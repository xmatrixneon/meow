-- ============================================================
-- seed_settings.sql
-- Seed: Settings row — BharatPe + app defaults
--
-- HOW TO RUN:
--   psql $DATABASE_URL -f seed_settings.sql
--   OR paste into Supabase SQL editor / TablePlus / psql shell
--
-- SAFE TO RE-RUN:
--   Uses INSERT ... ON CONFLICT DO UPDATE (upsert)
--   so re-running just refreshes the values.
-- ============================================================


-- ============================================================
-- Settings (single row, id = '1')
-- ============================================================

INSERT INTO "Settings" (
  "id",

  -- ── BharatPe ──────────────────────────────────────────────
  "bharatpeMerchantId",          -- merchant_id from session
  "bharatpeToken",               -- accessToken from session
  "bharatpeQrImage",             -- fill in if you have a QR image URL

  -- ── UPI ───────────────────────────────────────────────────
  "upiId",                       -- ← CHANGE THIS: your UPI ID e.g. 919693922187@bharatpe

  -- ── Recharge limits ───────────────────────────────────────
  "minRechargeAmount",
  "maxRechargeAmount",

  -- ── Referral ──────────────────────────────────────────────
  "referralPercent",
  "minRedeem",

  -- ── OTP / Number behaviour ────────────────────────────────
  "numberExpiryMinutes",         -- how long a rented number stays active
  "minCancelMinutes",            -- minimum minutes before cancellation is allowed

  -- ── Display ───────────────────────────────────────────────
  "currency",

  -- ── Maintenance ───────────────────────────────────────────
  "maintenanceMode",

  -- ── Telegram support ──────────────────────────────────────
  "telegramHelpUrl",             -- ← CHANGE THIS: e.g. https://t.me/YourSupportBot
  "telegramSupportUsername",     -- ← CHANGE THIS: e.g. YourSupportBot

  -- ── API docs ──────────────────────────────────────────────
  "apiDocsBaseUrl"               -- ← CHANGE THIS: e.g. https://yourdomain.com/api/docs

) VALUES (
  '1',

  -- BharatPe (from your session JSON)
  '57113736',                                -- bharatpeMerchantId  ← from merchant_id
  'edaa0bb278e54a23899c1cfeb6e937ef',        -- bharatpeToken       ← from accessToken
  'https://yourdomain.com/qr.png',           -- bharatpeQrImage     ← add URL if you have one

  -- UPI
  'BHARATPE.8V0Y0C8A7B91024@fbpe',                   -- upiId               ← CHANGE THIS if different

  -- Recharge limits (₹)
  10.00,                                     -- minRechargeAmount
  5000.00,                                   -- maxRechargeAmount

  -- Referral
  0,                                         -- referralPercent (0 = disabled)
  0.00,                                      -- minRedeem

  -- OTP behaviour
  15,                                        -- numberExpiryMinutes
  2,                                         -- minCancelMinutes

  -- Display
  '₹',                                       -- currency

  -- Maintenance
  false,                                     -- maintenanceMode

  -- Telegram support  ← CHANGE THESE
  NULL,                                      -- telegramHelpUrl      e.g. https://t.me/YourBot
  NULL,                                      -- telegramSupportUsername e.g. YourSupportBot

  -- API docs  ← CHANGE THIS
  NULL                                       -- apiDocsBaseUrl
)
ON CONFLICT ("id") DO UPDATE SET
  "bharatpeMerchantId"      = EXCLUDED."bharatpeMerchantId",
  "bharatpeToken"           = EXCLUDED."bharatpeToken",
  "bharatpeQrImage"         = EXCLUDED."bharatpeQrImage",
  "upiId"                   = EXCLUDED."upiId",
  "minRechargeAmount"       = EXCLUDED."minRechargeAmount",
  "maxRechargeAmount"       = EXCLUDED."maxRechargeAmount",
  "referralPercent"         = EXCLUDED."referralPercent",
  "minRedeem"               = EXCLUDED."minRedeem",
  "numberExpiryMinutes"     = EXCLUDED."numberExpiryMinutes",
  "minCancelMinutes"        = EXCLUDED."minCancelMinutes",
  "currency"                = EXCLUDED."currency",
  "maintenanceMode"         = EXCLUDED."maintenanceMode",
  "telegramHelpUrl"         = EXCLUDED."telegramHelpUrl",
  "telegramSupportUsername" = EXCLUDED."telegramSupportUsername",
  "apiDocsBaseUrl"          = EXCLUDED."apiDocsBaseUrl";


-- ============================================================
-- VERIFY (uncomment to check)
-- ============================================================
-- SELECT * FROM "Settings";


-- ============================================================
-- ROLLBACK — resets settings to schema defaults
-- ============================================================
-- DELETE FROM "Settings" WHERE "id" = '1';