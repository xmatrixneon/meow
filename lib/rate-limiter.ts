import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";

// ─── API Key Refresh Rate Limiter ──────────────────────────────────────────────

/**
 * Rate limiter for API key regeneration - daily limit.
 *
 * Limits:
 * - 3 refreshes per day
 * - 30 minute cooldown between refreshes (blockDuration)
 *
 * Uses in-memory store. For distributed systems, replace with RateLimiterRedis.
 */
export const apiKeyRefreshLimiter = new RateLimiterMemory({
  keyPrefix: "api_key_refresh",
  points: 3, // 3 refreshes per day
  duration: 86400, // per 24 hours (in seconds)
  blockDuration: 1800, // 30 minute cooldown between refreshes (in seconds)
});

/**
 * Weekly rate limiter for API key regeneration.
 * Separate limiter to track weekly limit (10 per week).
 */
export const apiKeyWeeklyLimiter = new RateLimiterMemory({
  keyPrefix: "api_key_refresh_weekly",
  points: 10, // 10 refreshes per week
  duration: 604800, // per 7 days (in seconds)
});

// ─── Constants ────────────────────────────────────────────────────────────────

export const COOLDOWN_MS = 1800 * 1000; // 30 minutes in ms
export const DAILY_LIMIT = 3;
export const WEEKLY_LIMIT = 10;

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Get rate limit info for UI display.
 */
export async function getRefreshRateLimitInfo(userId: string): Promise<{
  dailyRemaining: number;
  weeklyRemaining: number;
  cooldownRemainingMs: number;
  canRefresh: boolean;
}> {
  try {
    const [dailyRes, weeklyRes] = await Promise.all([
      apiKeyRefreshLimiter.get(userId),
      apiKeyWeeklyLimiter.get(userId),
    ]);

    const dailyConsumed = dailyRes?.consumedPoints ?? 0;
    const weeklyConsumed = weeklyRes?.consumedPoints ?? 0;

    const dailyRemaining = Math.max(0, DAILY_LIMIT - dailyConsumed);
    const weeklyRemaining = Math.max(0, WEEKLY_LIMIT - weeklyConsumed);

    // Check cooldown: if user has consumed any points and is blocked
    // msBeforeNext represents time until points reset OR until block expires
    // If blockDuration is active, msBeforeNext will be the block duration remaining
    let cooldownRemainingMs = 0;

    if (dailyRes) {
      // If blocked (msBeforeNext > blockDuration time means we're in cooldown)
      // Actually, when blockDuration is set, if consume fails, msBeforeNext = remaining block time
      // We need to track last refresh time separately for accurate cooldown
      // For simplicity, we use the consumed points and msBeforeNext to estimate

      // When in cooldown, the limiter blocks for blockDuration (30 min)
      // msBeforeNext after a failed consume = remaining block time
      // But get() returns the time until points reset, not block time

      // Alternative: check if user has consumed points recently
      // For simplicity, we'll check if there's a recent consumption
      // by looking at msBeforeNext relative to full duration
      if (dailyConsumed > 0 && dailyRes.msBeforeNext > 0) {
        // Time since last refresh = full duration - msBeforeNext
        const fullDurationMs = 86400 * 1000; // 24 hours
        const timeSinceLastRefresh = fullDurationMs - dailyRes.msBeforeNext;

        // If less than cooldown period has passed, user is in cooldown
        if (timeSinceLastRefresh < COOLDOWN_MS) {
          cooldownRemainingMs = COOLDOWN_MS - timeSinceLastRefresh;
        }
      }
    }

    const canRefresh =
      dailyRemaining > 0 &&
      weeklyRemaining > 0 &&
      cooldownRemainingMs === 0;

    return {
      dailyRemaining,
      weeklyRemaining,
      cooldownRemainingMs,
      canRefresh,
    };
  } catch {
    // On error, return safe defaults (fail open)
    return {
      dailyRemaining: DAILY_LIMIT,
      weeklyRemaining: WEEKLY_LIMIT,
      cooldownRemainingMs: 0,
      canRefresh: true,
    };
  }
}

/**
 * Try to consume points for API key refresh.
 * Returns error info if rate limited.
 */
export async function consumeRefreshQuota(userId: string): Promise<{
  success: boolean;
  retryAfterMs?: number;
  limitType?: "cooldown" | "daily" | "weekly";
}> {
  try {
    // First check weekly limit (it doesn't have blockDuration)
    const weeklyRes = await apiKeyWeeklyLimiter.get(userId);
    const weeklyConsumed = weeklyRes?.consumedPoints ?? 0;

    if (weeklyConsumed >= WEEKLY_LIMIT) {
      return {
        success: false,
        retryAfterMs: weeklyRes?.msBeforeNext,
        limitType: "weekly",
      };
    }

    // Try to consume from daily limiter (handles both daily limit and cooldown)
    await apiKeyRefreshLimiter.consume(userId, 1);

    // Also consume from weekly limiter
    await apiKeyWeeklyLimiter.consume(userId, 1);

    return { success: true };
  } catch (error) {
    // RateLimiterRes is thrown on rate limit
    if (error instanceof RateLimiterRes) {
      // Check if it's a daily limit or cooldown issue
      const dailyRes = await apiKeyRefreshLimiter.get(userId);
      const dailyConsumed = dailyRes?.consumedPoints ?? 0;

      // If daily limit reached
      if (dailyConsumed >= DAILY_LIMIT) {
        return {
          success: false,
          retryAfterMs: error.msBeforeNext,
          limitType: "daily",
        };
      }

      // Otherwise it's cooldown
      return {
        success: false,
        retryAfterMs: error.msBeforeNext,
        limitType: "cooldown",
      };
    }

    // Unknown error, fail closed
    return {
      success: false,
      retryAfterMs: COOLDOWN_MS,
      limitType: "cooldown",
    };
  }
}
