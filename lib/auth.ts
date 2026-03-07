import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { telegram } from "better-auth-telegram";
import { UserStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";

// ─── Startup Guards ──────────────────────────────────────────────────────────
// Hard-fail immediately if required env vars are missing.
// Using `!` non-null assertions would silently pass `undefined` into the
// Telegram plugin and produce confusing runtime errors on first login.

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("[auth] TELEGRAM_BOT_TOKEN is not set");
}
if (!process.env.TELEGRAM_BOT_USERNAME) {
  throw new Error("[auth] TELEGRAM_BOT_USERNAME is not set");
}
if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error(
    "[auth] BETTER_AUTH_SECRET is not set — generate one with: openssl rand -base64 32",
  );
}

const baseURL = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
if (!baseURL) {
  throw new Error("[auth] BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL must be set");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Filter out both JS `undefined` AND the literal string "undefined".
// NEXT_PUBLIC_ vars are inlined at build time as the string "undefined" when
// the env var wasn't set — a simple `!!value` check passes for that string.
function isTrustedOrigin(v: string | undefined): v is string {
  return typeof v === "string" && v.length > 0 && v !== "undefined";
}

// ─── User Bootstrap ───────────────────────────────────────────────────────────
//
// WHY THIS EXISTS:
// better-auth only creates the `User` row on first Telegram login.
// Without bootstrapping, new users have no Wallet, UserData, or UserApi row.
// The stubs API sees `userData === null` and returns ACCOUNT_BLOCKED.
// The wallet router throws on missing wallet. The API key page shows empty.
//
// WHY `databaseHooks` ALONE IS UNRELIABLE:
// better-auth calls `databaseHooks.user.create.after` INSIDE its own open
// database transaction. When our hook tries to INSERT child rows (Wallet,
// UserData, UserApi) referencing the new userId via FK, PostgreSQL sometimes
// sees the parent User row as not yet visible within that transaction —
// throwing a FK constraint violation that silently crashes the hook.
// The user still logs in (auth continues regardless), but the hook never runs
// to completion, leaving them in a broken half-bootstrapped state.
//
// THE FIX — two-layer defence:
//
//   Layer 1 (auth.ts): `databaseHooks.user.create.after` + `setImmediate`
//     The hook defers the bootstrap via `setImmediate` so it runs AFTER
//     better-auth's transaction has fully committed and the User row is
//     visible to other queries. This handles the happy path for new users.
//
//   Layer 2 (stubs route + wallet router): `upsert`-based auto-repair
//     Every protected entrypoint auto-creates missing records on demand.
//     This handles any edge case where the hook still fails (DB hiccup,
//     process restart, race on multi-instance deployment, etc.).
//
// Together these two layers guarantee that no user can ever be permanently
// stuck in a broken state regardless of deployment topology.

async function bootstrapNewUser(userId: string): Promise<void> {
  try {
    // All three records in a single interactive transaction.
    // Callback form guarantees full rollback if any step fails —
    // unlike the array/batch form which doesn't roll back earlier operations.
    //
    // Use upsert everywhere so re-running the bootstrap is idempotent —
    // safe to call multiple times without creating duplicates.
    // nanoid is loaded via dynamic import — avoids ESM-only issues in
    // Next.js App Router where static ESM imports can break in some configs.
    await prisma.$transaction(async (tx) => {
      await tx.wallet.upsert({
        where: { userId },
        create: {
          userId,
          balance: 0,
          totalSpent: 0,
          totalRecharge: 0,
          totalOtp: 0,
        },
        update: {}, // already exists — never overwrite balance
      });

      await tx.userData.upsert({
        where: { userId },
        create: {
          userId,
          // Use enum value — UserData.status is a UserStatus enum in schema.
          // Prisma accepts the string "ACTIVE" at runtime but the enum gives
          // compile-time type safety and prevents typo bugs.
          status: UserStatus.ACTIVE,
          lastLogin: new Date(),
        },
        update: { lastLogin: new Date() },
      });

      await tx.userApi.upsert({
        where: { userId },
        create: {
          userId,
          apiKey: (await import("nanoid")).nanoid(32),
          isActive: true,
          rateLimit: 100,
        },
        update: {}, // don't rotate an existing api key on re-run
      });
    });

    console.log(`[auth] ✓ Bootstrapped new user ${userId}`);
  } catch (err) {
    // Log but don't rethrow — auth must succeed even if bootstrap fails.
    // Layer 2 (upserts in stubs/wallet routes) will repair missing rows
    // on the user's first API call.
    console.error(`[auth] Bootstrap failed for user ${userId}:`, err);
  }
}

// ─── Auth Instance ────────────────────────────────────────────────────────────

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
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // extend session after 1 day of use

    cookieCache: {
      enabled: true,
      maxAge: 300, // 5 min — revalidates from DB after this
      // SECURITY (M2): 'compact' encodes session data in the cookie (readable
      // by the client but signed — not encrypted). Use 'jwe' if you need the
      // session payload to be opaque to the browser (e.g. contains sensitive
      // user fields). 'compact' is fine here since our session only contains
      // userId and standard claims.
      strategy: "compact",
    },

  // SECURITY: advancedCookieOptions — better-auth sets httpOnly and secure by
  // default in production (when BETTER_AUTH_URL is https://). Explicitly
  // setting sameSite here ensures CSRF protection regardless of framework
  // inference. 'lax' allows top-level navigations (Telegram mini-app redirect)
  // while blocking cross-site POST requests.
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
  },

  databaseHooks: {
    user: {
      create: {
        // Layer 1: deferred bootstrap via setImmediate.
        //
        // `setImmediate` pushes the bootstrap to the NEXT iteration of the
        // Node.js event loop, AFTER better-auth's own transaction has
        // committed and the User row is fully visible to other queries.
        //
        // Without this deferral, our INSERT of child rows (Wallet, UserData,
        // UserApi) via FK to userId can fail with a FK constraint violation
        // because PostgreSQL doesn't yet see the parent User row as committed
        // when we're still inside better-auth's transaction.
        after: async (user) => {
          setImmediate(() => {
            bootstrapNewUser(user.id);
          });
        },
      },
    },
  },

  plugins: [
    telegram({
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      botUsername: process.env.TELEGRAM_BOT_USERNAME,
      maxAuthAge: 86400, // init data valid for 24 h — matches Telegram's default
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