# Active Status Tab Separation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor number router to use active_status field for tab queries (ACTIVE=waiting, CLOSED=history) and fix SMS receipt behavior (keep PENDING until 15-min expiry).

**Architecture:** Separate display state (active_status) from outcome state (status). Use active_status for UI tab separation. Keep status as PENDING when SMS received, only change to COMPLETED after 15-minute expiry or manual close.

**Tech Stack:** Next.js 16, tRPC, Prisma with PostgreSQL, TypeScript

---

## Architecture Overview

The new design separates two concerns:

| Field | Purpose | Values | UI Effect |
|--------|---------|---------|-----------|
| `active_status` | Display state for tabs | ACTIVE, CLOSED | ACTIVE = Waiting tab, CLOSED = Received/Cancelled tabs |
| `status` | Outcome state | PENDING, COMPLETED, CANCELLED | PENDING = Still pending, COMPLETED = Success, CANCELLED = Failed |

**Flow:**
1. User buys number → `active_status: ACTIVE`, `status: PENDING`
2. SMS received → Update `smsContent`, keep `status: PENDING` (don't change!)
3. 15-min expiry OR user closes → Change `active_status: CLOSED`, update `status` based on outcome
4. Cancel button → Change `active_status: CLOSED`, `status: CANCELLED`

---

### Task 1: Update getActive to use active_status

**Files:**
- Modify: `lib/trpc/routers/number.ts:444-618`

**Step 1: Change query to use active_status only**

Find the `getActive` procedure and replace the query where clause:

```typescript
// OLD (lines 448-455):
where: {
  userId: ctx.user.id,
  OR: [
    { status: NumberStatus.PENDING },
    { status: NumberStatus.COMPLETED, createdAt: { gte: fiveMinutesAgo } }
  ]
}

// NEW:
where: {
  userId: ctx.user.id,
  activeStatus: "ACTIVE" as const,  // Only active numbers
}
```

**Step 2: Remove 5-minute logic**

Remove the `fiveMinutesAgo` variable (line 446) as it's no longer needed.

**Step 3: Update SMS poll logic to NOT change status on receipt**

Find the SMS poll block (around lines 486-506) and modify:

```typescript
// OLD (lines 486-506):
if (statusResponse.status === 'RECEIVED' && statusResponse.sms) {
  await prisma.$transaction(async (tx) => {
    await appendSmsContent(number.id, statusResponse.sms!);
    await tx.activeNumber.update({
      where: { id: number.id },
      data: {
        status: NumberStatus.COMPLETED,  // <-- REMOVE THIS
      },
    });
    await tx.wallet.update({
      where: { userId: ctx.user.id },
      data: {
        totalOtp: { increment: 1 },
      },
    });
  });
  await otpClient.finishOrder(number.numberId);
}

// NEW:
if (statusResponse.status === 'RECEIVED' && statusResponse.sms) {
  await prisma.$transaction(async (tx) => {
    await appendSmsContent(number.id, statusResponse.sms!);
    // DON'T change status to COMPLETED - keep it PENDING
    // Only increment totalOtp if this is first SMS
    const hasExistingSms = (number.smsContent as any[] | null)?.length > 0;
    if (!hasExistingSms) {
      await tx.wallet.update({
        where: { userId: ctx.user.id },
        data: {
          totalOtp: { increment: 1 },
        },
      });
    }
  });
  await otpClient.finishOrder(number.numberId);
}
```

**Step 4: Update re-fetch query to match**

Find the re-fetch block (around lines 564-571) and update:

```typescript
// OLD:
where: {
  userId: ctx.user.id,
  OR: [
    { status: NumberStatus.PENDING },
    { status: NumberStatus.COMPLETED, createdAt: { gte: fiveMinutesAgo } }
  ]
}

// NEW:
where: {
  userId: ctx.user.id,
  activeStatus: "ACTIVE" as const,
}
```

**Step 5: Remove unused variable**

Remove `fiveMinutesAgo` declaration if it's still in scope.

**Step 6: Commit**

```bash
git add lib/trpc/routers/number.ts
git commit -m "feat(number): getActive uses active_status, keep PENDING on SMS receipt"
```

---

### Task 2: Update getReceived to use active_status

**Files:**
- Modify: `lib/trpc/routers/number.ts:624-672`

**Step 1: Change query to use active_status AND status**

Find the `getReceived` procedure and update the where clause:

```typescript
// OLD (lines 626-629):
where: {
  userId: ctx.user.id,
  status: NumberStatus.COMPLETED,
}

// NEW:
where: {
  userId: ctx.user.id,
  activeStatus: "CLOSED" as const,  // Only closed numbers
  status: NumberStatus.COMPLETED,     // That were successfully received
}
```

**Step 2: Commit**

```bash
git add lib/trpc/routers/number.ts
git commit -m "feat(number): getReceived uses active_status=CLOSED AND status=COMPLETED"
```

---

### Task 3: Update getCancelled to use active_status

**Files:**
- Modify: `lib/trpc/routers/number.ts:678-726`

**Step 1: Change query to use active_status AND status**

Find the `getCancelled` procedure and update the where clause:

```typescript
// OLD (lines 680-683):
where: {
  userId: ctx.user.id,
  status: NumberStatus.CANCELLED,
}

// NEW:
where: {
  userId: ctx.user.id,
  activeStatus: "CLOSED" as const,  // Only closed numbers
  status: NumberStatus.CANCELLED,     // That were cancelled
}
```

**Step 2: Commit**

```bash
git add lib/trpc/routers/number.ts
git commit -m "feat(number): getCancelled uses active_status=CLOSED AND status=CANCELLED"
```

---

### Task 4: Update buy mutation to set active_status

**Files:**
- Modify: `lib/trpc/routers/number.ts:352-370`

**Step 1: Add active_status field to create call**

Find the `activeNumber.create` call in the buy mutation (around lines 354-370) and add active_status:

```typescript
// OLD (data object inside create):
data: {
  userId,
  serviceId: service.id,
  orderId,
  serverId: service.serverId,
  numberId: "PENDING",
  phoneNumber: "PENDING",
  price: finalPrice,
  status: NumberStatus.PENDING,
  balanceDeducted: true,
  expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
}

// NEW:
data: {
  userId,
  serviceId: service.id,
  orderId,
  serverId: service.serverId,
  numberId: "PENDING",
  phoneNumber: "PENDING",
  price: finalPrice,
  status: NumberStatus.PENDING,
  activeStatus: "ACTIVE" as const,  // NEW: Show in waiting tab
  balanceDeducted: true,
  expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
}
```

**Step 2: Commit**

```bash
git add lib/trpc/routers/number.ts
git commit -m "feat(number): set active_status=ACTIVE on buy"
```

---

### Task 5: Update getStatus to keep PENDING on SMS receipt

**Files:**
- Modify: `lib/trpc/routers/number.ts:804-835`

**Step 1: Remove status change on SMS receipt**

Find the SMS received block in getStatus (around lines 804-835) and update:

```typescript
// OLD (lines 804-835):
if (statusResponse.status === "RECEIVED" && statusResponse.sms) {
  await prisma.$transaction(async (tx) => {
    await appendSmsContent(activeNumber.id, statusResponse.sms!);
    await tx.activeNumber.update({
      where: { id: activeNumber.id },
      data: {
        status: NumberStatus.COMPLETED,  // <-- REMOVE THIS
      },
    });
    await tx.wallet.update({
      where: { userId: ctx.user.id },
      data: {
        totalOtp: { increment: 1 },
      },
    });
  });
  await otpClient.finishOrder(activeNumber.numberId);
  return {
    status: NumberStatus.COMPLETED,
    sms: statusResponse.sms,
    phoneNumber: activeNumber.phoneNumber,
  };
}

// NEW:
if (statusResponse.status === "RECEIVED" && statusResponse.sms) {
  await prisma.$transaction(async (tx) => {
    await appendSmsContent(activeNumber.id, statusResponse.sms!);
    // DON'T change status - keep PENDING until expiry or manual close
    // Only increment totalOtp if this is first SMS
    const hasExistingSms = (activeNumber.smsContent as any[] | null)?.length > 0;
    if (!hasExistingSms) {
      await tx.wallet.update({
        where: { userId: ctx.user.id },
        data: {
          totalOtp: { increment: 1 },
        },
      });
    }
  });
  await otpClient.finishOrder(activeNumber.numberId);
  return {
    status: NumberStatus.PENDING,  // Still pending
    sms: statusResponse.sms,
    phoneNumber: activeNumber.phoneNumber,
  };
}
```

**Step 2: Commit**

```bash
git add lib/trpc/routers/number.ts
git commit -m "feat(number): getStatus keeps PENDING on SMS receipt"
```

---

### Task 6: Update cancel to set active_status=CLOSED

**Files:**
- Modify: `lib/trpc/routers/number.ts:965-975`

**Step 1: Add active_status to cancel update**

Find the cancel transaction block (around lines 965-975) and add active_status:

```typescript
// OLD (data object in activeNumber.update):
data: {
  status: NumberStatus.CANCELLED,
  balanceDeducted: false,
}

// NEW:
data: {
  status: NumberStatus.CANCELLED,
  activeStatus: "CLOSED" as const,  // NEW: Move to history tabs
  balanceDeducted: false,
}
```

**Step 2: Commit**

```bash
git add lib/trpc/routers/number.ts
git commit -m "feat(number): set active_status=CLOSED on cancel"
```

---

### Task 7: Add auto-expire logic to close expired numbers

**Files:**
- Modify: `lib/trpc/routers/number.ts` (add new helper function and call in getActive)

**Step 1: Add auto-expire helper function**

Add this new helper function after `handleAutoRefund` (around line 246):

```typescript
/**
 * Auto-expire numbers that have exceeded their time limit
 * Changes active_status to CLOSED with appropriate status
 */
async function autoExpireNumbers(userId: string): Promise<void> {
  const now = new Date();

  // Find ACTIVE numbers that are expired
  const expiredNumbers = await prisma.activeNumber.findMany({
    where: {
      userId,
      activeStatus: "ACTIVE",
      expiresAt: { lt: now },
    },
    include: { service: true },
  });

  for (const number of expiredNumbers) {
    await prisma.$transaction(async (tx) => {
      const hasSms = !!number.smsContent;
      const finalStatus = hasSms ? NumberStatus.COMPLETED : NumberStatus.CANCELLED;

      await tx.activeNumber.update({
        where: { id: number.id },
        data: {
          activeStatus: "CLOSED",
          status: finalStatus,
          balanceDeducted: false, // Prevent double refund
        },
      });

      // Refund if no SMS was received
      if (!hasSms && number.balanceDeducted) {
        await tx.wallet.update({
          where: { userId },
          data: {
            balance: { increment: number.price },
            totalSpent: { decrement: number.price },
            totalOtp: { decrement: 1 },
          },
        });

        const wallet = await tx.wallet.findUnique({ where: { userId } });
        if (wallet) {
          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              type: "REFUND",
              amount: number.price,
              status: "COMPLETED",
              description: `Auto-expired: ${number.service.name} number`,
              metadata: {
                orderId: number.orderId,
                reason: "expired_no_sms",
                serviceId: number.serviceId,
                serviceName: number.service.name,
              },
            },
          });
        }
      }
    });
  }
}
```

**Step 2: Call auto-expire in getActive**

Add the call at the beginning of `getActive` procedure (right after line 444, before the query):

```typescript
getActive: protectedProcedure.query(async ({ ctx }) => {
  // Auto-expire numbers first
  await autoExpireNumbers(ctx.user.id);

  // Then query active numbers...
```

**Step 3: Commit**

```bash
git add lib/trpc/routers/number.ts
git commit -m "feat(number): auto-expire numbers after time limit, move to CLOSED"
```

---

### Task 8: Run ESLint

**Files:**
- Test: All modified files

**Step 1: Run ESLint**

```bash
npm run lint
```

Expected: No errors

If there are errors, fix them and re-run.

---

### Task 9: Build project

**Files:**
- Test: All files

**Step 1: Build**

```bash
npm run build
```

Expected: ✓ Compiled successfully

---

### Task 10: Final commit

**Files:**
- All files

**Step 1: Commit any remaining changes**

```bash
git add .
git commit -m "feat(number): use active_status for tab queries, keep PENDING on SMS receipt"
```

---

## Verification Checklist

- [ ] getActive only returns active_status=ACTIVE numbers
- [ ] getReceived only returns active_status=CLOSED AND status=COMPLETED
- [ ] getCancelled only returns active_status=CLOSED AND status=CANCELLED
- [ ] buy sets active_status=ACTIVE
- [ ] getStatus does NOT change status on SMS receipt
- [ ] cancel sets active_status=CLOSED
- [ ] Expired numbers auto-move to CLOSED with appropriate status
- [ ] Numbers with SMS still show in Waiting tab until expiry
- [ ] ESLint passes
- [ ] Build succeeds

## Testing Commands

```bash
# Start dev server
npm run dev

# Test with a real purchase and verify:
# 1. Number appears in Waiting tab (active_status=ACTIVE)
# 2. SMS received - still in Waiting tab (status=PENDING)
# 3. After 15 min - moves to Received tab (active_status=CLOSED, status=COMPLETED)
# 4. Cancel - moves to Cancelled tab (active_status=CLOSED, status=CANCELLED)
```
