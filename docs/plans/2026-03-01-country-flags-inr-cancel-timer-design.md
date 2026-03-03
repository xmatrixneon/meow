# Country Flags, INR Pricing, Cancel Timer - Design

**Status:** Approved
**Date:** 2026-03-01

## Overview

Add country flag support with admin-uploaded URLs, display all prices in INR (₹), implement global cancel timer that admin controls, and create external PHP API at `/var/www/stubs/` for programmatic access.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    YOUR APP (meowsms)                               │
│                                                                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │   Frontend UI   │    │   tRPC API      │    │  External API   │ │
│  │   (Next.js)     │───▶│   /api/trpc     │    │ /stubs/handler  │ │
│  │                 │    │                 │    │   _api.php      │ │
│  └─────────────────┘    └────────┬────────┘    └────────┬────────┘ │
│                                  │                      │          │
│                                  ▼                      ▼          │
│                         ┌─────────────────────────────────────┐   │
│                         │         Database (Prisma)           │   │
│                         │  - Services, Servers, Settings      │   │
│                         │  - flagUrl, currency, cancelTimer  │   │
│                         └─────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Section 1: Database Schema Changes

### Settings Model - New Fields
```prisma
model Settings {
  id                  String  @id @default("1")
  // ... existing fields ...

  // NEW FIELDS:
  currency            String  @default("INR")      // Currency symbol for display
  minCancelMinutes    Int     @default(2)        // Global cancel timer (minutes)
}
```

### OtpServer Model - Flag URL
```prisma
model OtpServer {
  id          String    @id @default(cuid())
  name        String    // "India Server 1"
  countryCode String    // "IN", "22"
  flagUrl     String?   // NEW: URL to country flag image
  apiId       String
  isActive    Boolean   @default(true)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  services    Service[]
  api         ApiCredential @relation(fields: [apiId], references: [id])
}
```

### ActiveNumber Model - Server Relation
```prisma
model ActiveNumber {
  id          String       @id @default(cuid())
  userId      String
  serviceId   String
  orderId     String       @unique
  numberId    String
  phoneNumber String
  serverId    String
  price       Decimal      @db.Decimal(10, 2)
  status      NumberStatus @default(PENDING)
  smsContent  String?
  buyTime     DateTime     @default(now())
  expiresAt   DateTime
  createdAt   DateTime     @default(now())
  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  service     Service      @relation(fields: [serviceId], references: [id], onDelete: Restrict)
  server      OtpServer    @relation(fields: [serverId], references: [id]) // NEW: for country info

  @@index([userId, status])
  @@index([status, expiresAt])
}
```

## Section 2: Backend API Changes

### tRPC Service Router
- Add `listWithServers` procedure
- Returns services with nested server info including country data
- Structure: `{ services: [{ id, name, code, basePrice, server: { id, name, countryCode, flagUrl } }] }`

### tRPC Number Router - Cancel Timer
```typescript
// Update cancel procedure
const settings = await prisma.settings.findUnique({ where: { id: "1" } });
const minCancelMinutes = settings?.minCancelMinutes || 2;

const order = await prisma.activeNumber.findUnique({ where: { id: orderId } });
const timeSincePurchase = Date.now() - order.buyTime.getTime();
const minCancelMs = minCancelMinutes * 60 * 1000;

if (timeSincePurchase < minCancelMs) {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: `Cannot cancel within ${minCancelMinutes} minutes`,
  });
}
```

### tRPC Admin Router
- `settings.update` - Accept `currency` and `minCancelMinutes`
- `servers.update` - Accept `flagUrl` per server

### External PHP API (/var/www/stubs/handler_api.php)

**Actions:**

| Action | Parameters | Response |
|---------|------------|----------|
| getNumber | api_key, service, country | ACCESS_NUMBER:orderId:phone |
| getStatus | api_key, id | STATUS_WAIT_CODE / STATUS_OK:sms |
| setStatus | api_key, id, status | ACCESS_CANCEL / ACCESS_ACTIVATION / EARLY_CANCEL_DENIED |

**Database Connection:**
```php
$db = new PDO(
  "pgsql:host=" . getenv('DB_HOST') .
  ";dbname=" . getenv('DB_NAME') .
  ";user=" . getenv('DB_USER') .
  ";password=" . getenv('DB_PASSWORD')
);
```

**Cancel Timer Validation:**
```php
$diffMs = $now->getTimestamp() - $givenTime->getTimestamp();
$minCancelMs = $settings['minCancelMinutes'] * 60 * 1000;

if ($diffMs < $minCancelMs) {
    return "EARLY_CANCEL_DENIED";
}
```

## Section 3: Frontend UI Changes

### Home Page (app/page.tsx)
```tsx
// Balance in INR
<span className="text-xs font-bold text-green-500">
  ₹{walletData?.balance?.toFixed(2) || "0.00"}
</span>

// Server price from DB
<ServerCard server={server} onBuy={() => handleBuy(server.id)} />
// Shows: ₹{parseFloat(server.basePrice).toFixed(2)}
```

### Numbers Page (app/numbers/page.tsx)
```tsx
// Country flag with fallback
<div className="w-10 h-10 rounded-xl overflow-hidden">
  {item.flagUrl ? (
    <img src={item.flagUrl} alt={item.country} className="w-full h-full object-cover" />
  ) : (
    <span className="text-lg">{item.countryCode}</span>
  )}
</div>

// Cancel button with timer check
{isWaiting && (
  <Tooltip content={`Cannot cancel within ${minCancelMinutes} minutes`}>
    <Button disabled={!item.canCancel} className={cn(...)}>
      <Trash2 size={14} />
    </Button>
  </Tooltip>
)}
```

### Wallet Page (app/wallet/page.tsx)
```tsx
// Balance in INR
<span className="text-2xl font-bold text-green-500">
  ₹{walletData?.balance?.toFixed(2) || "0.00"}
</span>

// Transaction amounts in INR
<span className={transaction.type === 'DEPOSIT' ? "text-green-500" : "text-red-500"}>
  {transaction.type === 'DEPOSIT' ? "+" : "-"}₹{Math.abs(transaction.amount).toFixed(2)}
</span>
```

### Admin Settings Page (app/admin/settings/page.tsx)
```tsx
// Currency symbol
<Input id="currency" defaultValue="₹" placeholder="₹, $, €" />

// Cancel timer (minutes)
<Input
  id="minCancelMinutes"
  type="number"
  defaultValue={2}
  min={0}
  max={60}
  label="Minimum time before cancel (minutes)"
/>

// Per-server flag URLs
{servers.map(server => (
  <div key={server.id}>
    <label>{server.name} Flag URL</label>
    <div className="flex gap-2">
      <Input defaultValue={server.flagUrl} placeholder="https://..." />
      {server.flagUrl && (
        <img src={server.flagUrl} className="w-8 h-6 rounded" />
      )}
    </div>
  </div>
))}
```

## Implementation Order

### Phase 1: Database
1. Add `currency` to Settings model
2. Add `minCancelMinutes` to Settings model
3. Add `flagUrl` to OtpServer model
4. Add `server` relation to ActiveNumber model
5. Run migration: `npx prisma migrate dev --name add-country-and-cancel-timer`

### Phase 2: Backend tRPC
1. Update `service.listWithServers` to include country + flagUrl
2. Update `number.cancel` with timer validation
3. Update `admin.settings.update` for new fields
4. Update `admin.servers.update` to handle flagUrl

### Phase 3: External PHP API
1. Create `/var/www/stubs/handler_api.php`
2. Connect to PostgreSQL database via PDO
3. Implement `getNumber` action - buy from pool
4. Implement `getStatus` action - check SMS status
5. Implement `setStatus` action - cancel with timer check
6. Add EARLY_CANCEL_DENIED response for premature cancels

### Phase 4: Frontend
1. Update home page - INR prices, real server data
2. Update numbers page - country flags, cancel timer indicator
3. Update wallet page - INR format
4. Create/update admin settings page - currency, cancel timer, server flags

### Phase 5: Testing
1. Test getNumber → STATUS_WAIT_CODE → STATUS_OK flow
2. Test cancel within timer → EARLY_CANCEL_DENIED
3. Test cancel after timer → ACCESS_CANCEL
4. Verify country flags display correctly
5. Verify INR prices throughout app

## Success Criteria

- [x] Prices displayed as ₹X.XX throughout app
- [x] Country flags show from admin-uploaded URLs
- [x] Users cannot cancel numbers within X minutes (admin-controlled)
- [x] External API at `/var/www/stubs/handler_api.php` works
- [x] External API returns stubs format responses
- [x] Admin can set cancel timer and currency symbol
