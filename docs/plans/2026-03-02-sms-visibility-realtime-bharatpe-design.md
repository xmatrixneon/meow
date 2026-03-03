# SMS Visibility, Real-time Updates & BharatPe Configuration Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix SMS visibility issues (numbers disappear from waiting when received), add auto-tab switching on SMS received, and configure BharatPe payment settings.

**Architecture:** Modify backend to return recent completed numbers in `getActive`, add frontend auto-switch logic on SMS receipt, seed BharatPe configuration to database.

---

## Section 1: Backend API Changes

### Modify `getActive` Procedure

**File:** `lib/trpc/routers/number.ts`

**Current behavior:**
- Returns only PENDING status numbers

**New behavior:**
- Returns PENDING numbers + COMPLETED numbers from last 5 minutes
- This allows recently received SMS to appear in both "waiting" and "received" tabs

**Implementation:**
```typescript
// Add 5-minute threshold for showing completed numbers in waiting tab
const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

const numbers = await prisma.activeNumber.findMany({
  where: {
    userId: ctx.user.id,
    OR: [
      { status: NumberStatus.PENDING },
      { status: NumberStatus.COMPLETED, createdAt: { gte: fiveMinutesAgo } }
    ]
  },
  include: { service: { include: { server: { include: { api: true } } } } },
  orderBy: { createdAt: "desc" }
});
```

### Add `isNewlyReceived` Indicator

When SMS is received during polling, mark it as newly received so frontend can detect and trigger auto-switch.

---

## Section 2: Frontend Numbers Page Changes

### Tab Logic Update

**File:** `app/numbers/page.tsx`

**Current behavior:**
- "Waiting" tab: PENDING only
- "Received" tab: COMPLETED only

**New behavior:**
- "Waiting" tab: PENDING + COMPLETED (last 5 min)
- "Received" tab: All COMPLETED
- Cancelled tab: Unchanged

### Auto-Switch to Received Tab

**Logic:**
1. Track previous count of received numbers
2. On each poll (5-second interval):
   - Compare current received count with previous
   - If count increased → new SMS received
   - Switch activeTab to "received"
   - Show toast notification

**Implementation:**
```typescript
const [prevReceivedCount, setPrevReceivedCount] = useState(0);

useEffect(() => {
  const currentReceivedCount = receivedNumbers.length;
  if (currentReceivedCount > prevReceivedCount && activeTab === "waiting") {
    // New SMS received while in waiting tab
    setActiveTab("received");
    toast.success("SMS received!");
  }
  setPrevReceivedCount(currentReceivedCount);
}, [receivedNumbers.length, activeTab]);
```

### Visual Indicators for Received SMS in Waiting Tab

For numbers in "waiting" tab that have received SMS:
- Green border: `border-green-500/30`
- Green status badge: "Received"
- Show SMS content with OTP code
- Keep timer showing "0:00" (expired but still visible)

---

## Section 3: BharatPe Configuration

### Database Seed

**Values to set:**
- `upiId`: `BHARATPE.8V0Y0C8A7B91024@fbpe`
- `bharatpeQrImage`: `https://i.ibb.co/d4KQzjbj/IMG-20260224-185009.jpg`
- `bharatpeMerchantId`: `57113736`
- `bharatpeToken`: `edaa0bb278e54a23899c1cfeb6e937ef`
- `minRechargeAmount`: `10`

**Implementation:** Create seed script `prisma/seed-bharatpe.ts`

### Deposit Dialog Display

**File:** `components/deposit-dialog.tsx`

Ensure QR image is displayed prominently above UPI ID:
```tsx
{settings?.bharatpeQrImage && (
  <div className="flex justify-center mb-4">
    <img
      src={settings.bharatpeQrImage}
      alt="BharatPe QR"
      className="w-48 h-48 rounded-xl"
    />
  </div>
)}
```

---

## Section 4: Polling Optimization

**Current behavior:**
- Polls `getActive` every 5 seconds when waiting numbers exist
- Other queries not polled

**New behavior:**
- Polls all relevant queries on interval:
  - `getActive`
  - `getReceived`
  - `getCancelled`
  - `wallet.balance`
- Enables auto-switch detection

**Implementation:**
```typescript
useEffect(() => {
  const waitingNumbers = numbers.filter(n => n.status === "waiting");

  if (waitingNumbers.length > 0) {
    pollingRef.current = setInterval(() => {
      utils.number.getActive.invalidate();
      utils.number.getReceived.invalidate();
      utils.number.getCancelled.invalidate();
      utils.wallet.balance.invalidate();
    }, 5000);
  }

  return () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
  };
}, [numbers.length, utils]);
```

---

## Success Criteria

- ✅ Numbers with received SMS appear in both "waiting" (for 5 min) and "received" tabs
- ✅ When SMS received, user is auto-switched to "received" tab with notification
- ✅ No manual page refresh needed - updates every 5 seconds
- ✅ BharatPe settings configured in database
- ✅ Deposit dialog shows QR code image
- ✅ Visual indicators clearly show SMS received status
