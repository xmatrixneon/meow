// lib/telegram-web-app.ts
//
// Minimal WebApp utilities after switching to @telegram-apps/sdk-react.
//
// WHAT WAS REMOVED AND WHY:
//
//   getRawInitData()   — deleted. We now use useRawInitData() from the SDK
//                        which reads from the URL hash params synchronously.
//                        window.Telegram.WebApp is no longer touched.
//
//   waitForInitData()  — deleted. The polling loop existed to handle the race
//                        between telegram-web-app.js and React hydration. Since
//                        we dropped that script entirely, the race is gone.
//
//   notifyWebAppReady()— deleted. The SDK's miniApp.ready() replaces this.
//
// WHAT REMAINS:
//   makeAuthError()    — still needed by the provider
//   parseTelegramUserId() — still needed for session cross-check

import type { AuthError, AuthErrorCode } from "@/types/auth";

// ─── Error factory ────────────────────────────────────────────────────────────

const ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  NO_INIT_DATA: "Please open this app inside Telegram.",
  VALIDATION_FAILED: "Session expired. Please reopen the app.",
  NETWORK_ERROR: "Connection error. Please try again.",
  SESSION_EXPIRED: "Session expired. Please reopen the app.",
};

export function makeAuthError(code: AuthErrorCode): AuthError {
  return { code, message: ERROR_MESSAGES[code] };
}

// ─── initData parser ──────────────────────────────────────────────────────────
// Extracts the Telegram user ID string from raw initData for session cross-check.
// Telegram sends id as a number inside the user JSON — we stringify it to match
// the string stored in User.telegramId.

export function parseTelegramUserId(rawInitData: string): string | null {
  try {
    const userStr = new URLSearchParams(rawInitData).get("user");
    const id = userStr ? JSON.parse(userStr)?.id : null;
    return id != null ? String(id) : null;
  } catch {
    return null;
  }
}