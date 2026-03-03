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
/* Types */
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
/* Helpers */
/* ──────────────────────────────────────────────────────────────── */

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
      existing = [
        {
          content: current.smsContent,
          receivedAt: new Date().toISOString(),
        },
      ];
    }
  }

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

    const updated = await tx.activeNumber.updateMany({
      where: { id: activeNumber.id, balanceDeducted: true },
      data: {
        status: NumberStatus.CANCELLED,
        activeStatus: ActiveStatus.CLOSED,
        balanceDeducted: false,
      },
    });

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
/* Core Poll Logic */
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
      if (
        number.numberId === 'PENDING' ||
        number.phoneNumber === 'PENDING'
      ) {
        continue;
      }

      /* ───── Expiry Handling ───── */

      if (number.expiresAt && number.expiresAt.getTime() < now) {
        const hasSms = !!number.smsContent;
        const finalStatus = hasSms
          ? NumberStatus.COMPLETED
          : NumberStatus.CANCELLED;

        const updated = await prisma.activeNumber.updateMany({
          where: { id: number.id, balanceDeducted: true },
          data: {
            activeStatus: ActiveStatus.CLOSED,
            status: finalStatus,
            balanceDeducted: false,
          },
        });

        if (updated.count > 0 && !hasSms) {
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

          console.log(`[expired] orderId=${number.orderId} refunded`);
        }

        continue;
      }

      const otpClient = new OtpProviderClient({
        apiUrl: number.service.server.api.apiUrl,
        apiKey: number.service.server.api.apiKey,
      });

      /* ───── Additional SMS ───── */

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

      /* ───── First SMS ───── */

      let statusResponse;
      try {
        statusResponse = await otpClient.getStatus(number.numberId);
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : JSON.stringify(err);

        console.error(
          `[net-err] orderId=${number.orderId}:`,
          message
        );
        continue;
      }

      if (
        statusResponse.status === 'RECEIVED' &&
        statusResponse.sms
      ) {
        const added = await appendSmsContent(
          number.id,
          statusResponse.sms
        );

        if (added) {
          await prisma.activeNumber.update({
            where: { id: number.id },
            data: {
              status: NumberStatus.COMPLETED,
              activeStatus: ActiveStatus.ACTIVE,
            },
          });

          await otpClient.finishOrder(number.numberId);

          console.log(
            `[sms] orderId=${number.orderId} SMS received`
          );
        }

        continue;
      }

      /* ───── Provider Cancelled ───── */

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
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : JSON.stringify(err);

      console.error(
        `[poll-err] orderId=${number.orderId}:`,
        message
      );
    }
  }
}

/* ──────────────────────────────────────────────────────────────── */
/* PM2 Loop */
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
        err instanceof Error
          ? err.message
          : JSON.stringify(err);

      console.error('[otp-poller] unhandled error:', message);
    }

    await new Promise((resolve) =>
      setTimeout(resolve, POLL_INTERVAL)
    );
  }
}

run();