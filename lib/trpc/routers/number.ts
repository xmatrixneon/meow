import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/db";
import { OtpProviderClient } from "@/lib/providers";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { NumberStatus, ActiveStatus, Prisma } from "@/app/generated/prisma/client";

// ─── Input schemas ────────────────────────────────────────────────────────────

const buySchema = z.object({
  serviceId: z.string().cuid(),
  serverId: z.string().cuid(),
});

const getStatusSchema = z.object({
  orderId: z.string(),
});

const cancelSchema = z.object({
  orderId: z.string(),
});

const historySchema = z.object({
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0),
  cursor: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculate final price after applying any custom discount for the user.
 */
async function calculateFinalPrice(
  userId: string,
  serviceId: string,
  basePrice: Prisma.Decimal,
): Promise<Prisma.Decimal> {
  const customPrice = await prisma.customPrice.findUnique({
    where: { userId_serviceId: { userId, serviceId } },
  });

  if (!customPrice) return basePrice;

  if (customPrice.type === "FLAT") {
    const final = basePrice.minus(customPrice.discount);
    return final.isNegative() ? new Prisma.Decimal(0) : final;
  }

  // PERCENT
  const discountAmount = basePrice.mul(customPrice.discount.div(100));
  return basePrice.minus(discountAmount);
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

      // Delete the original PURCHASE transaction so history stays clean
      await tx.transaction.deleteMany({
        where: {
          metadata: { path: ["orderId"], equals: orderId },
          type: "PURCHASE",
        },
      });

      await tx.wallet.update({
        where: { userId },
        data: {
          balance: { increment: price },
          totalSpent: { decrement: price },
          totalOtp: { decrement: 1 },
        },
      });
    });
  } catch (error) {
    console.error("[buy] Failed to refund after buy error:", error);
  }
}

/**
 * Append a new SMS to the smsContent array on an ActiveNumber.
 * Handles backward-compat with old string format.
 *
 * IMPORTANT: Always call OUTSIDE of prisma.$transaction blocks.
 * Calling inside causes isolation conflicts that silently roll back.
 *
 * @returns true if a new SMS was added, false if duplicate
 */
async function appendSmsContent(numberId: string, newSms: string): Promise<boolean> {
  const current = await prisma.activeNumber.findUnique({
    where: { id: numberId },
    select: { smsContent: true },
  });
  if (!current) return false;

  let existing: Array<{ content: string; receivedAt: string }> = [];

  if (current.smsContent) {
    if (Array.isArray(current.smsContent)) {
      existing = current.smsContent as typeof existing;
    } else if (typeof current.smsContent === "string") {
      existing = [{ content: current.smsContent, receivedAt: new Date().toISOString() }];
    }
  }

  if (existing.some((s) => s.content === newSms)) return false;

  await prisma.activeNumber.update({
    where: { id: numberId },
    data: {
      smsContent: [
        ...existing,
        { content: newSms, receivedAt: new Date().toISOString() },
      ] as Prisma.InputJsonValue,
    },
  });

  return true;
}

/**
 * Auto-refund when number expires without SMS or provider cancels.
 * Uses updateMany + balanceDeducted guard to prevent double refunds atomically.
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

    const service = await tx.service.findUnique({ where: { id: activeNumber.serviceId } });

    // Atomic guard — only proceeds if balanceDeducted is still true
    const updated = await tx.activeNumber.updateMany({
      where: { id: activeNumber.id, balanceDeducted: true },
      data: {
        status: NumberStatus.CANCELLED,
        activeStatus: ActiveStatus.CLOSED,
        balanceDeducted: false,
      },
    });

    if (updated.count === 0) return; // Already refunded, skip

    if (!wallet) {
      console.error(
        `[auto-refund] Wallet not found for userId=${userId}, orderId=${activeNumber.orderId}`,
      );
      return;
    }

    await tx.wallet.update({
      where: { userId },
      data: {
        balance: { increment: activeNumber.price },
        totalSpent: { decrement: activeNumber.price },
        totalOtp: { decrement: 1 },
      },
    });

    await tx.transaction.create({
      data: {
        walletId: wallet.id,
        type: "REFUND",
        amount: activeNumber.price,
        status: "COMPLETED",
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
   * On provider failure, automatically refunds and deletes the pending record.
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

    // SECURITY (C3): enforce max concurrent active numbers per user.
    // Without this, a user with a large balance (or 0-price discount) can open
    // hundreds of simultaneous numbers, exhausting provider inventory and
    // creating unbounded poller load.
    const MAX_CONCURRENT_NUMBERS = 10;
    const activeCount = await prisma.activeNumber.count({
      where: {
        userId,
        activeStatus: "ACTIVE",
        status: { not: "CANCELLED" },
        NOT: { phoneNumber: "PENDING" },
      },
    });
    if (activeCount >= MAX_CONCURRENT_NUMBERS) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `You can have at most ${MAX_CONCURRENT_NUMBERS} active numbers at a time.`,
      });
    }

    const finalPrice = await calculateFinalPrice(userId, service.id, service.basePrice);
    const settings = await prisma.settings.findUnique({ where: { id: "1" } });
    const expiryMinutes = settings?.numberExpiryMinutes ?? 15;
    const orderId = nanoid(16);

    // Step 1: Check balance, then deduct atomically
    // FIX (Bug 2): read wallet first to check balance BEFORE decrementing
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
          totalSpent: { increment: finalPrice },
          totalOtp: { increment: 1 },
        },
      });

      // Extra safety net — should never happen due to the check above
      if (updatedWallet.balance.isNegative()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient balance" });
      }

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: "PURCHASE",
          amount: finalPrice,
          status: "COMPLETED",
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

    // Step 2: Call provider (outside transaction)
    // FIX (Bug 1): handleBuyFailure is called exactly ONCE on any failure path.
    // The outer catch no longer calls it again if an inner TRPCError is thrown.
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
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: numberResponse.error ?? "Failed to get phone number from provider",
      });
    }

    // Step 3: Update with real provider details
    const updatedNumber = await prisma.activeNumber.update({
      where: { id: result.activeNumber.id },
      data: {
        numberId: numberResponse.orderId,
        phoneNumber: numberResponse.phoneNumber,
      },
      include: { service: true },
    });

    await prisma.transaction.updateMany({
      where: { metadata: { path: ["orderId"], equals: orderId } },
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
   * Pure DB read — all SMS polling is handled by fetch.ts in PM2.
   */
  getActive: protectedProcedure.query(async ({ ctx }) => {
    const numbers = await prisma.activeNumber.findMany({
      where: {
        userId: ctx.user.id,
        activeStatus: ActiveStatus.ACTIVE,
        status: { not: NumberStatus.CANCELLED },
        // FIX (Bug 4 from previous review): exclude ghost PENDING records
        NOT: { phoneNumber: "PENDING" },
      },
      include: {
        service: { include: { server: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return { numbers };
  }),

  /**
   * Received tab — COMPLETED numbers with infinite scroll.
   */
  getReceivedInfinite: protectedProcedure.input(historySchema).query(async ({ ctx, input }) => {
    const limit = input.limit ?? 20;

    const numbers = await prisma.activeNumber.findMany({
      where: {
        userId: ctx.user.id,
        activeStatus: ActiveStatus.CLOSED,
        status: NumberStatus.COMPLETED,
        ...(input.cursor && { createdAt: { lt: new Date(input.cursor) } }),
      },
      include: { service: { include: { server: true } } },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

    let nextCursor: string | null = null;
    if (numbers.length > limit) {
      nextCursor = numbers.pop()!.createdAt.toISOString();
    }

    return { numbers, nextCursor };
  }),

  /**
   * Cancelled tab — CANCELLED numbers with infinite scroll.
   */
  getCancelledInfinite: protectedProcedure.input(historySchema).query(async ({ ctx, input }) => {
    const limit = input.limit ?? 20;

    const numbers = await prisma.activeNumber.findMany({
      where: {
        userId: ctx.user.id,
        activeStatus: ActiveStatus.CLOSED,
        status: NumberStatus.CANCELLED,
        ...(input.cursor && { createdAt: { lt: new Date(input.cursor) } }),
      },
      include: { service: { include: { server: true } } },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

    let nextCursor: string | null = null;
    if (numbers.length > limit) {
      nextCursor = numbers.pop()!.createdAt.toISOString();
    }

    return { numbers, nextCursor };
  }),

  /**
   * Last 5 numbers across all statuses — homepage widget.
   * FIX: excludes ghost PENDING records (phoneNumber='PENDING').
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
   * Get status of a specific order — primarily a DB read.
   * fetch.ts handles all SMS polling, expiry, and provider cancellation.
   *
   * FIX (Bug 3 from previous review): no longer calls external API on every poll.
   * Multi-SMS check is now only triggered by the poller, not here.
   * This endpoint is a pure DB read + expiry safety net only.
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

    // Already settled — read from DB
    if (activeNumber.status !== NumberStatus.PENDING) {
      return {
        status: activeNumber.status,
        sms: activeNumber.smsContent,
        phoneNumber: activeNumber.phoneNumber,
      };
    }

    // PENDING — expiry safety net (fetch.ts is primary handler)
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
   * Blocked if SMS already received or within minCancelMinutes cooldown.
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

    // Cancel cooldown
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

    // Cancel with provider (refund regardless of provider response)
    const otpClient = new OtpProviderClient({
      apiUrl: activeNumber.service.server.api.apiUrl,
      apiKey: activeNumber.service.server.api.apiKey,
    });
    const cancelResponse = await otpClient.cancelOrder(activeNumber.numberId).catch((err) => {
      console.error(`[cancel] Provider cancel failed for ${activeNumber.numberId}:`, err);
      return { success: false };
    });

    // Refund atomically with balanceDeducted=true guard INSIDE the transaction.
    // Prevents double-refund race with the poller's handleAutoRefund.
    await prisma.$transaction(async (tx) => {
      // FIX #4 (number.router): use updateMany with balanceDeducted guard so the
      // poller cannot double-refund between our read above and this write.
      const guard = await tx.activeNumber.updateMany({
        where: { id: activeNumber.id, balanceDeducted: true },
        data: {
          status: NumberStatus.CANCELLED,
          activeStatus: ActiveStatus.CLOSED,
          balanceDeducted: false,
        },
      });

      // FIX #4 (number.router): throw inside the transaction so the caller gets
      // a proper BAD_REQUEST instead of a silent success:true.
      // The transaction has no writes to roll back, so this is safe.
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
          totalSpent: { decrement: activeNumber.price },
          totalOtp: { decrement: 1 },
        },
      });

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: "REFUND",
          amount: activeNumber.price,
          status: "COMPLETED",
          // refundOrderId for DB-level dedup — unique constraint prevents
          // a duplicate REFUND even if two processes race here.
          refundOrderId: activeNumber.orderId,
          description: `Cancelled: ${activeNumber.service.name} - ${activeNumber.phoneNumber}`,
          phoneNumber: activeNumber.phoneNumber,
          metadata: {
            orderId: activeNumber.orderId,
            numberId: activeNumber.numberId,
            serviceId: activeNumber.serviceId,
            serviceName: activeNumber.service.name,
            cancelReason: "user_requested",
            providerCancelSuccess: cancelResponse.success,
          },
        },
      });
    });

    return { success: true, refundedAmount: activeNumber.price.toNumber() };
  }),

  /**
   * Purchase history with offset pagination.
   */
  history: protectedProcedure.input(historySchema).query(async ({ ctx, input }) => {
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