# Virtual Number Service - Design Document

**Date:** 2026-03-01
**Status:** Approved

## Overview

Build a virtual phone number service (OTP/SMS verification) as a Telegram Mini App using Next.js. The app consumes external OTP provider APIs and provides users with virtual numbers for receiving SMS verifications.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              OTP Provider API (External)             │
│   Format: /stubs/handler_api.php?action=...          │
│   Actions: getNumber, getStatus, setStatus, getPrices│
└─────────────────────┬───────────────────────────────┘
                      │ HTTP calls
┌─────────────────────▼───────────────────────────────┐
│              Next.js App (This Project)              │
│  Frontend: React + Tailwind + shadcn/ui              │
│  API: tRPC for type-safe procedures                  │
│  Auth: Better Auth + Telegram Mini App               │
│  Database: PostgreSQL + Prisma                       │
│  Payments: BharatPe auto-verification                │
└─────────────────────────────────────────────────────┘
```

## Database Schema

### User Model (Extended)
```prisma
model User {
  // ... existing Better Auth fields
  isAdmin      Boolean  @default(false)

  // Relations
  wallet       Wallet?
  numbers      ActiveNumber[]
  customPrices CustomPrice[]
  promos       PromocodeHistory[]
}
```

### Wallet & Transactions
```prisma
model Wallet {
  id         String   @id @default(cuid())
  userId     String   @unique
  balance    Float    @default(0)
  totalSpent Float    @default(0)
  user       User     @relation(fields: [userId], references: [id])
  transactions Transaction[]
}

model Transaction {
  id          String   @id @default(cuid())
  walletId    String
  type        String   // DEPOSIT, PURCHASE, REFUND, PROMO
  amount      Float
  status      String   // PENDING, COMPLETED, FAILED
  description String?
  metadata    Json?
  createdAt   DateTime @default(now())
  wallet      Wallet   @relation(fields: [walletId], references: [id])
}
```

### OTP Service System
```prisma
model OtpServer {
  id          String   @id @default(cuid())
  name        String   // "India Server 1"
  countryCode String   // "IN"
  apiUrl      String   // Provider API URL
  apiKey      String   // Encrypted API key
  isActive    Boolean  @default(true)
  services    Service[]
}

model Service {
  id         String   @id @default(cuid())
  name       String   // "WhatsApp", "Telegram"
  code       String   // Service code for API
  serverId   String
  basePrice  Float
  iconUrl    String?
  isActive   Boolean  @default(true)
  server     OtpServer @relation(fields: [serverId], references: [id])
  purchases  ActiveNumber[]
  customPrices CustomPrice[]
}
```

### Active Numbers
```prisma
model ActiveNumber {
  id          String   @id @default(cuid())
  userId      String
  serviceId   String
  orderId     String   @unique
  phoneNumber String
  externalId  String   // Provider's number ID
  price       Float
  status      String   // PENDING, RECEIVED, CANCELLED, EXPIRED
  smsContent  String?
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id])
  service     Service  @relation(fields: [serviceId], references: [id])
}
```

### Promocode System
```prisma
model Promocode {
  id        String   @id @default(cuid())
  code      String   @unique  // 12-digit alphanumeric
  amount    Float
  maxUses   Int      @default(1)
  usedCount Int      @default(0)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  history   PromocodeHistory[]
}

model PromocodeHistory {
  id          String   @id @default(cuid())
  promocodeId String
  userId      String
  amount      Float
  createdAt   DateTime @default(now())
  promocode   Promocode @relation(fields: [promocodeId], references: [id])
  user        User     @relation(fields: [userId], references: [id])
}
```

### Custom Pricing
```prisma
model CustomPrice {
  id        String  @id @default(cuid())
  userId    String
  serviceId String
  discount  Float
  type      String  // FLAT, PERCENT
  user      User    @relation(fields: [userId], references: [id])
  service   Service @relation(fields: [serviceId], references: [id])
  @@unique([userId, serviceId])
}
```

### Settings
```prisma
model Settings {
  id                  String   @id @default("1")
  bharatpeMerchantId  String?
  bharatpeToken       String?
  minRechargeAmount   Float    @default(10)
  upiId               String?  // Display UPI ID
  referralPercent     Float    @default(0)
}
```

## API Structure (tRPC)

### Service Router
```typescript
service.list({ serverId?: string })  // Get services with stock
service.getServers()                  // Get available servers
```

### Number Router
```typescript
number.buy({ serviceId, serverId })  // Purchase number
number.getActive()                    // Get active numbers
number.getStatus({ orderId })         // Poll for SMS
number.cancel({ orderId })            // Cancel & refund
number.history()                      // Completed numbers
```

### Wallet Router
```typescript
wallet.getBalance()                   // Current balance
wallet.getTransactions()              // Transaction history
wallet.deposit({ utr })               // Verify UTR via BharatPe
wallet.redeemPromo({ code })          // Redeem promocode
```

### Admin Router
```typescript
admin.service.create/update/delete
admin.server.create/update/delete
admin.promo.generate({ amount, count, maxUses })
admin.promo.list()
admin.user.list()
admin.user.setCustomPrice({ userId, serviceId, discount, type })
admin.settings.update()
```

## Provider API Bridge

Calls external OTP provider using stubs format:

```typescript
// lib/providers/bridge.ts
const actions = {
  getNumber: (service, country) => `?action=getNumber&service=${service}&country=${country}`,
  getStatus: (id) => `?action=getStatus&id=${id}`,
  setStatus: (id, status) => `?action=setStatus&id=${id}&status=${status}`,
  getPrices: (country) => `?action=getPrices&country=${country}`,
}
```

## Payment Flow (BharatPe)

1. User clicks "Add Balance"
2. Shows UPI ID / QR code
3. User pays and enters UTR number
4. System calls BharatPe API to verify transaction
5. If found, auto-credits wallet

## Frontend Pages

### User Pages
| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Service catalog with search/filter |
| Numbers | `/numbers` | Active numbers + history tabs |
| Wallet | `/wallet` | Balance, deposit, promocode, transactions |
| Profile | `/profile` | User info |
| Support | `/support` | Contact/help |

### Admin Pages
| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/admin` | Stats overview |
| Services | `/admin/services` | CRUD services |
| Servers | `/admin/servers` | Manage API servers |
| Promocodes | `/admin/promocodes` | Generate/manage codes |
| Users | `/admin/users` | User list, custom pricing |
| Settings | `/admin/settings` | Site configuration |

## Key Features

1. **Service Catalog** - Browse services with real-time stock
2. **Number Purchase** - Buy virtual number for any service
3. **SMS Polling** - Real-time SMS status updates
4. **Auto-expiry** - Numbers expire after 20 minutes
5. **Auto-refund** - Refund on cancellation/expiry
6. **Wallet System** - Balance management with BharatPe deposits
7. **Promocodes** - Admin-generated 12-digit codes
8. **Custom Pricing** - Per-user special prices
9. **Admin Panel** - Full management interface
