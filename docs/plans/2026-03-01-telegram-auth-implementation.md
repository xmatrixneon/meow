# Telegram Auth Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor Telegram Mini App authentication to use TMA.js SDK with proper state management and secure sessions.

**Architecture:** Use @tma.js/sdk-react hooks for type-safe Telegram data access, better-auth-telegram for server validation, and a React context with state machine for auth state management.

**Tech Stack:** Next.js 16, @tma.js/sdk-react, better-auth, better-auth-telegram, TypeScript

---

## Task 1: Create Auth Types

**Files:**
- Create: `types/auth.ts`

**Step 1: Create auth types file**

```typescript
// types/auth.ts

export type AuthState = 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'error';

export type AuthErrorCode =
  | 'NO_INIT_DATA'
  | 'VALIDATION_FAILED'
  | 'NETWORK_ERROR'
  | 'SESSION_EXPIRED';

export interface AuthError {
  code: AuthErrorCode;
  message: string;
}

export interface TelegramAuthContextValue {
  state: AuthState;
  user: User | null;
  error: AuthError | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  retry: () => void;
  signOut: () => Promise<void>;
}

// User type is imported from types/index.ts
import type { User } from './index';
```

**Step 2: Commit**

```bash
git add types/auth.ts
git commit -m "feat(auth): add auth types for state machine"
```

---

## Task 2: Update Server-Side Auth Config

**Files:**
- Modify: `lib/auth.ts`

**Step 1: Update session configuration**

Replace the session config in `lib/auth.ts`:

```typescript
session: {
  cookieCache: {
    enabled: true,
    maxAge: 300, // 5 minutes
  },
  expiresIn: 60 * 60 * 24 * 7, // 7 days
  updateAge: 60 * 60 * 24, // Refresh every 24 hours
},
```

**Step 2: Add maxAuthAge to telegram plugin**

Update the telegram plugin config:

```typescript
telegram({
  botToken: process.env.TELEGRAM_BOT_TOKEN!,
  botUsername: process.env.TELEGRAM_BOT_USERNAME!,
  maxAuthAge: 86400, // 24 hours - prevents replay attacks
  autoCreateUser: true,
  miniApp: {
    enabled: true,
    validateInitData: true,
    allowAutoSignin: true,
  },
}),
```

**Step 3: Commit**

```bash
git add lib/auth.ts
git commit -m "feat(auth): update session config for 7-day secure sessions"
```

---

## Task 3: Create useTelegramAuth Hook

**Files:**
- Create: `hooks/use-telegram-auth.ts`

**Step 1: Create the auth hook**

```typescript
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
```

**Step 2: Commit**

```bash
git add hooks/use-telegram-auth.ts
git commit -m "feat(auth): add useTelegramAuth hook"
```

---

## Task 4: Rewrite TelegramAuthProvider

**Files:**
- Modify: `providers/telegram-auth-provider.tsx`

**Step 1: Rewrite the provider with TMA.js SDK**

```typescript
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

      const sessionUser = result.data?.user as User | undefined;
      setUser(sessionUser ?? null);
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
          const telegramId = userStr ? JSON.parse(userStr)?.id?.toString() : null;

          if (telegramId && sessionUser.telegramId !== telegramId) {
            // Session mismatch - sign out and re-auth
            await authClient.signOut();
            await signIn();
            return;
          }
        }

        setUser(sessionUser);
        setState("authenticated");
      } else {
        // No session - try to sign in
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
      setError(getAuthError("SESSION_EXPIRED"));
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
```

**Step 2: Commit**

```bash
git add providers/telegram-auth-provider.tsx
git commit -m "feat(auth): rewrite TelegramAuthProvider with TMA.js SDK"
```

---

## Task 5: Update Layout to Remove Old Script

**Files:**
- Modify: `app/layout.tsx`

**Step 1: Remove the manual Telegram script tag**

The TMA.js SDK handles Telegram WebApp initialization. Remove this block:

```typescript
// REMOVE THIS:
<Script
  src="https://telegram.org/js/telegram-web-app.js"
  strategy="beforeInteractive"
/>
```

The layout should look like:

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import BottomNavBar from "@/components/ui/bottom-nav-bar";
import { TelegramAuthProvider } from "@/providers/telegram-auth-provider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MeowSMS",
  description: "Secure SMS service with Telegram authentication",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <TelegramAuthProvider>
          <Navbar />
          <main className="pt-14 pb-16">{children}</main>
          <BottomNavBar />
        </TelegramAuthProvider>
      </body>
    </html>
  );
}
```

**Step 2: Commit**

```bash
git add app/layout.tsx
git commit -m "refactor: remove manual Telegram script, TMA.js SDK handles init"
```

---

## Task 6: Update CLAUDE.md Documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update authentication sections**

Replace the authentication-related sections in CLAUDE.md with updated documentation reflecting the new implementation.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with new auth architecture"
```

---

## Task 7: Test the Implementation

**Step 1: Build the project**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors

**Step 2: Run dev server**

```bash
npm run dev
```

**Step 3: Test in Telegram**

1. Open the app via Telegram (local tunnel or deployed URL)
2. Verify auto-authentication works
3. Check browser console for any errors
4. Verify session cookie is set correctly

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create auth types | `types/auth.ts` |
| 2 | Update server auth config | `lib/auth.ts` |
| 3 | Create useTelegramAuth hook | `hooks/use-telegram-auth.ts` |
| 4 | Rewrite TelegramAuthProvider | `providers/telegram-auth-provider.tsx` |
| 5 | Update layout | `app/layout.tsx` |
| 6 | Update docs | `CLAUDE.md` |
| 7 | Test | - |
