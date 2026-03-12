#!/usr/bin/env npx tsx
/**
 * Wallet Reconciliation Script
 *
 * Verifies wallet balance matches the transaction ledger.
 * Run with --fix to correct discrepancies.
 *
 * Usage:
 *   npx tsx scripts/reconcile-wallet.ts           # Check all wallets
 *   npx tsx scripts/reconcile-wallet.ts --fix     # Fix discrepancies
 *   npx tsx scripts/reconcile-wallet.ts --user=X  # Check specific user
 */

import { config } from "dotenv";
config();

import { prisma } from "@/lib/db";
import { Prisma, TransactionType, TransactionStatus } from "@/app/generated/prisma/client";
const { Decimal } = Prisma;

function toDecimal(value: unknown): Prisma.Decimal {
  if (value instanceof Decimal) return value;
  return new Decimal(String(value || 0));
}

async function reconcileWallet(userId?: string, fix: boolean = false) {
  console.log("=== Wallet Reconciliation ===\n");

  const wallets = userId
    ? await prisma.wallet.findMany({ where: { userId } })
    : await prisma.wallet.findMany();

  if (wallets.length === 0) {
    console.log("No wallets found.");
    return;
  }

  let driftCount = 0;
  let totalDrift = new Decimal(0);

  for (const wallet of wallets) {
    // Compute balance from transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        walletId: wallet.id,
        status: TransactionStatus.COMPLETED,
      },
      select: { type: true, amount: true },
    });

    let computedBalance = new Decimal(0);

    for (const tx of transactions) {
      const amount = toDecimal(tx.amount);

      switch (tx.type) {
        case TransactionType.DEPOSIT:
        case TransactionType.PROMO:
        case TransactionType.REFERRAL:
        case TransactionType.REFUND:
        case TransactionType.ADJUSTMENT:
          computedBalance = computedBalance.plus(amount);
          break;
        case TransactionType.PURCHASE:
          computedBalance = computedBalance.minus(amount);
          break;
      }
    }

    const storedBalance = toDecimal(wallet.balance);
    const drift = computedBalance.minus(storedBalance);
    const hasDrift = !drift.equals(new Decimal(0));

    if (hasDrift) {
      driftCount++;
      totalDrift = totalDrift.plus(drift.abs());

      console.log(`DRIFT: Wallet ${wallet.id}`);
      console.log(`   User: ${wallet.userId}`);
      console.log(`   Stored:   ${storedBalance.toFixed(2)}`);
      console.log(`   Computed: ${computedBalance.toFixed(2)}`);
      console.log(`   Drift:    ${drift.toFixed(2)}`);

      if (fix) {
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: { balance: computedBalance },
        });
        console.log(`   FIXED`);
      }
      console.log();
    }
  }

  console.log("=== Summary ===");
  console.log(`Total wallets: ${wallets.length}`);
  console.log(`Drift detected: ${driftCount}`);
  console.log(`Total drift amount: ${totalDrift.toFixed(2)}`);

  if (driftCount > 0 && !fix) {
    console.log("\nRun with --fix to correct discrepancies.");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fix = args.includes("--fix");
  const userArg = args.find((a) => a.startsWith("--user="));
  const userId = userArg ? userArg.split("=")[1] : undefined;

  try {
    await reconcileWallet(userId, fix);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
