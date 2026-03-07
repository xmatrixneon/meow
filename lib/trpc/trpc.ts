import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { headers as nextHeaders } from "next/headers";
import type { User } from "@/types";

export interface Context {
  session: Awaited<ReturnType<typeof auth.api.getSession>> | null;
  user: User | null;
}

export async function createTRPCContext(): Promise<Context> {
  // FIX (Bug 5): wrap nextHeaders() in try/catch — it throws outside
  // a request context (e.g. during Next.js static generation at build time)
  let headersList: Awaited<ReturnType<typeof nextHeaders>>;
  try {
    headersList = await nextHeaders();
  } catch {
    return { session: null, user: null };
  }

  // FIX (Bug 4): removed all console.log calls that were logging session
  // cookies and user IDs on every single tRPC request in production.
  // Re-enable locally by setting DEBUG_TRPC=1 in your .env if needed.
  const debug = process.env.DEBUG_TRPC === "1";

  if (debug) {
    console.log("[TRPC] Creating context, ua:", headersList.get("user-agent")?.substring(0, 60));
  }

  const session = await auth.api.getSession({ headers: headersList });

  if (debug) {
    console.log("[TRPC] Session:", { hasSession: !!session, userId: session?.user?.id });
  }

  if (!session) {
    return { session: null, user: null };
  }

  return {
    session,
    user: session.user as User,
  };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

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