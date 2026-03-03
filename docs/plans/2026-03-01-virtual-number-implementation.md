# Virtual Number Service - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a complete virtual number service (OTP/SMS verification) as a Telegram Mini App

**Architecture:** Next.js App Router with tRPC for type-safe APIs, Prisma for PostgreSQL, Better Auth for Telegram authentication. Calls external OTP provider APIs using the stubs/handler_api.php format.

**Tech Stack:** Next.js 16, tRPC, Prisma, PostgreSQL, Better Auth, Tailwind CSS, shadcn/ui

---

## Phase 1: Database Schema Extension

### Task 1.1: Extend Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

**Add the following models:**

```prisma
// Wallet System
model Wallet {
  id            String        @id @default(cuid())
  userId        String        @unique
  balance       Float         @default(0)
  totalSpent    Float         @default(0)
  totalOtp      Int           @default(0)
  totalRecharge Float         @default(0)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  user          User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions  Transaction[]
}

model Transaction {
  id          String   @id @default(cuid())
  walletId    String
  type        String   // DEPOSIT, PURCHASE, REFUND, PROMO, REFERRAL
  amount      Float
  status      Int      @default(1) // 0=pending, 1=completed, 2=failed
  description String?
  txnId       String?  // UTR or reference
  metadata    Json?
  createdAt   DateTime @default(now())
  wallet      Wallet   @relation(fields: [walletId], references: [id], onDelete: Cascade)

  @@index([walletId, createdAt])
}

// OTP Provider System
model OtpServer {
  id          String    @id @default(cuid())
  name        String    // "India Server 1"
  countryCode String    // "IN", "22"
  apiId       String    // Reference to ApiCredential
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  services    Service[]
  api         ApiCredential @relation(fields: [apiId], references: [id])
}

model ApiCredential {
  id        String     @id @default(cuid())
  name      String     // "5SIM", "SMS-Activate"
  apiUrl    String
  apiKey    String
  isActive  Boolean    @default(true)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  servers   OtpServer[]
}

model Service {
  id           String   @id @default(cuid())
  code         String   // "whatsapp", "telegram" (for API)
  name         String   // "WhatsApp", "Telegram"
  serverId     String
  basePrice    Float
  iconUrl      String?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  server       OtpServer @relation(fields: [serverId], references: [id])
  purchases    ActiveNumber[]
  customPrices CustomPrice[]

  @@unique([code, serverId])
}

// Active Numbers
model ActiveNumber {
  id          String    @id @default(cuid())
  userId      String
  serviceId   String
  orderId     String    @unique
  numberId    String    // External provider's number ID
  phoneNumber String
  serverId    String
  price       Float
  status      Int       @default(2) // 1=completed, 2=pending, 3=cancelled/expired
  smsContent  String?
  buyTime     DateTime  @default(now())
  expiresAt   DateTime
  createdAt   DateTime  @default(now())
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  service     Service   @relation(fields: [serviceId], references: [id])

  @@index([userId, status])
  @@index([status, expiresAt])
}

// Promocode System
model Promocode {
  id        String            @id @default(cuid())
  code      String            @unique
  amount    Float
  maxUses   Int               @default(1)
  usedCount Int               @default(0)
  isActive  Boolean           @default(true)
  createdAt DateTime          @default(now())
  history   PromocodeHistory[]
}

model PromocodeHistory {
  id          String    @id @default(cuid())
  promocodeId String
  userId      String
  amount      Float
  createdAt   DateTime  @default(now())
  promocode   Promocode @relation(fields: [promocodeId], references: [id])
  user        User      @relation(fields: [userId], references: [id])

  @@unique([promocodeId, userId])
}

// Custom Pricing
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

// Settings
model Settings {
  id                  String  @id @default("1")
  bharatpeMerchantId  String?
  bharatpeToken       String?
  minRechargeAmount   Float   @default(10)
  upiId               String?
  referralPercent     Float   @default(0)
  minRedeem           Float   @default(0)
  numberExpiryMinutes Int     @default(20)
}
```

**Update User model to add:**
```prisma
model User {
  // ... existing fields
  isAdmin      Boolean           @default(false)

  // Relations
  wallet       Wallet?
  numbers      ActiveNumber[]
  customPrices CustomPrice[]
  promoHistory PromocodeHistory[]
}
```

**Step 1: Run migration**
```bash
npx prisma migrate dev --name add_virtual_number_schema
```

**Step 2: Generate Prisma client**
```bash
npx prisma generate
```

**Step 3: Commit**
```bash
git add prisma/schema.prisma
git commit -m "feat: add virtual number service database schema"
```

---

## Phase 2: tRPC Setup

### Task 2.1: Install tRPC Dependencies

**Run:**
```bash
npm install @trpc/server @trpc/client @trpc/react-query @tanstack/react-query superjson
```

### Task 2.2: Create tRPC Configuration

**Create: `lib/trpc/trpc.ts`**
```typescript
import { initTRPC } from '@trpc/server'
import superjson from 'superjson'
import { ZodError } from 'zod'

export const createTRPCContext = async (opts: { headers: Headers }) => {
  return {
    ...opts,
  }
}

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

export const createTRPCRouter = t.router
export const publicProcedure = t.procedure
```

### Task 2.3: Create API Route

**Create: `app/api/trpc/[trpc]/route.ts`**
```typescript
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { createTRPCContext } from '@/lib/trpc/trpc'
import { appRouter } from '@/lib/trpc/routers/_app'

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTRPCContext,
  })

export { handler as GET, handler as POST }
```

---

## Phase 3: OTP Provider Bridge

### Task 3.1: Create Provider Types

**Create: `lib/providers/types.ts`**
```typescript
export interface ProviderResponse {
  getNumber: {
    success: boolean
    orderId?: string
    phoneNumber?: string
    error?: string
  }
  getStatus: {
    status: 'WAITING' | 'RECEIVED' | 'CANCELLED'
    sms?: string
  }
  setStatus: {
    success: boolean
  }
  getPrices: Record<string, { count: number, price: number }>
}

export interface OtpProviderConfig {
  apiUrl: string
  apiKey: string
}
```

### Task 3.2: Create Provider Client

**Create: `lib/providers/client.ts`**
```typescript
import type { OtpProviderConfig } from './types'

export class OtpProviderClient {
  private apiUrl: string
  private apiKey: string

  constructor(config: OtpProviderConfig) {
    this.apiUrl = config.apiUrl
    this.apiKey = config.apiKey
  }

  async getNumber(service: string, country: string) {
    const url = `${this.apiUrl}/stubs/handler_api.php?api_key=${this.apiKey}&action=getNumber&service=${service}&country=${country}`
    const response = await fetch(url)
    const text = await response.text()

    if (text.startsWith('ACCESS_NUMBER:')) {
      const [, id, phone] = text.split(':')
      return { success: true, orderId: id, phoneNumber: phone }
    }
    return { success: false, error: text }
  }

  async getStatus(id: string) {
    const url = `${this.apiUrl}/stubs/handler_api.php?api_key=${this.apiKey}&action=getStatus&id=${id}`
    const response = await fetch(url)
    const text = await response.text()

    if (text.startsWith('STATUS_OK:')) {
      return { status: 'RECEIVED' as const, sms: text.replace('STATUS_OK:', '') }
    }
    if (text === 'STATUS_WAIT_CODE' || text === 'STATUS_WAIT_RETRY') {
      return { status: 'WAITING' as const }
    }
    return { status: 'CANCELLED' as const }
  }

  async setStatus(id: string, status: number) {
    const url = `${this.apiUrl}/stubs/handler_api.php?api_key=${this.apiKey}&action=setStatus&id=${id}&status=${status}`
    await fetch(url)
    return { success: true }
  }

  async getPrices(country: string) {
    const url = `${this.apiUrl}/stubs/handler_api.php?api_key=${this.apiKey}&action=getPrices&country=${country}`
    const response = await fetch(url)
    return response.json()
  }
}
```

---

## Phase 4: Service Router

### Task 4.1: Create Service Router

**Create: `lib/trpc/routers/service.ts`**
```typescript
import { z } from 'zod'
import { createTRPCRouter, publicProcedure } from '../trpc'
import { prisma } from '@/lib/db'

export const serviceRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({ serverId: z.string().optional() }))
    .query(async ({ input }) => {
      const where = input.serverId ? { serverId: input.serverId, isActive: true } : { isActive: true }
      const services = await prisma.service.findMany({
        where,
        include: { server: true },
        orderBy: { name: 'asc' }
      })
      return services
    }),

  servers: publicProcedure.query(async () => {
    return prisma.otpServer.findMany({
      where: { isActive: true },
      include: { api: true }
    })
  }),
})
```

---

## Phase 5: Number Router

### Task 5.1: Create Number Router

**Create: `lib/trpc/routers/number.ts`**
```typescript
import { z } from 'zod'
import { createTRPCRouter, publicProcedure } from '../trpc'
import { prisma } from '@/lib/db'
import { OtpProviderClient } from '@/lib/providers/client'
import { nanoid } from 'nanoid'

export const numberRouter = createTRPCRouter({
  buy: publicProcedure
    .input(z.object({ serviceId: z.string(), serverId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // 1. Get user from session
      // 2. Check wallet balance
      // 3. Call provider API
      // 4. Create ActiveNumber record
      // 5. Deduct balance
      // 6. Return order details
    }),

  getActive: publicProcedure.query(async ({ ctx }) => {
    // Get user's active numbers (status=2)
  }),

  getStatus: publicProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ input, ctx }) => {
      // Poll provider API for SMS
    }),

  cancel: publicProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Cancel number and refund
    }),

  history: publicProcedure.query(async ({ ctx }) => {
    // Get completed numbers (status=1)
  }),
})
```

---

## Phase 6: Wallet Router

### Task 6.1: Create Wallet Router

**Create: `lib/trpc/routers/wallet.ts`**
```typescript
import { z } from 'zod'
import { createTRPCRouter, publicProcedure } from '../trpc'
import { prisma } from '@/lib/db'

export const walletRouter = createTRPCRouter({
  balance: publicProcedure.query(async ({ ctx }) => {
    // Get user wallet balance
  }),

  transactions: publicProcedure.query(async ({ ctx }) => {
    // Get transaction history
  }),

  deposit: publicProcedure
    .input(z.object({ utr: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Verify UTR via BharatPe API
      // Credit wallet if valid
    }),

  redeemPromo: publicProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Validate and redeem promocode
    }),
})
```

---

## Phase 7: Admin Router

### Task 7.1: Create Admin Router

**Create: `lib/trpc/routers/admin.ts`**
```typescript
import { z } from 'zod'
import { createTRPCRouter, publicProcedure } from '../trpc'
import { prisma } from '@/lib/db'

const adminProcedure = publicProcedure.use(async ({ ctx, next }) => {
  // Check if user is admin
  return next()
})

export const adminRouter = createTRPCRouter({
  service: createTRPCRouter({
    create: adminProcedure.input(/* ... */).mutation(/* ... */),
    update: adminProcedure.input(/* ... */).mutation(/* ... */),
    delete: adminProcedure.input(/* ... */).mutation(/* ... */),
  }),

  server: createTRPCRouter({
    create: adminProcedure.input(/* ... */).mutation(/* ... */),
    update: adminProcedure.input(/* ... */).mutation(/* ... */),
    delete: adminProcedure.input(/* ... */).mutation(/* ... */),
  }),

  promo: createTRPCRouter({
    generate: adminProcedure.input(/* ... */).mutation(/* ... */),
    list: adminProcedure.query(/* ... */),
  }),

  user: createTRPCRouter({
    list: adminProcedure.query(/* ... */),
    setCustomPrice: adminProcedure.input(/* ... */).mutation(/* ... */),
  }),
})
```

---

## Phase 8: Frontend Pages

### Task 8.1: Update Home Page - Service Catalog

**Modify: `app/page.tsx`**
- Display service cards with logo, name, price, stock
- Search/filter functionality
- Buy button

### Task 8.2: Update Numbers Page

**Modify: `app/numbers/page.tsx`**
- Active numbers tab with countdown timer
- History tab
- SMS display
- Cancel button

### Task 8.3: Update Wallet Page

**Modify: `app/wallet/page.tsx`**
- Balance display
- Deposit via UPI (UTR input)
- Promocode redemption
- Transaction history

### Task 8.4: Create Admin Pages

**Create:**
- `app/admin/page.tsx` - Dashboard
- `app/admin/services/page.tsx` - Service management
- `app/admin/servers/page.tsx` - Server management
- `app/admin/promocodes/page.tsx` - Promocode management
- `app/admin/users/page.tsx` - User management

---

## Phase 9: BharatPe Integration

### Task 9.1: Create BharatPe Client

**Create: `lib/payments/bharatpe.ts`**
```typescript
export class BharatPeClient {
  private merchantId: string
  private token: string

  async verifyTransaction(utr: string) {
    const url = `https://payments-tesseract.bharatpe.in/api/v1/merchant/transactions?module=PAYMENT_QR&merchantId=${this.merchantId}`
    const response = await fetch(url, {
      headers: { token: this.token }
    })
    const data = await response.json()

    const match = data.data.transactions.find(
      (t: any) => t.bankReferenceNo === utr
    )

    if (match) {
      return {
        found: true,
        amount: match.amount,
        payerName: match.payerName
      }
    }
    return { found: false }
  }
}
```

---

## Execution Order

1. **Phase 1**: Database Schema (foundation)
2. **Phase 2**: tRPC Setup (API infrastructure)
3. **Phase 3**: Provider Bridge (external API communication)
4. **Phase 4**: Service Router (read-only, low risk)
5. **Phase 5**: Number Router (core business logic)
6. **Phase 6**: Wallet Router (financial operations)
7. **Phase 9**: BharatPe Integration (payment verification)
8. **Phase 7**: Admin Router (management)
9. **Phase 8**: Frontend Pages (UI)

---

## Key Implementation Notes

### Number Status Codes
- `1` = Completed (SMS received)
- `2` = Pending (waiting for SMS)
- `3` = Cancelled/Expired

### API Response Format (from legacy)
- `ACCESS_NUMBER:order_id:phone_number` - Success
- `STATUS_WAIT_CODE` - Waiting for SMS
- `STATUS_OK:code` - SMS received
- `STATUS_CANCEL` - Cancelled
- `NO_BALANCE` - Insufficient funds
- `BAD_KEY` - Invalid API key

### Pricing Logic
1. Get base price from Service
2. Check CustomPrice for user discount
3. Apply FLAT discount or PERCENT percentage
4. Return final price
