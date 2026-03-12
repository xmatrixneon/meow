-- Fix SMS dedup: allow same OTP code at different times
-- Previously: unique on (activeNumberId, content) would silently drop duplicate OTPs
-- Now: unique on (activeNumberId, content, receivedAt) allows same code at different times

-- Drop old constraint
ALTER TABLE "SmsMessage" DROP CONSTRAINT "SmsMessage_activeNumberId_content_key";

-- Add new constraint with receivedAt
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_activeNumberId_content_receivedAt_key" UNIQUE ("activeNumberId", "content", "receivedAt");
