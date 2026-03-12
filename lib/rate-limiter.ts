import {
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
  RateLimiterAbstract,
} from "rate-limiter-flexible";
import Redis from "ioredis";

// ─── Redis Client (lazy singleton) ─────────────────────────────────────────────

let redisClient: Redis | null = null;
let redisConnectionAttempted = false;

function getRedisClient(): Redis | null {
  // Only attempt connection once
  if (redisConnectionAttempted) return redisClient;
  redisConnectionAttempted = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log("[rate-limiter] REDIS_URL not set, using in-memory rate limiting");
    return null;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      lazyConnect: true,
      connectTimeout: 5000,
    });

    redisClient.on("error", (err) => {
      console.error("[rate-limiter] Redis connection error:", err.message);
    });

    redisClient.on("connect", () => {
      console.log("[rate-limiter] Connected to Redis");
    });

    console.log(`[rate-limiter] Redis client created for ${redisUrl.replace(/:[^:@]+@/, ':****@')}`);
    return redisClient;
  } catch (err) {
    console.error("[rate-limiter] Failed to create Redis client:", err);
    return null;
  }
}

// ─── Lazy Rate Limiter Wrapper ─────────────────────────────────────────────────

type LimiterConfig = {
  keyPrefix: string;
  points: number;
  duration: number;
  blockDuration?: number;
};

/**
 * Lazy rate limiter that creates the actual limiter on first use.
 * This ensures environment variables are loaded before Redis connection.
 */
class LazyRateLimiter {
  private limiter: RateLimiterAbstract | null = null;
  private config: LimiterConfig;

  constructor(config: LimiterConfig) {
    this.config = config;
  }

  private getLimiter(): RateLimiterAbstract {
    if (!this.limiter) {
      const redis = getRedisClient();
      if (redis) {
        this.limiter = new RateLimiterRedis({
          storeClient: redis,
          ...this.config,
        });
      } else {
        this.limiter = new RateLimiterMemory(this.config);
      }
    }
    return this.limiter;
  }

  async consume(key: string | number, points?: number): Promise<RateLimiterRes> {
    return this.getLimiter().consume(key, points);
  }

  async get(key: string | number): Promise<RateLimiterRes | null> {
    return this.getLimiter().get(key);
  }
}

// ─── Rate Limiters (lazy initialized) ───────────────────────────────────────────

/**
 * Rate limiter for API key regeneration - daily limit.
 *
 * Limits:
 * - 3 refreshes per day
 * - 30 minute cooldown between refreshes (blockDuration)
 *
 * Uses Redis when REDIS_URL is set, falls back to in-memory for local dev.
 */
const apiKeyRefreshLimiter = new LazyRateLimiter({
  keyPrefix: "api_key_refresh",
  points: 3, // 3 refreshes per day
  duration: 86400, // per 24 hours (in seconds)
  blockDuration: 1800, // 30 minute cooldown between refreshes (in seconds)
});

/**
 * Weekly rate limiter for API key regeneration.
 * Separate limiter to track weekly limit (10 per week).
 */
const apiKeyWeeklyLimiter = new LazyRateLimiter({
  keyPrefix: "api_key_refresh_weekly",
  points: 10, // 10 refreshes per week
  duration: 604800, // per 7 days (in seconds)
});

/**
 * Rate limiter for external API (stubs/handler_api.php).
 * 30 requests per second per user.
 */
const apiRequestLimiter = new LazyRateLimiter({
  keyPrefix: "stubs_api",
  points: 30, // 30 requests
  duration: 1, // per second
});

// ─── Constants ────────────────────────────────────────────────────────────────

export const COOLDOWN_MS = 1800 * 1000; // 30 minutes in ms
export const DAILY_LIMIT = 3;
export const WEEKLY_LIMIT = 10;
export const API_RATE_LIMIT = 30; // requests per second

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
    let cooldownRemainingMs = 0;

    if (dailyRes) {
      if (dailyConsumed > 0 && dailyRes.msBeforeNext > 0) {
        const fullDurationMs = 86400 * 1000; // 24 hours
        const timeSinceLastRefresh = fullDurationMs - dailyRes.msBeforeNext;

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

/**
 * Consume API request quota for external API.
 * Throws RateLimiterRes on rate limit.
 */
export async function consumeApiQuota(userId: string): Promise<void> {
  await apiRequestLimiter.consume(userId);
}

/**
 * Get API rate limit info for response headers.
 */
export async function getApiRateLimitInfo(
  userId: string,
): Promise<{ msBeforeNext: number; remaining: number }> {
  const res = await apiRequestLimiter.get(userId);
  const consumed = res?.consumedPoints ?? 0;
  const msBeforeNext = res?.msBeforeNext ?? 1000;
  const remaining = Math.max(0, API_RATE_LIMIT - consumed);

  return { msBeforeNext, remaining };
}
