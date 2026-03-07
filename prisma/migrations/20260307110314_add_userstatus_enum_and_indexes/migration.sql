/*
  Warnings:

  - A unique constraint covering the columns `[apiKey]` on the table `ApiCredential` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "ActiveNumber_phoneNumber_idx";

-- DropIndex
DROP INDEX "ApiCredential_apiKey_idx";

-- CreateIndex
CREATE UNIQUE INDEX "ApiCredential_apiKey_key" ON "ApiCredential"("apiKey");
