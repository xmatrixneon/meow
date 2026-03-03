
import type { auth } from "@/lib/auth";
// ✅ infer base session type from better-auth config
type BaseSession = typeof auth.$Infer.Session;

// ✅ extend with your Telegram fields from schema
export type User = BaseSession["user"] & {
  telegramId?:       string | null;
  telegramUsername?: string | null;
  firstName?:        string | null;
  lastName?:         string | null;
  languageCode?:     string | null;
  isPremium?:        boolean | null;
  photoUrl?:         string | null;
  isAdmin?:          boolean | null;
};

export type ExtendedSession = Omit<BaseSession, "user"> & {
  user: User;
};

// ✅ error codes from plugin — single source of truth
export const ERROR_CODES = {
  RATE_LIMITED:       "RATE_LIMITED",
  NOT_AUTHENTICATED:  "NOT_AUTHENTICATED",
  INVALID_INIT_DATA:  "INVALID_INIT_DATA",
  INIT_DATA_EXPIRED:  "INIT_DATA_EXPIRED",
  USER_NOT_FOUND:     "USER_NOT_FOUND",
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;