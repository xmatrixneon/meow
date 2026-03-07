import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { telegram } from "better-auth-telegram";
import { UserStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";

// Hard-fail at startup if required env vars are missing.
// Using ! assertion would silently pass undefined to the Telegram plugin.
if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("[auth] TELEGRAM_BOT_TOKEN is not set");
}
if (!process.env.TELEGRAM_BOT_USERNAME) {
  throw new Error("[auth] TELEGRAM_BOT_USERNAME is not set");
}
// BETTER_AUTH_SECRET is required by better-auth for cookie signing and
// token encryption. Without it, better-auth falls back to an insecure default.
if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("[auth] BETTER_AUTH_SECRET is not set — generate one with: openssl rand -base64 32");
}

const baseURL = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
if (!baseURL) throw new Error("[auth] BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL must be set");

// Filter out both JS undefined AND the string "undefined".
// NEXT_PUBLIC_ vars get inlined at build time as the literal string "undefined"
// if the env var wasn't set — a simple !!origin check passes for that string.
function isTrustedOrigin(v: string | undefined): v is string {
  return typeof v === "string" && v.length > 0 && v !== "undefined";
}

export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BETTER_AUTH_URL,
    "http://localhost:3000",
    "https://localhost:3000",
  ].filter(isTrustedOrigin),

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  session: {
    expiresIn: 60 * 60 * 24 * 7,   // 7 days
    updateAge: 60 * 60 * 24,        // extend session if used after 1 day
    cookieCache: {
      enabled: true,
      maxAge: 300,                   // 5 minutes — revalidates from DB after this
      // FIX: explicit strategy — 'compact' is fastest and smallest.
      // Without this, the strategy defaults may change across better-auth versions.
      // Use 'jwe' if you need cookie contents to be unreadable to the client.
      strategy: "compact",
    },
  },

  // Bootstrap new users atomically on first Telegram login.
  //
  // better-auth only creates the User row. Without this hook new users would have:
  //   - No Wallet   → balance queries throw, purchases fail
  //   - No UserData → stubs API sees null and returns ACCOUNT_BLOCKED
  //   - No UserApi  → API key page shows empty until user navigates there
  //
  // FIX: switched from prisma.$transaction([...]) array/batch form to the
  // callback form. The array form does NOT rollback earlier operations if a
  // later one fails — e.g. if userData.create throws, the wallet is already
  // created and the user is left in a broken half-bootstrapped state.
  // The callback form is a real interactive transaction with full rollback.
  //
  // Auth still succeeds even if the hook throws — the individual routers
  // (wallet, stubs) have their own auto-create fallbacks as a safety net.
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            const { nanoid } = await import("nanoid");

            await prisma.$transaction(async (tx) => {
              await tx.wallet.create({
                data: {
                  userId: user.id,
                  balance: 0,
                  totalSpent: 0,
                  totalRecharge: 0,
                  totalOtp: 0,
                },
              });

              await tx.userData.create({
                data: {
                  userId: user.id,
                  // FIX: use enum value — UserData.status is now a UserStatus
                  // enum in the schema. Prisma accepts the string "ACTIVE" at
                  // runtime but using the enum gives compile-time type safety.
                  status: UserStatus.ACTIVE,
                  lastLogin: new Date(),
                },
              });

              await tx.userApi.create({
                data: {
                  userId: user.id,
                  apiKey: nanoid(32),
                  isActive: true,
                  rateLimit: 100,
                },
              });
            });

            console.log(`[auth] Bootstrapped new user: ${user.id}`);
          } catch (err) {
            console.error(`[auth] Bootstrap failed for user ${user.id}:`, err);
          }
        },
      },
    },
  },

  plugins: [
    telegram({
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      botUsername: process.env.TELEGRAM_BOT_USERNAME,
      maxAuthAge: 86400,       // init data valid for 24h — matches Telegram's default
      autoCreateUser: true,
      miniApp: {
        enabled: true,
        validateInitData: true,
        allowAutoSignin: true,
      },
    }),
  ],
});

export type Auth = typeof auth;