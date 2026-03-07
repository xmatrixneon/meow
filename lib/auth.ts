import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { telegram } from "better-auth-telegram";
// FIX (Bug 1): use shared prisma from lib/db — eliminates duplicate Pool + PrismaClient
import { prisma } from "@/lib/db";

// FIX (Bug 2): hard-fail at startup if required tokens are missing
// (previously used ! assertion which silently passed undefined to the Telegram plugin)
if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("[auth] TELEGRAM_BOT_TOKEN is not set");
}
if (!process.env.TELEGRAM_BOT_USERNAME) {
  throw new Error("[auth] TELEGRAM_BOT_USERNAME is not set");
}

const baseURL = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
if (!baseURL) throw new Error("[auth] BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL must be set");

// FIX (Bug 3): filter out both JS undefined AND the string "undefined".
// NEXT_PUBLIC_ vars get inlined at build time as the literal string "undefined"
// if the env var wasn't set — !!origin passes for that string.
function isTrustedOrigin(v: string | undefined): v is string {
  return typeof v === "string" && v.length > 0 && v !== "undefined";
}

export const auth = betterAuth({
  baseURL,

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
    cookieCache: {
      enabled: true,
      maxAge: 300,
    },
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },

  // FIX (Root cause of ACCOUNT_BLOCKED for new users):
  //
  // better-auth only creates the User row on first Telegram login.
  // Without this hook, new users had:
  //   - No Wallet   → balance queries throw, purchases fail
  //   - No UserData → stubs API sees null and returns ACCOUNT_BLOCKED
  //   - No UserApi  → API key page shows empty until user navigates there
  //
  // This hook atomically creates all three in a single DB transaction
  // right after the User row is created. Auth still succeeds even if
  // the hook fails — stubs/wallet routers have auto-create fallbacks too.
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            const { nanoid } = await import("nanoid");

            await prisma.$transaction([
              prisma.wallet.create({
                data: {
                  userId: user.id,
                  balance: 0,
                  totalSpent: 0,
                  totalRecharge: 0,
                  totalOtp: 0,
                },
              }),
              prisma.userData.create({
                data: {
                  userId: user.id,
                  status: "ACTIVE",
                  lastLogin: new Date(),
                },
              }),
              prisma.userApi.create({
                data: {
                  userId: user.id,
                  apiKey: nanoid(32),
                  isActive: true,
                  rateLimit: 100,
                },
              }),
            ]);

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
      maxAuthAge: 86400,
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