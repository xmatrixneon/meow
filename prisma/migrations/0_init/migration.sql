-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'PURCHASE', 'REFUND', 'PROMO', 'REFERRAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "NumberStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('FLAT', 'PERCENT');

-- CreateEnum
CREATE TYPE "ActiveStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'SUSPENDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "image" TEXT,
    "telegramId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "languageCode" TEXT,
    "isPremium" BOOLEAN DEFAULT false,
    "allowsWriteToPm" BOOLEAN DEFAULT false,
    "photoUrl" TEXT,
    "addedToAttachmentMenu" BOOLEAN DEFAULT false,
    "authDate" TIMESTAMP(3),
    "queryId" TEXT,
    "chatInstance" TEXT,
    "chatType" TEXT,
    "startParam" TEXT,
    "canSendAfter" INTEGER,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'oauth',
    "providerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "refreshToken" TEXT DEFAULT '',
    "accessToken" TEXT DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "tokenType" TEXT DEFAULT '',
    "scope" TEXT DEFAULT '',
    "idToken" TEXT DEFAULT '',
    "sessionState" TEXT DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "telegramId" TEXT,
    "telegramUsername" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalOtp" INTEGER NOT NULL DEFAULT 0,
    "totalRecharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "description" TEXT,
    "phoneNumber" TEXT,
    "txnId" TEXT,
    "refundOrderId" TEXT,
    "orderId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCredential" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpServer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "countryIso" TEXT NOT NULL DEFAULT 'IN',
    "countryName" TEXT NOT NULL DEFAULT 'India',
    "flagUrl" TEXT,
    "apiId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtpServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "basePrice" DECIMAL(10,2) NOT NULL,
    "iconUrl" TEXT NOT NULL DEFAULT 'https://i.ibb.co/kgBcLZsX/meow.png',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveNumber" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "numberId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "status" "NumberStatus" NOT NULL DEFAULT 'PENDING',
    "activeStatus" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "smsContent" JSONB,
    "balanceDeducted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActiveNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promocode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Promocode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromocodeHistory" (
    "id" TEXT NOT NULL,
    "promocodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromocodeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomPrice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL,
    "type" "DiscountType" NOT NULL,

    CONSTRAINT "CustomPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT '1',
    "bharatpeMerchantId" TEXT,
    "bharatpeToken" TEXT,
    "bharatpeQrImage" TEXT,
    "upiId" TEXT,
    "minRechargeAmount" DECIMAL(10,2) NOT NULL DEFAULT 10,
    "maxRechargeAmount" DECIMAL(10,2) NOT NULL DEFAULT 5000,
    "currency" TEXT NOT NULL DEFAULT '₹',
    "referralPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minRedeem" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "numberExpiryMinutes" INTEGER NOT NULL DEFAULT 15,
    "minCancelMinutes" INTEGER NOT NULL DEFAULT 2,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "telegramHelpUrl" TEXT,
    "telegramSupportUsername" TEXT,
    "apiDocsBaseUrl" TEXT,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserApi" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rateLimit" INTEGER NOT NULL DEFAULT 100,
    "refreshCount" INTEGER NOT NULL DEFAULT 0,
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserApi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserApiRefreshLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserApiRefreshLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserData" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
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
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Verification_expiresAt_idx" ON "Verification"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Verification_identifier_value_key" ON "Verification"("identifier", "value");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_txnId_key" ON "Transaction"("txnId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_refundOrderId_key" ON "Transaction"("refundOrderId");

-- CreateIndex
CREATE INDEX "Transaction_walletId_createdAt_id_idx" ON "Transaction"("walletId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Transaction_walletId_status_idx" ON "Transaction"("walletId", "status");

-- CreateIndex
CREATE INDEX "Transaction_walletId_type_idx" ON "Transaction"("walletId", "type");

-- CreateIndex
CREATE INDEX "Transaction_orderId_idx" ON "Transaction"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiCredential_apiKey_key" ON "ApiCredential"("apiKey");

-- CreateIndex
CREATE INDEX "ApiCredential_isActive_idx" ON "ApiCredential"("isActive");

-- CreateIndex
CREATE INDEX "OtpServer_apiId_idx" ON "OtpServer"("apiId");

-- CreateIndex
CREATE INDEX "OtpServer_isActive_idx" ON "OtpServer"("isActive");

-- CreateIndex
CREATE INDEX "Service_isActive_idx" ON "Service"("isActive");

-- CreateIndex
CREATE INDEX "Service_serverId_idx" ON "Service"("serverId");

-- CreateIndex
CREATE INDEX "Service_name_idx" ON "Service"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Service_code_serverId_key" ON "Service"("code", "serverId");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveNumber_orderId_key" ON "ActiveNumber"("orderId");

-- CreateIndex
CREATE INDEX "ActiveNumber_userId_activeStatus_status_createdAt_id_idx" ON "ActiveNumber"("userId", "activeStatus", "status", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ActiveNumber_activeStatus_expiresAt_idx" ON "ActiveNumber"("activeStatus", "expiresAt");

-- CreateIndex
CREATE INDEX "ActiveNumber_orderId_userId_idx" ON "ActiveNumber"("orderId", "userId");

-- CreateIndex
CREATE INDEX "ActiveNumber_userId_status_idx" ON "ActiveNumber"("userId", "status");

-- CreateIndex
CREATE INDEX "ActiveNumber_serverId_idx" ON "ActiveNumber"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "Promocode_code_key" ON "Promocode"("code");

-- CreateIndex
CREATE INDEX "Promocode_isActive_idx" ON "Promocode"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PromocodeHistory_promocodeId_userId_key" ON "PromocodeHistory"("promocodeId", "userId");

-- CreateIndex
CREATE INDEX "CustomPrice_serviceId_idx" ON "CustomPrice"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomPrice_userId_serviceId_key" ON "CustomPrice"("userId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "UserApi_userId_key" ON "UserApi"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserApi_apiKey_key" ON "UserApi"("apiKey");

-- CreateIndex
CREATE INDEX "UserApi_apiKey_idx" ON "UserApi"("apiKey");

-- CreateIndex
CREATE INDEX "UserApiRefreshLog_userId_createdAt_idx" ON "UserApiRefreshLog"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserData_userId_key" ON "UserData"("userId");

-- CreateIndex
CREATE INDEX "UserData_status_idx" ON "UserData"("status");

-- CreateIndex
CREATE INDEX "UserAuditLog_userId_createdAt_idx" ON "UserAuditLog"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "UserAuditLog_adminId_createdAt_idx" ON "UserAuditLog"("adminId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpServer" ADD CONSTRAINT "OtpServer_apiId_fkey" FOREIGN KEY ("apiId") REFERENCES "ApiCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "OtpServer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveNumber" ADD CONSTRAINT "ActiveNumber_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveNumber" ADD CONSTRAINT "ActiveNumber_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveNumber" ADD CONSTRAINT "ActiveNumber_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "OtpServer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromocodeHistory" ADD CONSTRAINT "PromocodeHistory_promocodeId_fkey" FOREIGN KEY ("promocodeId") REFERENCES "Promocode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromocodeHistory" ADD CONSTRAINT "PromocodeHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomPrice" ADD CONSTRAINT "CustomPrice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomPrice" ADD CONSTRAINT "CustomPrice_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApi" ADD CONSTRAINT "UserApi_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApiRefreshLog" ADD CONSTRAINT "UserApiRefreshLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserApi"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserData" ADD CONSTRAINT "UserData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAuditLog" ADD CONSTRAINT "UserAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAuditLog" ADD CONSTRAINT "UserAuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraints
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_balance_non_negative" CHECK ("balance" >= 0);
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_totalSpent_non_negative" CHECK ("totalSpent" >= 0);
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_totalOtp_non_negative" CHECK ("totalOtp" >= 0);
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_totalRecharge_non_negative" CHECK ("totalRecharge" >= 0);
ALTER TABLE "ActiveNumber" ADD CONSTRAINT "ActiveNumber_price_non_negative" CHECK ("price" >= 0);
