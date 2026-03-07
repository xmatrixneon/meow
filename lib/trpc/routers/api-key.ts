import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/db";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";

// ─── Configuration ────────────────────────────────────────────────────────────

const COOLDOWN_MINUTES = 30;  // Must wait 30 min between refreshes
const DAILY_LIMIT = 3;        // Max 3 refreshes per day
const WEEKLY_LIMIT = 10;      // Max 10 refreshes per week

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Start of today in UTC (consistent across server restarts) */
function startOfTodayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Start of current week (Monday) in UTC */
function startOfThisWeekUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day; // roll back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const apiKeyRouter = createTRPCRouter({
  /**
   * Get or create the user's API key.
   * Returns key info + all rate limit details so the UI can display them.
   *
   * FIX: weekly/daily counts are now derived from real refresh timestamps
   * stored in UserApiRefreshLog, not a single counter that never resets.
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    let userApi = await prisma.userApi.findUnique({ where: { userId } });

    if (!userApi) {
      userApi = await prisma.userApi.create({
        data: { userId, apiKey: nanoid(32), isActive: true, rateLimit: 100 },
      });
    }

    const now = new Date();
    const lastRefreshed = userApi.lastRefreshedAt ?? userApi.createdAt;

    // FIX (Bug 7 + 8): count from real log records — resets automatically
    const [dailyCount, weeklyCount] = await Promise.all([
      prisma.userApiRefreshLog.count({
        where: { userId, createdAt: { gte: startOfTodayUTC() } },
      }),
      prisma.userApiRefreshLog.count({
        where: { userId, createdAt: { gte: startOfThisWeekUTC() } },
      }),
    ]);

    const msSinceLast = now.getTime() - lastRefreshed.getTime();
    const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;
    const canRefresh =
      msSinceLast >= cooldownMs &&
      dailyCount < DAILY_LIMIT &&
      weeklyCount < WEEKLY_LIMIT;

    const cooldownRemaining = Math.max(0, Math.ceil((cooldownMs - msSinceLast) / 60_000));

    return {
      apiKey: userApi.apiKey,
      isActive: userApi.isActive,
      createdAt: userApi.createdAt.toISOString(),
      lastRefreshedAt: userApi.lastRefreshedAt?.toISOString() ?? null,
      canRefresh,
      cooldownRemaining,           // minutes remaining in cooldown
      dailyRemaining: Math.max(0, DAILY_LIMIT - dailyCount),
      weeklyRemaining: Math.max(0, WEEKLY_LIMIT - weeklyCount),
      limits: {
        cooldownMinutes: COOLDOWN_MINUTES,
        dailyLimit: DAILY_LIMIT,
        weeklyLimit: WEEKLY_LIMIT,
      },
    };
  }),

  /**
   * Regenerate the user's API key.
   * Enforces: 30-min cooldown, 3/day, 10/week.
   *
   * FIX (Bug 7): weekly limit now resets every Monday via log-based counting.
   * FIX (Bug 8): daily limit is now actually enforced (was declared but never checked).
   * FIX: throws TRPCError instead of plain Error so the client gets a proper error code.
   */
  refresh: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    const now = new Date();

    let existing = await prisma.userApi.findUnique({ where: { userId } });

    // First-time user — create key, no cooldown needed
    if (!existing) {
      const created = await prisma.$transaction(async (tx) => {
        const userApi = await tx.userApi.create({
          data: { userId, apiKey: nanoid(32), isActive: true, rateLimit: 100, lastRefreshedAt: now },
        });
        await tx.userApiRefreshLog.create({ data: { userId } });
        return userApi;
      });

      return {
        apiKey: created.apiKey,
        isActive: created.isActive,
        createdAt: created.createdAt.toISOString(),
        lastRefreshedAt: created.lastRefreshedAt?.toISOString() ?? null,
        regenerated: false,
      };
    }

    // ── Rate limit checks ──────────────────────────────────────────────────

    const lastRefreshed = existing.lastRefreshedAt ?? existing.createdAt;
    const minutesSinceLast = (now.getTime() - lastRefreshed.getTime()) / 60_000;

    if (minutesSinceLast < COOLDOWN_MINUTES) {
      const minutesRemaining = Math.ceil(COOLDOWN_MINUTES - minutesSinceLast);
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Please wait ${minutesRemaining} more minute(s) before refreshing again.`,
      });
    }

    // FIX (Bug 8): daily limit is now enforced
    const dailyCount = await prisma.userApiRefreshLog.count({
      where: { userId, createdAt: { gte: startOfTodayUTC() } },
    });

    if (dailyCount >= DAILY_LIMIT) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Daily limit of ${DAILY_LIMIT} refreshes reached. Try again tomorrow.`,
      });
    }

    // FIX (Bug 7): weekly limit based on real timestamps — resets every Monday
    const weeklyCount = await prisma.userApiRefreshLog.count({
      where: { userId, createdAt: { gte: startOfThisWeekUTC() } },
    });

    if (weeklyCount >= WEEKLY_LIMIT) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Weekly limit of ${WEEKLY_LIMIT} refreshes reached. Try again next Monday.`,
      });
    }

    // ── Atomically rotate key + record the refresh ─────────────────────────

    const updated = await prisma.$transaction(async (tx) => {
      const userApi = await tx.userApi.update({
        where: { userId },
        data: {
          apiKey: nanoid(32),
          isActive: true,
          lastRefreshedAt: now,
          // Keep refreshCount for legacy compatibility but it's no longer
          // used for limit enforcement — the log table is the source of truth
          refreshCount: { increment: 1 },
        },
      });

      await tx.userApiRefreshLog.create({ data: { userId } });

      return userApi;
    });

    return {
      apiKey: updated.apiKey,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
      lastRefreshedAt: updated.lastRefreshedAt?.toISOString() ?? null,
      regenerated: true,
    };
  }),
});