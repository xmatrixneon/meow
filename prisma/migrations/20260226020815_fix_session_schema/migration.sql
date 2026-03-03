-- Rename sessionToken to token
ALTER TABLE "Session" RENAME COLUMN "sessionToken" TO "token";

-- Rename expires to expiresAt
ALTER TABLE "Session" RENAME COLUMN "expires" TO "expiresAt";

-- Add ipAddress column
ALTER TABLE "Session" ADD COLUMN "ipAddress" TEXT;

-- Add userAgent column
ALTER TABLE "Session" ADD COLUMN "userAgent" TEXT;

-- Add createdAt column
ALTER TABLE "Session" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add updatedAt column
ALTER TABLE "Session" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
