# Schema Improvements Design

**Date:** 2026-03-12
**Status:** Approved
**Based on:** Senior developer recommendations

## Overview

This design addresses 6 schema improvements to enhance data integrity, prevent duplicate charges, improve querying capabilities, and enable better debugging.

## Changes Summary

| # | Improvement | Priority | Approach |
|---|-------------|----------|----------|
| 1 | Transactions as source of truth | Medium | On-demand reconciliation script |
| 2 | Idempotency for purchases | High | Active purchase check |
| 3 | Separate SMS table | Medium | New `SmsMessage` model |
| 4 | Provider error tracking | Medium | New fields on `ActiveNumber` |
| 5 | Remove "PENDING" sentinel | Low | Make fields nullable |
| 6 | Append-only transactions | Medium | DB trigger |

Items 6 (atomic wallet ops) and 8 (transaction time index) are already implemented.

---

## 1. Schema Changes

### New Model: `SmsMessage`

```prisma
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

### Modified: `ActiveNumber`

```prisma
model ActiveNumber {
  // ... existing fields ...

  // CHANGE: Make nullable (remove "PENDING" sentinel)
  numberId    String?   // was: String (with "PENDING" sentinel)
  phoneNumber String?   // was: String (with "PENDING" sentinel)

  // REMOVE: smsContent Json?
  // REPLACE WITH: relation to SmsMessage
  smsMessages SmsMessage[]

  // NEW: Provider error tracking
  providerStatus    String?   // "SUCCESS" | "API_ERROR" | "TIMEOUT" | "RATE_LIMITED" | "NO_NUMBER"
  providerError     String?   // Raw error message from provider
  lastProviderCheck DateTime? // Timestamp of last provider poll
}
```

### Modified: `Transaction`

No new fields needed for idempotency - we use existing `activeStatus` check instead.

---

## 2. Idempotency for Purchases

**Approach:** Active Purchase Check (no time window, no hash needed)

Before creating a new purchase, check if user already has an ACTIVE order for the same service:

```typescript
const existingActive = await prisma.activeNumber.findFirst({
  where: {
    userId,
    serviceId,
    activeStatus: ActiveStatus.ACTIVE,
  },
  orderBy: { createdAt: 'desc' },
});

if (existingActive) {
  // Return existing active order instead of creating duplicate
  return {
    orderId: existingActive.orderId,
    phoneNumber: existingActive.phoneNumber,
    status: 'existing'
  };
}
```

**Benefits:**
- Prevents duplicate charges from rapid retries / double-clicks
- User can still buy same service again after previous number completes/cancels
- No time window complexity
- Backwards compatible - no client changes required

**Applied to:**
- `lib/trpc/routers/number.ts` → `buy` mutation
- `app/api/stubs/handler_api.php/route.ts` → `handleGetNumber`

---

## 3. SMS Data Migration

### Migration Strategy

1. Create `SmsMessage` table in migration
2. Migrate existing JSON data to new table
3. Drop `smsContent` column from `ActiveNumber`

### SQL Migration

```sql
-- Create SmsMessage table
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "activeNumberId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- Migrate existing JSON data
INSERT INTO "SmsMessage" ("id", "activeNumberId", "content", "receivedAt")
SELECT
  gen_random_uuid(),
  "id" as "activeNumberId",
  sms->>'content',
  (sms->>'receivedAt')::timestamp
FROM "ActiveNumber",
     jsonb_array_elements("smsContent") as sms
WHERE "smsContent" IS NOT NULL;

-- Add indexes
CREATE INDEX "SmsMessage_activeNumberId_idx" ON "SmsMessage"("activeNumberId");
CREATE INDEX "SmsMessage_activeNumberId_receivedAt_idx" ON "SmsMessage"("activeNumberId", "receivedAt");

-- Add foreign key
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_activeNumberId_fkey"
  FOREIGN KEY ("activeNumberId") REFERENCES "ActiveNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old column
ALTER TABLE "ActiveNumber" DROP COLUMN "smsContent";
```

### Code Changes

| File | Change |
|------|--------|
| `lib/sms.ts` | Replace `computeSmsUpdate` with `createSmsMessage(numberId, content)` |
| `scripts/fetch.ts` | Use `prisma.smsMessage.create()` instead of JSON update |
| `lib/trpc/routers/number.ts` | Fetch via `activeNumber.smsMessages` relation |
| `app/api/stubs/handler_api.php/route.ts` | Query `SmsMessage` table for latest SMS |

---

## 4. Provider Error Tracking

### New Fields

```prisma
providerStatus    String?   // "SUCCESS" | "API_ERROR" | "TIMEOUT" | "RATE_LIMITED" | "NO_NUMBER"
providerError     String?   // Raw error message from provider
lastProviderCheck DateTime? // Timestamp of last provider poll
```

### Usage in Poller

```typescript
// Record successful poll
await prisma.activeNumber.update({
  where: { id: number.id },
  data: {
    lastProviderCheck: new Date(),
    providerStatus: "SUCCESS"
  },
});

// Record provider error
await prisma.activeNumber.update({
  where: { id: number.id },
  data: {
    lastProviderCheck: new Date(),
    providerStatus: "API_ERROR",
    providerError: error.message,
  },
});
```

---

## 5. Remove "PENDING" Sentinel

### Changes

| Field | Before | After |
|-------|--------|-------|
| `numberId` | `String` (default: "PENDING") | `String?` (default: null) |
| `phoneNumber` | `String` (default: "PENDING") | `String?` (default: null) |

### Code Updates

Replace string comparisons with null checks:

```typescript
// Before
if (number.phoneNumber !== "PENDING") { ... }

// After
if (number.phoneNumber !== null) { ... }
```

---

## 6. Append-Only Transactions

### Database Trigger

```sql
CREATE OR REPLACE FUNCTION prevent_transaction_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.amount != NEW.amount THEN
    RAISE EXCEPTION 'Cannot modify transaction amount';
  END IF;
  IF OLD.type != NEW.type THEN
    RAISE EXCEPTION 'Cannot modify transaction type';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transaction_append_only
  BEFORE UPDATE ON "Transaction"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_transaction_modification();
```

### What's Allowed

- ✅ Insert new transactions
- ✅ Update `status` (PENDING → COMPLETED → FAILED)

### What's Blocked

- ❌ Changing `amount`
- ❌ Changing `type`

---

## 7. Reconciliation Job

**File:** `scripts/reconcile-wallet.ts`

On-demand script to verify wallet balance matches transaction ledger.

### Usage

```bash
# Check for drift (dry run)
npx tsx scripts/reconcile-wallet.ts

# Check specific user
npx tsx scripts/reconcile-wallet.ts --user=userId123

# Fix discrepancies
npx tsx scripts/reconcile-wallet.ts --fix
```

### Logic

```typescript
async function reconcileWallet(userId?: string) {
  const wallets = userId
    ? [await prisma.wallet.findUnique({ where: { userId } })]
    : await prisma.wallet.findMany();

  for (const wallet of wallets) {
    // Sum deposits, promos, referrals, refunds (positive)
    // Subtract purchases (negative)
    const computedBalance = await computeBalanceFromTransactions(wallet.id);

    if (!computedBalance.equals(wallet.balance)) {
      console.log(`DRIFT: Wallet ${wallet.id}`);
      console.log(`  Stored: ${wallet.balance}, Computed: ${computedBalance}`);

      if (process.argv.includes('--fix')) {
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: { balance: computedBalance },
        });
      }
    }
  }
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add `SmsMessage`, modify `ActiveNumber` |
| `lib/sms.ts` | Rewrite for `SmsMessage` table |
| `scripts/fetch.ts` | SMS write to new table, provider tracking |
| `lib/trpc/routers/number.ts` | Idempotency check, nullable fields, SMS relation |
| `app/api/stubs/handler_api.php/route.ts` | Idempotency check, nullable fields, SMS query |

## New Files

| File | Purpose |
|------|---------|
| `scripts/reconcile-wallet.ts` | On-demand wallet reconciliation |
| `prisma/migrations/XXX/migration.sql` | Schema migration + trigger |

## Breaking Changes

None. All changes are backwards compatible.
