// providers/telegram-auth-provider.tsx
"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { init } from "@tma.js/sdk";
import { authClient } from "@/lib/auth-client";
import { TelegramAuthContext } from "@/hooks/use-telegram-auth";
import type { TelegramAuthContextValue, AuthState, AuthError } from "@/types/auth";
import type { User } from "@/types";

// ─── SDK Init ────────────────────────────────────────────────────────────────
let sdkInitialized = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAuthError(code: AuthError["code"]): AuthError {
  const messages: Record<AuthError["code"], string> = {
    NO_INIT_DATA: "Please open this app in Telegram",
    VALIDATION_FAILED: "Session expired. Please reopen the app.",
    NETWORK_ERROR: "Connection error. Please try again.",
    SESSION_EXPIRED: "Session expired. Please reopen the app.",
  };
  return { code, message: messages[code] };
}

/**
 * Read initData directly from window.Telegram.WebApp.initData.
 *
 * WHY WE READ DIRECTLY INSTEAD OF USING retrieveRawInitData() FROM @tma.js/sdk:
 *
 * The SDK's retrieveRawInitData() re-parses the URL hash/search params looking
 * for `tgWebAppData`. On first load this can return undefined because the hash
 * injection races with React's useEffect.
 *
 * Per the official Telegram docs, window.Telegram.WebApp.initData is the
 * canonical, already-parsed source of truth once telegram-web-app.js has run.
 * Reading it directly is more reliable on cold opens.
 *
 * Ref: https://core.telegram.org/bots/webapps#initializing-mini-apps
 */
function getRawInitData(): string | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp?.initData || null;
}

/**
 * Tell Telegram the Mini App has finished loading.
 *
 * Per official docs, calling WebApp.ready() removes the native loading
 * placeholder shown by the Telegram client while the app bootstraps.
 * Must be called after the app is rendered and ready to show.
 *
 * Ref: https://core.telegram.org/bots/webapps#initializing-mini-apps
 */
function notifyTelegramReady(): void {
  try {
    window.Telegram?.WebApp?.ready();
  } catch {
    // Non-critical — safe to ignore outside Telegram context
  }
}

/**
 * Wait for window.Telegram.WebApp.initData to be populated.
 *
 * THE RACE CONDITION THIS FIXES:
 * On a cold open, Telegram injects WebApp.initData by running
 * telegram-web-app.js. Even with Next.js strategy="beforeInteractive",
 * React's hydration and useEffect can fire while WebApp.initData is still
 * an empty string "". On page refresh it works because the script already
 * ran before React mounted — explaining the exact symptom reported.
 *
 * This polls for the value to become non-empty before proceeding with auth.
 * Typically resolves in < 100ms. Times out after 3s for non-Telegram contexts.
 */
function waitForInitData(timeoutMs = 3000, intervalMs = 50): Promise<boolean> {
  return new Promise((resolve) => {
    // Fast path
    if (getRawInitData()) {
      resolve(true);
      return;
    }

    const deadline = Date.now() + timeoutMs;

    const timer = setInterval(() => {
      if (getRawInitData()) {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() >= deadline) {
        clearInterval(timer);
        resolve(false);
      }
    }, intervalMs);
  });
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function TelegramAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>("idle");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const didAttempt = useRef(false);

  const signIn = useCallback(async () => {
    setState("loading");
    setError(null);

    const initData = getRawInitData();

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

      const sessionUser = (result.data as { user?: User } | null)?.user;

      if (!sessionUser) {
        setState("error");
        setError(getAuthError("VALIDATION_FAILED"));
        return;
      }

      setUser(sessionUser);
      setState("authenticated");
    } catch (err) {
      setState("error");
      setError(getAuthError("NETWORK_ERROR"));
      console.error("[auth] Sign-in error:", err);
    }
  }, []);

  const checkSession = useCallback(async () => {
    setState("loading");

    try {
      const session = await authClient.getSession();
      const sessionUser = session?.data?.user as User | undefined;

      if (sessionUser) {
        const initData = getRawInitData();
        if (initData) {
          const params = new URLSearchParams(initData);
          const userStr = params.get("user");

          let telegramId: string | null = null;
          try {
            telegramId = userStr ? JSON.parse(userStr)?.id?.toString() : null;
          } catch {
            console.warn("[auth] Failed to parse Telegram user from initData");
          }

          if (telegramId && sessionUser.telegramId !== telegramId) {
            await authClient.signOut();
            await signIn();
            return;
          }
        }

        setUser(sessionUser);
        setState("authenticated");
      } else {
        await signIn();
      }
    } catch (err) {
      setState("error");
      setError(getAuthError("NETWORK_ERROR"));
      console.error("[auth] Session check error:", err);
    }
  }, [signIn]);

  // Auto-auth on mount — waits for WebApp to be ready before proceeding
  useEffect(() => {
    if (didAttempt.current) return;
    didAttempt.current = true;

    (async () => {
      // 1. Wait for Telegram to finish populating WebApp.initData.
      //    Fixes the first-load race where initData is "" when React mounts.
      const isReady = await waitForInitData();

      if (!isReady) {
        setState("unauthenticated");
        setError(getAuthError("NO_INIT_DATA"));
        return;
      }

      // 2. Init the TMA.js SDK now that WebApp is confirmed available.
      //    Ordering matters: SDK init must come after initData is populated.
      if (!sdkInitialized) {
        try {
          init();
          sdkInitialized = true;
        } catch (err) {
          // Non-fatal: we read initData directly from WebApp, not via the SDK.
          console.warn("[auth] TMA SDK init warning:", err);
        }
      }

      // 3. Tell Telegram the app is ready — removes the loading placeholder.
      //    Ref: https://core.telegram.org/bots/webapps#initializing-mini-apps
      notifyTelegramReady();

      // 4. Check for existing session or perform fresh sign-in.
      await checkSession();
    })();
  }, [checkSession]);

  const retry = useCallback(() => {
    signIn();
  }, [signIn]);

  const signOut = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch (err) {
      console.error("[auth] Sign out error:", err);
    } finally {
      setUser(null);
      setState("unauthenticated");
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