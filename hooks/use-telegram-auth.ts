"use client";
// hooks/use-telegram-auth.ts

import { createContext, useContext } from "react";
import type { AuthState, AuthError } from "@/types/auth";
import type { User } from "@/types/user";

// ─── Context value ────────────────────────────────────────────────────────────

export interface TelegramAuthContextValue extends AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  retry: () => void;
  signOut: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────
// null default so useTelegramAuth() can detect usage outside the provider.

export const TelegramAuthContext =
  createContext<TelegramAuthContextValue | null>(null);

// ─── Primary hook ─────────────────────────────────────────────────────────────

export function useTelegramAuth(): TelegramAuthContextValue {
  const ctx = useContext(TelegramAuthContext);
  if (!ctx) {
    throw new Error(
      "useTelegramAuth must be used inside <TelegramAuthProvider>",
    );
  }
  return ctx;
}

// ─── Convenience hooks ────────────────────────────────────────────────────────

export function useUser(): User | null {
  return useTelegramAuth().user;
}

export function useIsAdmin(): boolean {
  return useTelegramAuth().user?.isAdmin ?? false;
}

export function useAuthStatus(): {
  status: AuthState["status"];
  isAuthenticated: boolean;
  isLoading: boolean;
  error: AuthError | null;
} {
  const { status, isAuthenticated, isLoading, error } = useTelegramAuth();
  return { status, isAuthenticated, isLoading, error };
}