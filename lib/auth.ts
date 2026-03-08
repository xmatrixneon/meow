// lib/auth.ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { telegram } from "better-auth-telegram";
import { UserStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";

// ─── Env Guards ───────────────────────────────────────────────────────────────

const requiredEnv = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
} as const;

for (const [key, value] of Object.entries(requiredEnv)) {
  if (!value) throw new Error(`[auth] Missing required env var: ${key}`);
}

const baseURL = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
if (!baseURL) {
  throw new Error("[auth] Set BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL");
}

// ─── Trusted Origins ──────────────────────────────────────────────────────────
// NEXT_PUBLIC_ vars are inlined as the literal string "undefined" at build time
// when unset — a plain !! check passes for that, so we validate properly.

function isValidOrigin(v: string | undefined): v is string {
  return typeof v === "string" && v.length > 0 && v !== "undefined";
}

const trustedOrigins = [
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.BETTER_AUTH_URL,
  "http://localhost:3000",
  "https://localhost:3000",
].filter(isValidOrigin);

// ─── User Bootstrap ───────────────────────────────────────────────────────────
//
// WHY setImmediate:
// better-auth calls databaseHooks inside its own open transaction.
// Our FK child-row INSERTs can fail with constraint violations because
// PostgreSQL doesn't yet see the parent User row as committed.
// setImmediate defers to the next event-loop tick, after commit.
//
// WHY upsert:
// Idempotent — safe to re-run on retries or multi-instance deploys.
// Layer 2 auto-repair in stubs/wallet routes also uses upsert as fallback.

async function bootstrapUser(userId: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.wallet.upsert({
        where: { userId },
        create: {
          userId,
          balance: "0",
          totalSpent: "0",
          totalRecharge: "0",
          totalOtp: 0,
        },
        update: {}, // never overwrite existing balance
      });

      await tx.userData.upsert({
        where: { userId },
        create: {
          userId,
          status: UserStatus.ACTIVE,
          lastLogin: new Date(),
        },
        update: { lastLogin: new Date() },
      });

      const { nanoid } = await import("nanoid");
      await tx.userApi.upsert({
        where: { userId },
        create: {
          userId,
          apiKey: nanoid(32),
          isActive: true,
          rateLimit: 100,
        },
        update: {}, // never rotate an existing API key
      });
    });

    console.log(`[auth] ✓ Bootstrapped user ${userId}`);
  } catch (err) {
    // Non-fatal — Layer 2 upserts in stubs/wallet routes repair on first call
    console.error(`[auth] Bootstrap failed for user ${userId}:`, err);
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET!,
  trustedOrigins,

  database: prismaAdapter(prisma, { provider: "postgresql" }),

  session: {
    expiresIn: 60 * 60 * 24 * 7,  // 7 days
    updateAge: 60 * 60 * 24,       // extend after 1 day of activity
    cookieCache: {
      enabled: true,
      maxAge: 300,                  // revalidate from DB every 5 min
      strategy: "compact",
    },
  },

  advanced: {
    cookiePrefix: "meowsms",
    cookies: {
      session_token: {
        attributes: {
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          httpOnly: true,
        },
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          setImmediate(() => void bootstrapUser(user.id));
        },
      },
    },
  },

  plugins: [
    telegram({
      botToken: process.env.TELEGRAM_BOT_TOKEN!,
      botUsername: process.env.TELEGRAM_BOT_USERNAME!,
      autoCreateUser: true,
      maxAuthAge: 86_400, // 24h — matches Telegram default
      miniApp: {
        enabled: true,
        validateInitData: true,
        allowAutoSignin: true,

        // mapMiniAppDataToUser receives TelegramMiniAppUser which contains:
        // id, first_name, last_name?, username?, photo_url?,
        // language_code?, is_premium?, allows_write_to_pm?, is_bot?
        //
        // Fields NOT available here (they're on TelegramMiniAppData, not user):
        // auth_date, query_id, chat_instance, chat_type, start_param,
        // can_send_after, added_to_attachment_menu
        // Those schema columns stay null — acceptable, not critical for MeowSMS.
        //
        // Return type requires image: string | undefined (not null).
        mapMiniAppDataToUser: (data) => ({
          // Standard better-auth fields
          name: [data.first_name, data.last_name].filter(Boolean).join(" "),
          image: data.photo_url ?? undefined,

          // Telegram-specific User columns
          firstName: data.first_name,
          lastName: data.last_name ?? null,
          languageCode: data.language_code ?? null,
          isPremium: data.is_premium ?? false,
          allowsWriteToPm: data.allows_write_to_pm ?? false,
          photoUrl: data.photo_url ?? null,
        }),
      },
    }),
  ],
});

export type Auth = typeof auth;