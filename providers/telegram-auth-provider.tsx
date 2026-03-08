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
    import("@telegram-apps/sdk-react").then(({ init, miniApp }) => {
      init();
      if (miniApp.mountSync.isAvailable()) {
        miniApp.mountSync();
        miniApp.ready();
      }
    });
  } catch (err) {
    console.warn("[tma-sdk] Boot warning:", err);
  }
}

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

  const rawInitData = useRawInitData();

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
    if (rawInitData) signIn(rawInitData);
  }, [rawInitData, signIn]);

  // ── Boot ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (didRun.current) return;

    if (rawInitData === undefined) {
      dispatch({ type: "UNAUTHENTICATED" });
      return;
    }

    didRun.current = true;
    progress(10, "Starting up…");
    bootSdk();
    void checkSession(rawInitData);
  }, [rawInitData, checkSession, progress]);

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