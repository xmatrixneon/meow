// types/auth.ts
// claude code 

import type { User } from './index';

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
