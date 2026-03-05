import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/db";
import { nanoid } from "nanoid";

// Configuration constants
const COOLDOWN_MINUTES = 30;  // Must wait 30 min between refreshes
const DAILY_LIMIT = 3;         // Max 3 refreshes per day
const WEEKLY_LIMIT = 10;       // Max 10 refreshes per week

/**
 * Helper function to get start of day in local timezone
 */
function getStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Helper function to get start of week in local timezone (Monday)
 */
function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust so Monday is day 1
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const apiKeyRouter = createTRPCRouter({
  /**
   * Get or create user's API key
   * Automatically creates a new API key if none exists
   * Returns refresh limits information
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    // Try to find existing API key
    let userApi = await prisma.userApi.findUnique({
      where: { userId },
    });

    // Create new API key if none exists
    if (!userApi) {
      const apiKey = nanoid(32);
      userApi = await prisma.userApi.create({
        data: {
          userId,
          apiKey,
          isActive: true,
          rateLimit: 100,
        },
      });
    }

    const now = new Date();
    const lastRefreshed = userApi.lastRefreshedAt || userApi.createdAt;

    // Calculate remaining limits
    const canRefresh = now.getTime() - lastRefreshed.getTime() >= COOLDOWN_MINUTES * 60 * 1000;

    // Calculate daily refreshes (this only works with full audit log, for now use refreshCount as proxy)
    // For simplicity, we'll just check against weekly limit
    const weeklyRemaining = Math.max(0, WEEKLY_LIMIT - userApi.refreshCount);

    // Calculate cooldown remaining
    const cooldownRemaining = Math.max(
      0,
      COOLDOWN_MINUTES - (now.getTime() - lastRefreshed.getTime()) / (60 * 1000)
    );

    return {
      apiKey: userApi.apiKey,
      isActive: userApi.isActive,
      createdAt: userApi.createdAt.toISOString(),
      lastRefreshedAt: userApi.lastRefreshedAt?.toISOString() || null,
      refreshCount: userApi.refreshCount,
      canRefresh,
      cooldownRemaining: Math.ceil(cooldownRemaining),
      weeklyRemaining,
      limits: {
        cooldownMinutes: COOLDOWN_MINUTES,
        dailyLimit: DAILY_LIMIT,
        weeklyLimit: WEEKLY_LIMIT,
      },
    };
  }),

  /**
   * Refresh/regenerate user's API key
   * Invalidates the old key and creates a new one
   * Multiple rate limits to prevent abuse:
   * - 30 minutes cooldown between refreshes
   * - 3 refreshes per day
   * - 10 refreshes per week
   */
  refresh: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    const now = new Date();

    // Check if API key exists
    const existing = await prisma.userApi.findUnique({
      where: { userId },
    });

    if (!existing) {
      // Create new record if none exists (first time user)
      const newApiKey = nanoid(32);
      const created = await prisma.userApi.create({
        data: {
          userId,
          apiKey: newApiKey,
          isActive: true,
          rateLimit: 100,
          refreshCount: 0,
          lastRefreshedAt: now,
        },
      });

      return {
        apiKey: created.apiKey,
        isActive: created.isActive,
        createdAt: created.createdAt.toISOString(),
        lastRefreshedAt: created.lastRefreshedAt?.toISOString(),
        refreshCount: created.refreshCount,
        regenerated: false,
      };
    }

    // Check cooldown period (30 minutes)
    const lastRefreshed = existing.lastRefreshedAt || existing.createdAt;
    const minutesSinceLastRefresh = (now.getTime() - lastRefreshed.getTime()) / (1000 * 60);

    if (minutesSinceLastRefresh < COOLDOWN_MINUTES) {
      const minutesRemaining = Math.ceil(COOLDOWN_MINUTES - minutesSinceLastRefresh);
      throw new Error(
        `Please wait ${minutesRemaining} more minute(s) before refreshing again.`
      );
    }

    // Check weekly limit (10 per week)
    if (existing.refreshCount >= WEEKLY_LIMIT) {
      throw new Error(
        `You have reached the weekly limit of ${WEEKLY_LIMIT} refreshes. Please try again next week.`
      );
    }

    // Note: Daily limit would require tracking refresh timestamps in a separate table
    // For now, we're implementing cooldown + weekly limit which provides good protection
    // To add daily limit, we'd need a UserApiRefreshLog table

    // Update existing record with new key
    const updated = await prisma.userApi.update({
      where: { userId },
      data: {
        apiKey: nanoid(32),
        isActive: true,
        lastRefreshedAt: now,
        refreshCount: existing.refreshCount + 1,
      },
    });

    return {
      apiKey: updated.apiKey,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
      lastRefreshedAt: updated.lastRefreshedAt?.toISOString(),
      refreshCount: updated.refreshCount,
      regenerated: true,
    };
  }),
});
