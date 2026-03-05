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
 * Calculate final price after applying any custom discount for the user
 */
async function calculateFinalPrice(
  userId: string,
  serviceId: string,
  basePrice: Prisma.Decimal
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
  userId: string
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const activeNumber = await tx.activeNumber.findFirst({
        where: { orderId, userId, balanceDeducted: true },
      });
      if (!activeNumber) return;

      await tx.activeNumber.delete({ where: { id: activeNumber.id } });

      // Delete the original PURCHASE transaction for failed purchases
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
 * IMPORTANT: Always call this OUTSIDE of prisma.$transaction blocks.
 * Calling it inside a transaction causes isolation conflicts where the
 * write silently rolls back, leaving smsContent as null in the DB.
 *
 * @returns true if a new SMS was added, false if it was a duplicate
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
      // Backward compat: convert old string format to array
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
 * Uses updateMany with balanceDeducted check to prevent double refunds atomically.
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
  reason: "expired" | "provider_cancelled"
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Wallet not found" });

    const service = await tx.service.findUnique({ where: { id: activeNumber.serviceId } });

    // Atomic — only proceeds if balanceDeducted is still true
    const updated = await tx.activeNumber.updateMany({
      where: { id: activeNumber.id, balanceDeducted: true },
      data: {
        status: NumberStatus.CANCELLED,
        activeStatus: ActiveStatus.CLOSED,
        balanceDeducted: false,
      },
    });

    if (updated.count === 0) return; // Already refunded, skip

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
   * Flow: deduct balance → create pending record → call provider → update with real number.
   * If provider fails at any point, automatically refunds and deletes the pending record.
   */
  buy: protectedProcedure.input(buySchema).mutation(async ({ ctx, input }) => {
    console.log("[Number.buy] Starting buy mutation");
    console.log("[Number.buy] User ID:", ctx.user?.id);
    console.log("[Number.buy] Input:", input);

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
    const orderId = nanoid(16);

    // Step 1: Deduct balance atomically
    const result = await prisma.$transaction(async (tx) => {
      const walletUpdate = await tx.wallet.update({
        where: { userId },
        data: {
          balance: { decrement: finalPrice },
          totalSpent: { increment: finalPrice },
          totalOtp: { increment: 1 },
        },
      });

      if (walletUpdate.balance.isNegative()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient balance" });
      }

      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Wallet not found" });

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

      return { activeNumber, wallet };
    });

    // Step 2: Call provider (outside transaction)
    try {
      console.log("[Number.buy] Calling OTP provider API:", {
        apiUrl: service.server.api.apiUrl,
        apiKey: service.server.api.apiKey ? `${service.server.api.apiKey.substring(0, 8)}...` : 'NOT SET',
        serviceCode: service.code,
        countryCode: service.server.countryCode,
      });

      const otpClient = new OtpProviderClient({
        apiUrl: service.server.api.apiUrl,
        apiKey: service.server.api.apiKey,
      });

      const numberResponse = await otpClient.getNumber(service.code, service.server.countryCode);

      if (!numberResponse.success || !numberResponse.orderId || !numberResponse.phoneNumber) {
        await handleBuyFailure(orderId, finalPrice, userId);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: numberResponse.error || "Failed to get phone number from provider",
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
          metadata: {
            orderId,
            numberId: numberResponse.orderId,
            serviceId: service.id,
            serviceName: service.name,
          },
        },
      });

      return { success: true, number: updatedNumber, message: "Number purchased successfully" };
    } catch (error) {
      await handleBuyFailure(orderId, finalPrice, userId);
      throw error;
    }
  }),

  /**
   * Get all ACTIVE numbers for the Waiting tab.
   * Pure DB read — no external API calls.
   * All SMS polling is handled by fetch.mjs running in PM2.
   */
  getActive: protectedProcedure.query(async ({ ctx }) => {
    const numbers = await prisma.activeNumber.findMany({
      where: {
        userId: ctx.user.id,
        activeStatus: ActiveStatus.ACTIVE,
        status: { not: NumberStatus.CANCELLED },
      },
      include: {
        service: { include: { server: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return { numbers };
  }),

  /**
   * Received tab — COMPLETED numbers with infinite scroll
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
   * Cancelled tab — CANCELLED numbers with infinite scroll
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
   * Legacy non-infinite received query
   */
  getReceived: protectedProcedure.input(historySchema).query(async ({ ctx, input }) => {
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
   * Legacy non-infinite cancelled query
   */
  getCancelled: protectedProcedure.input(historySchema).query(async ({ ctx, input }) => {
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
   * Last 5 numbers across all statuses — homepage widget
   */
  getRecent: protectedProcedure.query(async ({ ctx }) => {
    const numbers = await prisma.activeNumber.findMany({
      where: { userId: ctx.user.id },
      include: { service: { include: { server: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return { numbers };
  }),

  /**
   * Get status of a specific order — primarily a DB read.
   * fetch.mjs handles all SMS polling, expiry, and provider cancellation.
   * This endpoint only handles:
   *   1. Multi-SMS check for COMPLETED numbers still in waiting tab
   *   2. Expiry refund as a fallback safety net
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

    // ── Already settled — read from DB ───────────────────────────────────────
    if (activeNumber.status !== NumberStatus.PENDING) {
      // COMPLETED + still in waiting tab → check for additional SMS
      if (activeNumber.smsContent && activeNumber.activeStatus === ActiveStatus.ACTIVE) {
        const otpClient = new OtpProviderClient({
          apiUrl: activeNumber.service.server.api.apiUrl,
          apiKey: activeNumber.service.server.api.apiKey,
        });

        const nextCheck = await otpClient.getNextSms(activeNumber.numberId);

        if (nextCheck.success && nextCheck.hasMore) {
          const additionalStatus = await otpClient.getStatus(activeNumber.numberId);
          if (additionalStatus.status === "RECEIVED" && additionalStatus.sms) {
            const added = await appendSmsContent(activeNumber.id, additionalStatus.sms);
            if (added) {
              await otpClient.finishOrder(activeNumber.numberId);
            }
          }
        }

        const updated = await prisma.activeNumber.findUnique({
          where: { id: activeNumber.id },
          select: { smsContent: true },
        });

        return {
          status: activeNumber.status,
          sms: updated?.smsContent,
          phoneNumber: activeNumber.phoneNumber,
        };
      }

      return {
        status: activeNumber.status,
        sms: activeNumber.smsContent,
        phoneNumber: activeNumber.phoneNumber,
      };
    }

    // ── PENDING — expiry safety net ──────────────────────────────────────────
    // fetch.mjs is the primary handler but this catches any edge cases
    // where the user's browser requests status right at expiry boundary.
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
        "expired"
      );
      return {
        status: NumberStatus.CANCELLED,
        sms: undefined,
        phoneNumber: activeNumber.phoneNumber,
        expired: true,
      };
    }

    // Still waiting — fetch.mjs will update DB when SMS arrives
    return {
      status: NumberStatus.PENDING,
      sms: undefined,
      phoneNumber: activeNumber.phoneNumber,
      expiresAt: activeNumber.expiresAt,
    };
  }),

  /**
   * Cancel an active order and refund the user.
   * Blocked if SMS already received (by status or smsContent).
   * Blocked within the minCancelMinutes cooldown window.
   */
  cancel: protectedProcedure.input(cancelSchema).mutation(async ({ ctx, input }) => {
    const activeNumber = await prisma.activeNumber.findFirst({
      where: { orderId: input.orderId, userId: ctx.user.id },
      include: { service: { include: { server: { include: { api: true } } } } },
    });

    if (!activeNumber) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
    }

    // Block if SMS already received
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

    // Cancel with provider (we still refund even if this fails)
    const otpClient = new OtpProviderClient({
      apiUrl: activeNumber.service.server.api.apiUrl,
      apiKey: activeNumber.service.server.api.apiKey,
    });
    const cancelResponse = await otpClient.cancelOrder(activeNumber.numberId);

    // Refund atomically
    await prisma.$transaction(async (tx) => {
      await tx.activeNumber.update({
        where: { id: activeNumber.id },
        data: {
          status: NumberStatus.CANCELLED,
          activeStatus: ActiveStatus.CLOSED,
          balanceDeducted: false,
        },
      });

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
          description: `Cancelled: ${activeNumber.service.name} - ${activeNumber.phoneNumber}`,
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
   * Purchase history with offset pagination — legacy endpoint
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
   * All numbers — legacy endpoint
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
   * Single number by DB id
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