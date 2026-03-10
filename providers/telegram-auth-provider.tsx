"use client";
// providers/telegram-auth-provider.tsx

import {
  useEffect,
  useReducer,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { retrieveRawInitData } from "@telegram-apps/sdk";
import { authClient } from "@/lib/auth-client";
import { TelegramAuthContext } from "@/hooks/use-telegram-auth";
import { makeAuthError, parseTelegramUserId } from "@/lib/telegram-web-app";
import type { AuthState, AuthAction } from "@/types/auth";
import type { User } from "@/types/user";

// ─── Reducer ──────────────────────────────────────────────────────────────────

const initialState: AuthState = {
  status: "loading",
  error: null,
  progress: 0,
  progressLabel: "Starting up…",
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOADING":
      return { ...state, status: "loading", error: null };
    case "PROGRESS":
      return {
        ...state,
        progress: action.payload.progress,
        progressLabel: action.payload.label,
      };
    case "AUTHENTICATED":
      return {
        ...state,
        status: "authenticated",
        error: null,
        progress: 100,
        progressLabel: "Done",
      };
    case "UNAUTHENTICATED":
      return { ...state, status: "unauthenticated", error: null };
    case "ERROR":
      return { ...state, status: "error", error: action.payload };
    default:
      return state;
  }
}

function useUserState(): [User | null, (u: User | null) => void] {
  return useReducer((_: User | null, next: User | null) => next, null);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function TelegramAuthProvider({ children }: { children: ReactNode }) {
  const [authState, dispatch] = useReducer(authReducer, initialState);
  const [user, setUser] = useUserState();
  const didRun = useRef(false);

  const progress = useCallback(
    (value: number, label: string) =>
      dispatch({ type: "PROGRESS", payload: { progress: value, label } }),
    [],
  );

  // ── signIn ──────────────────────────────────────────────────────────────

  const signIn = useCallback(
    async (initData: string): Promise<boolean> => {
      progress(60, "Almost there…");

      try {
        const result = await authClient.signInWithMiniApp(initData);

        if (result.error) {
          dispatch({ type: "ERROR", payload: makeAuthError("VALIDATION_FAILED") });
          return false;
        }

        progress(85, "Almost there…");

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
    [setUser, progress],
  );

  // ── checkSession ────────────────────────────────────────────────────────

  const checkSession = useCallback(
    async (initData: string): Promise<void> => {
      progress(20, "Almost there…");

      try {
        progress(40, "Almost there…");
        const session = await authClient.getSession();
        const sessionUser = session?.data?.user as User | undefined;

        if (!sessionUser) {
          await signIn(initData);
          return;
        }

        progress(70, "Almost there…");
        const currentTelegramId = parseTelegramUserId(initData);

        if (currentTelegramId && sessionUser.telegramId !== currentTelegramId) {
          progress(50, "Almost there…");
          await authClient.signOut();
          await signIn(initData);
          return;
        }

        progress(90, "Almost there…");
        setUser(sessionUser);
        dispatch({ type: "AUTHENTICATED" });
      } catch {
        await signIn(initData);
      }
    },
    [signIn, setUser, progress],
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
    didRun.current = false;
    // Re-trigger the effect by forcing a re-render
    dispatch({ type: "LOADING" });
  }, []);

  // ── Boot ────────────────────────────────────────────────────────────────
  // Use retrieveRawInitData() directly instead of useRawInitData() hook
  // to avoid hook errors when not in Telegram context

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    let rawInitData: string | undefined;

    try {
      // Try to get init data from URL hash
      rawInitData = retrieveRawInitData();
    } catch (err) {
      // Not in Telegram context - show "Open in Telegram" screen
      console.log("[auth] Not in Telegram context:", err);
      dispatch({ type: "UNAUTHENTICATED" });
      return;
    }

    if (!rawInitData) {
      // No init data available - not in Telegram
      dispatch({ type: "UNAUTHENTICATED" });
      return;
    }

    progress(10, "Starting up…");
    void checkSession(rawInitData);
  }, [checkSession, progress]);

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
