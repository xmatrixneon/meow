import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// FIX: cache BOTH pool and prisma globally.
// Previously only prisma was cached — on every Next.js hot reload in dev,
// createPrismaClient() was called again, creating a new Pool each time
// even though the prisma instance was reused. Each Pool holds its own
// pg connections → connection leak over time.
const g = globalThis as unknown as {
  pool: Pool | undefined;
  prisma: PrismaClient | undefined;
};

function getPool(): Pool {
  if (!g.pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("[db] DATABASE_URL is not set");
    }
    g.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    g.pool.on("error", (err) => {
      console.error("[db] Unexpected pg pool error:", err);
    });
  }
  return g.pool;
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg(getPool());
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = g.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  g.prisma = prisma;
}

export default prisma;