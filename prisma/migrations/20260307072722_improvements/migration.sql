/*
  Warnings:

  - You are about to drop the column `buyTime` on the `ActiveNumber` table. All the data in the column will be lost.
  - The `status` column on the `UserData` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[refundOrderId]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `ActiveNumber` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'SUSPENDED');

-- AlterTable
ALTER TABLE "ActiveNumber" DROP COLUMN "buyTime",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Settings" ALTER COLUMN "currency" SET DEFAULT '₹';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "refundOrderId" TEXT;

-- AlterTable
ALTER TABLE "UserData" DROP COLUMN "status",
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "UserApiRefreshLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserApiRefreshLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserApiRefreshLog_userId_createdAt_idx" ON "UserApiRefreshLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ActiveNumber_orderId_userId_idx" ON "ActiveNumber"("orderId", "userId");

-- CreateIndex
CREATE INDEX "ActiveNumber_activeStatus_expiresAt_idx" ON "ActiveNumber"("activeStatus", "expiresAt");

-- CreateIndex
CREATE INDEX "ActiveNumber_phoneNumber_idx" ON "ActiveNumber"("phoneNumber");

-- CreateIndex
CREATE INDEX "ApiCredential_apiKey_idx" ON "ApiCredential"("apiKey");

-- CreateIndex
CREATE INDEX "ApiCredential_isActive_idx" ON "ApiCredential"("isActive");

-- CreateIndex
CREATE INDEX "OtpServer_isActive_idx" ON "OtpServer"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_refundOrderId_key" ON "Transaction"("refundOrderId");

-- CreateIndex
CREATE INDEX "UserData_status_idx" ON "UserData"("status");

-- AddForeignKey
ALTER TABLE "UserApiRefreshLog" ADD CONSTRAINT "UserApiRefreshLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserApi"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
