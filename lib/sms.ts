import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";

export type SmsEntry = {
  content: string;
  receivedAt: string;
};

/**
 * Pure computation — no DB access.
 *
 * Parses the existing smsContent field (handles legacy string format and
 * current array format) and returns whether the new SMS is a duplicate,
 * plus the updated list if it should be persisted.
 *
 * Callers are responsible for persisting updatedList however they need to —
 * this lets fetch.ts combine smsContent + status into a single atomic write
 * instead of doing two separate DB writes.
 */
export function computeSmsUpdate(
  existing: unknown,
  newSms: string,
): { added: boolean; updatedList: SmsEntry[] } {
  let parsed: SmsEntry[] = [];

  if (existing) {
    if (Array.isArray(existing)) {
      parsed = existing as SmsEntry[];
    } else if (typeof existing === "string") {
      // Backward-compat: old records stored a plain string
      parsed = [{ content: existing, receivedAt: new Date().toISOString() }];
    }
  }

  if (parsed.some((s) => s.content === newSms)) {
    return { added: false, updatedList: parsed };
  }

  return {
    added: true,
    updatedList: [...parsed, { content: newSms, receivedAt: new Date().toISOString() }],
  };
}

/**
 * Convenience wrapper for callers that only need to append smsContent and
 * don't need to combine the write with other fields (e.g. status).
 *
 * Used by the multi-SMS path in fetch.ts where status is already COMPLETED
 * and doesn't need updating alongside the new SMS.
 *
 * IMPORTANT: always call OUTSIDE of prisma.$transaction blocks —
 * calling inside causes isolation conflicts that silently roll back.
 */
export async function appendSmsContent(
  numberId: string,
  newSms: string,
): Promise<{ added: boolean; updatedList: SmsEntry[] }> {
  const current = await prisma.activeNumber.findUnique({
    where: { id: numberId },
    select: { smsContent: true },
  });

  if (!current) return { added: false, updatedList: [] };

  const result = computeSmsUpdate(current.smsContent, newSms);

  if (result.added) {
    await prisma.activeNumber.update({
      where: { id: numberId },
      data: { smsContent: result.updatedList as Prisma.InputJsonValue },
    });
  }

  return result;
}