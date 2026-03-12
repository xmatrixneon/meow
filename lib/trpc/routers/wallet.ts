import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma, TransactionStatus, TransactionType, NumberStatus } from "@/app/generated/prisma/client";
const { Decimal } = Prisma;

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/db";
import { createBharatPeClient, BharatPeError } from "@/lib/payments";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert Decimal to number for API responses.
 * Uses toNumber() — sufficient for display values (balance, totals).
 * For financial calculations always use Decimal arithmetic directly.
 */
function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return value.toNumber();
}

/**
 * Unwrap Prisma errors that may be wrapped inside $transaction.
 * Prisma re-throws transaction errors with the original error on `.cause`.
 */
function getPrismaError(
  error: unknown,
): Prisma.PrismaClientKnownRequestError | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error;
  if ((error as any)?.cause instanceof Prisma.PrismaClientKnownRequestError) {
    return (error as any).cause;
  }
  return null;
}

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

// ─── Router ───────────────────────────────────────────────────────────────────

export const walletRouter = createTRPCRouter({
  /**
   * Get wallet balance and spending totals.
   * Auto-creates wallet if missing (safety net for edge cases where
   * the auth.ts bootstrap hook failed on signup).
   */
  balance: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    // upsert instead of findUnique + create to avoid P2002 race
    // when two requests simultaneously hit this endpoint for a new user.
    const wallet = await prisma.wallet.upsert({
      where: { userId },
      create: {
        userId,
        balance: new Decimal(0),
        totalSpent: new Decimal(0),
        totalRecharge: new Decimal(0),
        totalOtp: 0,
      },
      update: {},
    });

    return {
      balance: toNumber(wallet.balance),
      totalSpent: toNumber(wallet.totalSpent),
      totalRecharge: toNumber(wallet.totalRecharge),
      totalOtp: wallet.totalOtp,
    };
  }),

  /**
   * Transaction history with statistics — offset pagination.
   * Suitable for the history page where a known total is needed.
   */
  transactions: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        status: z.enum(["ALL", "COMPLETED", "PENDING", "FAILED"]).default("ALL"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { limit, offset, status } = input;

      const wallet = await prisma.wallet.findUnique({ where: { userId } });

      if (!wallet) {
        return {
          transactions: [],
          total: 0,
          statistics: {
            numberCount: 0,
            numberCountWithSms: 0,
            totalSpent: 0,
            totalTopup: 0,
          },
        };
      }

      const baseWhere = { walletId: wallet.id };
      const where =
        status === "ALL"
          ? baseWhere
          : { ...baseWhere, status: status as TransactionStatus };

      const [total, transactions] = await Promise.all([
        prisma.transaction.count({ where }),
        prisma.transaction.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
      ]);

      // FIX: use NumberStatus enum instead of raw strings
      const [numberCount, numberCountWithSms, totalSpentFromNumbers, totalTopup] =
        await Promise.all([
          prisma.activeNumber.count({
            where: { userId, status: NumberStatus.COMPLETED },
          }),

          prisma.activeNumber.count({
            where: {
              userId,
              status: NumberStatus.COMPLETED,
              smsMessages: { some: {} },
            },
          }),

          prisma.activeNumber.aggregate({
            where: { userId, status: NumberStatus.COMPLETED },
            _sum: { price: true },
          }),

          // FIX: use TransactionType enum instead of raw strings
          prisma.transaction.aggregate({
            where: {
              walletId: wallet.id,
              status: TransactionStatus.COMPLETED,
              type: {
                in: [
                  TransactionType.DEPOSIT,
                  TransactionType.REFUND,
                  TransactionType.PROMO,
                ],
              },
            },
            _sum: { amount: true },
          }),
        ]);

      const formattedTransactions = transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: toNumber(tx.amount),
        status: tx.status,
        description: tx.description,
        txnId: tx.txnId,
        phoneNumber: tx.phoneNumber,
        metadata: tx.metadata,
        createdAt: tx.createdAt.toISOString(),
      }));

      return {
        transactions: formattedTransactions,
        total,
        statistics: {
          numberCount,
          numberCountWithSms,
          totalSpent: toNumber(totalSpentFromNumbers._sum.price),
          totalTopup: toNumber(totalTopup._sum.amount),
        },
      };
    }),

  /**
   * Transaction history with infinite scroll — compound cursor pagination.
   */
  transactionsInfinite: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(30),
        cursor: z.string().optional(),
        status: z.enum(["ALL", "COMPLETED", "PENDING", "FAILED"]).default("ALL"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { limit, status } = input;
      const cursor = input.cursor ? decodeCursor(input.cursor) : null;

      const wallet = await prisma.wallet.findUnique({ where: { userId } });

      if (!wallet) {
        return { transactions: [], nextCursor: null, total: 0 };
      }

      const baseWhere = { walletId: wallet.id };
      const statusFilter =
        status !== "ALL" ? { status: status as TransactionStatus } : {};

      const where = {
        ...baseWhere,
        ...statusFilter,
        ...(cursor && {
          OR: [
            { createdAt: { lt: new Date(cursor.createdAt) } },
            {
              createdAt: { equals: new Date(cursor.createdAt) },
              id: { lt: cursor.id },
            },
          ],
        }),
      };

      const [total, transactions] = await Promise.all([
        prisma.transaction.count({ where: { ...baseWhere, ...statusFilter } }),
        prisma.transaction.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: limit + 1,
        }),
      ]);

      let nextCursor: string | null = null;
      if (transactions.length > limit) {
        const lastItem = transactions.pop()!;
        nextCursor = encodeCursor(lastItem.createdAt, lastItem.id);
      }

      const formattedTransactions = transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: toNumber(tx.amount),
        status: tx.status,
        description: tx.description,
        txnId: tx.txnId,
        phoneNumber: tx.phoneNumber,
        metadata: tx.metadata,
        createdAt: tx.createdAt.toISOString(),
      }));

      return {
        transactions: formattedTransactions,
        nextCursor,
        total,
      };
    }),

  /**
   * Deposit via UTR (race-safe).
   */
  deposit: protectedProcedure
    .input(
      z.object({
        utr: z
          .string()
          .trim()
          .min(8)
          .max(30)
          .regex(
            /^[A-Za-z0-9]+$/,
            "Invalid UTR format — must be 8–30 alphanumeric characters.",
          ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { utr } = input;

      // ── 1. Load settings ─────────────────────────────────────────────────
      const settings = await prisma.settings.findUnique({
        where: { id: "1" },
        select: {
          bharatpeMerchantId: true,
          bharatpeToken: true,
          minRechargeAmount: true,
          maxRechargeAmount: true,
          upiId: true,
          referralPercent: true,
        },
      });

      if (!settings?.bharatpeMerchantId || !settings?.bharatpeToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Payment verification is not configured.",
        });
      }

      // ── 2. Pre-check our DB before calling BharatPe ──────────────────────
      const existingTx = await prisma.transaction.findUnique({
        where: { txnId: utr },
      });

      if (existingTx) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This UTR has already been used.",
        });
      }

      // ── 3. Verify with BharatPe ──────────────────────────────────────────
      let verifyResult;
      try {
        const bharatPeClient = createBharatPeClient(
          settings.bharatpeMerchantId,
          settings.bharatpeToken,
        );
        verifyResult = await bharatPeClient.verifyTransaction(utr);
      } catch (error) {
        if (error instanceof BharatPeError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }
        throw error;
      }

      if (!verifyResult.found) {
        return { success: false, message: "Transaction not found." };
      }

      if (!verifyResult.canCredit) {
        return { success: false, message: "Transaction cannot be credited." };
      }

      // ── 4. Validate amount ───────────────────────────────────────────────
      const rawAmount = verifyResult.amount ?? 0;
      if (
        typeof rawAmount !== "number" ||
        !Number.isFinite(rawAmount) ||
        rawAmount <= 0
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid transaction amount received from payment provider.",
        });
      }

      const amount = rawAmount;
      const minAmount = toNumber(settings.minRechargeAmount);
      const maxAmount = toNumber(settings.maxRechargeAmount ?? 5000);

      if (amount < minAmount) {
        return {
          success: false,
          message: `Minimum recharge amount is ₹${minAmount}.`,
        };
      }

      if (amount > maxAmount) {
        return {
          success: false,
          message: `Maximum recharge amount is ₹${maxAmount}.`,
        };
      }

      // ── 5. Validate payee UPI ID ─────────────────────────────────────────
      if (verifyResult.payeeIdentifier) {
        if (!settings.upiId) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "UPI ID is not configured — cannot verify payment destination.",
          });
        }
        const apiPayee = verifyResult.payeeIdentifier.toLowerCase();
        const expected = settings.upiId.split("@")[0]?.toLowerCase() ?? "";

        if (!apiPayee.includes(expected) && !expected.includes(apiPayee)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Payment not made to correct UPI ID.",
          });
        }
      }

      // ── 6. Upsert wallet + insert transaction ────────────────────────────
      const wallet = await prisma.wallet.upsert({
        where: { userId },
        create: {
          userId,
          balance: new Decimal(0),
          totalSpent: new Decimal(0),
          totalRecharge: new Decimal(0),
          totalOtp: 0,
        },
        update: {},
      });

      try {
        await prisma.$transaction(async (tx) => {
          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              // FIX: use TransactionType enum
              type: TransactionType.DEPOSIT,
              amount: new Decimal(amount),
              status: TransactionStatus.COMPLETED,
              description: "Deposit via UPI",
              txnId: utr,
              metadata: {
                utr,
                payerName: verifyResult.payerName,
                payerVpa: verifyResult.payerVpa,
                transactionDate: verifyResult.transactionDate,
              },
            },
          });

          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              balance: { increment: new Decimal(amount) },
              totalRecharge: { increment: new Decimal(amount) },
            },
          });
        });
      } catch (error) {
        const prismaErr = getPrismaError(error);
        if (prismaErr?.code === "P2002") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This UTR has already been used.",
          });
        }
        throw error;
      }

      return {
        success: true,
        amount,
        message: `Successfully added ₹${amount} to wallet.`,
      };
    }),

  /**
   * Redeem a promo code.
   */
  redeemPromo: protectedProcedure
    .input(
      z.object({
        code: z
          .string()
          .trim()
          .min(1)
          .max(50)
          .transform((s) => s.toUpperCase()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { code } = input;

      const promocode = await prisma.promocode.findFirst({
        where: { code: { equals: code, mode: "insensitive" } },
      });

      if (!promocode || !promocode.isActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid promo code." });
      }

      if (promocode.usedCount >= promocode.maxUses) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid promo code." });
      }

      const MAX_PROMO_AMOUNT = new Decimal(1000);
      if (promocode.amount.greaterThan(MAX_PROMO_AMOUNT)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid promo code." });
      }

      const existingUse = await prisma.promocodeHistory.findUnique({
        where: { promocodeId_userId: { promocodeId: promocode.id, userId } },
      });

      if (existingUse) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You already used this promo code.",
        });
      }

      const wallet = await prisma.wallet.upsert({
        where: { userId },
        create: {
          userId,
          balance: new Decimal(0),
          totalSpent: new Decimal(0),
          totalRecharge: new Decimal(0),
          totalOtp: 0,
        },
        update: {},
      });

      try {
        await prisma.$transaction(async (tx) => {
          const guardUpdate = await tx.promocode.updateMany({
            where: {
              id: promocode.id,
              isActive: true,
              usedCount: { lt: promocode.maxUses },
            },
            data: { usedCount: { increment: 1 } },
          });

          if (guardUpdate.count === 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid promo code." });
          }

          await tx.promocodeHistory.create({
            data: { promocodeId: promocode.id, userId, amount: promocode.amount },
          });

          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              balance: { increment: promocode.amount },
              totalRecharge: { increment: promocode.amount },
            },
          });

          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              // FIX: use TransactionType enum
              type: TransactionType.PROMO,
              amount: promocode.amount,
              status: TransactionStatus.COMPLETED,
              description: `Promo code: ${promocode.code}`,
            },
          });
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        const prismaErr = getPrismaError(error);
        if (prismaErr?.code === "P2002") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You already used this promo code.",
          });
        }
        throw error;
      }

      return {
        success: true,
        amount: toNumber(promocode.amount),
        message: `Successfully redeemed ${code}.`,
      };
    }),
});