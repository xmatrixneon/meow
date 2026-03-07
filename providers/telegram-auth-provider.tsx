// providers/telegram-auth-provider.tsx
"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { init, retrieveRawInitData } from "@tma.js/sdk";
import { authClient } from "@/lib/auth-client";
import { TelegramAuthContext } from "@/hooks/use-telegram-auth";
import type { TelegramAuthContextValue, AuthState, AuthError } from "@/types/auth";
import type { User } from "@/types";

// Initialize TMA.js SDK once
let sdkInitialized = false;

function getAuthError(code: AuthError["code"]): AuthError {
  const messages: Record<AuthError["code"], string> = {
    NO_INIT_DATA: "Please open this app in Telegram",
    VALIDATION_FAILED: "Session expired. Please reopen the app.",
    NETWORK_ERROR: "Connection error. Please try again.",
    SESSION_EXPIRED: "Session expired. Please reopen the app.",
  };
  return { code, message: messages[code] };
}

export function TelegramAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>("idle");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const didAttempt = useRef(false);

  // Initialize SDK once
  useEffect(() => {
    if (!sdkInitialized) {
      init();
      sdkInitialized = true;
    }
  }, []);

  const signIn = useCallback(async () => {
    setState("loading");
    setError(null);

    const initData = retrieveRawInitData();

    if (!initData) {
      setState("unauthenticated");
      setError(getAuthError("NO_INIT_DATA"));
      return;
    }

    try {
      const result = await authClient.signInWithMiniApp(initData);

      if (result.error) {
        setState("error");
        setError(getAuthError("VALIDATION_FAILED"));
        return;
      }

      // result.data.user is correct per the better-auth-telegram docs
      // (POST /telegram/miniapp/signin returns { user, session }).
      // However the library doesn't expose this in its TS definitions —
      // result.data is typed as {} — so we cast only this one extraction.
      const sessionUser = (result.data as { user?: User } | null)?.user;

      if (!sessionUser) {
        // Sign-in succeeded but returned no user — treat as auth failure
        setState("error");
        setError(getAuthError("VALIDATION_FAILED"));
        return;
      }

      setUser(sessionUser);
      setState("authenticated");
    } catch (err) {
      setState("error");
      setError(getAuthError("NETWORK_ERROR"));
      console.error("Auth error:", err);
    }
  }, []);

  // Check existing session on mount
  const checkSession = useCallback(async () => {
    setState("loading");

    try {
      const session = await authClient.getSession();
      const sessionUser = session?.data?.user as User | undefined;

      if (sessionUser) {
        // Verify session matches current Telegram user
        const initData = retrieveRawInitData();
        if (initData) {
          const params = new URLSearchParams(initData);
          const userStr = params.get("user");

          // FIX: wrap JSON.parse in try/catch — malformed initData would throw
          // uncaught and leave the user stuck on the loading screen.
          let telegramId: string | null = null;
          try {
            telegramId = userStr ? JSON.parse(userStr)?.id?.toString() : null;
          } catch {
            console.warn("[auth] Failed to parse Telegram user from initData");
          }

          if (telegramId && sessionUser.telegramId !== telegramId) {
            // Session mismatch — sign out and re-auth
            await authClient.signOut();
            await signIn();
            return;
          }
        }

        setUser(sessionUser);
        setState("authenticated");
      } else {
        // No session — try to sign in
        await signIn();
      }
    } catch (err) {
      setState("error");
      setError(getAuthError("NETWORK_ERROR"));
      console.error("Session check error:", err);
    }
  }, [signIn]);

  // Auto-auth on mount
  useEffect(() => {
    if (didAttempt.current) return;
    didAttempt.current = true;
    checkSession();
  }, [checkSession]);

  const retry = useCallback(() => {
    signIn();
  }, [signIn]);

  const signOut = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      setUser(null);
      setState("unauthenticated");
      // FIX: don't set SESSION_EXPIRED error on explicit sign out — it's not
      // an error, it's intentional. Setting an error here would show an error
      // message to the user after they deliberately signed out.
      setError(null);
    }
  }, []);

  const value: TelegramAuthContextValue = {
    state,
    user,
    error,
    isAuthenticated: state === "authenticated",
    isLoading: state === "loading",
    retry,
    signOut,
  };

  return (
    <TelegramAuthContext.Provider value={value}>
      {children}
    </TelegramAuthContext.Provider>
  );
}