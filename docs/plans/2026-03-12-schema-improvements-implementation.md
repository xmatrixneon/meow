# Schema Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 6 schema improvements: separate SMS table, remove PENDING sentinel, provider error tracking, active purchase idempotency, append-only transactions, and reconciliation script.

**Architecture:** Add new `SmsMessage` model, modify `ActiveNumber` to use nullable fields and track provider status, add DB trigger for transaction immutability, and create on-demand reconciliation script.

**Tech Stack:** Prisma, PostgreSQL, TypeScript, Next.js

---

## Task 1: Update Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add SmsMessage model**

Add after the `ActiveNumber` model definition (around line 340):

```prisma
// ─── SMS Messages ────────────────────────────────────────────────────────────

model SmsMessage {
  id             String   @id @default(cuid())
  activeNumberId String
  content        String
  receivedAt     DateTime @default(now())

  activeNumber ActiveNumber @relation(fields: [activeNumberId], references: [id], onDelete: Cascade)

  @@index([activeNumberId])
  @@index([activeNumberId, receivedAt])
}
```

**Step 2: Modify ActiveNumber model**

Replace lines 279-340 in `prisma/schema.prisma`:

```prisma
model ActiveNumber {
  id          String @id @default(cuid())
  userId      String
  serviceId   String
  serverId    String

  /// Unique order reference — used as the join key across transactions and provider calls.
  orderId String @unique

  /// Provider-assigned order ID. NULL until provider call succeeds.
  numberId String?

  /// E.164 phone number. NULL until provider call succeeds.
  phoneNumber String?

  /// Purchase price at time of buy.
  /// Non-negative (0.00 allowed for 100% discount). Enforced by DB CHECK.
  price Decimal @db.Decimal(10, 2)

  status       NumberStatus @default(PENDING)
  activeStatus ActiveStatus @default(ACTIVE)

  /// SMS messages received for this number.
  smsMessages SmsMessage[]

  /// True while balance has been deducted and no refund issued.
  balanceDeducted Boolean @default(false)

  /// Provider tracking for debugging.
  providerStatus    String?
  providerError     String?
  lastProviderCheck DateTime?

  createdAt DateTime @default(now())
  expiresAt DateTime
  updatedAt DateTime @updatedAt

  user    User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  service Service   @relation(fields: [serviceId], references: [id], onDelete: Restrict)
  server  OtpServer @relation(fields: [serverId], references: [id])

  // ── Pagination indexes ──────────────────────────────────────────────────────
  @@index([userId, activeStatus, status, createdAt(sort: Desc), id(sort: Desc)])

  // ── Poller index ────────────────────────────────────────────────────────────
  @@index([activeStatus, expiresAt])

  // ── Point-lookup indexes ────────────────────────────────────────────────────
  @@index([orderId, userId])
  @@index([userId, status])
  @@index([serverId])
}
```

**Step 3: Add relation to ActiveNumber in OtpServer model**

Find the `OtpServer` model and update the `numbers` relation to include `SmsMessage`:

The existing relation is already correct. No change needed here.

**Step 4: Generate Prisma client**

```bash
npx prisma generate
```

Expected: Prisma client generated to `app/generated/prisma/`

**Step 5: Commit schema changes**

```bash
git add prisma/schema.prisma
git commit -m "$(cat <<'EOF'
feat(schema): add SmsMessage model and provider tracking

- Add SmsMessage model for normalized SMS storage
- Make numberId/phoneNumber nullable (remove PENDING sentinel)
- Add providerStatus, providerError, lastProviderCheck fields
- Remove smsContent JSON field

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create Database Migration

**Files:**
- Create: `prisma/migrations/20260312_schema_improvements/migration.sql`

**Step 1: Create migration file**

```bash
mkdir -p prisma/migrations/20260312_schema_improvements
```

**Step 2: Write migration SQL**

Create file `prisma/migrations/20260312_schema_improvements/migration.sql`:

```sql
-- ─── 1. Create SmsMessage table ──────────────────────────────────────────────

CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "activeNumberId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- ─── 2. Migrate existing SMS data ────────────────────────────────────────────

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

-- ─── 3. Add new columns to ActiveNumber ──────────────────────────────────────

ALTER TABLE "ActiveNumber" ADD COLUMN "providerStatus" TEXT;
ALTER TABLE "ActiveNumber" ADD COLUMN "providerError" TEXT;
ALTER TABLE "ActiveNumber" ADD COLUMN "lastProviderCheck" TIMESTAMP(3);

-- ─── 4. Make numberId and phoneNumber nullable ───────────────────────────────

-- First update any "PENDING" values to NULL
UPDATE "ActiveNumber" SET "numberId" = NULL WHERE "numberId" = 'PENDING';
UPDATE "ActiveNumber" SET "phoneNumber" = NULL WHERE "phoneNumber" = 'PENDING';

-- Alter columns to be nullable (they already are in PostgreSQL, just ensuring)
ALTER TABLE "ActiveNumber" ALTER COLUMN "numberId" DROP NOT NULL;
ALTER TABLE "ActiveNumber" ALTER COLUMN "phoneNumber" DROP NOT NULL;

-- ─── 5. Drop smsContent column ───────────────────────────────────────────────

ALTER TABLE "ActiveNumber" DROP COLUMN "smsContent";

-- ─── 6. Add indexes for SmsMessage ───────────────────────────────────────────

CREATE INDEX "SmsMessage_activeNumberId_idx" ON "SmsMessage"("activeNumberId");
CREATE INDEX "SmsMessage_activeNumberId_receivedAt_idx" ON "SmsMessage"("activeNumberId", "receivedAt");

-- ─── 7. Add foreign key constraint ───────────────────────────────────────────

ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_activeNumberId_fkey"
    FOREIGN KEY ("activeNumberId") REFERENCES "ActiveNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 8. Create append-only trigger for Transaction ───────────────────────────

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
```

**Step 3: Mark migration as applied (for existing DB)**

```bash
# If database already has data, run the SQL manually or use:
npx prisma migrate dev --name schema_improvements --create-only
# Then apply the generated migration
```

**Step 4: Commit migration**

```bash
git add prisma/migrations/
git commit -m "$(cat <<'EOF'
feat(db): add migration for schema improvements

- Create SmsMessage table with indexes
- Migrate existing JSON SMS data to new table
- Add provider tracking columns to ActiveNumber
- Convert PENDING sentinel values to NULL
- Drop smsContent JSON column
- Add append-only trigger for Transaction table

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Rewrite SMS Utilities

**Files:**
- Modify: `lib/sms.ts`

**Step 1: Rewrite lib/sms.ts**

Replace entire file:

```typescript
import { prisma } from "@/lib/db";

export type SmsEntry = {
  id: string;
  content: string;
  receivedAt: Date;
};

/**
 * Create a new SMS message for an active number.
 * Returns the created message or null if duplicate detected.
 *
 * IMPORTANT: Call OUTSIDE of prisma.$transaction blocks to avoid isolation conflicts.
 */
export async function createSmsMessage(
  activeNumberId: string,
  content: string,
): Promise<{ created: boolean; message: SmsEntry | null }> {
  // Check for duplicate content within last 60 seconds (debounce rapid duplicates)
  const recentDuplicate = await prisma.smsMessage.findFirst({
    where: {
      activeNumberId,
      content,
      receivedAt: {
        gte: new Date(Date.now() - 60 * 1000),
      },
    },
  });

  if (recentDuplicate) {
    return { created: false, message: null };
  }

  const message = await prisma.smsMessage.create({
    data: {
      activeNumberId,
      content,
    },
    select: {
      id: true,
      content: true,
      receivedAt: true,
    },
  });

  return { created: true, message };
}

/**
 * Get all SMS messages for an active number, ordered by receivedAt.
 */
export async function getSmsMessages(activeNumberId: string): Promise<SmsEntry[]> {
  const messages = await prisma.smsMessage.findMany({
    where: { activeNumberId },
    orderBy: { receivedAt: "asc" },
    select: {
      id: true,
      content: true,
      receivedAt: true,
    },
  });

  return messages;
}

/**
 * Get the latest SMS message for an active number.
 */
export async function getLatestSms(activeNumberId: string): Promise<SmsEntry | null> {
  const message = await prisma.smsMessage.findFirst({
    where: { activeNumberId },
    orderBy: { receivedAt: "desc" },
    select: {
      id: true,
      content: true,
      receivedAt: true,
    },
  });

  return message;
}

/**
 * Check if an active number has any SMS messages.
 */
export async function hasSmsMessages(activeNumberId: string): Promise<boolean> {
  const count = await prisma.smsMessage.count({
    where: { activeNumberId },
  });

  return count > 0;
}

/**
 * Parse SMS content to extract OTP code.
 * Looks for 4-8 digit codes in the message.
 */
export function extractOTP(content: string | null): string | null {
  if (!content) return null;

  // Common OTP patterns: 4-8 consecutive digits
  const match = content.match(/\b(\d{4,8})\b/);
  return match ? match[1] : null;
}
```

**Step 2: Commit**

```bash
git add lib/sms.ts
git commit -m "$(cat <<'EOF'
refactor(sms): rewrite for SmsMessage table

- Replace JSON-based smsContent with database table operations
- Add createSmsMessage, getSmsMessages, getLatestSms functions
- Add duplicate detection within 60-second window
- Keep extractOTP utility function

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update SMS Poller

**Files:**
- Modify: `scripts/fetch.ts`

**Step 1: Update imports**

At the top of `scripts/fetch.ts`, update the import from lib/sms.ts:

```typescript
import { createSmsMessage, getLatestSms, hasSmsMessages } from "@/lib/sms";
```

Remove the old import of `appendSmsContent` and `computeSmsUpdate`.

**Step 2: Update SMS handling in poller**

Find the section around line 160-290 that handles SMS receipt. Replace the SMS logic:

Locate the block that starts with `if (statusResponse.status === "RECEIVED")` and update:

```typescript
if (statusResponse.status === "RECEIVED") {
  const smsText = statusResponse.sms;
  if (!smsText) continue;

  // Create SMS message in new table (outside transaction)
  const { created } = await createSmsMessage(number.id, smsText);

  if (!created) {
    // Duplicate SMS, skip
    continue;
  }

  // Check if this is first SMS (status is still PENDING)
  const isFirstSms = number.status === NumberStatus.PENDING;

  if (isFirstSms) {
    // First SMS received - update status to COMPLETED and increment wallet stats
    await prisma.$transaction(async (tx) => {
      await tx.activeNumber.update({
        where: { id: number.id },
        data: {
          status: NumberStatus.COMPLETED,
          lastProviderCheck: new Date(),
          providerStatus: "SUCCESS",
        },
      });

      // Increment wallet stats for successful SMS
      await tx.wallet.update({
        where: { userId: number.userId },
        data: {
          totalSpent: { increment: number.price },
          totalOtp: { increment: 1 },
        },
      });
    });
  } else {
    // Additional SMS - just update provider check time
    await prisma.activeNumber.update({
      where: { id: number.id },
      data: {
        lastProviderCheck: new Date(),
        providerStatus: "SUCCESS",
      },
    });
  }

  // Request next SMS for multi-SMS support
  try {
    await otpClient.getNextSms(number.numberId!);
  } catch {
    // Provider may not support multi-SMS, ignore
  }

  continue;
}
```

**Step 3: Update provider error tracking**

Find the error handling sections and add provider status tracking:

```typescript
// On API error
await prisma.activeNumber.update({
  where: { id: number.id },
  data: {
    lastProviderCheck: new Date(),
    providerStatus: "API_ERROR",
    providerError: error.message,
  },
});

// On timeout
await prisma.activeNumber.update({
  where: { id: number.id },
  data: {
    lastProviderCheck: new Date(),
    providerStatus: "TIMEOUT",
  },
});

// On no number available
await prisma.activeNumber.update({
  where: { id: number.id },
  data: {
    lastProviderCheck: new Date(),
    providerStatus: "NO_NUMBER",
  },
});
```

**Step 4: Update refund logic for expired numbers**

Find the expiry check section and update to use `hasSmsMessages`:

```typescript
if (new Date() > number.expiresAt) {
  const receivedSms = await hasSmsMessages(number.id);

  if (receivedSms) {
    // Has SMS - mark as completed
    await prisma.activeNumber.update({
      where: { id: number.id },
      data: {
        activeStatus: ActiveStatus.CLOSED,
        lastProviderCheck: new Date(),
        providerStatus: "SUCCESS",
      },
    });
  } else if (number.balanceDeducted) {
    // No SMS - refund
    // ... existing refund logic ...
  }
}
```

**Step 5: Commit**

```bash
git add scripts/fetch.ts
git commit -m "$(cat <<'EOF'
refactor(poller): use SmsMessage table and provider tracking

- Replace JSON smsContent with createSmsMessage calls
- Add provider status/error tracking on API responses
- Use hasSmsMessages for expiry checks
- Update wallet stats on first SMS receipt

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update Number Router

**Files:**
- Modify: `lib/trpc/routers/number.ts`

**Step 1: Update imports**

Add at the top:

```typescript
import { getSmsMessages, getLatestSms, hasSmsMessages, extractOTP } from "@/lib/sms";
```

**Step 2: Add idempotency check in buy mutation**

Find the `buy` mutation (around line 196). Add after the service validation:

```typescript
// ─── Idempotency: Check for existing active order ──────────────────────────────
const existingActive = await prisma.activeNumber.findFirst({
  where: {
    userId,
    serviceId: service.id,
    activeStatus: ActiveStatus.ACTIVE,
  },
  orderBy: { createdAt: "desc" },
  include: {
    service: { include: { server: true } },
  },
});

if (existingActive) {
  // Return existing active order instead of creating duplicate
  return {
    id: existingActive.id,
    orderId: existingActive.orderId,
    phoneNumber: existingActive.phoneNumber,
    service: {
      id: existingActive.service.id,
      name: existingActive.service.name,
    },
    country: existingActive.service.server?.countryName ?? "Unknown",
    expiresAt: existingActive.expiresAt,
    price: existingActive.price,
    status: "existing" as const,
  };
}
```

**Step 3: Update ActiveNumber creation**

Find the `tx.activeNumber.create` call (around line 252). Update:

```typescript
const activeNumber = await tx.activeNumber.create({
  data: {
    userId,
    serviceId: service.id,
    orderId,
    serverId: service.serverId,
    numberId: null,        // Changed from "PENDING"
    phoneNumber: null,     // Changed from "PENDING"
    price: finalPrice,
    status: NumberStatus.PENDING,
    activeStatus: ActiveStatus.ACTIVE,
    balanceDeducted: true,
    expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
  },
  include: { service: true },
});
```

**Step 4: Update provider success handling**

After successful `otpClient.getNumber` call, update the record:

```typescript
// Update with provider data
await prisma.activeNumber.update({
  where: { id: result.activeNumber.id },
  data: {
    numberId: numberResponse.orderId,
    phoneNumber: numberResponse.phoneNumber,
    lastProviderCheck: new Date(),
    providerStatus: "SUCCESS",
  },
});
```

**Step 5: Update provider error handling**

In the catch block for provider failure:

```typescript
await prisma.activeNumber.update({
  where: { id: result.activeNumber.id },
  data: {
    lastProviderCheck: new Date(),
    providerStatus: "API_ERROR",
    providerError: error.message,
  },
});
```

**Step 6: Update getActive query to include SMS messages**

Find the `getActive` procedure and update the include:

```typescript
include: {
  service: {
    include: {
      server: true,
    },
  },
  smsMessages: {
    orderBy: { receivedAt: "asc" as const },
  },
},
```

**Step 7: Update return type to include SMS**

Find where active numbers are returned and update the transform:

```typescript
const numbers = activeNumbers.map((n) => ({
  ...n,
  sms: n.smsMessages.length > 0 ? n.smsMessages[n.smsMessages.length - 1].content : null,
  smsList: n.smsMessages.map((s) => ({
    content: s.content,
    receivedAt: s.receivedAt.toISOString(),
  })),
  code: n.smsMessages.length > 0 ? extractOTP(n.smsMessages[n.smsMessages.length - 1].content) : null,
}));
```

**Step 8: Update cancel and status checks**

Find queries that check `phoneNumber: { not: "PENDING" }` and change to:

```typescript
phoneNumber: { not: null }
```

**Step 9: Commit**

```bash
git add lib/trpc/routers/number.ts
git commit -m "$(cat <<'EOF'
refactor(number): add idempotency and use SmsMessage table

- Add active purchase check to prevent duplicate charges
- Use null instead of "PENDING" sentinel for numberId/phoneNumber
- Include smsMessages relation in queries
- Add provider status tracking on buy
- Update queries to use phoneNumber: { not: null }

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update Wallet Router

**Files:**
- Modify: `lib/trpc/routers/wallet.ts`

**Step 1: Update SMS filter query**

Find the line with `smsContent: { not: Prisma.DbNull }` (around line 148). Replace with:

```typescript
// Check for SMS using subquery on SmsMessage table
const numbersWithSms = await prisma.smsMessage.findFirst({
  where: { activeNumber: { userId } },
  select: { activeNumberId: true },
});
// Use this in filter logic as needed
```

Or update the aggregation to use the new relation if it's an include.

**Step 2: Commit**

```bash
git add lib/trpc/routers/wallet.ts
git commit -m "$(cat <<'EOF'
refactor(wallet): update SMS filter for new table

- Replace smsContent JSON check with SmsMessage relation query

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update Public API (Stubs)

**Files:**
- Modify: `app/api/stubs/handler_api.php/route.ts`

**Step 1: Add imports**

Add at the top:

```typescript
import { getLatestSms, hasSmsMessages, extractOTP } from "@/lib/sms";
```

**Step 2: Add idempotency check in handleGetNumber**

Find `handleGetNumber` function. Add after validation, before the transaction:

```typescript
// ─── Idempotency: Check for existing active order ──────────────────────────────
const existingActive = await prisma.activeNumber.findFirst({
  where: {
    userId: user.id,
    serviceId: service.id,
    activeStatus: ActiveStatus.ACTIVE,
  },
  orderBy: { createdAt: "desc" },
});

if (existingActive) {
  // Return existing order
  const phone = existingActive.phoneNumber || "PENDING";
  return new NextResponse(`ACCESS_NUMBER:${existingActive.orderId}:${phone}`, {
    status: 200,
    headers: corsHeaders,
  });
}
```

**Step 3: Update ActiveNumber creation**

Find the `tx.activeNumber.create` call. Update:

```typescript
const activeNumber = await tx.activeNumber.create({
  data: {
    userId: user.id,
    numberId: null,        // Changed from "PENDING"
    phoneNumber: null,     // Changed from "PENDING"
    serverId: service.serverId,
    serviceId: service.id,
    orderId,
    expiresAt,
    price: finalPrice,
    status: NumberStatus.PENDING,
    activeStatus: ActiveStatus.ACTIVE,
    balanceDeducted: true,
  },
});
```

**Step 4: Update getStatus to use SmsMessage table**

Find `handleGetStatus` function. Replace the SMS retrieval:

```typescript
// Get latest SMS from SmsMessage table
const latestSms = await getLatestSms(number.id);

if (number.activeStatus === ActiveStatus.CLOSED) {
  if (latestSms) {
    return new NextResponse(`STATUS_OK:${latestSms.content}`, {
      status: 200,
      headers: corsHeaders,
    });
  }
  return new NextResponse("STATUS_CANCEL", {
    status: 200,
    headers: corsHeaders,
  });
}

// ... expiry check logic ...

if (latestSms) {
  return new NextResponse(`STATUS_OK:${latestSms.content}`, {
    status: 200,
    headers: corsHeaders,
  });
}
```

**Step 5: Update expiry refund check**

Find the expiry logic. Update to use `hasSmsMessages`:

```typescript
if (new Date() > number.expiresAt) {
  const receivedSms = await hasSmsMessages(number.id);

  if (number.balanceDeducted && number.status === NumberStatus.PENDING && !receivedSms) {
    // Refund logic...
  }
}
```

**Step 6: Remove extractLatestSms function**

Delete the `extractLatestSms` function (around line 599-611) as it's replaced by `getLatestSms`.

**Step 7: Update setStatus cancel check**

Find the cancel logic (statusCode === 8). Update:

```typescript
if (number.status !== NumberStatus.PENDING) {
  // Check if has SMS
  const receivedSms = await hasSmsMessages(number.id);
  if (receivedSms) {
    return new NextResponse("ACCESS_ACTIVATION", {
      status: 200,
      headers: corsHeaders,
    });
  }
}
```

**Step 8: Commit**

```bash
git add app/api/stubs/handler_api.php/route.ts
git commit -m "$(cat <<'EOF'
refactor(stubs): add idempotency and use SmsMessage table

- Add active purchase check in handleGetNumber
- Use null instead of "PENDING" sentinel
- Replace extractLatestSms with getLatestSms from lib/sms
- Use hasSmsMessages for status checks
- Add provider status tracking

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update Frontend Numbers Page

**Files:**
- Modify: `app/numbers/page.tsx`

**Step 1: Update parseSmsContent usage**

Find the `parseSmsContent` function calls (around lines 632, 660). The data structure from tRPC now returns `smsMessages` instead of `smsContent`.

Update the data transform:

```typescript
const numbers: TempNumber[] = useMemo(
  () =>
    activeData?.numbers.map((n) => {
      const server = n.service?.server;
      const smsList = n.smsMessages?.map((s: any) => ({
        content: s.content,
        receivedAt: s.receivedAt,
      })) ?? [];
      const displaySms = smsList.length > 0 ? smsList[smsList.length - 1].content : null;

      return {
        id: n.id,
        orderId: n.orderId,
        number: n.phoneNumber ?? "Waiting...",
        country: server?.countryName ?? "Unknown",
        countryCode: server?.countryCode ?? "",
        countryIso: server?.countryIso ?? "",
        countryFlag: server?.flagUrl,
        service: n.service?.name ?? "Unknown",
        serviceId: n.serviceId,
        serverId: n.serverId,
        status: "waiting" as TabValue,
        smsReceived: (n.status as string) === "COMPLETED",
        expiresAt: new Date(n.expiresAt),
        sms: displaySms,
        smsList,
        code: extractOTP(displaySms),
        buyTime: new Date(n.createdAt),
      };
    }) ?? [],
  [activeData],
);
```

**Step 2: Update receivedNumbers transform similarly**

Apply the same pattern to the `receivedNumbers` useMemo.

**Step 3: Remove or update parseSmsContent helper**

If there's a `parseSmsContent` helper function in the file, it can be removed since the data now comes pre-formatted from the API.

**Step 4: Commit**

```bash
git add app/numbers/page.tsx
git commit -m "$(cat <<'EOF'
refactor(numbers): use smsMessages from API response

- Update data transforms to use smsMessages array
- Handle null phoneNumber with "Waiting..." fallback
- Remove parseSmsContent helper (no longer needed)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Create Wallet Reconciliation Script

**Files:**
- Create: `scripts/reconcile-wallet.ts`

**Step 1: Create the script**

```typescript
#!/usr/bin/env npx tsx
/**
 * Wallet Reconciliation Script
 *
 * Verifies wallet balance matches the transaction ledger.
 * Run with --fix to correct discrepancies.
 *
 * Usage:
 *   npx tsx scripts/reconcile-wallet.ts           # Check all wallets
 *   npx tsx scripts/reconcile-wallet.ts --fix     # Fix discrepancies
 *   npx tsx scripts/reconcile-wallet.ts --user=X  # Check specific user
 */

import { config } from "dotenv";
config();

import { prisma } from "@/lib/db";
import { TransactionType, TransactionStatus } from "@/app/generated/prisma/client";
import { Decimal } from "@/app/generated/prisma/client/runtime/library";

const { Decimal: PrismaDecimal } = await import("@prisma/client/runtime/library");

function toDecimal(value: any): Decimal {
  if (value instanceof PrismaDecimal) return value;
  return new PrismaDecimal(String(value || 0));
}

async function reconcileWallet(userId?: string, fix: boolean = false) {
  console.log("=== Wallet Reconciliation ===\n");

  const wallets = userId
    ? await prisma.wallet.findMany({ where: { userId } })
    : await prisma.wallet.findMany({
        include: { user: { select: { telegramUsername: true } } },
      });

  if (wallets.length === 0) {
    console.log("No wallets found.");
    return;
  }

  let driftCount = 0;
  let totalDrift = new PrismaDecimal(0);

  for (const wallet of wallets) {
    // Compute balance from transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        walletId: wallet.id,
        status: TransactionStatus.COMPLETED,
      },
      select: { type: true, amount: true },
    });

    let computedBalance = new PrismaDecimal(0);

    for (const tx of transactions) {
      const amount = toDecimal(tx.amount);

      switch (tx.type) {
        case TransactionType.DEPOSIT:
        case TransactionType.PROMO:
        case TransactionType.REFERRAL:
        case TransactionType.REFUND:
        case TransactionType.ADJUSTMENT:
          computedBalance = computedBalance.plus(amount);
          break;
        case TransactionType.PURCHASE:
          computedBalance = computedBalance.minus(amount);
          break;
      }
    }

    const storedBalance = toDecimal(wallet.balance);
    const drift = computedBalance.minus(storedBalance);
    const hasDrift = !drift.equals(0);

    if (hasDrift) {
      driftCount++;
      totalDrift = totalDrift.plus(drift.abs());

      console.log(`❌ DRIFT: Wallet ${wallet.id}`);
      console.log(`   User: ${wallet.userId}`);
      console.log(`   Stored:   ${storedBalance.toFixed(2)}`);
      console.log(`   Computed: ${computedBalance.toFixed(2)}`);
      console.log(`   Drift:    ${drift.toFixed(2)}`);

      if (fix) {
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: { balance: computedBalance },
        });
        console.log(`   ✅ FIXED`);
      }
      console.log();
    }
  }

  console.log("=== Summary ===");
  console.log(`Total wallets: ${wallets.length}`);
  console.log(`Drift detected: ${driftCount}`);
  console.log(`Total drift amount: ${totalDrift.toFixed(2)}`);

  if (driftCount > 0 && !fix) {
    console.log("\nRun with --fix to correct discrepancies.");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fix = args.includes("--fix");
  const userArg = args.find((a) => a.startsWith("--user="));
  const userId = userArg ? userArg.split("=")[1] : undefined;

  try {
    await reconcileWallet(userId, fix);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
```

**Step 2: Commit**

```bash
git add scripts/reconcile-wallet.ts
git commit -m "$(cat <<'EOF'
feat(scripts): add wallet reconciliation script

- On-demand script to verify wallet balance vs transaction ledger
- Supports --fix flag to correct discrepancies
- Supports --user=X to check specific user
- Reports drift summary

Usage: npx tsx scripts/reconcile-wallet.ts [--fix] [--user=X]

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Update CLAUDE.md Documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update SMS Content Utilities section**

Find the "SMS Content Utilities" section and update:

```markdown
## SMS Content Utilities (`lib/sms.ts`)

Utilities for handling SMS messages in the `SmsMessage` table.

### Functions
- `createSmsContent(numberId, content)`: Create new SMS message with duplicate detection
- `getSmsMessages(numberId)`: Get all SMS messages for a number
- `getLatestSms(numberId)`: Get the most recent SMS for a number
- `hasSmsMessages(numberId)`: Check if a number has any SMS
- `extractOTP(content)`: Parse SMS to extract OTP code

### SMS Storage
```typescript
// SMS messages stored in SmsMessage table
type SmsEntry = { id: string; content: string; receivedAt: Date };
```
```

**Step 2: Add reconciliation script to commands**

```markdown
## Common Commands

```bash
npm run dev          # Start development server on localhost:3000
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npx tsx scripts/fetch.ts  # Run SMS poller (background process)
npx tsx scripts/reconcile-wallet.ts  # Verify wallet balances
npx tsx scripts/reconcile-wallet.ts --fix  # Fix wallet discrepancies
```
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: update CLAUDE.md for schema improvements

- Update SMS utilities section for new SmsMessage table
- Add reconciliation script to common commands

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Final Step: Run Migration and Verify

**Step 1: Generate Prisma client**

```bash
npx prisma generate
```

**Step 2: Run migration**

```bash
npx prisma migrate dev --name schema_improvements
```

Or for existing production database:
```bash
npx prisma migrate deploy
```

**Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds without TypeScript errors.

**Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: finalize schema improvements implementation

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Testing Checklist

- [ ] Buy a number via Mini App - should work normally
- [ ] Rapid double-click buy - should return existing active order
- [ ] Receive SMS - should appear in new SmsMessage table
- [ ] Check transaction history - should display correctly
- [ ] Cancel a number - refund should work
- [ ] Public API getNumber - should work with idempotency
- [ ] Public API getStatus - should return SMS from new table
- [ ] Run reconciliation script - should report no drift
