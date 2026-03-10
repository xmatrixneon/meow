-- DropIndex
DROP INDEX "ActiveNumber_activeStatus_idx";

-- DropIndex
DROP INDEX "ActiveNumber_status_expiresAt_idx";

-- DropIndex
DROP INDEX "ActiveNumber_userId_activeStatus_status_idx";

-- DropIndex
DROP INDEX "Transaction_walletId_createdAt_idx";

-- DropIndex
DROP INDEX "UserApi_userId_idx";

-- DropIndex
DROP INDEX "UserAuditLog_adminId_idx";

-- DropIndex
DROP INDEX "UserAuditLog_createdAt_idx";

-- DropIndex
DROP INDEX "UserAuditLog_userId_idx";

-- DropIndex
DROP INDEX "UserData_userId_idx";

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "orderId" TEXT;

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "ActiveNumber_userId_activeStatus_status_createdAt_id_idx" ON "ActiveNumber"("userId", "activeStatus", "status", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "CustomPrice_serviceId_idx" ON "CustomPrice"("serviceId");

-- CreateIndex
CREATE INDEX "Promocode_isActive_idx" ON "Promocode"("isActive");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Transaction_walletId_createdAt_id_idx" ON "Transaction"("walletId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Transaction_orderId_idx" ON "Transaction"("orderId");

-- CreateIndex
CREATE INDEX "UserAuditLog_userId_createdAt_idx" ON "UserAuditLog"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "UserAuditLog_adminId_createdAt_idx" ON "UserAuditLog"("adminId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Verification_expiresAt_idx" ON "Verification"("expiresAt");
