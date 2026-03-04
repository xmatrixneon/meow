"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState, type ReactNode } from "react";
import superjson from "superjson";
import { trpc } from "./client";

//  removed 1 line
//       74            // Add fetch wrapper to handle non-JSON responses                                                                                                                   
//       75            async fetch(url, options) {                                                                                                                                  
//       76              try {                                                                                                                                                             
//       77 -              const response = await fetch(url, options);                                                                                                                     
//       77 +              // Include credentials for cookie-based authentication                                                                                                          
//       78 +              const response = await fetch(url, {                                                                                                                             
//       79 +                ...options,                                                                                                                                                   
//       80 +                credentials: "include",                                                                                                                                       
//       81 +              });                 

/**
 * Props for TRPCProvider component
 */
interface TRPCProviderProps {
  children: ReactNode;
  /**
   * Optional custom API URL (defaults to /api/trpc)
   * Useful for development with different backends
   */
  apiUrl?: string;
}

/**
 * tRPC Provider Component
 *
 * Wraps the application with tRPC and React Query providers
 * Configured with superjson transformer for rich type serialization
 *
 * Usage:
 * ```tsx
 * // app/layout.tsx or app/providers.tsx
 * import { TRPCProvider } from "@/lib/trpc/provider";
 *
 * export function Providers({ children }) {
 *   return (
 *     <TRPCProvider>
 *       {children}
 *     </TRPCProvider>
 *   );
 * }
 * ```
 */
export function TRPCProvider({ children, apiUrl }: TRPCProviderProps) {
  // Create a new QueryClient per component tree to avoid SSR issues
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Stale time of 5 minutes
            staleTime: 5 * 60 * 1000,
            // Refetch on window focus
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  // Create tRPC client with batch links
  // In tRPC v11, transformer is configured per-link
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          // Use provided URL or default to /api/trpc
          url: apiUrl ?? "/api/trpc",
          // Transformer for serialization (superjson for rich types)
          transformer: superjson,
          // Headers function for auth
          headers() {
            return {
              // Include credentials for cookie-based auth
              // Note: credentials are handled by fetch automatically
            };
          },
          // Add fetch wrapper to handle non-JSON responses
          async fetch(url, options) {
            try {
              const response = await fetch(url, options);

              // Check if response is HTML instead of JSON
              const contentType = response.headers.get("content-type");
              if (!contentType?.includes("application/json")) {
                const text = await response.text();
                console.error("[tRPC] Non-JSON response received:", text.substring(0, 200));
                throw new Error("Server returned invalid response. Please try again.");
              }

              return response;
            } catch (error) {
              // Re-throw with better error message
              throw error instanceof Error ? error : new Error("Network error. Please check your connection.");
            }
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}

/**
 * Re-export trpc hooks from provider for convenience
 */
export { trpc } from "./client";
