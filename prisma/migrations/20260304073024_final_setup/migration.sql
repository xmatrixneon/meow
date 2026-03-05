/*
  Warnings:

  - You are about to alter the column `price` on the `ActiveNumber` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - The `status` column on the `ActiveNumber` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `smsContent` column on the `ActiveNumber` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `discount` on the `CustomPrice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `amount` on the `Promocode` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `amount` on the `PromocodeHistory` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `basePrice` on the `Service` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `minRechargeAmount` on the `Settings` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `minRedeem` on the `Settings` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `amount` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - The `status` column on the `Transaction` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `balance` on the `Wallet` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `totalSpent` on the `Wallet` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `totalRecharge` on the `Wallet` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - A unique constraint covering the columns `[txnId]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[telegramId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `type` on the `CustomPrice` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `type` on the `Transaction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'PURCHASE', 'REFUND', 'PROMO', 'REFERRAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "NumberStatus" AS ENUM ('COMPLETED', 'PENDING', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('FLAT', 'PERCENT');

-- CreateEnum
CREATE TYPE "ActiveStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- DropForeignKey
ALTER TABLE "CustomPrice" DROP CONSTRAINT "CustomPrice_userId_fkey";

-- DropForeignKey
ALTER TABLE "PromocodeHistory" DROP CONSTRAINT "PromocodeHistory_userId_fkey";

-- AlterTable
ALTER TABLE "ActiveNumber" ADD COLUMN     "activeStatus" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "balanceDeducted" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "price" SET DATA TYPE DECIMAL(10,2),
DROP COLUMN "status",
ADD COLUMN     "status" "NumberStatus" NOT NULL DEFAULT 'PENDING',
DROP COLUMN "smsContent",
ADD COLUMN     "smsContent" JSONB;

-- AlterTable
ALTER TABLE "CustomPrice" ALTER COLUMN "discount" SET DATA TYPE DECIMAL(10,2),
DROP COLUMN "type",
ADD COLUMN     "type" "DiscountType" NOT NULL;

-- AlterTable
ALTER TABLE "OtpServer" ADD COLUMN     "countryIso" TEXT NOT NULL DEFAULT 'IN',
ADD COLUMN     "countryName" TEXT NOT NULL DEFAULT 'India',
ADD COLUMN     "flagUrl" TEXT;

-- AlterTable
ALTER TABLE "Promocode" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "PromocodeHistory" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Service" ALTER COLUMN "basePrice" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "bharatpeQrImage" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxRechargeAmount" DECIMAL(10,2) NOT NULL DEFAULT 5000,
ADD COLUMN     "minCancelMinutes" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "telegramHelpUrl" TEXT,
ALTER COLUMN "minRechargeAmount" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "minRedeem" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "numberExpiryMinutes" SET DEFAULT 15;

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "type",
ADD COLUMN     "type" "TransactionType" NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(10,2),
DROP COLUMN "status",
ADD COLUMN     "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Wallet" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "totalSpent" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "totalRecharge" SET DATA TYPE DECIMAL(10,2);

-- CreateTable
CREATE TABLE "UserApi" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rateLimit" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserApi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserData" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastLogin" TIMESTAMP(3),
    "apiCalls" INTEGER NOT NULL DEFAULT 0,
    "lastApiCall" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "changes" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserApi_userId_key" ON "UserApi"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserApi_apiKey_key" ON "UserApi"("apiKey");

-- CreateIndex
CREATE INDEX "UserApi_apiKey_idx" ON "UserApi"("apiKey");

-- CreateIndex
CREATE INDEX "UserApi_userId_idx" ON "UserApi"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserData_userId_key" ON "UserData"("userId");

-- CreateIndex
CREATE INDEX "UserData_userId_idx" ON "UserData"("userId");

-- CreateIndex
CREATE INDEX "UserData_status_idx" ON "UserData"("status");

-- CreateIndex
CREATE INDEX "UserAuditLog_userId_idx" ON "UserAuditLog"("userId");

-- CreateIndex
CREATE INDEX "UserAuditLog_adminId_idx" ON "UserAuditLog"("adminId");

-- CreateIndex
CREATE INDEX "UserAuditLog_createdAt_idx" ON "UserAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActiveNumber_userId_status_idx" ON "ActiveNumber"("userId", "status");

-- CreateIndex
CREATE INDEX "ActiveNumber_status_expiresAt_idx" ON "ActiveNumber"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ActiveNumber_activeStatus_idx" ON "ActiveNumber"("activeStatus");

-- CreateIndex
CREATE INDEX "ActiveNumber_userId_activeStatus_status_idx" ON "ActiveNumber"("userId", "activeStatus", "status");

-- CreateIndex
CREATE INDEX "ActiveNumber_serverId_idx" ON "ActiveNumber"("serverId");

-- CreateIndex
CREATE INDEX "OtpServer_apiId_idx" ON "OtpServer"("apiId");

-- CreateIndex
CREATE INDEX "Service_isActive_idx" ON "Service"("isActive");

-- CreateIndex
CREATE INDEX "Service_serverId_idx" ON "Service"("serverId");

-- CreateIndex
CREATE INDEX "Service_name_idx" ON "Service"("name");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Transaction_walletId_status_idx" ON "Transaction"("walletId", "status");

-- CreateIndex
CREATE INDEX "Transaction_walletId_type_idx" ON "Transaction"("walletId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_txnId_key" ON "Transaction"("txnId");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- AddForeignKey
ALTER TABLE "ActiveNumber" ADD CONSTRAINT "ActiveNumber_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "OtpServer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromocodeHistory" ADD CONSTRAINT "PromocodeHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomPrice" ADD CONSTRAINT "CustomPrice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApi" ADD CONSTRAINT "UserApi_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserData" ADD CONSTRAINT "UserData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAuditLog" ADD CONSTRAINT "UserAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAuditLog" ADD CONSTRAINT "UserAuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Session_sessionToken_key" RENAME TO "Session_token_key";
