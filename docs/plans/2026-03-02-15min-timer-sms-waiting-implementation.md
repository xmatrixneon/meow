# 15-Minute Order Timer with SMS Display in Waiting Tab - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 15-minute order timer where SMS-received numbers stay in "Waiting" tab until full time expires.

**Architecture:** Add `active_status` field to separate UI display (waiting vs history) from final outcome (completed vs cancelled). SMS receipt only updates `smsContent`, not status. Auto-expire after 15 minutes moves numbers to appropriate tab based on whether SMS was received.

**Tech Stack:** Next.js 16, Prisma, PostgreSQL, tRPC, TypeScript

---

## Task 1: Update Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma:276-290`

**Step 1: Add ActiveStatus enum**

Add before the Settings model (around line 276):

```prisma
enum ActiveStatus {
  ACTIVE
  CLOSED
}
```

**Step 2: Add active_status field to ActiveNumber model**

In the ActiveNumber model (after line 231), add:

```prisma
model ActiveNumber {
  // ... existing fields ...
  expiresAt      DateTime
  active_status  ActiveStatus @default(ACTIVE)  // NEW: Controls UI tab display
  status         NumberStatus @default(PENDING)  // Keep existing: Final outcome
  createdAt      DateTime      @default(now())
  // ... rest of model
}
```

**Step 3: Change numberExpiryMinutes default to 15**

In the Settings model (around line 286), change:

```prisma
model Settings {
  // ... existing fields
  numberExpiryMinutes Int @default(15)  // Was 20
  currency            String @default("INR")
  minCancelMinutes    Int   @default(2)
  // ... rest of model
}
```

**Step 4: Generate Prisma client and run migration**

```bash
npx prisma generate
npx prisma migrate dev --name add_active_status_and_15min_timer
```

**Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add active_status field and change timer to 15 minutes"
```

---

## Task 2: Update Number Router - Use active_status for Queries

**Files:**
- Modify: `lib/trpc/routers/number.ts:444-726`

**Step 1: Update getActive to use active_status**

Replace the entire getActive query (lines 444-617) with:

```typescript
/**
 * Get all active numbers for the current user
 * Returns all ACTIVE numbers (with or without SMS)
 * Also polls external API for SMS updates
 */
getActive: protectedProcedure.query(async ({ ctx }) => {
  const numbers = await prisma.activeNumber.findMany({
    where: {
      userId: ctx.user.id,
      active_status: "ACTIVE",  // Only show active numbers in Waiting tab
    },
    include: {
      service: {
        include: {
          server: {
            include: {
              api: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // Poll external API for SMS updates
  const { OtpProviderClient } = await import('@/lib/providers');

  for (const number of numbers) {
    try {
      const otpClient = new OtpProviderClient({
        apiUrl: number.service.server.api.apiUrl,
        apiKey: number.service.server.api.apiKey,
      });

      const statusResponse = await otpClient.getStatus(number.numberId);

      // If SMS received, append to smsContent array (keep status as PENDING)
      if (statusResponse.status === 'RECEIVED' && statusResponse.sms) {
        await appendSmsContent(number.id, statusResponse.sms!);
      }
      // If cancelled by provider, handle refund
      else if (statusResponse.status === 'CANCELLED') {
        await prisma.$transaction(async (tx) => {
          await tx.activeNumber.update({
            where: { id: number.id },
            data: {
              active_status: "CLOSED",
              status: NumberStatus.CANCELLED,
              balanceDeducted: false,
            },
          });

          await tx.wallet.update({
            where: { userId: ctx.user.id },
            data: {
              balance: { increment: number.price },
              totalSpent: { decrement: number.price },
              totalOtp: { decrement: 1 },
            },
          });

          const wallet = await tx.wallet.findUnique({
            where: { userId: ctx.user.id },
          });

          if (wallet) {
            await tx.transaction.create({
              data: {
                walletId: wallet.id,
                type: "REFUND",
                amount: number.price,
                status: "COMPLETED",
                description: `Provider cancelled: ${number.service.name} number: ${number.phoneNumber}`,
                metadata: {
                  orderId: number.orderId,
                  numberId: number.numberId,
                  serviceId: number.serviceId,
                  serviceName: number.service.name,
                  reason: "provider_cancelled",
                },
              },
            });
          }
        });
      }
    } catch (error) {
      console.error(`Failed to check status for ${number.orderId}:`, error);
    }
  }

  // Check for expired numbers and auto-update their status
  const settings = await prisma.settings.findUnique({
    where: { id: "1" },
  });
  const expiryMinutes = settings?.numberExpiryMinutes ?? 15;

  for (const number of numbers) {
    const now = Date.now();
    const expiresAt = number.expiresAt.getTime();
    const isExpired = now > expiresAt;

    if (isExpired) {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.activeNumber.updateMany({
          where: {
            id: number.id,
            active_status: "ACTIVE",
          },
          data: {
            active_status: "CLOSED",
            status: number.smsContent
              ? NumberStatus.COMPLETED
              : NumberStatus.CANCELLED,
            balanceDeducted: number.smsContent ? true : false,
          },
        });

        // Refund if expired without SMS
        if (updated.count > 0 && !number.smsContent) {
          await tx.wallet.update({
            where: { userId: ctx.user.id },
            data: {
              balance: { increment: number.price },
              totalSpent: { decrement: number.price },
              totalOtp: { decrement: 1 },
            },
          });

          const wallet = await tx.wallet.findUnique({
            where: { userId: ctx.user.id },
          });

          if (wallet) {
            await tx.transaction.create({
              data: {
                walletId: wallet.id,
                type: "REFUND",
                amount: number.price,
                status: "COMPLETED",
                description: `Auto-refund: Number expired without SMS`,
                metadata: {
                  orderId: number.orderId,
                  reason: "expired_no_sms",
                },
              },
            });
          }
        }
      });
    }
  }

  // Re-fetch numbers after potential updates
  const updatedNumbers = await prisma.activeNumber.findMany({
    where: {
      userId: ctx.user.id,
      active_status: "ACTIVE",
    },
    include: {
      service: {
        include: {
          server: {
            include: {
              api: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return { numbers: updatedNumbers as Array<...> };
}),
```

**Step 2: Update getReceived to use active_status**

Modify the getActive query (lines 624-671), update the where clause:

```typescript
getReceived: protectedProcedure.query(async ({ ctx }) => {
  const numbers = await prisma.activeNumber.findMany({
    where: {
      userId: ctx.user.id,
      active_status: "CLOSED",  // Only show closed numbers
      status: NumberStatus.COMPLETED,  // That were completed
    },
    // ... rest of query
  });
  // ... return
}),
```

**Step 3: Update getCancelled to use active_status**

Modify the where clause:

```typescript
getCancelled: protectedProcedure.query(async ({ ctx }) => {
  const numbers = await prisma.activeNumber.findMany({
    where: {
      userId: ctx.user.id,
      active_status: "CLOSED",  // Only show closed numbers
      status: NumberStatus.CANCELLED,  // That were cancelled
    },
    // ... rest of query
  });
  // ... return
}),
```

**Step 4: Update buy mutation to use settings expiry**

Update line 299:

```typescript
const expiryMinutes = settings?.numberExpiryMinutes ?? 15;  // Changed from 20
```

And update line 365 to set active_status:

```typescript
const activeNumber = await tx.activeNumber.create({
  data: {
    userId,
    serviceId: service.id,
    orderId,
    serverId: service.serverId,
    numberId: "PENDING",
    phoneNumber: "PENDING",
    price: finalPrice,
    status: NumberStatus.PENDING,
    active_status: "ACTIVE",  // NEW
    balanceDeducted: true,
    expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
  },
  // ... rest
});
```

**Step 5: Update getStatus to NOT change status on SMS**

Modify lines 804-834 to only update smsContent:

```typescript
// If SMS received, append to smsContent array (DO NOT change status)
if (statusResponse.status === "RECEIVED" && statusResponse.sms) {
  await prisma.$transaction(async (tx) => {
    // Append SMS to existing array
    await appendSmsContent(activeNumber.id, statusResponse.sms!);

    // DO NOT update status - keep it as PENDING
    // Number stays in Waiting tab until expiresAt

    // Increment totalOtp counter
    await tx.wallet.update({
      where: { userId: ctx.user.id },
      data: {
        totalOtp: { increment: 1 },
      },
    });
  });

  // Notify provider that we received SMS
  await otpClient.finishOrder(activeNumber.numberId);

  return {
    status: NumberStatus.PENDING,  // Keep as PENDING
    sms: statusResponse.sms,
    phoneNumber: activeNumber.phoneNumber,
  };
}
```

**Step 6: Run ESLint to check for errors**

```bash
npm run lint
```

**Step 7: Commit**

```bash
git add lib/trpc/routers/number.ts
git commit -m "feat(number): use active_status for tab queries, keep PENDING on SMS receipt"
```

---

## Task 3: Update External Stubs API

**Files:**
- Modify: `app/api/stubs/handler_api.php/route.ts:93-244`

**Step 1: Update handleGetNumber to use Settings for expiry**

Replace line 147:

```typescript
// Get expiry time from Settings
const settings = await prisma.settings.findUnique({
  where: { id: "1" },
});
const expiryMinutes = settings?.numberExpiryMinutes ?? 15;  // Changed from 20

const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
```

And update the create call to include active_status:

```typescript
await prisma.$transaction([
  prisma.activeNumber.create({
    data: {
      userId: user.id,
      serviceId: service.id,
      orderId,
      numberId: result.orderId!,
      phoneNumber: result.phoneNumber!,
      serverId: service.serverId,
      price: service.basePrice,
      status: "PENDING",
      active_status: "ACTIVE",  // NEW
      expiresAt,
    },
  }),
  // ... rest of transaction
]);
```

**Step 2: Update handleGetStatus to NOT change status on SMS**

Replace lines 235-240:

```typescript
if (status.status === "RECEIVED" && status.sms) {
  // Only update smsContent, keep status as PENDING and active_status as ACTIVE
  await prisma.activeNumber.update({
    where: { id: number.id },
    data: {
      smsContent: status.sms,
      // Keep status: "PENDING" and active_status: "ACTIVE"
    },
  });
  return new NextResponse(`STATUS_OK:${status.sms}`, { status: 200, headers: corsHeaders });
}
```

**Step 3: Add auto-expire logic to handleGetStatus**

After the SMS received check, add expiry handling:

```typescript
// Check expiry and auto-update
const now = new Date();
if (now > number.expiresAt) {
  // Time expired - update based on whether SMS was received
  const finalStatus = number.smsContent ? "COMPLETED" : "CANCELLED";
  await prisma.activeNumber.update({
    where: { id: number.id },
    data: {
      active_status: "CLOSED",
      status: finalStatus,
    },
  });
  return new NextResponse(
    finalStatus === "COMPLETED"
      ? `STATUS_OK:${number.smsContent || ""}`
      : "STATUS_CANCEL",
    { status: 200, headers: corsHeaders }
  );
}
```

**Step 4: Run ESLint**

```bash
npm run lint
```

**Step 5: Commit**

```bash
git add app/api/stubs/handler_api.php/route.ts
git commit -m "feat(stubs): use Settings for expiry, keep PENDING on SMS receipt"
```

---

## Task 4: Update Numbers Page UI

**Files:**
- Modify: `app/numbers/page.tsx:593-726`

**Step 1: Remove the 5-minute COMPLETED logic**

The numbers useMemo (lines 593-636) should be simplified to just use PENDING numbers:

```typescript
const numbers: TempNumber[] = useMemo(() => {
  return activeData?.numbers.map(n => {
    // ... existing mapping ...
    return {
      id: n.id,
      orderId: n.orderId,
      number: n.phoneNumber,
      country: countryName,
      countryCode: countryCode,
      countryIso: countryIso,
      countryFlag: flagUrl,
      service: n.service?.name || "Unknown",
      status: n.status === "PENDING" ? "waiting" : "received",  // Simplified
      expiresIn: formatTimeRemaining(n.expiresAt),
      sms: displaySms,
      smsList,
      code: extractOTP(displaySms || smsList),
      buyTime,
      canCancel: false,
      cancelRemainingMs: 0,
    };
  }) || [];
}, [activeData]);
```

**Step 2: Test the changes**

```bash
npm run build
npm run dev
```

Test the following flows:
1. Buy a number → Should appear in Waiting tab
2. Wait for SMS → SMS appears, stays in Waiting tab
3. Wait for 15 minutes → Number moves to Received tab
4. Cancel before 15 min → Number moves to Cancelled tab with refund

**Step 3: Commit**

```bash
git add app/numbers/page.tsx
git commit -m "fix(numbers): simplify tab logic, remove 5min COMPLETED fallback"
```

---

## Task 5: Testing & Verification

**Files:**
- Test: Manual testing flow

**Step 1: Run build to ensure no errors**

```bash
npm run build
```

**Expected:** Build succeeds without errors

**Step 2: Test the complete flow manually**

1. Start dev server: `npm run dev`
2. Buy a number from the app
3. Observe it appears in Waiting tab
4. Wait for SMS (or simulate via API)
5. Verify SMS appears but number stays in Waiting tab
6. Wait for 15-minute timer to expire
7. Verify number moves to Received tab
8. Test another number, cancel it before expiry
9. Verify it moves to Cancelled tab with refund

**Step 3: Verify Settings can control timer**

```bash
# Update Settings to test different timer values
npx tsx -e "
  import { config } from 'dotenv';
  config({ path: '.env' });
  import { PrismaClient } from './app/generated/prisma/client';
  const prisma = new PrismaClient();
  await prisma.settings.update({
    where: { id: '1' },
    data: { numberExpiryMinutes: 10 }  // Test with 10 minutes
  });
  await prisma.\$disconnect();
"
```

**Step 4: Test external stubs API**

```bash
# Test getNumber
curl "http://localhost:3000/api/stubs/handler_api.php?action=getNumber&api_key=YOUR_TELEGRAM_ID&service=airtel&country=22"

# Test getStatus - should return SMS but keep in Waiting state
curl "http://localhost:3000/api/stubs/handler_api.php?action=getStatus&api_key=YOUR_TELEGRAM_ID&id=ORDER_ID"
```

**Step 5: Final commit**

```bash
git add .
git commit -m "test: verified 15-minute timer and SMS waiting tab behavior"
```

---

## Summary of Changes

| Component | Changes |
|-----------|----------|
| Database | Added `active_status` enum, added field to ActiveNumber, changed default timer to 15 |
| Number Router | Use `active_status` for tab queries, SMS doesn't change status |
| Stubs API | Use Settings for expiry, keep PENDING on SMS receipt |
| UI | Simplified tab logic, numbers stay in Waiting until expiry |

---

## Testing Checklist

- [ ] Order timer is 15 minutes (not 20)
- [ ] SMS received → Number stays in Waiting tab
- [ ] SMS visible in Waiting tab
- [ ] After 15 min + SMS → Moves to Received tab
- [ ] After 15 min no SMS → Auto-refund, moves to Cancelled
- [ ] Cancel works with refund
- [ ] Settings.numberExpiryMinutes controls timer
- [ ] External API uses correct timer
- [ ] Build succeeds
- [ ] No ESLint errors
