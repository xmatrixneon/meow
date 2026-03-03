// hooks/use-telegram-auth.ts
"use client";

import { useContext, createContext } from "react";
import type { TelegramAuthContextValue } from "@/types/auth";

const TelegramAuthContext = createContext<TelegramAuthContextValue | null>(null);

export function useTelegramAuth(): TelegramAuthContextValue {
  const context = useContext(TelegramAuthContext);
  if (!context) {
    throw new Error("useTelegramAuth must be used within TelegramAuthProvider");
  }
  return context;
}

export { TelegramAuthContext };
