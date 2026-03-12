-- CreateEnum
-- This is a manual migration for schema improvements
-- Includes: SmsMessage table, provider tracking fields, data migration, append-only trigger

-- 1. Create SmsMessage table
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "activeNumberId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- 2. Migrate existing SMS data from JSON to new table
INSERT INTO "SmsMessage" ("id", "activeNumberId", "content", "receivedAt")
SELECT
    gen_random_uuid(),
    "id",
    sms->>'content',
    COALESCE((sms->>'receivedAt')::timestamp, CURRENT_TIMESTAMP)
FROM "ActiveNumber",
     jsonb_array_elements(CASE
        WHEN jsonb_typeof("smsContent") = 'array' THEN "smsContent"
        ELSE jsonb_build_array(jsonb_build_object('content', "smsContent", 'receivedAt', to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
    END) as sms
WHERE "smsContent" IS NOT NULL
  AND "smsContent" != 'null';

-- 3. Add new columns to ActiveNumber for provider tracking
ALTER TABLE "ActiveNumber" ADD COLUMN "providerStatus" TEXT;
ALTER TABLE "ActiveNumber" ADD COLUMN "providerError" TEXT;
ALTER TABLE "ActiveNumber" ADD COLUMN "lastProviderCheck" TIMESTAMP(3);

-- 4. Convert PENDING sentinel to NULL
UPDATE "ActiveNumber" SET "numberId" = NULL WHERE "numberId" = 'PENDING';
UPDATE "ActiveNumber" SET "phoneNumber" = NULL WHERE "phoneNumber" = 'PENDING';

-- 5. Drop smsContent column (data has been migrated)
ALTER TABLE "ActiveNumber" DROP COLUMN "smsContent";

-- 6. Add indexes for SmsMessage
CREATE INDEX "SmsMessage_activeNumberId_idx" ON "SmsMessage"("activeNumberId");
CREATE INDEX "SmsMessage_activeNumberId_receivedAt_idx" ON "SmsMessage"("activeNumberId", "receivedAt");

-- 7. Add foreign key constraint
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_activeNumberId_fkey"
    FOREIGN KEY ("activeNumberId") REFERENCES "ActiveNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. Add unique constraint to prevent duplicate SMS content per number
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_activeNumberId_content_key" UNIQUE ("activeNumberId", "content");

-- 9. Create append-only trigger for Transaction table
CREATE OR REPLACE FUNCTION prevent_transaction_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.amount != NEW.amount THEN
        RAISE EXCEPTION 'Cannot modify transaction amount: transactions are append-only';
    END IF;
    IF OLD.type != NEW.type THEN
        RAISE EXCEPTION 'Cannot modify transaction type: transactions are append-only';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transaction_append_only
    BEFORE UPDATE ON "Transaction"
    FOR EACH ROW
    EXECUTE FUNCTION prevent_transaction_modification();
