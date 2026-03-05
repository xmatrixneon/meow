import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { headers as nextHeaders } from "next/headers";
import type { User } from "@/types";

/**
 * Context type for tRPC procedures
 */
export interface Context {
  session: Awaited<ReturnType<typeof auth.api.getSession>> | null;
  user: User | null;
}

/**
 * Creates the tRPC context for each request
 * Gets the session from Better Auth and extracts user data
 */
export async function createTRPCContext(): Promise<Context> {
  const headersList = await nextHeaders();

  // Log headers for debugging (remove in production)
  console.log("[TRPC Context] Creating context");
  console.log("[TRPC Context] Headers:", {
    cookie: headersList.get("cookie")?.substring(0, 50) + "...",
    userAgent: headersList.get("user-agent")?.substring(0, 50) + "...",
  });

  const session = await auth.api.getSession({
    headers: headersList,
  });

  console.log("[TRPC Context] Session result:", {
    hasSession: !!session,
    hasUser: !!session?.user,
    userId: session?.user?.id,
  });

  if (!session) {
    console.log("[TRPC Context] No session found, returning null user");
    return {
      session: null,
      user: null,
    };
  }

  // The user from session includes our extended Telegram fields
  console.log("[TRPC Context] Session found, returning user:", session.user.id);
  return {
    session,
    user: session.user as User,
  };
}

/**
 * Initialize tRPC with superjson transformer and custom error formatting
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Export reusable router and procedure builders
 */
export const createTRPCRouter = t.router;

/**
 * Public procedure - no authentication required
 */
export const publicProcedure = t.procedure;

/**
 * Protected procedure - requires authenticated user
 * Throws UNAUTHORIZED error if no user is present
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user || !ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this resource",
    });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      user: ctx.user,
    },
  });
});
