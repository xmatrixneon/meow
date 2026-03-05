import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/app/generated/prisma/client";
const { Decimal } = Prisma;

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/db";
import { createBharatPeClient, BharatPeError } from "@/lib/payments";

/**
 * Helper to convert Decimal to number for API responses
 */
function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return value.toNumber();
}

export const walletRouter = createTRPCRouter({
  /**
   * Get wallet balance
   */
  balance: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    let wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          userId,
          balance: new Decimal(0),
          totalSpent: new Decimal(0),
          totalRecharge: new Decimal(0),
          totalOtp: 0,
        },
      });
    }

    return {
      balance: toNumber(wallet.balance),
      totalSpent: toNumber(wallet.totalSpent),
      totalRecharge: toNumber(wallet.totalRecharge),
      totalOtp: wallet.totalOtp,
    };
  }),

  /**
   * Transactions with statistics
   */
  transactions: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        status: z.enum(["ALL", "COMPLETED", "PENDING", "FAILED"]).default("ALL"),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { limit, offset, status } = input;

      const wallet = await prisma.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        return {
          transactions: [],
          total: 0,
          statistics: {
            numberCount: 0,
            totalSpent: 0,
            totalTopup: 0,
          },
        };
      }

      const baseWhere = { walletId: wallet.id };
      const where = status === "ALL" ? baseWhere : { ...baseWhere, status };

      const [total, transactions] = await Promise.all([
        prisma.transaction.count({ where }),
        prisma.transaction.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
      ]);

      // Accurate statistics from actual data
      const [numberCount, numberCountWithSms, totalSpentFromNumbers, totalTopup] =
        await Promise.all([
          // Total completed numbers (purchased)
          prisma.activeNumber.count({
            where: {
              userId,
              status: "COMPLETED",
            },
          }),
          // Numbers with SMS received (actual used)
          prisma.activeNumber.count({
            where: {
              userId,
              status: "COMPLETED",
              smsContent: { not: null },
            },
          }),
          // Total spent on completed numbers
          prisma.activeNumber.aggregate({
            where: {
              userId,
              status: "COMPLETED",
            },
            _sum: { price: true },
          }),
          // Total deposits + refunds
          prisma.transaction.aggregate({
            where: {
              walletId: wallet.id,
              status: "COMPLETED",
              type: {
                in: ["DEPOSIT", "REFUND"],
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
   * Deposit via UTR (Race-safe)
   */
  deposit: protectedProcedure
    .input(
      z.object({
        utr: z.string().trim().min(1).max(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { utr } = input;

      const settings = await prisma.settings.findUnique({
        where: { id: "1" },
        select: {
          bharatpeMerchantId: true,
          bharatpeToken: true,
          minRechargeAmount: true,
          maxRechargeAmount: true,
          upiId: true,
        },
      });

      if (!settings?.bharatpeMerchantId || !settings?.bharatpeToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Payment verification is not configured.",
        });
      }

      let verifyResult;
      try {
        const bharatPeClient = createBharatPeClient(
          settings.bharatpeMerchantId,
          settings.bharatpeToken
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
        return {
          success: false,
          message: "Transaction not found.",
        };
      }

      if (!verifyResult.canCredit) {
        return {
          success: false,
          message: "Transaction cannot be credited.",
        };
      }

      const amount = verifyResult.amount ?? 0;

      const minAmount = toNumber(settings.minRechargeAmount);
      const maxAmount = toNumber(
        new Decimal(settings.maxRechargeAmount ?? 5000)
      );

      if (amount < minAmount) {
        return {
          success: false,
          message: `Minimum recharge amount is ${minAmount}.`,
        };
      }

      if (amount > maxAmount) {
        return {
          success: false,
          message: `Maximum recharge amount is ${maxAmount}.`,
        };
      }

      // Validate payee
      if (verifyResult.payeeIdentifier && settings.upiId) {
        const apiPayee = verifyResult.payeeIdentifier.toLowerCase();
        const expected = settings.upiId.split("@")[0]?.toLowerCase();

        if (!apiPayee.includes(expected) && !expected.includes(apiPayee)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Payment not made to correct UPI ID.",
          });
        }
      }

      let wallet = await prisma.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        wallet = await prisma.wallet.create({
          data: {
            userId,
            balance: new Decimal(0),
            totalSpent: new Decimal(0),
            totalRecharge: new Decimal(0),
            totalOtp: 0,
          },
        });
      }

      // RACE-SAFE ATOMIC TRANSACTION
      try {
        await prisma.$transaction(async (tx) => {
          await tx.transaction.create({
            data: {
              walletId: wallet!.id,
              type: "DEPOSIT",
              amount: new Decimal(amount),
              status: "COMPLETED",
              description: `Deposit via UPI`,
              txnId: utr, // UNIQUE CONSTRAINT HERE
              metadata: {
                utr,
                payerName: verifyResult.payerName,
                payerVpa: verifyResult.payerVpa,
                transactionDate: verifyResult.transactionDate,
              },
            },
          });

          await tx.wallet.update({
            where: { id: wallet!.id },
            data: {
              balance: { increment: new Decimal(amount) },
              totalRecharge: { increment: new Decimal(amount) },
            },
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
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
        message: `Successfully added ${amount} to wallet.`,
      };
    }),

  /**
   * Redeem Promo (fixed totalRecharge bug)
   */
  redeemPromo: protectedProcedure
    .input(
      z.object({
        code: z.string().trim().min(1).max(50).toUpperCase(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { code } = input;

      const promocode = await prisma.promocode.findUnique({
        where: { code },
      });

      if (!promocode || !promocode.isActive) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid or inactive promo code.",
        });
      }

      if (promocode.usedCount >= promocode.maxUses) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Promo usage limit reached.",
        });
      }

      const existingUse = await prisma.promocodeHistory.findUnique({
        where: {
          promocodeId_userId: {
            promocodeId: promocode.id,
            userId,
          },
        },
      });

      if (existingUse) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You already used this promo code.",
        });
      }

      let wallet = await prisma.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        wallet = await prisma.wallet.create({
          data: {
            userId,
            balance: new Decimal(0),
            totalSpent: new Decimal(0),
            totalRecharge: new Decimal(0),
            totalOtp: 0,
          },
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.wallet.update({
          where: { id: wallet!.id },
          data: {
            balance: { increment: promocode.amount },
            // NOT incrementing totalRecharge (promo ≠ real deposit)
          },
        });

        await tx.transaction.create({
          data: {
            walletId: wallet!.id,
            type: "PROMO",
            amount: promocode.amount,
            status: "COMPLETED",
            description: `Promo code: ${promocode.code}`,
          },
        });

        await tx.promocode.update({
          where: { id: promocode.id },
          data: {
            usedCount: { increment: 1 },
          },
        });

        await tx.promocodeHistory.create({
          data: {
            promocodeId: promocode.id,
            userId,
            amount: promocode.amount,
          },
        });
      });

      return {
        success: true,
        amount: toNumber(promocode.amount),
        message: `Successfully redeemed ${code}.`,
      };
    }),
});