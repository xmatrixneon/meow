import { createTRPCRouter } from "../trpc";
import { serviceRouter } from "./service";
import { numberRouter } from "./number";
import { walletRouter } from "./wallet";
import { adminRouter } from "./admin";

/**
 * Main tRPC App Router
 * Merges all feature routers into a single router
 */
export const appRouter = createTRPCRouter({
  service: serviceRouter,
  number: numberRouter,
  wallet: walletRouter,
  admin: adminRouter,
});

/**
 * Export the AppRouter type for client-side type inference
 * Use this in client code: import type { AppRouter } from "@/lib/trpc/routers/_app";
 */
export type AppRouter = typeof appRouter;

/**
 * Export individual routers for convenience
 */
export { serviceRouter, numberRouter, walletRouter, adminRouter };
