/**
 * tRPC Module Exports
 *
 * This file provides clean exports for the tRPC setup
 */

// Server-side exports
export { createTRPCContext, createTRPCRouter, publicProcedure, protectedProcedure } from "./trpc";
export type { Context } from "./trpc";

// Router exports
export { appRouter, serviceRouter, numberRouter, walletRouter, adminRouter } from "./routers/_app";
export type { AppRouter } from "./routers/_app";

// Client-side exports
export { trpc } from "./client";
export { TRPCProvider } from "./provider";
