"use client";
// providers/telegram-auth-provider.tsx
//
// LOADED VIA: providers/index.tsx → dynamic(..., { ssr: false })
// Never import this file directly in layout.tsx or any server component.
//
// AUTH FLOW:
//   1. useRawInitData() from SDK reads initData from URL hash — synchronous,
//      always available when the component mounts. No polling, no race.
//   2. If undefined → not inside Telegram → show "Open in Telegram" screen.
//   3. If defined → check for existing session first (avoids sign-in round-trip).
//   4. Session found + same telegramId → reuse it.
//   5. Session found + different telegramId → sign out stale, sign in fresh.
//   6. No session → sign in with initData.

import {
  useEffect,
  useReducer,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useRawInitData } from "@telegram-apps/sdk-react";
import { authClient } from "@/lib/auth-client";
import { TelegramAuthContext } from "@/hooks/use-telegram-auth";
import { makeAuthError, parseTelegramUserId } from "@/lib/telegram-web-app";
import type { AuthState, AuthAction } from "@/types/auth";
import type { User } from "@/types/user";

// ─── SDK init (once per page) ─────────────────────────────────────────────────

let sdkBooted = false;

function bootSdk(): void {
  if (sdkBooted) return;
  sdkBooted = true;
  try {
    // Dynamic import — avoids any SSR contamination even inside a "use client"
    // file, since this runs inside useEffect (browser-only).
    import("@telegram-apps/sdk-react").then(({ init, miniApp }) => {
      init();
      if (miniApp.mountSync.isAvailable()) {
        miniApp.mountSync();
        miniApp.ready(); // removes Telegram's native loading placeholder
      }
    });
  } catch (err) {
    console.warn("[tma-sdk] Boot warning:", err);
  }
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

const initialState: AuthState = { status: "loading", error: null };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOADING":
      return { status: "loading", error: null };
    case "AUTHENTICATED":
      return { status: "authenticated", error: null };
    case "UNAUTHENTICATED":
      return { status: "unauthenticated", error: null };
    case "ERROR":
      return { status: "error", error: action.payload };
    default:
      return state;
  }
}

// ─── User state ───────────────────────────────────────────────────────────────

function useUserState(): [User | null, (u: User | null) => void] {
  return useReducer((_: User | null, next: User | null) => next, null);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function TelegramAuthProvider({ children }: { children: ReactNode }) {
  const [authState, dispatch] = useReducer(authReducer, initialState);
  const [user, setUser] = useUserState();
  const didRun = useRef(false);

  // useRawInitData reads from the URL hash params that Telegram embeds before
  // the webview opens. It's synchronous — no waiting, no race condition.
  // Returns undefined when not inside Telegram.
  const rawInitData = useRawInitData();

  // ── signIn ──────────────────────────────────────────────────────────────

  const signIn = useCallback(
    async (initData: string): Promise<boolean> => {
      dispatch({ type: "LOADING" });

      try {
        const result = await authClient.signInWithMiniApp(initData);

        if (result.error) {
          dispatch({ type: "ERROR", payload: makeAuthError("VALIDATION_FAILED") });
          return false;
        }

        const sessionUser = (result.data as { user?: User } | null)?.user ?? null;

        if (!sessionUser) {
          dispatch({ type: "ERROR", payload: makeAuthError("VALIDATION_FAILED") });
          return false;
        }

        setUser(sessionUser);
        dispatch({ type: "AUTHENTICATED" });
        return true;
      } catch {
        dispatch({ type: "ERROR", payload: makeAuthError("NETWORK_ERROR") });
        return false;
      }
    },
    [setUser],
  );

  // ── checkSession ────────────────────────────────────────────────────────

  const checkSession = useCallback(
    async (initData: string): Promise<void> => {
      dispatch({ type: "LOADING" });

      try {
        const session = await authClient.getSession();
        const sessionUser = session?.data?.user as User | undefined;

        if (!sessionUser) {
          await signIn(initData);
          return;
        }

        // Guard against account switching — compare session telegramId with
        // the one currently embedded in initData
        const currentTelegramId = parseTelegramUserId(initData);

        if (currentTelegramId && sessionUser.telegramId !== currentTelegramId) {
          // Different Telegram account — clear stale session and re-auth
          await authClient.signOut();
          await signIn(initData);
          return;
        }

        setUser(sessionUser);
        dispatch({ type: "AUTHENTICATED" });
      } catch {
        // getSession threw (network blip) — fall through to fresh sign-in
        // instead of landing in error state
        await signIn(initData);
      }
    },
    [signIn, setUser],
  );

  // ── signOut ─────────────────────────────────────────────────────────────

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await authClient.signOut();
    } catch (err) {
      console.error("[auth] Sign-out error:", err);
    } finally {
      setUser(null);
      dispatch({ type: "UNAUTHENTICATED" });
    }
  }, [setUser]);

  // ── retry ───────────────────────────────────────────────────────────────

  const retry = useCallback((): void => {
    if (rawInitData) signIn(rawInitData);
  }, [rawInitData, signIn]);

  // ── Boot ────────────────────────────────────────────────────────────────
  //
  // Runs once when rawInitData first becomes available.
  // useRawInitData() is synchronous so this fires on the first render — no
  // polling, no setTimeout, no setInterval.
  //
  // StrictMode-safe: didRun ref prevents the double-invocation in dev mode.

  useEffect(() => {
    if (didRun.current) return;

    // rawInitData is undefined when not inside Telegram
    if (rawInitData === undefined) {
      dispatch({ type: "UNAUTHENTICATED" });
      return;
    }

    didRun.current = true;

    // Boot SDK and kick off auth
    bootSdk();
    void checkSession(rawInitData);
  }, [rawInitData, checkSession]);

  // ── Context value ────────────────────────────────────────────────────────

  const value = useMemo(
    () => ({
      ...authState,
      user,
      isAuthenticated: authState.status === "authenticated",
      isLoading: authState.status === "loading",
      retry,
      signOut,
    }),
    [authState, user, retry, signOut],
  );

  return (
    <TelegramAuthContext.Provider value={value}>
      {children}
    </TelegramAuthContext.Provider>
  );
}