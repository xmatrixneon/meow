"use client";
// providers/index.tsx
//
// Single entry point imported by layout.tsx.
//
// WHY dynamic + ssr: false:
// @telegram-apps/sdk-react calls useRawInitData() which reads from
// window.location — this throws on the server where window doesn't exist.
// ssr: false ensures the entire TelegramAuthProvider subtree is
// skipped during SSR and only renders in the browser.

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";

const TelegramAuthProvider = dynamic(
  () =>
    import("./telegram-auth-provider").then((m) => ({
      default: m.TelegramAuthProvider,
    })),
  {
    ssr: false,
    loading: () => null, // no flash — TelegramGate handles the loading UI
  },
);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <TelegramAuthProvider>{children}</TelegramAuthProvider>
    </ThemeProvider>
  );
}