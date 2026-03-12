import { prisma } from "@/lib/db";

export type SmsEntry = {
  id: string;
  content: string;
  receivedAt: Date;
};

/**
 * Create a new SMS message for an active number.
 * Returns the created message or null if duplicate detected.
 *
 * IMPORTANT: Call OUTSIDE of prisma.$transaction blocks to avoid isolation conflicts.
 */
export async function createSmsMessage(
  activeNumberId: string,
  content: string,
): Promise<{ created: boolean; message: SmsEntry | null }> {
  // Check for duplicate content within last 60 seconds (debounce rapid duplicates)
  const recentDuplicate = await prisma.smsMessage.findFirst({
    where: {
      activeNumberId,
      content,
      receivedAt: {
        gte: new Date(Date.now() - 60 * 1000),
      },
    },
  });

  if (recentDuplicate) {
    return { created: false, message: null };
  }

  const message = await prisma.smsMessage.create({
    data: {
      activeNumberId,
      content,
    },
    select: {
      id: true,
      content: true,
      receivedAt: true,
    },
  });

  return { created: true, message };
}

/**
 * Get all SMS messages for an active number, ordered by receivedAt.
 */
export async function getSmsMessages(activeNumberId: string): Promise<SmsEntry[]> {
  const messages = await prisma.smsMessage.findMany({
    where: { activeNumberId },
    orderBy: { receivedAt: "asc" },
    select: {
      id: true,
      content: true,
      receivedAt: true,
    },
  });

  return messages;
}

/**
 * Get the latest SMS message for an active number.
 */
export async function getLatestSms(activeNumberId: string): Promise<SmsEntry | null> {
  const message = await prisma.smsMessage.findFirst({
    where: { activeNumberId },
    orderBy: { receivedAt: "desc" },
    select: {
      id: true,
      content: true,
      receivedAt: true,
    },
  });

  return message;
}

/**
 * Check if an active number has any SMS messages.
 */
export async function hasSmsMessages(activeNumberId: string): Promise<boolean> {
  const count = await prisma.smsMessage.count({
    where: { activeNumberId },
  });

  return count > 0;
}

/**
 * Parse SMS content to extract OTP code.
 * Looks for 4-8 digit codes in the message.
 */
export function extractOTP(content: string | null): string | null {
  if (!content) return null;

  // Common OTP patterns: 4-8 consecutive digits
  const match = content.match(/\b(\d{4,8})\b/);
  return match ? match[1] : null;
}
