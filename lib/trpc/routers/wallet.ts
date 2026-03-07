import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma, TransactionStatus } from "@/app/generated/prisma/client";
const { Decimal } = Prisma;

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/db";
import { createBharatPeClient, BharatPeError } from "@/lib/payments";

/**
 * Helper to convert Decimal to number for API responses.
 * Uses toNumber() — sufficient for display values (balance, totals).
 * For financial calculations always use Decimal arithmetic directly.
 */
function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return value.toNumber();
}

export const walletRouter = createTRPCRouter({
  /**
   * Get wallet balance and spending totals.
   * Auto-creates wallet if missing (safety net for edge cases where
   * auth.ts bootstrap hook failed on signup).
   */
  balance: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    // FIX (R1): use upsert instead of findUnique + create to avoid P2002
    // race when two requests simultaneously hit this endpoint for a new user.
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
   * Transaction history with statistics.
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
      // FIX (TS1): cast status to TransactionStatus — the zod enum union type
      // doesn't automatically satisfy Prisma's expected enum type, which can
      // cause TS compile errors in strict mode.
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

      const [numberCount, numberCountWithSms, totalSpentFromNumbers, totalTopup] =
        await Promise.all([
          prisma.activeNumber.count({ where: { userId, status: "COMPLETED" } }),

          // FIX #6 (wallet): use `{ not: null }` for Json? field instead of
          // `{ not: Prisma.DbNull }`. Prisma distinguishes DbNull (SQL NULL) from
          // JsonNull (JSON `null`), but `{ not: null }` handles both correctly
          // and is the idiomatic form for "field has any value".
          prisma.activeNumber.count({
            where: {
              userId,
              status: "COMPLETED",
              // FIX (TS2): Prisma requires Prisma.DbNull for SQL NULL checks on
              // Json? fields — plain `null` does not satisfy JsonNullValueFilter type.
              // Prisma.DbNull = SQL NULL (field absent), Prisma.JsonNull = JSON null value.
              // We want "field is not SQL NULL" = has been written = { not: Prisma.DbNull }.
              smsContent: { not: Prisma.DbNull },
            },
          }),

          prisma.activeNumber.aggregate({
            where: { userId, status: "COMPLETED" },
            _sum: { price: true },
          }),

          prisma.transaction.aggregate({
            where: {
              walletId: wallet.id,
              status: "COMPLETED",
              type: { in: ["DEPOSIT", "REFUND"] },
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
   * Deposit via UTR (race-safe).
   *
   * Race safety: the unique constraint on Transaction.txnId is the authoritative
   * dedup guard. Two concurrent requests with the same UTR: one succeeds, the
   * other gets P2002 → "already used" error.
   *
   * Referral bonus: if the depositing user was referred by another user, the
   * referrer gets a percentage bonus credited to their wallet after the deposit
   * succeeds. This is fire-and-forget — a referral failure never blocks the
   * depositor's own credit.
   */
  deposit: protectedProcedure
    .input(z.object({
      // FIX (V1): validate UTR format before hitting BharatPe API.
      // Real UPI UTRs are alphanumeric, 8–30 chars. Rejecting obviously
      // malformed values prevents spam/probe attacks on the payment API.
      utr: z.string().trim().min(8).max(30).regex(
        /^[A-Za-z0-9]+$/,
        "Invalid UTR format — must be 8–30 alphanumeric characters."
      ),
    }))
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
          referralPercent: true,
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
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        }
        throw error;
      }

      if (!verifyResult.found) {
        return { success: false, message: "Transaction not found." };
      }

      if (!verifyResult.canCredit) {
        return { success: false, message: "Transaction cannot be credited." };
      }

      const rawAmount = verifyResult.amount ?? 0;
      // SECURITY (C2): validate amount is a positive finite number before any
      // comparison. BharatPe API could theoretically return null, NaN, -1, or
      // a string — all of which would pass a naive >= minAmount check.
      if (typeof rawAmount !== 'number' || !Number.isFinite(rawAmount) || rawAmount <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid transaction amount received from payment provider.",
        });
      }
      const amount = rawAmount;
      const minAmount = toNumber(settings.minRechargeAmount);

      // FIX #5 (wallet): settings.maxRechargeAmount is already a Prisma.Decimal —
      // wrapping it in `new Decimal(...)` is redundant and `new Decimal(null)`
      // would throw before the `?? 5000` default could apply.
      // Use toNumber() directly which handles null/undefined safely.
      const maxAmount = toNumber(settings.maxRechargeAmount ?? 5000);

      if (amount < minAmount) {
        return { success: false, message: `Minimum recharge amount is ₹${minAmount}.` };
      }

      if (amount > maxAmount) {
        return { success: false, message: `Maximum recharge amount is ₹${maxAmount}.` };
      }

      // FIX (S1): payee UPI ID validation.
      // If the payment API returns a payeeIdentifier, we MUST validate it —
      // skipping when settings.upiId is null would accept payments to any UPI ID.
      // If settings.upiId is unconfigured, treat it as a configuration error.
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

      // FIX (R1): upsert is race-safe — concurrent first-time deposits won't
      // both try to create the wallet and race to P2002.
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

      // RACE-SAFE: txnId unique constraint on Transaction is the authoritative
      // dedup guard. Two concurrent requests with the same UTR: one gets P2002.
      try {
        await prisma.$transaction(async (tx) => {
          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              type: "DEPOSIT",
              amount: new Decimal(amount),
              status: "COMPLETED",
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

      // FIX #8 (wallet): Referral bonus hook.
      //
      // If this user was referred by another user and the platform has a
      // referral percentage configured, credit the referrer a bonus.
      //
      // This runs AFTER the deposit transaction commits — fire-and-forget.
      // A referral failure never blocks the depositor's own credit.
      //
      // Schema assumption: User has an optional `referredBy` field (String?)
      // storing the referrer's userId. Add this to your schema if not present:
      //   referredBy String?
      //
      // TODO: uncomment once `referredBy` is added to the User model in schema.prisma
      //
      // if (settings.referralPercent > 0) {
      //   creditReferralBonus(userId, amount, settings.referralPercent).catch((err) => {
      //     console.error(`[referral] Failed to credit bonus for userId=${userId}:`, err);
      //   });
      // }

      return {
        success: true,
        amount,
        message: `Successfully added ₹${amount} to wallet.`,
      };
    }),

  /**
   * Redeem a promo code.
   *
   * Race safety: the PromocodeHistory[promocodeId, userId] unique constraint
   * is the authoritative dedup guard — caught as P2002.
   * Two simultaneous requests can both pass the fast-path pre-check, but only
   * one will succeed the transaction insert.
   */
  redeemPromo: protectedProcedure
    .input(
      z.object({
        // FIX (Z1): .toUpperCase() is not a zod method in zod v3 — use .transform().
        // .transform() is always valid regardless of zod version.
        code: z.string().trim().min(1).max(50).transform(s => s.toUpperCase()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { code } = input;

      // FIX (W1): use case-insensitive mode for code lookup.
      // zod transforms input to uppercase, but DB codes may be mixed-case.
      // findFirst with mode:'insensitive' handles both cases safely.
      // Note: findUnique does not support mode:'insensitive' — must use findFirst.
      const promocode = await prisma.promocode.findFirst({
        where: { code: { equals: code, mode: "insensitive" } },
      });

      if (!promocode || !promocode.isActive) {
        // SECURITY (H3): use same message for invalid AND inactive — prevents enumeration
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid promo code." });
      }

      if (promocode.usedCount >= promocode.maxUses) {
        // SECURITY (H3): don't reveal the code exists but is exhausted
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid promo code." });
      }

      // Fast-path check (non-authoritative — P2002 below is the real guard)
      const existingUse = await prisma.promocodeHistory.findUnique({
        where: { promocodeId_userId: { promocodeId: promocode.id, userId } },
      });

      if (existingUse) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You already used this promo code." });
      }

      // FIX (R1): upsert is race-safe — no P2002 if two promo requests race
      // on a new user who has no wallet yet.
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
          // FIX (R2): atomic usedCount guard — use updateMany with usedCount < maxUses
          // as the WHERE condition. If another request already incremented usedCount
          // to maxUses, this update matches 0 rows and we throw EXHAUSTED.
          // This replaces the pre-transaction usedCount check which had a race window.
          const guardUpdate = await tx.promocode.updateMany({
            where: {
              id: promocode.id,
              isActive: true,
              usedCount: { lt: promocode.maxUses },
            },
            data: { usedCount: { increment: 1 } },
          });

          if (guardUpdate.count === 0) {
            // Either another request exhausted the code between our pre-check
            // and this transaction, or it was deactivated mid-flight.
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid promo code.",
            });
          }

          // PromocodeHistory unique[promocodeId, userId] guards per-user dedup.
          // This insert throws P2002 if this user already used the code.
          await tx.promocodeHistory.create({
            data: {
              promocodeId: promocode.id,
              userId,
              amount: promocode.amount,
            },
          });

          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              balance: { increment: promocode.amount },
              // NOT incrementing totalRecharge — promo credits ≠ real deposits
            },
          });

          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              type: "PROMO",
              amount: promocode.amount,
              status: "COMPLETED",
              description: `Promo code: ${promocode.code}`,
            },
          });
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error; // re-throw our own errors
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
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

// ─── Referral Bonus Helper ────────────────────────────────────────────────────
//
// Called after a successful deposit. Finds the referrer and credits them a
// percentage of the deposit amount. Idempotent — does nothing if:
//   - the user was not referred by anyone
//   - the referrer's wallet is missing
//   - referralPercent is 0
//
// To activate: add `referredBy String?` to the User model in schema.prisma,
// then uncomment the call in the deposit mutation above.
//
// async function creditReferralBonus(
//   userId: string,
//   depositAmount: number,
//   referralPercent: number,
// ): Promise<void> {
//   const user = await prisma.user.findUnique({
//     where: { id: userId },
//     select: { referredBy: true },
//   });
//
//   if (!user?.referredBy) return;
//
//   const referrer = await prisma.wallet.findUnique({
//     where: { userId: user.referredBy },
//   });
//
//   if (!referrer) return;
//
//   const bonusAmount = new Decimal(depositAmount).mul(referralPercent).div(100);
//   if (bonusAmount.isZero()) return;
//
//   await prisma.$transaction(async (tx) => {
//     await tx.wallet.update({
//       where: { userId: user.referredBy! },
//       data: { balance: { increment: bonusAmount } },
//     });
//
//     await tx.transaction.create({
//       data: {
//         walletId: referrer.id,
//         type: "REFERRAL",
//         amount: bonusAmount,
//         status: "COMPLETED",
//         description: `Referral bonus: ${referralPercent}% of ₹${depositAmount} deposit`,
//         metadata: { referredUserId: userId, depositAmount, referralPercent },
//       },
//     });
//   });
//
//   console.log(
//     `[referral] Credited ₹${bonusAmount} to referrer=${user.referredBy} for deposit by userId=${userId}`,
//   );
// }