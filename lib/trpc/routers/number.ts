import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/db";
import { OtpProviderClient } from "@/lib/providers";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { generateId } from "@/lib/utils";
import { NumberStatus, ActiveStatus, TransactionType, TransactionStatus, DiscountType, Prisma } from "@/app/generated/prisma/client";

// ─── Input schemas ────────────────────────────────────────────────────────────

const buySchema = z.object({
  serviceId: z.string(),
  serverId: z.string(),
});

const getStatusSchema = z.object({
  orderId: z.string(),
});

const cancelSchema = z.object({
  orderId: z.string(),
});

const infiniteSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(20),
  // Compound cursor: JSON-encoded { createdAt: string; id: string }
  // createdAt alone skips records sharing the same timestamp.
  // id (cuid) alone is not guaranteed time-ordered.
  // Together they are always unique and produce stable pages.
  cursor: z.string().optional(),
});

const historyOffsetSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0),
});

// ─── Cursor helpers ───────────────────────────────────────────────────────────

type PageCursor = { createdAt: string; id: string };

function encodeCursor(createdAt: Date, id: string): string {
  return JSON.stringify({ createdAt: createdAt.toISOString(), id });
}

function decodeCursor(cursor: string): PageCursor | null {
  try {
    const parsed = JSON.parse(cursor);
    if (typeof parsed.createdAt === "string" && typeof parsed.id === "string") {
      return parsed as PageCursor;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function calculateFinalPrice(
  userId: string,
  serviceId: string,
  basePrice: Prisma.Decimal,
): Promise<Prisma.Decimal> {
  const customPrice = await prisma.customPrice.findUnique({
    where: { userId_serviceId: { userId, serviceId } },
  });

  if (!customPrice) return basePrice;

  // FIX: clamp to zero — a discount larger than the base price must never
  // produce a negative finalPrice. A negative price passes the
  // `balance.lessThan(finalPrice)` check (negative < 0 is false) and causes
  // `balance: { decrement: negative }` to INCREMENT the wallet — free money.
  let result: Prisma.Decimal;
  if (customPrice.type === DiscountType.FLAT) {
    result = basePrice.minus(customPrice.discount);
  } else {
    // PERCENT: also guard against discount > 100 producing a negative value
    const discountAmount = basePrice.mul(customPrice.discount.div(100));
    result = basePrice.minus(discountAmount);
  }

  return result.isNegative() ? new Prisma.Decimal(0) : result;
}

/**
 * Refund balance and DELETE the failed purchase record entirely.
 * Called when provider fails after balance has already been deducted.
 */
async function handleBuyFailure(
  orderId: string,
  price: Prisma.Decimal,
  userId: string,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const activeNumber = await tx.activeNumber.findFirst({
        where: { orderId, userId, balanceDeducted: true },
      });
      if (!activeNumber) return;

      await tx.activeNumber.delete({ where: { id: activeNumber.id } });

      await tx.transaction.deleteMany({
        where: { orderId, type: TransactionType.PURCHASE },
      });

      await tx.wallet.update({
        where: { userId },
        data: {
          balance: { increment: price },
          // totalSpent and totalOtp are not touched - they only increment when SMS is received
        },
      });
    });
  } catch (error) {
    console.error("[buy] Failed to refund after buy error:", error);
  }
}

/**
 * Auto-refund when number expires without SMS or provider cancels.
 */
async function handleAutoRefund(
  activeNumber: {
    id: string;
    price: Prisma.Decimal;
    phoneNumber: string;
    orderId: string;
    serviceId: string;
  },
  userId: string,
  reason: "expired" | "provider_cancelled",
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new Error(
        `[auto-refund] Wallet not found for userId=${userId}, orderId=${activeNumber.orderId}`,
      );
    }

    const service = await tx.service.findUnique({ where: { id: activeNumber.serviceId } });

    const updated = await tx.activeNumber.updateMany({
      where: { id: activeNumber.id, balanceDeducted: true },
      data: {
        status: NumberStatus.CANCELLED,
        activeStatus: ActiveStatus.CLOSED,
        balanceDeducted: false,
      },
    });

    if (updated.count === 0) return;

    await tx.wallet.update({
      where: { userId },
      data: {
        balance: { increment: activeNumber.price },
        // totalSpent and totalOtp are not touched - they only increment when SMS is received
      },
    });

    await tx.transaction.create({
      data: {
        walletId: wallet.id,
        type: TransactionType.REFUND,
        amount: activeNumber.price,
        status: TransactionStatus.COMPLETED,
        refundOrderId: activeNumber.orderId,
        orderId: activeNumber.orderId,
        description:
          reason === "expired"
            ? "Auto-refund: Number expired without SMS"
            : "Auto-refund: Provider cancelled order",
        phoneNumber: activeNumber.phoneNumber,
        metadata: {
          orderId: activeNumber.orderId,
          reason,
          serviceId: activeNumber.serviceId,
          serviceName: service?.name,
        },
      },
    });
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const numberRouter = createTRPCRouter({
  /**
   * Buy a new virtual phone number.
   * Flow: check balance → deduct → create pending record → call provider → update.
   */
  buy: protectedProcedure.input(buySchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;

    const service = await prisma.service.findFirst({
      where: { id: input.serviceId, serverId: input.serverId, isActive: true },
      include: { server: { include: { api: true } } },
    });

    if (!service) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Service not found or inactive" });
    }

    if (!service.server.isActive || !service.server.api.isActive) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Server or API is currently unavailable" });
    }

    const finalPrice = await calculateFinalPrice(userId, service.id, service.basePrice);
    const settings = await prisma.settings.findUnique({ where: { id: "1" } });
    const expiryMinutes = settings?.numberExpiryMinutes ?? 15;
    const orderId = generateId();

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });

      if (!wallet) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Wallet not found" });
      }

      if (wallet.balance.lessThan(finalPrice)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient balance" });
      }

      const updatedWallet = await tx.wallet.update({
        where: { userId },
        data: {
          balance: { decrement: finalPrice },
          // totalSpent and totalOtp are incremented only when SMS is received, not at purchase time
        },
      });

      if (updatedWallet.balance.isNegative()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient balance" });
      }

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.PURCHASE,
          amount: finalPrice,
          status: TransactionStatus.COMPLETED,
          orderId,
          description: `Purchase pending: ${service.name}`,
          metadata: { orderId, serviceId: service.id, serviceName: service.name },
        },
      });

      const activeNumber = await tx.activeNumber.create({
        data: {
          userId,
          serviceId: service.id,
          orderId,
          serverId: service.serverId,
          numberId: "PENDING",
          phoneNumber: "PENDING",
          price: finalPrice,
          status: NumberStatus.PENDING,
          activeStatus: ActiveStatus.ACTIVE,
          balanceDeducted: true,
          expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
        },
        include: { service: true },
      });

      return { activeNumber, walletId: wallet.id };
    });

    const otpClient = new OtpProviderClient({
      apiUrl: service.server.api.apiUrl,
      apiKey: service.server.api.apiKey,
    });

    let numberResponse;
    try {
      numberResponse = await otpClient.getNumber(service.code, service.server.countryCode);
    } catch (providerError) {
      await handleBuyFailure(orderId, finalPrice, userId);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to reach OTP provider",
      });
    }

    if (!numberResponse.success || !numberResponse.orderId || !numberResponse.phoneNumber) {
      await handleBuyFailure(orderId, finalPrice, userId);
      const errorCode = numberResponse.errorCode;
      let errorMessage = numberResponse.error ?? "Failed to get phone number from provider";
      if (errorCode === "NO_NUMBER" || errorCode === "NO_NUMBERS") {
        errorMessage = "No numbers available from provider";
      } else if (errorCode === "NO_BALANCE") {
        errorMessage = "Provider has insufficient balance";
      } else if (errorCode === "BAD_SERVICE") {
        errorMessage = "Service not available on provider";
      }
      throw new TRPCError({ code: "BAD_REQUEST", message: errorMessage });
    }

    const updatedNumber = await prisma.activeNumber.update({
      where: { id: result.activeNumber.id },
      data: {
        numberId: numberResponse.orderId,
        phoneNumber: numberResponse.phoneNumber,
      },
      include: { service: true },
    });

    await prisma.transaction.updateMany({
      where: { orderId },
      data: {
        description: `Purchased ${service.name} number: ${numberResponse.phoneNumber}`,
        phoneNumber: numberResponse.phoneNumber,
        metadata: {
          orderId,
          numberId: numberResponse.orderId,
          serviceId: service.id,
          serviceName: service.name,
        },
      },
    });

    return { success: true, number: updatedNumber, message: "Number purchased successfully" };
  }),

  /**
   * Get all ACTIVE numbers for the Waiting tab.
   */
  getActive: protectedProcedure.query(async ({ ctx }) => {
    const numbers = await prisma.activeNumber.findMany({
      where: {
        userId: ctx.user.id,
        activeStatus: ActiveStatus.ACTIVE,
        status: { not: NumberStatus.CANCELLED },
        NOT: { phoneNumber: "PENDING" },
      },
      include: { service: { include: { server: true } } },
      orderBy: { createdAt: "desc" },
    });

    return { numbers };
  }),

  /**
   * Received tab — compound cursor pagination.
   */
  getReceivedInfinite: protectedProcedure.input(infiniteSchema).query(async ({ ctx, input }) => {
    const limit = input.limit ?? 20;
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;

    const numbers = await prisma.activeNumber.findMany({
      where: {
        userId: ctx.user.id,
        activeStatus: ActiveStatus.CLOSED,
        status: NumberStatus.COMPLETED,
        ...(cursor && {
          OR: [
            { createdAt: { lt: new Date(cursor.createdAt) } },
            { createdAt: { equals: new Date(cursor.createdAt) }, id: { lt: cursor.id } },
          ],
        }),
      },
      include: { service: { include: { server: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    let nextCursor: string | null = null;
    if (numbers.length > limit) {
      const lastItem = numbers.pop()!;
      nextCursor = encodeCursor(lastItem.createdAt, lastItem.id);
    }

    return { numbers, nextCursor };
  }),

  /**
   * Cancelled tab — compound cursor pagination.
   */
  getCancelledInfinite: protectedProcedure.input(infiniteSchema).query(async ({ ctx, input }) => {
    const limit = input.limit ?? 20;
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;

    const numbers = await prisma.activeNumber.findMany({
      where: {
        userId: ctx.user.id,
        activeStatus: ActiveStatus.CLOSED,
        status: NumberStatus.CANCELLED,
        ...(cursor && {
          OR: [
            { createdAt: { lt: new Date(cursor.createdAt) } },
            { createdAt: { equals: new Date(cursor.createdAt) }, id: { lt: cursor.id } },
          ],
        }),
      },
      include: { service: { include: { server: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    let nextCursor: string | null = null;
    if (numbers.length > limit) {
      const lastItem = numbers.pop()!;
      nextCursor = encodeCursor(lastItem.createdAt, lastItem.id);
    }

    return { numbers, nextCursor };
  }),

  /**
   * Last 5 numbers — homepage widget.
   */
  getRecent: protectedProcedure.query(async ({ ctx }) => {
    const numbers = await prisma.activeNumber.findMany({
      where: {
        userId: ctx.user.id,
        NOT: { phoneNumber: "PENDING" },
      },
      include: { service: { include: { server: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return { numbers };
  }),

  /**
   * Get status of a specific order — pure DB read + expiry safety net.
   */
  getStatus: protectedProcedure.input(getStatusSchema).query(async ({ ctx, input }) => {
    const activeNumber = await prisma.activeNumber.findFirst({
      where: { orderId: input.orderId, userId: ctx.user.id },
      include: {
        service: {
          include: {
            server: {
              select: {
                id: true,
                name: true,
                countryCode: true,
                countryIso: true,
                countryName: true,
                flagUrl: true,
                api: true,
              },
            },
          },
        },
      },
    });

    if (!activeNumber) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
    }

    if (activeNumber.status !== NumberStatus.PENDING) {
      return {
        status: activeNumber.status,
        sms: activeNumber.smsContent,
        phoneNumber: activeNumber.phoneNumber,
      };
    }

    const isExpired = activeNumber.expiresAt && activeNumber.expiresAt.getTime() < Date.now();
    if (isExpired && !activeNumber.smsContent) {
      await handleAutoRefund(
        {
          id: activeNumber.id,
          price: activeNumber.price,
          phoneNumber: activeNumber.phoneNumber,
          orderId: activeNumber.orderId,
          serviceId: activeNumber.serviceId,
        },
        ctx.user.id,
        "expired",
      );
      return {
        status: NumberStatus.CANCELLED,
        sms: undefined,
        phoneNumber: activeNumber.phoneNumber,
        expired: true,
      };
    }

    return {
      status: NumberStatus.PENDING,
      sms: undefined,
      phoneNumber: activeNumber.phoneNumber,
      expiresAt: activeNumber.expiresAt,
    };
  }),

  /**
   * Cancel an active order and refund the user.
   *
   * FIX: DB transaction runs BEFORE the provider cancel call.
   * Previously the provider was cancelled first — if the DB transaction then
   * failed, the number was cancelled upstream but still showed ACTIVE in our
   * DB. The poller would eventually self-heal, but the user saw inconsistent
   * state for up to one poll cycle.
   *
   * New flow:
   *  1. DB transaction: guard + close record + credit wallet + write REFUND tx
   *  2. Provider cancel (best-effort, fire-and-forget on failure)
   *
   * Trade-off: if the provider cancel fails after a successful DB commit the
   * provider holds the number open briefly. This is acceptable — providers
   * auto-expire idle numbers and our record is already CANCELLED/CLOSED so
   * the poller will not try to re-use it.
   */
  cancel: protectedProcedure.input(cancelSchema).mutation(async ({ ctx, input }) => {
    const activeNumber = await prisma.activeNumber.findFirst({
      where: { orderId: input.orderId, userId: ctx.user.id },
      include: { service: { include: { server: { include: { api: true } } } } },
    });

    if (!activeNumber) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
    }

    if (activeNumber.status === NumberStatus.COMPLETED || activeNumber.smsContent) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot cancel — SMS has already been received",
      });
    }

    if (activeNumber.status === NumberStatus.CANCELLED) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Order is already cancelled" });
    }

    if (!activeNumber.balanceDeducted) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Order has already been refunded" });
    }

    const settings = await prisma.settings.findUnique({ where: { id: "1" } });
    const minCancelMs = (settings?.minCancelMinutes ?? 2) * 60 * 1000;
    const elapsed = Date.now() - activeNumber.createdAt.getTime();

    if (elapsed < minCancelMs) {
      const remainingSeconds = Math.ceil((minCancelMs - elapsed) / 1000);
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Cannot cancel yet. Please wait ${remainingSeconds} seconds.`,
      });
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId: ctx.user.id } });
    if (!wallet) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Wallet not found" });
    }

    // FIX: DB transaction FIRST — close record + refund wallet atomically.
    // Provider cancel is called afterward as best-effort.
    await prisma.$transaction(async (tx) => {
      const guard = await tx.activeNumber.updateMany({
        where: { id: activeNumber.id, balanceDeducted: true },
        data: {
          status: NumberStatus.CANCELLED,
          activeStatus: ActiveStatus.CLOSED,
          balanceDeducted: false,
        },
      });

      if (guard.count === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Order has already been refunded.",
        });
      }

      await tx.wallet.update({
        where: { userId: ctx.user.id },
        data: {
          balance: { increment: activeNumber.price },
          // totalSpent and totalOtp are not touched - they only increment when SMS is received
        },
      });

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.REFUND,
          amount: activeNumber.price,
          status: TransactionStatus.COMPLETED,
          refundOrderId: activeNumber.orderId,
          orderId: activeNumber.orderId,
          description: `Cancelled: ${activeNumber.service.name} - ${activeNumber.phoneNumber}`,
          phoneNumber: activeNumber.phoneNumber,
          metadata: {
            orderId: activeNumber.orderId,
            numberId: activeNumber.numberId,
            serviceId: activeNumber.serviceId,
            serviceName: activeNumber.service.name,
            cancelReason: "user_requested",
            // providerCancelSuccess filled in below after the fact
          },
        },
      });
    });

    // Best-effort provider cancel — DB is already committed so a failure here
    // is safe. The provider will auto-expire the number on their side.
    const otpClient = new OtpProviderClient({
      apiUrl: activeNumber.service.server.api.apiUrl,
      apiKey: activeNumber.service.server.api.apiKey,
    });
    otpClient.cancelOrder(activeNumber.numberId).catch((err) => {
      console.error(`[cancel] Provider cancel failed for ${activeNumber.numberId}:`, err);
    });

    return { success: true, refundedAmount: activeNumber.price.toNumber() };
  }),

  /**
   * Purchase history with offset pagination.
   */
  history: protectedProcedure.input(historyOffsetSchema).query(async ({ ctx, input }) => {
    const [numbers, total] = await Promise.all([
      prisma.activeNumber.findMany({
        where: {
          userId: ctx.user.id,
          activeStatus: ActiveStatus.CLOSED,
          status: { in: [NumberStatus.COMPLETED, NumberStatus.CANCELLED] },
        },
        include: { service: { include: { server: true } } },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        skip: input.offset,
      }),
      prisma.activeNumber.count({
        where: {
          userId: ctx.user.id,
          activeStatus: ActiveStatus.CLOSED,
          status: { in: [NumberStatus.COMPLETED, NumberStatus.CANCELLED] },
        },
      }),
    ]);

    return { numbers, total };
  }),

  /**
   * All numbers — legacy endpoint.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const numbers = await prisma.activeNumber.findMany({
      where: { userId: ctx.user.id },
      include: { service: { include: { server: true } } },
      orderBy: { createdAt: "desc" },
    });

    return { numbers, total: numbers.length };
  }),

  /**
   * Single number by DB id.
   */
  byId: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      return prisma.activeNumber.findFirst({
        where: { id: input.id, userId: ctx.user.id },
        include: { service: { include: { server: true } } },
      });
    }),
});