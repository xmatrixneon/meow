import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { telegram } from "better-auth-telegram";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const baseURL = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
if (!baseURL) throw new Error("BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL must be set");

export const auth = betterAuth({
  baseURL,
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BETTER_AUTH_URL,
    "http://localhost:3000",
    "https://localhost:3000",
  ].filter((origin): origin is string => !!origin),
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 300, // 5 minutes
    },
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Refresh every 24 hours
  },
  plugins: [
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
  ],
});

export type Auth = typeof auth;
