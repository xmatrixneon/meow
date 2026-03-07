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

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL ?? '5000', 10);
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

// FIX: added 'buy_failed' reason for ghost PENDING cleanup — distinct from
// 'provider_cancelled' which means the provider explicitly cancelled an active order.
type RefundReason = 'expired' | 'provider_cancelled' | 'buy_failed';

type RefundPayload = {
  id: string;
  price: Prisma.Decimal;
  orderId: string;
  serviceId: string;
  phoneNumber?: string;
};

/* ──────────────────────────────────────────────────────────────── */
/* Helpers                                                          */
/* ──────────────────────────────────────────────────────────────── */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
 * Auto-refund when number expires without SMS or provider cancels.
 * Uses updateMany + balanceDeducted=true guard to prevent double refunds.
 * If wallet is missing, still closes the number so it doesn't get re-processed.
 *
 * FIX: sets refundOrderId for DB-level dedup (unique constraint in schema).
 * FIX: accepts optional phoneNumber for proper transaction records.
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

    // Atomic guard — prevents double refunds from concurrent processes
    const updated = await tx.activeNumber.updateMany({
      where: { id: activeNumber.id, balanceDeducted: true },
      data: {
        status: NumberStatus.CANCELLED,
        activeStatus: ActiveStatus.CLOSED,
        balanceDeducted: false,
      },
    });

    if (updated.count === 0) return; // Already refunded by another process

    if (!wallet) {
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
        // FIX: refundOrderId gives DB-level dedup guarantee (unique constraint in schema)
        refundOrderId: activeNumber.orderId,
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

async function processNumber(number: Awaited<ReturnType<typeof fetchActiveNumbers>>[number]): Promise<void> {
  try {
    // Ghost PENDING records: buy transaction crashed before provider responded.
    // FIX: use reason='buy_failed' instead of 'provider_cancelled' — the provider
    // was never successfully reached, so this is a different failure mode.
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
        // SMS already received — close and call finishOrder to tell provider we're done.
        // FIX: finishOrder was previously never called — provider never knew we were done.
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
      const nextCheck = await otpClient.getNextSms(number.numberId);

      if (!nextCheck.success || !nextCheck.hasMore) {
        // No more SMS — close the number and call finishOrder.
        // FIX: finishOrder was previously never called here either.
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
          console.log(`[sms+] orderId=${number.orderId} additional SMS saved`);
        }
      }
      return;
    }

    /* ───── First SMS — poll provider ───── */

    const statusResponse = await otpClient.getStatus(number.numberId);

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

        // Do NOT call finishOrder here — number stays ACTIVE for multi-SMS.
        // finishOrder is called when we close the number (expiry or no more SMS above).
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

    // STATUS_WAIT_CODE — nothing to do, will poll again next interval
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    console.error(`[poll-err] orderId=${number.orderId}:`, message);
  }
}

/* ──────────────────────────────────────────────────────────────── */
/* DB fetch                                                         */
/* ──────────────────────────────────────────────────────────────── */

async function fetchActiveNumbers() {
  return prisma.activeNumber.findMany({
    where: {
      activeStatus: ActiveStatus.ACTIVE,
      status: { not: NumberStatus.CANCELLED },
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
  // doesn't abort the rest.
  await Promise.allSettled(numbers.map((n) => processNumber(n as any)));
}

async function run(): Promise<void> {
  console.log(`[otp-poller] started — interval=${POLL_INTERVAL}ms`);

  // Concurrency guard — prevents overlapping poll cycles
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

  // Clean shutdown — disconnect both prisma AND pg pool
  async function shutdown(signal: string): Promise<void> {
    console.log(`[otp-poller] shutting down (${signal})`);
    clearInterval(intervalHandle);
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  const intervalHandle = setInterval(tick, POLL_INTERVAL);

  // Run immediately on startup
  await tick();
}

run();