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

/* ──────────────────────────────────────────────────────────────── */
/* Types                                                            */
/* ──────────────────────────────────────────────────────────────── */

type SmsEntry = {
  content: string;
  receivedAt: string;
};

type RefundReason = 'expired' | 'provider_cancelled';

type RefundPayload = {
  id: string;
  price: Prisma.Decimal;
  orderId: string;
  serviceId: string;
};

/* ──────────────────────────────────────────────────────────────── */
/* Helpers                                                          */
/* ──────────────────────────────────────────────────────────────── */

/**
 * Append a new SMS to the smsContent array on an ActiveNumber.
 * Handles backward-compat with old string format.
 * Returns true if a new SMS was added, false if it was a duplicate.
 *
 * IMPORTANT: Always call this OUTSIDE of prisma.$transaction blocks.
 * Calling it inside a transaction causes isolation conflicts where the
 * write silently rolls back, leaving smsContent as null in the DB.
 */
async function appendSmsContent(
  numberId: string,
  newSms: string
): Promise<boolean> {
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
      // Backward compat: convert old string format to array
      existing = [
        {
          content: current.smsContent,
          receivedAt: new Date().toISOString(),
        },
      ];
    }
  }

  // Deduplicate — don't add same SMS twice
  if (existing.some((s) => s.content === newSms)) return false;

  await prisma.activeNumber.update({
    where: { id: numberId },
    data: {
      smsContent: [
        ...existing,
        {
          content: newSms,
          receivedAt: new Date().toISOString(),
        },
      ],
    },
  });

  return true;
}

/**
 * Auto-refund when number expires without SMS or provider cancels.
 * Uses updateMany with balanceDeducted=true check to prevent double
 * refunds atomically — if count === 0 it means already refunded, skip.
 */
async function handleAutoRefund(
  activeNumber: RefundPayload,
  userId: string,
  reason: RefundReason
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) return;

    const service = await tx.service.findUnique({
      where: { id: activeNumber.serviceId },
    });

    // Atomic guard — only proceeds if balanceDeducted is still true
    // Prevents double refunds if called from multiple places concurrently
    const updated = await tx.activeNumber.updateMany({
      where: { id: activeNumber.id, balanceDeducted: true },
      data: {
        status: NumberStatus.CANCELLED,
        activeStatus: ActiveStatus.CLOSED,
        balanceDeducted: false,
      },
    });

    // Already refunded by another process — skip
    if (updated.count === 0) return;

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
        type: 'REFUND',
        amount: activeNumber.price,
        status: 'COMPLETED',
        description:
          reason === 'expired'
            ? 'Auto-refund: Number expired without SMS'
            : 'Auto-refund: Provider cancelled order',
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
/* Core Poll Logic                                                  */
/* ──────────────────────────────────────────────────────────────── */

async function pollActiveNumbers(): Promise<void> {
  const numbers = await prisma.activeNumber.findMany({
    where: {
      activeStatus: ActiveStatus.ACTIVE,
      status: { not: NumberStatus.CANCELLED },
    },
    include: {
      service: { include: { server: { include: { api: true } } } },
    },
  });

  if (!numbers.length) return;

  const now = Date.now();

  for (const number of numbers) {
    try {
      // Skip numbers still waiting for provider details after purchase
      if (
        number.numberId === 'PENDING' ||
        number.phoneNumber === 'PENDING'
      ) {
        continue;
      }

      /* ───── Expiry Handling ───── */

      if (number.expiresAt && number.expiresAt.getTime() < now) {
        const hasSms = !!number.smsContent;

        if (hasSms) {
          // SMS already received — just close the number, no refund needed
          // Use updateMany so concurrent calls are idempotent
          await prisma.activeNumber.updateMany({
            where: {
              id: number.id,
              activeStatus: ActiveStatus.ACTIVE,
            },
            data: {
              activeStatus: ActiveStatus.CLOSED,
              status: NumberStatus.COMPLETED,
            },
          });
          console.log(
            `[expired] orderId=${number.orderId} closed with SMS`
          );
        } else {
          // FIX: No SMS — let handleAutoRefund close + refund atomically.
          // Previously this block set balanceDeducted=false BEFORE calling
          // handleAutoRefund, which caused the guard inside handleAutoRefund
          // to find 0 matching rows and skip the refund entirely.
          // Now handleAutoRefund owns the full atomic close+refund operation.
          await handleAutoRefund(
            {
              id: number.id,
              price: number.price,
              orderId: number.orderId,
              serviceId: number.serviceId,
            },
            number.userId,
            'expired'
          );
          console.log(
            `[expired] orderId=${number.orderId} refunded`
          );
        }

        continue;
      }

      /* ───── Build provider client ───── */

      const otpClient = new OtpProviderClient({
        apiUrl: number.service.server.api.apiUrl,
        apiKey: number.service.server.api.apiKey,
      });

      /* ───── Additional SMS (multi-SMS support) ───── */

      if (
        number.smsContent &&
        number.status === NumberStatus.COMPLETED
      ) {
        const nextCheck = await otpClient.getNextSms(number.numberId);

        if (nextCheck.success && nextCheck.hasMore) {
          const additionalStatus = await otpClient.getStatus(
            number.numberId
          );

          if (
            additionalStatus.status === 'RECEIVED' &&
            additionalStatus.sms
          ) {
            const added = await appendSmsContent(
              number.id,
              additionalStatus.sms
            );

            if (added) {
              await otpClient.finishOrder(number.numberId);
              console.log(
                `[sms+] orderId=${number.orderId} additional SMS saved`
              );
            }
          }
        }

        continue;
      }

      /* ───── First SMS — poll provider ───── */

      let statusResponse;
      try {
        statusResponse = await otpClient.getStatus(number.numberId);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : JSON.stringify(err);
        console.error(
          `[net-err] orderId=${number.orderId}:`,
          message
        );
        continue;
      }

      /* ── SMS received ── */

      if (
        statusResponse.status === 'RECEIVED' &&
        statusResponse.sms
      ) {
        // appendSmsContent must be called OUTSIDE of any transaction
        // (see function comment above)
        const added = await appendSmsContent(
          number.id,
          statusResponse.sms
        );

        if (added) {
          await prisma.activeNumber.update({
            where: { id: number.id },
            data: {
              status: NumberStatus.COMPLETED,
              activeStatus: ActiveStatus.ACTIVE, // stays ACTIVE until expiry or user closes
            },
          });

          await otpClient.finishOrder(number.numberId);

          console.log(
            `[sms] orderId=${number.orderId} SMS received`
          );
        }

        continue;
      }

      /* ── Provider cancelled ── */

      if (statusResponse.status === 'CANCELLED') {
        await handleAutoRefund(
          {
            id: number.id,
            price: number.price,
            orderId: number.orderId,
            serviceId: number.serviceId,
          },
          number.userId,
          'provider_cancelled'
        );

        console.log(
          `[cancelled] orderId=${number.orderId} refunded`
        );

        continue;
      }

      // STATUS_WAIT_CODE — nothing to do, will poll again next interval

    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : JSON.stringify(err);
      console.error(
        `[poll-err] orderId=${number.orderId}:`,
        message
      );
    }
  }
}

/* ──────────────────────────────────────────────────────────────── */
/* PM2 Loop                                                         */
/* ──────────────────────────────────────────────────────────────── */

async function run(): Promise<void> {
  console.log(
    `[otp-poller] started — interval=${POLL_INTERVAL}ms`
  );

  process.on('SIGINT', async () => {
    console.log('[otp-poller] shutting down (SIGINT)');
    await prisma.$disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('[otp-poller] shutting down (SIGTERM)');
    await prisma.$disconnect();
    process.exit(0);
  });

  while (true) {
    try {
      await pollActiveNumbers();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : JSON.stringify(err);
      console.error('[otp-poller] unhandled error:', message);
    }

    await new Promise((resolve) =>
      setTimeout(resolve, POLL_INTERVAL)
    );
  }
}

run();