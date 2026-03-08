-- ============================================================
-- seed_provider.sql
-- Seed: CattySMS provider → India server → common services
--
-- HOW TO RUN:
--   psql $DATABASE_URL -f seed_provider.sql
--   OR paste into Supabase SQL editor / TablePlus / psql shell
--
-- SAFE TO RE-RUN:
--   Every INSERT uses ON CONFLICT DO NOTHING — no duplicates.
--
-- BEFORE RUNNING — fill in the 2 values marked ← CHANGE THIS
-- ============================================================


-- ============================================================
-- 1. ApiCredential — CattySMS provider
-- ============================================================

INSERT INTO "ApiCredential" (
  "id", "name", "apiUrl", "apiKey", "isActive", "createdAt", "updatedAt"
) VALUES (
  'cattysms',
  'CattySMS',
  'https://cattysms.com',            -- ← CHANGE THIS: CattySMS base API URL
  'maya',           -- ← CHANGE THIS: your CattySMS API key
  true, NOW(), NOW()
)
ON CONFLICT ("id") DO NOTHING;


-- ============================================================
-- 2. OtpServer — India server on CattySMS
-- ============================================================

INSERT INTO "OtpServer" (
  "id", "name", "countryCode", "countryIso", "countryName",
  "flagUrl", "apiId", "isActive", "createdAt", "updatedAt"
) VALUES (
  'india', 'India', '22', 'IN', 'India',
  NULL, 'cattysms', true, NOW(), NOW()
)
ON CONFLICT ("id") DO NOTHING;


-- ============================================================
-- 3. Services — linked to India server
--    id:        full service name, lowercase, hyphenated
--    code:      full service name, lowercase (must match CattySMS service codes)
--    basePrice: what you charge users in ₹
-- ============================================================

INSERT INTO "Service" (
  "id", "code", "name", "serverId", "basePrice",
  "iconUrl", "isActive", "createdAt", "updatedAt"
) VALUES

-- Messaging
('telegram',       'telegram',      'Telegram',         'india',  5.00, NULL, true, NOW(), NOW()),
('whatsapp',       'whatsapp',      'WhatsApp',          'india',  8.00, NULL, true, NOW(), NOW()),
('signal',         'signal',        'Signal',            'india',  5.00, NULL, true, NOW(), NOW()),

-- Social
('instagram',      'instagram',     'Instagram',         'india',  2.00, NULL, true, NOW(), NOW()),
('facebook',       'facebook',      'Facebook',          'india',  2.00, NULL, true, NOW(), NOW()),
('twitter',        'twitter',       'Twitter / X',       'india',  2.00, NULL, true, NOW(), NOW()),
('youtube',        'youtube',       'YouTube',           'india',  2.00, NULL, true, NOW(), NOW()),
('snapchat',       'snapchat',      'Snapchat',          'india',  2.00, NULL, true, NOW(), NOW()),
('discord',        'discord',       'Discord',           'india',  2.00, NULL, true, NOW(), NOW()),
('linkedin',       'linkedin',      'LinkedIn',          'india', 18.00, NULL, true, NOW(), NOW()),
('tiktok',         'tiktok',        'TikTok',            'india',  2.00, NULL, true, NOW(), NOW()),
('airtel',         'airtel',        'Airtel',            'india',  2.00, NULL, true, NOW(), NOW()),

-- Google / Apple / Microsoft
('google',         'google',        'Google',            'india',  2.00, NULL, true, NOW(), NOW()),
('apple',          'apple',         'Apple ID',          'india',  2.00, NULL, true, NOW(), NOW()),
('microsoft',      'microsoft',     'Microsoft',         'india',  8.00, NULL, true, NOW(), NOW()),

-- E-Commerce / Shopping
('amazon',         'amazon',        'Amazon',            'india', 18.00, NULL, true, NOW(), NOW()),
('flipkart',       'flipkart',      'Flipkart',          'india', 15.00, NULL, true, NOW(), NOW()),
('meesho',         'meesho',        'Meesho',            'india', 12.00, NULL, true, NOW(), NOW()),
('myntra',         'myntra',        'Myntra',            'india', 12.00, NULL, true, NOW(), NOW()),

-- Food / Delivery
('swiggy',         'swiggy',        'Swiggy',            'india', 12.00, NULL, true, NOW(), NOW()),
('zomato',         'zomato',        'Zomato',            'india', 12.00, NULL, true, NOW(), NOW()),

-- Ride / Transport
('uber',           'uber',          'Uber',              'india', 15.00, NULL, true, NOW(), NOW()),
('ola',            'ola',           'Ola',               'india', 12.00, NULL, true, NOW(), NOW()),
('rapido',         'rapido',        'Rapido',            'india', 10.00, NULL, true, NOW(), NOW()),

-- Payments
('paytm',          'paytm',         'Paytm',             'india', 15.00, NULL, true, NOW(), NOW()),
('google-pay',     'google-pay',    'Google Pay',        'india', 15.00, NULL, true, NOW(), NOW()),
('phonepe',        'phonepe',       'PhonePe',           'india', 15.00, NULL, true, NOW(), NOW()),

-- Gaming
('battlegrounds',  'battlegrounds', 'Battlegrounds IN',  'india', 10.00, NULL, true, NOW(), NOW()),
('freefire',       'freefire',      'Free Fire',         'india', 10.00, NULL, true, NOW(), NOW()),

-- Entertainment
('netflix',        'netflix',       'Netflix',           'india', 15.00, NULL, true, NOW(), NOW()),
('hotstar',        'hotstar',       'Disney+ Hotstar',   'india', 12.00, NULL, true, NOW(), NOW())

ON CONFLICT ("id") DO NOTHING;


-- ============================================================
-- VERIFY (uncomment to check)
-- ============================================================
-- SELECT * FROM "ApiCredential";
-- SELECT * FROM "OtpServer";
-- SELECT id, code, name, "basePrice" FROM "Service" ORDER BY name;


-- ============================================================
-- ROLLBACK — removes everything inserted above
-- ============================================================
-- DELETE FROM "Service"       WHERE "serverId" = 'india';
-- DELETE FROM "OtpServer"     WHERE "id"       = 'india';
-- DELETE FROM "ApiCredential" WHERE "id"       = 'cattysms';