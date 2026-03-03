# Delay "Received" Tab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** After SMS is received, keep order in "Waiting" tab with "Received" status for 20 minutes (until expiry or manual close), then move to "History" tab.

**Architecture:**
- Backend: Keep `activeStatus: ACTIVE` after SMS received, only set to `CLOSED` on expiry/manual close
- Frontend: Filter orders with `status: COMPLETED` and `activeStatus: ACTIVE` to remain in "Waiting" tab

---

## Tasks

### Task 1: Update Backend - Keep Active Status After SMS

**File:** `lib/trpc/routers/number.ts`
**Action:** Modify the SMS received logic in `getActive` procedure to NOT set `activeStatus` to `CLOSED` immediately.

**Changes:**

In the `getActive` procedure, around line 545-565, locate the SMS received update block:

```typescript
// BEFORE (Current):
// If SMS received, append to smsContent array and UPDATE status to COMPLETED
// This prevents user from cancelling and getting refund after receiving SMS
// Number stays in ACTIVE tab until expiry time, then auto-expiry moves to CLOSED
if (statusResponse.status === 'RECEIVED' && statusResponse.sms) {
  await prisma.$transaction(async (tx) => {
    // Append SMS to existing array
    await appendSmsContent(number.id, statusResponse.sms!);

    // UPDATE status to COMPLETED to prevent cancellation and refund
    // Keep activeStatus as ACTIVE so number stays in waiting tab until expiry
    await tx.activeNumber.update({
      where: { id: number.id },
      data: { status: NumberStatus.COMPLETED },
    });
```

```typescript
// AFTER (New):
// If SMS received, append to smsContent array and UPDATE status to COMPLETED AND keep activeStatus as ACTIVE
// This prevents user from cancelling and getting refund after receiving SMS
// Number stays in "Waiting" tab until expiry time, then auto-expiry moves to "Received" tab
// The order can still check for nextsms while activeStatus is ACTIVE
if (statusResponse.status === 'RECEIVED' && statusResponse.sms) {
  await prisma.$transaction(async (tx) => {
    // Append SMS to existing array
    await appendSmsContent(number.id, statusResponse.sms!);

    // UPDATE status to COMPLETED
    // DO NOT update activeStatus yet - keep it ACTIVE until expiry or manual close
    await tx.activeNumber.update({
      where: { id: number.id },
      data: {
        status: NumberStatus.COMPLETED,
        // activeStatus stays ACTIVE so number remains in waiting tab
      },
    });
```

**Acceptance Criteria:**
- Order has `status: COMPLETED` but `activeStatus: ACTIVE`
- Order continues to check for nextsms (multi-SMS support)
- Order stays in "Waiting" tab for the duration until expiry/manual close

---

### Task 2: Update Frontend - Keep Received Orders in Waiting Tab

**File:** `app/numbers/page.tsx`
**Action:** Update the filtered logic to keep orders with `status: COMPLETED` and `activeStatus: ACTIVE` in the "Waiting" tab.

**Changes:**

Locate the `receivedNumbers` data transformation (around line 651-693):

```typescript
// BEFORE (Current):
const receivedNumbers: TempNumber[] = useMemo(() => {
  return receivedData?.numbers.map(n => {
    const server = n.service?.server;
    // ...
    status: "received",  // Hardcoded status!
    // ...
  });
}, [receivedData]);
```

```typescript
// AFTER (New):
const receivedNumbers: TempNumber[] = useMemo(() => {
  return receivedData?.numbers.filter(n => {
    // Keep orders with COMPLETED status and ACTIVE activeStatus in "Waiting" tab
    // The filter condition: activeStatus === 'CLOSED' && status === 'COMPLETED'
  });
}, [receivedData]);
```

**Acceptance Criteria:**
- Frontend correctly shows orders with `status: COMPLETED` and `activeStatus: ACTIVE` in "Received" tab
- Orders remain viewable with nextsms checking enabled

---

### Task 3: Test the Implementation

**Action:** Verify that orders stay in "Waiting" tab for 20 minutes after SMS receipt before moving to "Received" tab.

**Steps:**
1. Restart development server
2. Purchase a test number
3. Wait for SMS to be received
4. Verify order stays in "Waiting" tab for ~20 minutes
5. Verify order moves to "Received" tab after 20 minutes
6. Cancel order (should be disabled now with SMS received) - verify it returns error

---

### Task 4: Commit and Push

**Action:** Commit changes and push to GitHub.

**Steps:**
1. Run TypeScript compilation check
2. Stage all modified files
3. Commit with descriptive message
4. Push to `origin/main`

---

## Success Criteria

✅ Backend: Orders with SMS keep `activeStatus: ACTIVE` after receipt
✅ Frontend: Orders with `status: COMPLETED` and `activeStatus: ACTIVE` stay in "Waiting" tab
✅ Tab transition: Orders move to "Received" tab only after expiry or manual close
✅ Multi-SMS: Nextsms checks continue while in "Waiting" tab
