// types/auth.ts

export type AuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

export type AuthErrorCode =
  | "NO_INIT_DATA"
  | "VALIDATION_FAILED"
  | "SESSION_EXPIRED"
  | "NETWORK_ERROR";

export interface AuthError {
  code: AuthErrorCode;
  message: string;
}

export interface AuthState {
  status: AuthStatus;
  error: AuthError | null;
  progress: number;        // 0–100
  progressLabel: string;   // human-readable step label
}

export type AuthAction =
  | { type: "LOADING" }
  | { type: "AUTHENTICATED" }
  | { type: "UNAUTHENTICATED" }
  | { type: "ERROR"; payload: AuthError }
  | { type: "PROGRESS"; payload: { progress: number; label: string } };