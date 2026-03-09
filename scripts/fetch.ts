import { config } from 'dotenv';
config({ path: '.env' });

import {
  PrismaClient,
  NumberStatus,
  ActiveStatus,
  Prisma,
} from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OtpProviderClient } from '../lib/providers/client';

// SECURITY: fail fast if DATABASE_URL is missing — Pool() accepts undefined
// but only errors on the first query, producing a confusing message far from
// the real cause.
if (!process.env.DATABASE_URL) {
  console.error('[otp-poller] FATAL: DATABASE_URL is not set. Exiting.');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const _rawInterval = parseInt(process.env.POLL_INTERVAL ?? '5000', 10);
// BUG GUARD: parseInt returns NaN for garbage strings (e.g. 'fast'); 
// setInterval(fn, NaN) fires synchronously on every tick — instant DoS.
const POLL_INTERVAL = Number.isFinite(_rawInterval) && _rawInterval >= 1000
  ? _rawInterval
  : 5000;
// How long a PENDING (phoneNumber='PENDING') record can exist before we treat
// it as a ghost and refund it (provider call probably crashed mid-buy).
const PENDING_GHOST_TTL_MS = 5 * 60 * 1000; // 5 minutes

/* ──────────────────────────────────────────────────────────────── */
/* Types                                                            */
/* ──────────────────────────────────────────────────────────────── */

type SmsEntry = {
  content: string;
  receivedAt: string;
};

// FIX #3 (fetch): 'buy_failed' is a distinct reason from 'provider_cancelled' —
// buy_failed means the provider was never successfully reached (ghost PENDING record).
// provider_cancelled means the provider explicitly cancelled an active order.
type RefundReason = 'expired' | 'provider_cancelled' | 'buy_failed';

type RefundPayload = {
  id: string;
  price: Prisma.Decimal;
  orderId: string;
  serviceId: string;
  // Optional — ghost PENDING records have no real phone number yet
  phoneNumber?: string;
};

/* ──────────────────────────────────────────────────────────────── */
/* Helpers                                                          */
/* ──────────────────────────────────────────────────────────────── */

// FIX #3 (fetch): Removed unused `sleep()` function — dead code that was
// never called anywhere in this file.

/**
 * Append a new SMS to the smsContent array on an ActiveNumber.
 * Handles backward-compat with old string format.
 * Returns true if a new SMS was added, false if duplicate.
 *
 * IMPORTANT: Always call OUTSIDE of prisma.$transaction — calling inside
 * causes isolation conflicts where the write silently rolls back.
 */
async function appendSmsContent(numberId: string, newSms: string): Promise<boolean> {
  const current = await prisma.activeNumber.findUnique({
    where: { id: numberId },
    select: { smsContent: true },
  });
  if (!current) return false;

  let existing: SmsEntry[] = [];

  if (current.smsContent) {
    if (Array.isArray(current.smsContent)) {
      existing = current.smsContent as SmsEntry[];
    } else if (typeof current.smsContent === 'string') {
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
      ],
    },
  });

  return true;
}

/**
 * Auto-refund when a number expires without SMS, provider cancels, or a buy
 * fails before the provider ever responded (ghost PENDING).
 *
 * Guards:
 *  - updateMany with balanceDeducted=true prevents double-refunds from
 *    concurrent poller cycles or a race with the stubs/cancel endpoints.
 *  - refundOrderId unique constraint provides DB-level dedup as a final
 *    backstop — a duplicate REFUND transaction will fail with P2002 instead
 *    of silently crediting the user twice.
 */
async function handleAutoRefund(
  activeNumber: RefundPayload,
  userId: string,
  reason: RefundReason,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId } });

    const service = await tx.service.findUnique({
      where: { id: activeNumber.serviceId },
    });

    // Atomic guard — only proceeds if balanceDeducted is still true.
    // If another process already refunded, count === 0 and we skip safely.
    const updated = await tx.activeNumber.updateMany({
      where: { id: activeNumber.id, balanceDeducted: true },
      data: {
        status: NumberStatus.CANCELLED,
        activeStatus: ActiveStatus.CLOSED,
        balanceDeducted: false,
      },
    });

    if (updated.count === 0) return; // Already refunded — skip

    if (!wallet) {
      // Number is closed but balance can't be returned — log for manual recovery
      console.error(
        `[refund] Wallet not found for userId=${userId}, orderId=${activeNumber.orderId} — number closed but balance NOT refunded`,
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

    const description = (() => {
      if (reason === 'expired') return 'Auto-refund: Number expired without SMS';
      if (reason === 'buy_failed') return 'Auto-refund: Purchase failed before number was assigned';
      return 'Auto-refund: Provider cancelled order';
    })();

    await tx.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'REFUND',
        amount: activeNumber.price,
        status: 'COMPLETED',
        // FIX #1 (fetch): refundOrderId for DB-level dedup — unique constraint
        // in schema prevents a duplicate REFUND even if two processes race here.
        refundOrderId: activeNumber.orderId,
        description,
        // FIX #2 (fetch): include phoneNumber when available for transaction history
        ...(activeNumber.phoneNumber && { phoneNumber: activeNumber.phoneNumber }),
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

/* ──────────────────────────────────────────────────────────────── */
/* Per-number processor                                             */
/* ──────────────────────────────────────────────────────────────── */

// Infer element type of the fetchActiveNumbers array result
type ActiveNumberWithRelations = Awaited<ReturnType<typeof fetchActiveNumbers>>[0];

async function processNumber(number: ActiveNumberWithRelations): Promise<void> {
  try {
    // FIX (Bug 11 cross-file): ghost PENDING records from failed buy transactions
    if (number.numberId === 'PENDING' || number.phoneNumber === 'PENDING') {
      const age = Date.now() - number.createdAt.getTime();
      if (age > PENDING_GHOST_TTL_MS) {
        console.warn(
          `[ghost] orderId=${number.orderId} stuck PENDING for ${Math.round(age / 1000)}s — refunding`,
        );
        await handleAutoRefund(
          {
            id: number.id,
            price: number.price,
            orderId: number.orderId,
            serviceId: number.serviceId,
            // No phoneNumber — provider was never reached for ghost records
          },
          number.userId,
          // FIX #3 (fetch): use 'buy_failed' not 'provider_cancelled' —
          // semantically distinct: provider was never successfully reached,
          // as opposed to the provider actively cancelling a live order.
          'buy_failed',
        );
      }
      return;
    }

    /* ───── Expiry handling ───── */

    if (number.expiresAt && number.expiresAt.getTime() < Date.now()) {
      if (number.smsContent) {
        // SMS already received — close and notify provider we're done.
        // FIX #7 (fetch): finishOrder is best-effort; crash window between
        // the updateMany and the finishOrder call is acceptable — the provider
        // will eventually timeout the order on their side.
        await prisma.activeNumber.updateMany({
          where: { id: number.id, activeStatus: ActiveStatus.ACTIVE },
          data: {
            activeStatus: ActiveStatus.CLOSED,
            status: NumberStatus.COMPLETED,
          },
        });

        const otpClientForFinish = new OtpProviderClient({
          apiUrl: number.service.server.api.apiUrl,
          apiKey: number.service.server.api.apiKey,
        });
        await otpClientForFinish.finishOrder(number.numberId).catch((err) => {
          console.warn(`[expired+sms] finishOrder failed for ${number.numberId}:`, err);
        });

        console.log(`[expired+sms] orderId=${number.orderId} closed`);
      } else {
        await handleAutoRefund(
          {
            id: number.id,
            price: number.price,
            orderId: number.orderId,
            serviceId: number.serviceId,
            phoneNumber: number.phoneNumber, // pass for transaction history
          },
          number.userId,
          'expired',
        );
        console.log(`[expired] orderId=${number.orderId} refunded`);
      }
      return;
    }

    /* ───── Build provider client ───── */

    const otpClient = new OtpProviderClient({
      apiUrl: number.service.server.api.apiUrl,
      apiKey: number.service.server.api.apiKey,
    });

    /* ───── Multi-SMS: check for additional SMS on already-completed numbers ───── */

    if (number.smsContent && number.status === NumberStatus.COMPLETED) {
      const nextCheck = await otpClient.getNextSms(number.numberId);

      if (!nextCheck.success || !nextCheck.hasMore) {
        // FIX (Bug 4): no more SMS — close the number so it's not polled forever.
        // FIX #7 (fetch): call finishOrder to tell the provider we're done.
        await prisma.activeNumber.updateMany({
          where: { id: number.id, activeStatus: ActiveStatus.ACTIVE },
          data: { activeStatus: ActiveStatus.CLOSED },
        });

        await otpClient.finishOrder(number.numberId).catch((err) => {
          console.warn(`[multi-sms] finishOrder failed for ${number.numberId}:`, err);
        });

        console.log(`[multi-sms] orderId=${number.orderId} no more SMS, closed`);
        return;
      }

      const additionalStatus = await otpClient.getStatus(number.numberId);

      if (additionalStatus.status === 'RECEIVED' && additionalStatus.sms) {
        const added = await appendSmsContent(number.id, additionalStatus.sms);
        if (added) {
          // FIX (Bug 3 + Bug 10): do NOT call finishOrder here — keep number open
          // for further SMS. finishOrder is only called when closing the number.
          console.log(`[sms+] orderId=${number.orderId} additional SMS saved`);
        }
      }
      return;
    }

    /* ───── First SMS — poll provider ───── */

    const statusResponse = await otpClient.getStatus(number.numberId);
    // getStatus no longer throws (fixed in client.ts Bug 6) — always returns safely

    /* ── SMS received ── */

    if (statusResponse.status === 'RECEIVED' && statusResponse.sms) {
      const added = await appendSmsContent(number.id, statusResponse.sms);

      if (added) {
        await prisma.activeNumber.update({
          where: { id: number.id },
          data: {
            status: NumberStatus.COMPLETED,
            // Keep ACTIVE so user can still see it and request next SMS
            activeStatus: ActiveStatus.ACTIVE,
          },
        });

        // Update Transaction metadata with smsReceived for history page display
        await prisma.$transaction(async (tx) => {
          const wallet = await tx.wallet.findUnique({ where: { userId: number.userId } });
          if (wallet) {
            // Find the PURCHASE transaction by orderId in metadata
            const existingTx = await tx.transaction.findFirst({
              where: {
                walletId: wallet.id,
                type: 'PURCHASE',
                metadata: { path: ['orderId'], equals: number.orderId },
              },
            });

            if (existingTx?.metadata) {
              // Update metadata with smsReceived: true
              await tx.transaction.update({
                where: { id: existingTx.id },
                data: {
                  metadata: {
                    ...(existingTx.metadata as Record<string, unknown>),
                    smsReceived: true,
                  },
                },
              });
            }
          }
        }).catch((err) => {
          console.warn(`[sms] Failed to update transaction metadata for orderId=${number.orderId}:`, err);
        });

        // FIX (Bug 3 + Bug 10): do NOT call finishOrder immediately.
        // finishOrder tells the provider we are done — but the number stays
        // ACTIVE for multi-SMS until expiry closes it.
        // finishOrder is called when we close the number (expiry or no more SMS).
        console.log(`[sms] orderId=${number.orderId} first SMS saved`);
      }
      return;
    }

    /* ── Provider cancelled ── */

    if (statusResponse.status === 'CANCELLED') {
      await handleAutoRefund(
        {
          id: number.id,
          price: number.price,
          orderId: number.orderId,
          serviceId: number.serviceId,
          phoneNumber: number.phoneNumber, // pass for transaction history
        },
        number.userId,
        'provider_cancelled',
      );
      console.log(`[cancelled] orderId=${number.orderId} refunded`);
      return;
    }

    // STATUS_WAIT_CODE — nothing to do this cycle, will poll again next interval

  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    console.error(`[poll-err] orderId=${number.orderId}:`, message);
  }
}

/* ──────────────────────────────────────────────────────────────── */
/* DB fetch                                                         */
/* ──────────────────────────────────────────────────────────────── */

async function fetchActiveNumbers() {
  // PERF: exclude numbers that expired more than 1 hour ago — they are already
  // handled (refunded/closed) or stuck and should be investigated manually.
  // Without this bound the poller re-processes the entire history on every cycle.
  const staleCutoff = new Date(Date.now() - 60 * 60 * 1000);
  return prisma.activeNumber.findMany({
    where: {
      activeStatus: ActiveStatus.ACTIVE,
      status: { not: NumberStatus.CANCELLED },
      // Skip records that are way past expiry — the index on (activeStatus, expiresAt)
      // in schema makes this filter efficient.
      OR: [
        { expiresAt: { gte: staleCutoff } },   // not yet very stale
        { phoneNumber: 'PENDING' },              // ghost records — always process
      ],
    },
    include: {
      service: { include: { server: { include: { api: true } } } },
    },
  });
}

/* ──────────────────────────────────────────────────────────────── */
/* Main poll loop                                                   */
/* ──────────────────────────────────────────────────────────────── */

async function pollActiveNumbers(): Promise<void> {
  const numbers = await fetchActiveNumbers();
  if (!numbers.length) return;

  // FIX (Bug 2): process all numbers in parallel — dramatically faster
  // Promise.allSettled so one failure doesn't abort the rest
  await Promise.allSettled(numbers.map((n) => processNumber(n)));
}

async function run(): Promise<void> {
  console.log(`[otp-poller] started — interval=${POLL_INTERVAL}ms`);

  // FIX (Bug 1): concurrency guard — prevents overlapping poll cycles
  let isPolling = false;

  async function tick(): Promise<void> {
    if (isPolling) return;
    isPolling = true;
    try {
      await pollActiveNumbers();
    } catch (err) {
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      console.error('[otp-poller] unhandled error:', message);
    } finally {
      isPolling = false;
    }
  }

  // FIX (Bug 5): clean shutdown — disconnect both prisma AND pg pool
  async function shutdown(signal: string): Promise<void> {
    console.log(`[otp-poller] shutting down (${signal})`);
    clearInterval(intervalHandle);
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Use setInterval so the gap between polls is consistent regardless of
  // how long the poll takes (combined with the isPolling guard above)
  const intervalHandle = setInterval(tick, POLL_INTERVAL);

  // Run immediately on startup
  await tick();
}

run();