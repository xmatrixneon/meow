// MUST be first - dotenv/config loads .env at import time before other imports are evaluated
import 'dotenv/config';

import {
  NumberStatus,
  ActiveStatus,
  TransactionType,
  TransactionStatus,
  Prisma,
} from '../app/generated/prisma/client';
import { prisma } from '../lib/db';
import { OtpProviderClient } from '../lib/providers/client';
// computeSmsUpdate: pure computation — used when we need to combine the SMS
//   write with other fields (status, activeStatus) in a single atomic update.
// appendSmsContent: DB read + write — used when smsContent is the only field
//   being updated (multi-SMS path where status is already COMPLETED).
import { computeSmsUpdate, appendSmsContent } from '../lib/sms';

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

// 'buy_failed'        = provider was never reached (ghost PENDING record).
// 'provider_cancelled' = provider explicitly cancelled a live order.
// 'expired'           = number timed out without receiving an SMS.
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

/**
 * Auto-refund when a number expires without SMS, provider cancels, or a buy
 * fails before the provider ever responded (ghost PENDING).
 *
 * Guards:
 *  - wallet is checked FIRST — if missing the transaction throws and rolls
 *    back so balanceDeducted is never flipped without a corresponding credit.
 *  - updateMany with balanceDeducted=true prevents double-refunds from
 *    concurrent poller cycles or a race with the cancel endpoint.
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
    // FIX: fetch wallet FIRST — throw if missing so the whole transaction
    // rolls back and balanceDeducted stays true, allowing a future retry.
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new Error(
        `[refund] Wallet not found for userId=${userId}, orderId=${activeNumber.orderId} — number NOT closed, will retry`,
      );
    }

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

    await tx.wallet.update({
      where: { userId },
      data: {
        balance: { increment: activeNumber.price },
        // totalSpent and totalOtp are not touched - they only increment when SMS is received
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
        type: TransactionType.REFUND,
        amount: activeNumber.price,
        status: TransactionStatus.COMPLETED,
        // refundOrderId unique constraint is the DB-level dedup backstop
        refundOrderId: activeNumber.orderId,
        orderId: activeNumber.orderId,
        description,
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

type ActiveNumberWithRelations = Awaited<ReturnType<typeof fetchActiveNumbers>>[0];

async function processNumber(number: ActiveNumberWithRelations): Promise<void> {
  try {
    /* ───── Ghost PENDING records from failed buy transactions ───── */

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
            // No phoneNumber — provider was never reached
          },
          number.userId,
          'buy_failed',
        );
      }
      return;
    }

    /* ───── Expiry handling ───── */

    if (number.expiresAt && number.expiresAt.getTime() < Date.now()) {
      if (number.smsContent) {
        // SMS already received — close and notify provider we're done.
        // finishOrder is best-effort; a crash here is acceptable — the
        // provider will eventually timeout on their side.
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
            phoneNumber: number.phoneNumber,
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
      // FIX: distinguish network/provider error from "no more SMS".
      // Previously: !nextCheck.success was treated the same as !hasMore —
      // a single transient network failure permanently closed the number and
      // called finishOrder, silently dropping any future SMS.
      // Now: only close when success=true AND hasMore=false (definitive answer
      // from the provider). On success=false (network error) we log and skip,
      // leaving the number open to be retried next poll cycle.
      const nextCheck = await otpClient.getNextSms(number.numberId);

      if (!nextCheck.success) {
        // Transient error — do not close. Will retry next cycle.
        console.warn(
          `[multi-sms] getNextSms failed for orderId=${number.orderId}, will retry next cycle`,
        );
        return;
      }

      if (!nextCheck.hasMore) {
        // Definitive: provider says no more SMS — safe to close.
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
        // appendSmsContent is correct here — status is already COMPLETED so
        // only smsContent needs updating. No need to combine fields.
        const { added } = await appendSmsContent(number.id, additionalStatus.sms);
        if (added) {
          console.log(`[sms+] orderId=${number.orderId} additional SMS saved`);
        }
      }
      return;
    }

    /* ───── First SMS — poll provider ───── */

    const statusResponse = await otpClient.getStatus(number.numberId);
    // getStatus never throws — returns WAITING on network errors (safe for poller)

    /* ── SMS received ── */

    if (statusResponse.status === 'RECEIVED' && statusResponse.sms) {
      // FIX: use computeSmsUpdate (pure, no DB write) so we can combine
      // smsContent + status + activeStatus into a single atomic update.
      const current = await prisma.activeNumber.findUnique({
        where: { id: number.id },
        select: { smsContent: true },
      });

      const { added, updatedList } = computeSmsUpdate(
        current?.smsContent,
        statusResponse.sms,
      );

      if (added) {
        // Single atomic write: smsContent + status + activeStatus together.
        await prisma.activeNumber.update({
          where: { id: number.id },
          data: {
            status: NumberStatus.COMPLETED,
            // Keep ACTIVE — user needs to see it, and multi-SMS may follow
            activeStatus: ActiveStatus.ACTIVE,
            smsContent: updatedList as Prisma.InputJsonValue,
          },
        });

        // Increment totalSpent and totalOtp only when SMS is received
        // This tracks actual successful purchases, not pending ones
        await prisma.wallet.update({
          where: { userId: number.userId },
          data: {
            totalSpent: { increment: number.price },
            totalOtp: { increment: 1 },
          },
        });

        // Update transaction metadata — single write, no transaction needed.
        const wallet = await prisma.wallet.findUnique({
          where: { userId: number.userId },
          select: { id: true },
        });

        if (wallet) {
          const existingTx = await prisma.transaction.findFirst({
            where: {
              walletId: wallet.id,
              type: TransactionType.PURCHASE,
              orderId: number.orderId,
            },
            select: { id: true, metadata: true },
          });

          if (existingTx?.metadata) {
            await prisma.transaction.update({
              where: { id: existingTx.id },
              data: {
                metadata: {
                  ...(existingTx.metadata as Record<string, unknown>),
                  smsReceived: true,
                },
              },
            }).catch((err) => {
              console.warn(
                `[sms] Failed to update transaction metadata for orderId=${number.orderId}:`,
                err,
              );
            });
          }
        }

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
          phoneNumber: number.phoneNumber,
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
  // Exclude numbers that expired more than 1 hour ago — already handled
  // (refunded/closed) or stuck and should be investigated manually.
  // Without this bound the poller re-processes the entire history each cycle.
  const staleCutoff = new Date(Date.now() - 60 * 60 * 1000);

  return prisma.activeNumber.findMany({
    where: {
      activeStatus: ActiveStatus.ACTIVE,
      status: { not: NumberStatus.CANCELLED },
      // Ghost PENDING records are always included regardless of age — once
      // handleAutoRefund closes them they drop out via status: { not: CANCELLED }.
      OR: [
        { expiresAt: { gte: staleCutoff } },
        { phoneNumber: 'PENDING' },
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

  // Process all numbers in parallel — Promise.allSettled so one failure
  // doesn't abort processing of the remaining numbers.
  await Promise.allSettled(numbers.map((n) => processNumber(n)));
}

async function run(): Promise<void> {
  console.log(`[otp-poller] started — interval=${POLL_INTERVAL}ms`);

  // Concurrency guard — prevents overlapping poll cycles if a cycle takes
  // longer than POLL_INTERVAL to complete.
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

  // Clean shutdown — disconnect Prisma on SIGINT/SIGTERM
  async function shutdown(signal: string): Promise<void> {
    console.log(`[otp-poller] shutting down (${signal})`);
    clearInterval(intervalHandle);
    await prisma.$disconnect();
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  const intervalHandle = setInterval(tick, POLL_INTERVAL);

  // Run immediately on startup
  await tick();
}

run();