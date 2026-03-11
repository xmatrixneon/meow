import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/db";
import { TRPCError } from "@trpc/server";
import { generateApiKey } from "@/lib/utils";
import {
  getRefreshRateLimitInfo,
  consumeRefreshQuota,
} from "@/lib/rate-limiter";

// ─── Configuration ────────────────────────────────────────────────────────────

const COOLDOWN_MINUTES = 30; // Must wait 30 min between refreshes
const DAILY_LIMIT = 3; // Max 3 refreshes per day
const WEEKLY_LIMIT = 10; // Max 10 refreshes per week

// ─── Router ───────────────────────────────────────────────────────────────────

export const apiKeyRouter = createTRPCRouter({
  /**
   * Get or create the user's API key.
   * Returns key info + rate limit details from rate-limiter-flexible.
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    let userApi = await prisma.userApi.findUnique({ where: { userId } });

    if (!userApi) {
      userApi = await prisma.userApi.create({
        data: { userId, apiKey: generateApiKey(), isActive: true, rateLimit: 100 },
      });
    }

    // Get rate limit info from rate-limiter-flexible
    const rateLimitInfo = await getRefreshRateLimitInfo(userId);

    const cooldownRemaining = Math.ceil(rateLimitInfo.cooldownRemainingMs / 60_000);

    return {
      apiKey: userApi.apiKey,
      isActive: userApi.isActive,
      createdAt: userApi.createdAt.toISOString(),
      lastRefreshedAt: userApi.lastRefreshedAt?.toISOString() ?? null,
      canRefresh: rateLimitInfo.canRefresh,
      cooldownRemaining,
      dailyRemaining: rateLimitInfo.dailyRemaining,
      weeklyRemaining: rateLimitInfo.weeklyRemaining,
      limits: {
        cooldownMinutes: COOLDOWN_MINUTES,
        dailyLimit: DAILY_LIMIT,
        weeklyLimit: WEEKLY_LIMIT,
      },
    };
  }),

  /**
   * Regenerate the user's API key.
   * Uses rate-limiter-flexible for rate limiting:
   * - 30-min cooldown between refreshes
   * - 3 refreshes per day
   * - 10 refreshes per week
   */
  refresh: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    const now = new Date();

    let existing = await prisma.userApi.findUnique({ where: { userId } });

    // First-time user — create key, no rate limit check needed
    if (!existing) {
      const created = await prisma.userApi.create({
        data: {
          userId,
          apiKey: generateApiKey(),
          isActive: true,
          rateLimit: 100,
          lastRefreshedAt: now,
        },
      });

      // Log the refresh for audit trail
      await prisma.userApiRefreshLog.create({ data: { userId } });

      // Consume quota in rate limiter
      await consumeRefreshQuota(userId);

      return {
        apiKey: created.apiKey,
        isActive: created.isActive,
        createdAt: created.createdAt.toISOString(),
        lastRefreshedAt: created.lastRefreshedAt?.toISOString() ?? null,
        regenerated: false,
      };
    }

    // ── Rate limit check using rate-limiter-flexible ─────────────────────────

    const rateLimitInfo = await getRefreshRateLimitInfo(userId);

    if (!rateLimitInfo.canRefresh) {
      // Determine the appropriate error message
      if (rateLimitInfo.cooldownRemainingMs > 0) {
        const minutesRemaining = Math.ceil(rateLimitInfo.cooldownRemainingMs / 60_000);
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Please wait ${minutesRemaining} more minute(s) before refreshing again.`,
        });
      }

      if (rateLimitInfo.dailyRemaining === 0) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Daily limit of ${DAILY_LIMIT} refreshes reached. Try again tomorrow.`,
        });
      }

      if (rateLimitInfo.weeklyRemaining === 0) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Weekly limit of ${WEEKLY_LIMIT} refreshes reached. Try again next week.`,
        });
      }
    }

    // ── Consume quota and rotate key ─────────────────────────────────────────

    const consumeResult = await consumeRefreshQuota(userId);
    if (!consumeResult.success) {
      const minutesRemaining = consumeResult.retryAfterMs
        ? Math.ceil(consumeResult.retryAfterMs / 60_000)
        : COOLDOWN_MINUTES;
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Please wait ${minutesRemaining} more minute(s).`,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const userApi = await tx.userApi.update({
        where: { userId },
        data: {
          apiKey: generateApiKey(),
          isActive: true,
          lastRefreshedAt: now,
          refreshCount: { increment: 1 },
        },
      });

      // Keep logging for audit trail
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
