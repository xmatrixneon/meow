import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "./routers/_app";

/**
 * tRPC React client
 * Creates typed hooks for use in React components
 *
 * Usage:
 * ```tsx
 * import { trpc } from "@/lib/trpc/client";
 *
 * function MyComponent() {
 *   const { data } = trpc.service.list.useQuery();
 *   return <div>{JSON.stringify(data)}</div>;
 * }
 * ```
 */
export const trpc = createTRPCReact<AppRouter>();
