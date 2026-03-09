-- ============================================================
-- seed_provider.sql
-- Seed: CattySMS provider → India server → all services
--
-- HOW TO RUN:
--   psql $DATABASE_URL -f seed_provider_full.sql
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
  'https://cattysms.shop',            -- ← CHANGE THIS: CattySMS base API URL
  'maya',                           -- ← CHANGE THIS: your CattySMS API key
  true, NOW(), NOW()
)
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "isActive" = EXCLUDED."isActive", "updatedAt" = EXCLUDED."updatedAt";


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
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "isActive" = EXCLUDED."isActive", "updatedAt" = EXCLUDED."updatedAt";


-- ============================================================
-- 3. Services — linked to India server
--    id:        service identifier (matches code)
--    code:      must match CattySMS service codes
--    basePrice: charged to users in ₹ (randomised 5–9)
-- ============================================================

INSERT INTO "Service" (
  "id", "code", "name", "serverId", "basePrice",
  "iconUrl", "isActive", "createdAt", "updatedAt"
) VALUES

-- Messaging & Social
('whatsapp',        'whatsapp',       'WhatsApp',            'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('telegram',        'telegram',       'Telegram',            'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('instagram',       'instagram',      'Instagram',           'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('facebook',        'facebook',       'Facebook',            'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('viber',           'viber',          'Viber',               'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('signal',          'signal',         'Signal',              'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),

-- Google / Apple / Microsoft
('google',          'google',         'Google',              'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('apple',           'apple',          'Apple ID',            'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('microsoft',       'microsoft',      'Microsoft',           'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('googlepay',       'googlepay',      'Google Pay',          'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('playconsole',     'playconsole',    'Play Console',        'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('googlemessage',   'googlemessage',  'Google Message',      'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),

-- Telecom
('airtel',          'airtel',         'Airtel',              'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),

-- E-Commerce / Shopping
('amazon',          'amazon',         'Amazon',              'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('flipkart',        'flipkart',       'Flipkart',            'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('meesho',          'meesho',         'Meesho',              'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('myntra',          'myntra',         'Myntra',              'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('ajio',            'ajio',           'AJio',                'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('shein',           'shei',           'Shein',               'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('shopsy',          'shopsy',         'Shopsy',              'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('pantaloons',      'panta',          'Pantaloons',          'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('firstcry',        'firstcry',       'First Cry',           'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('bigbasket',       'bigbasket',      'Big Basket',          'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('indiapolls',      'indiapolls',     'Indiapolls',          'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),

-- Food & Grocery Delivery
('swiggy',          'swiggy',         'Swiggy',              'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('zomato',          'zomato',         'Zomato',              'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('blinkit',         'blinkit',        'Blinkit',             'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('zepto',           'zepto',          'Zepto',               'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('zeptom',          'zeptom',         'Zeptom',              'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('jiomart',         'jiomart',        'JioMart',             'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('eatsure',         'eatsure',        'Eatsure',             'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('eatclub',         'eatclub',        'Eatclub',             'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('milkbasket',      'milkbasket',     'Milkbasket',          'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('tabe',            'tabe',           'Tabe',                'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('countrydelight',  'countrydelight', 'Country Delight',     'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('jiffy',           'jiffy',          'Jiffy',               'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),

-- Ride & Transport
('uber',            'uber',           'Uber',                'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('ubereat',         'ubereat',        'Uber Eats',           'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('olacabs',         'olacabs',        'Ola Cabs',            'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('rapido',          'rapido',         'Rapido',              'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('blablacar',       'blablacar',      'BlaBlaCar',           'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('delhiveroo',      'delhiveroo',     'Delhiveroo',          'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),

-- Payments & Fintech
('paytm',           'paytm',          'Paytm',               'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('phonepe',         'phonepe',        'PhonePe',             'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('mobikwik',        'mobi',           'MobiKwik',            'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('cred',            'cred',           'Cred',                'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('razorpay',        'razorpay',       'Razorpay',            'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('freerecharge',    'freerecharge',   'FreeRecharge',        'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('bharatpe',        'bharatpe',       'BharatPe',            'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('cheq',            'cheq',           'CheQ',                'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('crystalpay',      'crystalpay',     'Crystal Pay',         'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('stablemoney',     'stablemoney',    'Stable Money',        'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('fino',            'fino',           'FIno',                'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('rupiyo',          'rupiyo',         'Rupiyo',              'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('mpocket',         'mpocket',        'mPocket',             'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('lendingplate',    'lendingplate',   'Lendingplate',        'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('poonewala',       'poonewala',      'Poonawala Fincorp',   'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('bajajfinance',    'bajajfinance',   'Bajaj Finance',       'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('bajajmarket',     'bajajmarket',    'Bajaj Market',        'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('abcd',            'abcd',           'Aditya Birla Capital','india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('icicimf',         'icicimf',        'ICICI Mutual Fund',   'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('icici',           'icici',          'ICICI',               'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('angleone',        'angleone',       'Angel One',           'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('uptox',           'uptox',          'Upstox',              'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('research360',     'research360',    'Research 360',        'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('mywallet',        'mywallet',       'My Wallet',           'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('pincode',         'pincode',        'Pincode',             'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('dreammoneya',     'dreammoneya',    'Dream Money',         'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('innopay',         'innopay',        'InnoPay',             'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('kredbharat',      'kredbharat',     'Kredbharat',          'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('digitaltopup',    'digitaltopup',   'Digital Topup',       'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('smsindiahub',     'smsindiahub',    'SMS India Hub',       'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),

-- E-Commerce Platforms
('snapmint',        'snapmint',       'Snapmint',            'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('shikhar',         'shikhar',        'Shikhar (HUL)',       'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('bizom',           'bizom',          'Bizom',               'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('delhivery',       'delhivery',      'Delhivery',           'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('qwikcliver',      'qwikcliver',     'QwikCilver',          'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('quickcilver',     'quickcilver',    'Quick Cilver',        'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('shopflo',         'shopflo',        'Shopflo',             'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('citykart',        'citykart',       'Citykart',            'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('hamaramall',      'hamaramall',     'Hamaramall',          'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('hamramall',       'hamramall',      'Hamramall',           'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('hmrmal',          'hmrmal',         'Hmrmal',              'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('apanamart',       'apanamart',      'Apana Mart',          'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('mymart',          'mymart',         'My Mart',             'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('digihaat',        'digihaat',       'Digihaat',            'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('dropit',          'dropit',         'Dropit',              'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('drop',            'drop',           'Drop-D',              'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('bookmydiamond',   'bookmydiamond',  'Book My Diamond',     'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('dotandkey',       'dotandkey',      'Dot & Key',           'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('foxtale',         'foxtale',        'Foxtale',             'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('dermaco',         'dermaco',        'Dermaco',             'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('boat',            'boat',           'boAt',                'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),

-- Healthcare & Pharmacy
('pharmeasy',       'pharmeasy',      'PharmEasy',           'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('netmeds',         'netmeds',        'Netmeds',             'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('trumeds',         'trumeds',        'Truemeds',            'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('cipla',           'cipla',          'CIPLA',               'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('pharmarack',      'pharmarack',     'Pharmarack',          'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('brskly',          'brskly',         'Brskly',              'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('bonusbuddy',      'bonusbuddy',     'Bonus Buddy',         'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),

-- Travel & Booking
('irctc',           'irctc',          'IRCTC',               'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('swarail',         'swarail',        'Swarail (RailOne)',   'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('redbus',          'redbus',         'RedBus',              'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('cleartrip',       'cleartip',       'Cleartrip',           'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('housing',         'housing',        'Housing.com',         'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('realstate',       'realstate',      'Real Estate India',   'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('justdial',        'justdial',       'Just Dial',           'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('jumbo',           'jumbo',          'Jumbo',               'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),

-- Energy / Petroleum
('bpcl',            'bpcl',           'Hello BPCL',          'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('iocl',            'iocl',           'IOCL (Indane)',       'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),

-- Entertainment / OTT / Gaming Apps
('tataneu',         'tataneu',        'Tata Neu',            'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('shriramone',      'shriramone',     'Shriram One',         'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('storytv',         'storytv',        'Story TV',            'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('dishtv',          'dishtv',         'Dish TV',             'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('quicktv',         'quicktv',        'Quick TV',            'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('ranglive',        'ranglive',       'Rang Live',           'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),

-- Education
('testbook',        'testbook',       'Testbook',            'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('unacademy',       'unacademy',      'Unacademy',           'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('career360',       'career360',      'Career 360',          'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('master',          'master',         'Master EDU',          'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('indiago',         'indiago',        'Indiago',             'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('digitalindia',    'digitalindia',   'Digital India',       'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('digialaya',       'digialaya',      'Digialaya',           'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),

-- Insurance / Government
('pmfby',           'pmfby',          'PMFBY',               'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('dbtagriculture',  'dbtagriculture', 'DBT Agriculture',     'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('agrostar',        'agrostar',       'Agro Star',           'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('policybazaar',    'policybazaar',   'Policy Bazaar',       'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('samridhi',        'samridhi',       'Samridhi (Havells)',  'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),

-- Surveys / Analytics
('nielsen',         'nielsen',        'Nielsen',             'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('mobileconnect',   'mobileconnect',  'Mobile Connect',      'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('rewardmedia',     'rewardmedia',    'Reward Media',        'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('mreward',         'mreward',        'Mreward',             'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('almond',          'almond',         'Almond',              'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('brevo',           'brevo',          'Brevo',               'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('twilio',          'twilio',         'Twilio',              'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('tickmill',        'tickmill',       'Tickmill',            'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),

-- Gaming & Betting (India)
('winmatch',        'winmatch',       'Winmatch',            'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('spincrush',       'spincrush',      'Spincrush',           'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('kheloboss',       'kheloboss',      'Kheloboss',           'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('freehit',         'freehit',        'Free Hit',            'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('playkaro',        'playkaro',       'Playkaro',            'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('fastwin',         'fastwin',        'Fastwin',             'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('91club',          '91club',         '91Club',              'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('91rummy',         '91rummy',        '91Rummy',             'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('rummyyes',        'rummyyes',       'Rummy Yes',           'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('rummyclub',       'rummyclub',      'Rummy Club',          'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('rummyclubb',      'rummyclubb',     'Rummy Club-1',        'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('rummypaisa',      'rummypaisa',     'Rummy Paisa',         'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('rummysweety',     'rummysweety',    'Rummy Sweety',        'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('rummymars',       'rummymars',      'Rummy Mars',          'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('rummyola',        'rummyola',       'Rummy Ola',           'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('rummyperfect',    'rummyperfect',   'Rummy Perfect',       'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('rummyeast',       'rummyeast',      'Rummy East',          'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('happyrummy',      'happyrummy',     'Happy Rummy',         'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('teenpattinobel',  'teenpattinobel', 'Teenpatti Nobel',     'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('teenpatisona',    'teenpatisona',   'Teenpati Sona',       'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('winclash',        'winclash',       'Winclash',            'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('cricmatch360',    'cricmatch360',   'Cricmatch360',        'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('royaljeet',       'royaljeet',      'Royaljeet',           'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('jeetexch360',     'jeetexch360',    'Jeetexch360',         'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('starexch',        'starexch',       'Starexch',            'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('star777',         'star777',        'Star777',             'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('bingo777',        'bingo777',       'Bingo777',            'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('yo777',           'yono777',        'Yo777',               'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('ak777',           'ak777',          'Ak777',               'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('ak47',            'ak47',           'Ak47',                'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('lotus365',        'lotus365',       'Lotus365',            'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('reddybook',       'reddybook',      'Reddybook',           'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('kk789',           'kk789',          'KK789',               'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('svip777',         'svip777',        'Svip777',             'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('mr777',           'mr777',          'Mr777',               'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('vipgujarat',      'gujarat',        'VIP Gujarat',         'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('yonovip',         'yonovip',        'Yono Vip',            'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('yonoking',        'yonoking',       'Yono King',           'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('yonogames',       'yonogames',      'Yono Games',          'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('in999',           'in999',          'In999',               'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('in99',            'in99',           'In99',                'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('51game',          '51game',         '51 Game',             'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('6club',           '6club',          '6 Club',              'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('6profit',         '6profit',        '6 Profit',            'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('567slots',        '567slots',       '567slots',            'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('winmate',         'winmate',        'Winmate',             'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('winza',           'winza',          'Winza',               'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('win11',           'win11',          'Win11',               'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('wazirwin',        'wazirwin',       'Wazirwin',            'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('rockywin',        'rockywin',       'Rockywin',            'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('okwin',           'okwin',          'Okwin',               'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('jwin',            'jwin',           'JWIN',                'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('dubaiexch247',    'dubaiexch247',   'Dubaiexch247',        'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('indusbet',        'indusbet',       'Indusbet',            'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('parbet',          'parbet',         'Parbet',              'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('perbet',          'perbet',         'Perbet',              'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('abet',            'abet',           'A Bet',               'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('bcasino',         'bacasino',       'BCASINO',             'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('dggame',          'dggame',         'DG Game',             'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('dbggame',         'dbggame',        'DBG Game',            'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('game1',           'game1',          'Game1',               'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('gamerummy',       'gamerummy',      'Game Rummy',          'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('ultragame',       'ultragame',      'Ultra Game',          'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('mtgame',          'mtgame',         'Mt Game',             'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('aagames',         'aagames',        'Aa Games',            'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('a66game',         'a66game',        'A66game',             'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('t1game',          't1game',         'T1game',              'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('lottery7',        'lottery7',       'Lottery7',            'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('mahaluck',        'mahaluck',       'Maha Luck',           'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('mantrigame',      'mantrigame',     'Mantrigame',          'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('rajagame',        'rajagame',       'Raja Game',           'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('dhoom',           'dhoom',          'Dhoom Play',          'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('slotwinner',      'slotwinner',     'Slot Winner',         'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('novamines',       'novamines',      'Nova Mines',          'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('ncfun',           'ncfun',          'NcFun',               'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('storm',           'storm',          'Storm',               'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('tiranga',         'tiranga',        'Tiranga',             'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('singham',         'singham',        'Singham',             'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('jalwa',           'jalwa',          'Jalwa',               'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('tapalam',         'tapalam',        'Tap Alam',            'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('crisscross',      'crisscross',     'Crisscross',          'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('dkart',           'dkart',          'DKart',               'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('bounty',          'bounty',         'Bounty',              'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('zerox',           'zerox',          'Zerox',               'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('nexsoft',         'nexsoft',        'Nexsoft',             'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('starp',           'starp',          'Starp',               'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('all5otp',         'all5otp',        'All5OTP',             'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('keenin',          'keenin',         'Keenin',              'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('vrummy',          'vrummy',         'Vrummy',              'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('leader',          'leader',         'Rummy Leader',        'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('ricklive',        'ricklive',       'Ricklive',            'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('ricktick',        'ricktick',       'Ricktick',            'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('rojdhan',         'rojdhan',        'Rojdhan',             'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('yourrick',        'yourrick',       'Your Rick',           'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('buggie',          'buggie',         'Buggie',              'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('sudipta',         'sudipta',        'Sudipta',             'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('magicpin',        'magicpin',       'Magicpin',            'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('roney',           'roney',          'Roney Sensex',        'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),

-- Misc / Other
('nykaa',           'nykaa',          'Nykaa',               'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('moneycontrol',    'moneycontrol',   'Money Control',       'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('orgen',           'orgen',          'Orgen',               'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('frnd',            'frnd',           'FRND',                'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('stan',            'stan',           'Stan',                'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('voyz',            'voyz',           'Voyz',                'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('kgen',            'kgen',           'KGEN',                'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('dove',            'dove',           'Dove',                'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('repair',          'repair',         'Repair Challenge',    'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('pundit',          'pundit',         'Asli Pundit',         'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('meragaao',        'meragaao',       'Mera Gao',            'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('orientfame',      'orientfame',     'Orient Fame',         'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('cashbook',        'cashbook',       'Cash Book',           'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('private',         'private',        'Private',             'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('private1',        'private1',       'Private -1',          'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('vip777',          'vip777',         'VIP-777',             'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('spinkaro',        'spinkaro',       'Spinkaro',            'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('facebook2',       'facebook2',      'Facebook2',           'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('smple',           'simple',         'Simple Pay',          'india',  6.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('rohini',          'rohini',         'Rohini',              'india',  8.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('cigna',           'cigna',          'Cigna',               'india',  9.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('wyse',            'wyse',           'Wyse',                'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),
('rosier',          'rosier',         'Rosier (CarWale)',     'india',  7.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW()),

-- TEST
('test-service',    'TEST',           'Test Service',        'india',  5.00, 'https://i.ibb.co/kgBcLZsX/meow.png', true, NOW(), NOW())

ON CONFLICT ("code", "serverId") DO UPDATE SET "name" = EXCLUDED."name", "basePrice" = EXCLUDED."basePrice", "iconUrl" = EXCLUDED."iconUrl", "isActive" = EXCLUDED."isActive", "updatedAt" = EXCLUDED."updatedAt";


-- ============================================================
-- VERIFY (uncomment to check)
-- ============================================================
-- SELECT COUNT(*) FROM "Service" WHERE "serverId" = 'india';
-- SELECT id, code, name, "basePrice" FROM "Service" ORDER BY name;


-- ============================================================
-- ROLLBACK — removes everything inserted above
-- ============================================================
-- DELETE FROM "Service"       WHERE "serverId" = 'india';
-- DELETE FROM "OtpServer"     WHERE "id"       = 'india';
-- DELETE FROM "ApiCredential" WHERE "id"       = 'cattysms';