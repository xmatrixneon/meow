// types/auth.ts

// "idle" and "initializing" are gone — useRawInitData() from the SDK is
// synchronous from URL hash, so there's no async wait state needed.
export type AuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

export type AuthErrorCode =
  | "NO_INIT_DATA"       // not inside Telegram (useRawInitData returned undefined)
  | "VALIDATION_FAILED"  // server rejected initData (bad HMAC / expired)
  | "SESSION_EXPIRED"    // session cookie stale
  | "NETWORK_ERROR";     // fetch threw

export interface AuthError {
  code: AuthErrorCode;
  message: string;
}

export interface AuthState {
  status: AuthStatus;
  error: AuthError | null;
}

export type AuthAction =
  | { type: "LOADING" }
  | { type: "AUTHENTICATED" }
  | { type: "UNAUTHENTICATED" }
  | { type: "ERROR"; payload: AuthError };