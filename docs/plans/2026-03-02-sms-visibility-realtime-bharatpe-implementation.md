# SMS Visibility, Real-time Updates & BharatPe Configuration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix SMS disappearing from waiting tab, add auto-tab switching on SMS receipt, configure BharatPe payment settings.

**Architecture:** Modify `getActive` to return recent completed numbers, add frontend auto-switch logic on polling, seed BharatPe configuration to Settings table.

**Tech Stack:** Next.js 16, tRPC, React Query, Prisma, PostgreSQL, Framer Motion, Sonner toasts

---

### Task 1: Modify getActive to return recent completed numbers

**Files:**
- Modify: `lib/trpc/routers/number.ts:444-609`

**Step 1: Add 5-minute threshold filter to getActive query**

Modify the query to include both PENDING and COMPLETED (last 5 min) numbers.

```typescript
getActive: protectedProcedure.query(async ({ ctx }) => {
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
```

**Step 2: Keep the polling logic but update final query**

The polling logic updates status, so we need to update both the initial query and the final re-fetch query.

Update the re-fetch query (around line 558):

```typescript
// Re-fetch numbers after potential updates (still PENDING + recent COMPLETED)
const updatedNumbers = await prisma.activeNumber.findMany({
  where: {
    userId: ctx.user.id,
    OR: [
      { status: NumberStatus.PENDING },
      { status: NumberStatus.COMPLETED, createdAt: { gte: fiveMinutesAgo } }
    ]
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
```

**Step 3: Test the API change**

Run: `npm run build` to verify no TypeScript errors.

**Step 4: Commit**

```bash
git add lib/trpc/routers/number.ts
git commit -m "feat(numbers): include recent completed numbers in getActive query"
```

---

### Task 2: Add auto-switch logic to frontend Numbers page

**Files:**
- Modify: `app/numbers/page.tsx:554-902`

**Step 1: Add state to track previous received count**

Add after line 556 (after existing state declarations):

```typescript
const [prevReceivedCount, setPrevReceivedCount] = useState(0);
```

**Step 2: Add effect to detect new SMS and auto-switch**

Add after line 568 (after the time tick effect):

```typescript
// Auto-switch to received tab when new SMS arrives
useEffect(() => {
  const currentReceivedCount = receivedNumbers.length;
  if (currentReceivedCount > prevReceivedCount && activeTab === "waiting") {
    // New SMS received while in waiting tab - switch to received
    setActiveTab("received");
    toast.success("SMS received! Check your received tab.", {
      duration: 3000,
    });
  }
  setPrevReceivedCount(currentReceivedCount);
}, [receivedNumbers.length, prevReceivedCount, activeTab]);
```

**Step 3: Update polling to invalidate all queries**

Find the polling effect (around line 738-752) and update it:

```typescript
// SMS polling for waiting numbers
useEffect(() => {
  const waitingNumbers = numbers.filter(n => n.status === "waiting");

  if (waitingNumbers.length > 0) {
    pollingRef.current = setInterval(() => {
      // Invalidate all queries for real-time updates
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

**Step 4: Test build**

Run: `npm run build` to verify no errors.

**Step 5: Commit**

```bash
git add app/numbers/page.tsx
git commit -m "feat(numbers): auto-switch to received tab on SMS, improve polling"
```

---

### Task 3: Add visual indicators for received SMS in waiting tab

**Files:**
- Modify: `app/numbers/page.tsx:349-550`

**Step 1: Update NumberCard to show received SMS in waiting tab**

Modify the NumberCard component to display SMS content even when status is "waiting" but SMS exists.

Find line 387-389 where status is checked:

```typescript
const isReceived = item.status === "received";
const isCancelled = item.status === "cancelled";
const isWaiting = item.status === "waiting";
const hasSms = !!(item.sms || item.smsList);
```

**Step 2: Show SMS content for waiting numbers with SMS**

Find the SMS display section (around line 471-479) and update condition:

```typescript
{/* Received SMS - show for both received and waiting with SMS */}
{hasSms && (
  <SmsList
    smsList={item.smsList}
    singleSms={item.sms}
    code={item.code}
    onCopyCode={copyCode}
  />
)}
```

**Step 3: Update status badge to show "Received" when SMS present**

Modify the status badge display (around line 434-443):

```typescript
<span className={cn(
  "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
  isReceived || hasSms
    ? "bg-green-500/10 border-green-500/30 text-green-500"
    : isCancelled
    ? "bg-red-500/10 border-red-500/30 text-red-500"
    : "bg-amber-400/10 border-amber-400/30 text-amber-500"
)}>
  {isReceived || hasSms ? "Received" : isCancelled ? "Cancelled" : "Waiting"}
</span>
```

**Step 4: Update card border color**

Find line 398-400 and update:

```typescript
className={cn(
  "bg-card border rounded-2xl overflow-hidden",
  isReceived || hasSms ? "border-green-500/30" : isCancelled ? "border-red-500/30" : "border-border"
)}
```

**Step 5: Test build**

Run: `npm run build` to verify no errors.

**Step 6: Commit**

```bash
git add app/numbers/page.tsx
git commit -m "feat(numbers): show received SMS in waiting tab with visual indicators"
```

---

### Task 4: Create BharatPe configuration seed script

**Files:**
- Create: `prisma/seed-bharatpe.ts`

**Step 1: Create seed script**

```typescript
import { config } from "dotenv";
config({ path: ".env" });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding BharatPe configuration...");

  const settings = await prisma.settings.upsert({
    where: { id: "1" },
    update: {
      upiId: "BHARATPE.8V0Y0C8A7B91024@fbpe",
      bharatpeQrImage: "https://i.ibb.co/d4KQzjbj/IMG-20260224-185009.jpg",
      bharatpeMerchantId: "57113736",
      bharatpeToken: "edaa0bb278e54a23899c1cfeb6e937ef",
      minRechargeAmount: 10,
    },
    create: {
      id: "1",
      upiId: "BHARATPE.8V0Y0C8A7B91024@fbpe",
      bharatpeQrImage: "https://i.ibb.co/d4KQzjbj/IMG-20260224-185009.jpg",
      bharatpeMerchantId: "57113736",
      bharatpeToken: "edaa0bb278e54a23899c1cfeb6e937ef",
      minRechargeAmount: 10,
    },
  });

  console.log("BharatPe configuration seeded:", {
    upiId: settings.upiId,
    bharatpeQrImage: settings.bharatpeQrImage,
    bharatpeMerchantId: settings.bharatpeMerchantId,
    minRechargeAmount: settings.minRechargeAmount,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
```

**Step 2: Run seed script**

Run: `npx tsx prisma/seed-bharatpe.ts`

Expected output:
```
Seeding BharatPe configuration...
BharatPe configuration seeded: { upiId: 'BHARATPE.8V0Y0C8A7B91024@fbpe', ... }
```

**Step 3: Verify in database**

Run: `npx tsx -e "import { prisma } from './lib/db'; (async () => { const s = await prisma.settings.findUnique({ where: { id: '1' } }); console.log(s); })().then(() => prisma.\$disconnect());"`

Expected: Settings record with all BharatPe fields populated.

**Step 4: Add to package.json scripts (optional)**

Add to `package.json` scripts section:
```json
"seed:bharatpe": "npx tsx prisma/seed-bharatpe.ts"
```

**Step 5: Commit**

```bash
git add prisma/seed-bharatpe.ts
git commit -m "feat(config): add BharatPe configuration seed script"
```

---

### Task 5: Verify deposit dialog shows QR code

**Files:**
- Verify: `components/deposit-dialog.tsx`

**Step 1: Check deposit dialog QR display**

Verify that the deposit dialog component displays the QR code image when `settings.bharatpeQrImage` is set.

The component should have code similar to:

```tsx
{settings?.bharatpeQrImage && (
  <div className="flex justify-center mb-4">
    <img
      src={settings.bharatpeQrImage}
      alt="BharatPe QR"
      className="w-48 h-48 rounded-xl"
      onError={(e) => {
        // Fallback if image fails to load
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  </div>
)}
```

**Step 2: Verify UPI ID display**

Ensure the UPI ID is displayed correctly below the QR code.

**Step 3: Test in browser**

1. Start dev server: `npm run dev`
2. Navigate to wallet page
3. Click "Deposit" → "UPI"
4. Verify:
   - QR code image displays
   - UPI ID: BHARATPE.8V0Y0C8A7B91024@fbpe
   - Minimum recharge: ₹10 shown

**Step 4: Commit if changes needed**

If deposit dialog needed updates:

```bash
git add components/deposit-dialog.tsx
git commit -m "fix(deposit): ensure BharatPe QR code displays correctly"
```

---

### Task 6: End-to-end testing

**Files:**
- Test: `app/numbers/page.tsx`, `lib/trpc/routers/number.ts`

**Step 1: Test SMS visibility in both tabs**

1. Purchase a number for testing
2. Wait for SMS to be received
3. Verify:
   - Number appears in "waiting" tab with green border
   - SMS content is visible in "waiting" tab
   - Number also appears in "received" tab
   - After 5 minutes, number only appears in "received" tab

**Step 2: Test auto-switch on SMS receipt**

1. Stay on "waiting" tab
2. Purchase a new number
3. Wait for SMS to arrive (or use test scenario)
4. Verify:
   - Auto-switches to "received" tab
   - Toast notification shows: "SMS received!"
   - Received number is highlighted

**Step 3: Test polling without refresh**

1. Open numbers page in browser
2. Purchase a number via API or another device
3. Wait 5-10 seconds
4. Verify:
   - New number appears without page refresh
   - If SMS received, auto-switch happens
   - Balance updates in wallet page

**Step 4: Test BharatPe deposit flow**

1. Navigate to wallet page
2. Click "Top Up" → "UPI"
3. Verify:
   - QR code displays from configured URL
   - UPI ID: BHARATPE.8V0Y0C8A7B91024@fbpe
   - Minimum recharge amount shown: ₹10
   - UTR input works correctly

**Step 5: Final build verification**

Run: `npm run build`

Expected: Build completes without errors.

**Step 6: Commit**

```bash
git commit --allow-empty -m "test: completed end-to-end testing of SMS visibility and BharatPe config"
```

---

## Summary

This implementation plan addresses all three requirements:

1. **SMS Visibility**: Recent completed numbers (last 5 min) appear in both "waiting" and "received" tabs
2. **Auto-Switch**: When SMS received while on "waiting" tab, automatically switch to "received" with toast notification
3. **Real-time Updates**: Polling updates all queries every 5 seconds without page refresh
4. **BharatPe Configuration**: All payment settings configured in database with QR code display

---

## Success Criteria

- ✅ Numbers with received SMS visible in both tabs (for 5 min)
- ✅ Auto-switch to "received" tab on SMS with notification
- ✅ No manual refresh needed - 5-second polling updates UI
- ✅ BharatPe QR code displays in deposit dialog
- ✅ UPI ID, merchant ID, token, and min recharge all configured
