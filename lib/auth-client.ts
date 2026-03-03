// lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { telegramClient } from "better-auth-telegram/client";
import type { User } from "@/types";

export const authClient = createAuthClient({
  baseURL:
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL!,
  fetchOptions: {
    credentials: "include",
  },
  plugins: [telegramClient()],
});

export type { User };