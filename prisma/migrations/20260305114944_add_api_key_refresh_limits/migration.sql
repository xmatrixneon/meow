-- AlterTable
ALTER TABLE "UserApi" ADD COLUMN     "lastRefreshedAt" TIMESTAMP(3),
ADD COLUMN     "refreshCount" INTEGER NOT NULL DEFAULT 0;
