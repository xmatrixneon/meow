# Frontend tRPC Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Connect existing frontend pages to tRPC backend APIs for real data flow - service catalog, number purchase, SMS polling, wallet management, and deposits.

**Architecture:** Wrap app with TRPCProvider, replace mock data with tRPC queries/mutations, add polling for SMS status, implement deposit/promo dialogs with form validation.

**Tech Stack:** Next.js 16, tRPC, React Query, Framer Motion, shadcn/ui, Sonner toasts

---

## Phase 1: Provider Setup

### Task 1.1: Add TRPCProvider to Layout

**Files:**
- Modify: `app/layout.tsx`

**Step 1: Import TRPCProvider**

Add import at top of file:
```tsx
import { TRPCProvider } from "@/lib/trpc";
```

**Step 2: Wrap children with TRPCProvider**

Wrap the main content with TRPCProvider:
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <TelegramAuthProvider>
          <TRPCProvider>
            <Navbar />
            <main className="pt-14 pb-16">{children}</main>
            <BottomNavBar />
          </TRPCProvider>
        </TelegramAuthProvider>
      </body>
    </html>
  );
}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: add TRPCProvider to root layout"
```

---

## Phase 2: Home Page Integration

### Task 2.1: Connect Service List to tRPC

**Files:**
- Modify: `app/page.tsx`

**Step 1: Import trpc hook**

Add import:
```tsx
import { trpc } from "@/lib/trpc/client";
```

**Step 2: Replace mock services with tRPC query**

Replace the hardcoded `services` array with:
```tsx
const { data: servicesData } = trpc.service.list.useQuery();
const { data: walletData } = trpc.wallet.balance.useQuery();

// Transform API data to local format
const services = servicesData?.services.map(s => ({
  id: s.id,
  name: s.name,
  emoji: s.iconUrl || "📱",
  category: "Service",
})) || [];
```

**Step 3: Update wallet balance display**

Replace `$0.00` with real balance:
```tsx
<span className="text-xs font-bold text-green-500">
  ${walletData?.balance?.toFixed(2) || "0.00"}
</span>
```

**Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: connect home page services to tRPC"
```

### Task 2.2: Implement Server Selection Sheet

**Files:**
- Modify: `app/page.tsx`

**Step 1: Add servers query**

```tsx
const { data: serversData } = trpc.service.servers.useQuery();
```

**Step 2: Transform servers data**

```tsx
const servers = serversData?.servers.map(s => ({
  id: s.id,
  name: s.name,
  price: "$0.05", // Will come from service.basePrice
  stock: 100, // Will need provider API for real stock
  successRate: 95,
  avgTime: "~30s",
})) || [];
```

**Step 3: Update ServerCard to use real data**

Pass server data to ServerCard component and display.

**Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: connect server selection to tRPC"
```

### Task 2.3: Implement Buy Number Mutation

**Files:**
- Modify: `app/page.tsx`

**Step 1: Add mutation hook**

```tsx
const buyMutation = trpc.number.buy.useMutation({
  onSuccess: (data) => {
    if (data.success && data.number) {
      setBought(serverId);
      setTimeout(() => {
        setSheetOpen(false);
        router.push("/numbers");
      }, 1500);
    }
  },
  onError: (error) => {
    toast.error(error.message);
  },
});
```

**Step 2: Update handleBuy function**

```tsx
const handleBuy = async (serverId: string) => {
  if (!selected) return;
  setBuying(serverId);
  buyMutation.mutate({
    serviceId: selected.id,
    serverId: serverId,
  });
};
```

**Step 3: Add toast import**

```tsx
import { toast } from "sonner";
```

**Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: implement buy number mutation on home page"
```

---

## Phase 3: Numbers Page Integration

### Task 3.1: Connect Active Numbers to tRPC

**Files:**
- Modify: `app/numbers/page.tsx`

**Step 1: Import trpc and toast**

```tsx
import { trpc from "@/lib/trpc/client";
import { toast } from "sonner";
```

**Step 2: Replace mock data with tRPC queries**

```tsx
const { data: activeData, refetch } = trpc.number.getActive.useQuery();
const { data: historyData } = trpc.number.history.useQuery({ limit: 50 });

const activeNumbers = activeData?.numbers || [];
const historyNumbers = historyData?.numbers || [];
```

**Step 3: Transform data for display**

```tsx
const numbers = activeNumbers.map(n => ({
  id: n.id,
  number: n.phoneNumber,
  country: "Unknown", // Could add country to Service/Server
  countryCode: "🌍",
  service: n.service?.name || "Unknown",
  status: n.status === "PENDING" ? "waiting" : "received",
  expiresIn: formatTimeRemaining(n.expiresAt),
  sms: n.smsContent,
  code: extractOTP(n.smsContent),
}));
```

**Step 4: Add helper functions**

```tsx
function formatTimeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "0:00";
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function extractOTP(sms?: string | null): string | undefined {
  if (!sms) return undefined;
  const match = sms.match(/\b\d{4,8}\b/);
  return match ? match[0] : undefined;
}
```

**Step 5: Commit**

```bash
git add app/numbers/page.tsx
git commit -m "feat: connect numbers page to tRPC"
```

### Task 3.2: Implement SMS Polling

**Files:**
- Modify: `app/numbers/page.tsx`

**Step 1: Add polling effect**

```tsx
import { useEffect, useRef } from "react";

// Inside component:
const pollingRef = useRef<NodeJS.Timeout | null>(null);

useEffect(() => {
  const waitingNumbers = activeNumbers.filter(n => n.status === "PENDING");

  if (waitingNumbers.length > 0) {
    pollingRef.current = setInterval(() => {
      refetch();
    }, 5000); // Poll every 5 seconds
  }

  return () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
  };
}, [activeNumbers, refetch]);
```

**Step 2: Add countdown timer**

```tsx
const [, setTick] = useState(0);

useEffect(() => {
  const timer = setInterval(() => setTick(t => t + 1), 1000);
  return () => clearInterval(timer);
}, []);
```

**Step 3: Commit**

```bash
git add app/numbers/page.tsx
git commit -m "feat: add SMS polling for waiting numbers"
```

### Task 3.3: Implement Cancel Number Mutation

**Files:**
- Modify: `app/numbers/page.tsx`

**Step 1: Add cancel mutation**

```tsx
const cancelMutation = trpc.number.cancel.useMutation({
  onSuccess: (data) => {
    toast.success(`Refunded $${data.refundedAmount?.toFixed(2)}`);
    refetch();
  },
  onError: (error) => {
    toast.error(error.message);
  },
});
```

**Step 2: Update cancel button handler**

```tsx
const handleCancel = (orderId: string) => {
  cancelMutation.mutate({ orderId });
};
```

**Step 3: Connect to trash button**

```tsx
<motion.button
  onClick={() => handleCancel(item.orderId)}
  disabled={cancelMutation.isPending}
  // ... rest of button props
>
```

**Step 4: Commit**

```bash
git add app/numbers/page.tsx
git commit -m "feat: implement cancel number with refund"
```

### Task 3.4: Add History Tab

**Files:**
- Modify: `app/numbers/page.tsx`

**Step 1: Update tabs to include history**

```tsx
const tabs = [
  { label: "Active", value: "active", icon: Clock },
  { label: "History", value: "history", icon: History },
];
```

**Step 2: Filter based on tab**

```tsx
const displayNumbers = activeTab === "active"
  ? numbers.filter(n => n.status === "waiting" || n.status === "received")
  : historyNumbers.map(n => ({ /* transform */ }));
```

**Step 3: Commit**

```bash
git add app/numbers/page.tsx
git commit -m "feat: add history tab to numbers page"
```

---

## Phase 4: Wallet Page Integration

### Task 4.1: Connect Wallet Balance to tRPC

**Files:**
- Modify: `app/wallet/page.tsx`

**Step 1: Import trpc**

```tsx
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
```

**Step 2: Add balance query**

```tsx
const { data: walletData, refetch: refetchWallet } = trpc.wallet.balance.useQuery();
const { data: transactionsData } = trpc.wallet.transactions.useQuery({ limit: 10 });

const balance = walletData?.balance || 0;
const transactions = transactionsData?.transactions || [];
```

**Step 3: Update balance display**

```tsx
<h1 className="text-4xl font-bold text-foreground tabular-nums tracking-tight">
  ${balance.toFixed(2)}
</h1>
```

**Step 4: Commit**

```bash
git add app/wallet/page.tsx
git commit -m "feat: connect wallet balance to tRPC"
```

### Task 4.2: Create Deposit Dialog Component

**Files:**
- Create: `components/deposit-dialog.tsx`

**Step 1: Create the dialog component**

```tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { IndianRupee, Copy, CheckCheck, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";

interface DepositDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  upiId?: string | null;
  onSuccess: () => void;
}

export function DepositDialog({ open, onOpenChange, upiId, onSuccess }: DepositDialogProps) {
  const [utr, setUtr] = useState("");
  const [copied, setCopied] = useState(false);

  const depositMutation = trpc.wallet.deposit.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`$${data.amount?.toFixed(2)} added to wallet!`);
        setUtr("");
        onSuccess();
        onOpenChange(false);
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const copyUpiId = () => {
    if (upiId) {
      navigator.clipboard.writeText(upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmit = () => {
    if (!utr.trim()) {
      toast.error("Please enter UTR number");
      return;
    }
    depositMutation.mutate({ utr: utr.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IndianRupee size={18} className="text-amber-500" />
            Add Funds via UPI
          </DialogTitle>
          <DialogDescription>
            Send payment to the UPI ID below and enter your UTR number
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* UPI ID Display */}
          <div className="bg-muted/50 rounded-2xl p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Pay to</p>
            <div className="flex items-center justify-center gap-2">
              <p className="font-mono font-bold text-lg">{upiId || "Not configured"}</p>
              {upiId && (
                <button onClick={copyUpiId} className="p-1">
                  {copied ? (
                    <CheckCheck size={16} className="text-green-500" />
                  ) : (
                    <Copy size={16} className="text-muted-foreground" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* UTR Input */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Enter UTR Number
            </label>
            <Input
              placeholder="12-digit UTR from payment app"
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              maxLength={12}
              className="rounded-xl"
            />
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={depositMutation.isPending || !utr.trim()}
            className="w-full rounded-xl"
          >
            {depositMutation.isPending ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify & Add Funds"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add components/deposit-dialog.tsx
git commit -m "feat: create deposit dialog component"
```

### Task 4.3: Create Promo Dialog Component

**Files:**
- Create: `components/promo-dialog.tsx`

**Step 1: Create the dialog component**

```tsx
"use client";

import { useState } from "react";
import { Gift, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";

interface PromoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function PromoDialog({ open, onOpenChange, onSuccess }: PromoDialogProps) {
  const [code, setCode] = useState("");

  const redeemMutation = trpc.wallet.redeemPromo.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`$${data.amount?.toFixed(2)} credited!`);
        setCode("");
        onSuccess();
        onOpenChange(false);
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = () => {
    if (!code.trim()) {
      toast.error("Please enter a promo code");
      return;
    }
    redeemMutation.mutate({ code: code.trim().toUpperCase() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift size={18} className="text-violet-500" />
            Redeem Promo Code
          </DialogTitle>
          <DialogDescription>
            Enter your 12-character promo code to get bonus balance
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <Input
            placeholder="Enter promo code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={12}
            className="rounded-xl text-center font-mono text-lg tracking-widest"
          />

          <Button
            onClick={handleSubmit}
            disabled={redeemMutation.isPending || !code.trim()}
            className="w-full rounded-xl"
          >
            {redeemMutation.isPending ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Redeeming...
              </>
            ) : (
              "Redeem Code"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add components/promo-dialog.tsx
git commit -m "feat: create promo dialog component"
```

### Task 4.4: Integrate Dialogs into Wallet Page

**Files:**
- Modify: `app/wallet/page.tsx`

**Step 1: Import dialogs**

```tsx
import { DepositDialog } from "@/components/deposit-dialog";
import { PromoDialog } from "@/components/promo-dialog";
```

**Step 2: Add dialog state**

```tsx
const [depositOpen, setDepositOpen] = useState(false);
const [promoOpen, setPromoOpen] = useState(false);
```

**Step 3: Add Settings query for UPI ID**

```tsx
// You'll need to add a settings procedure to the service router
// For now, we'll use a placeholder
const upiId = "merchant@upi"; // TODO: Get from settings
```

**Step 4: Update UPI button to open dialog**

```tsx
<motion.button
  onClick={() => setDepositOpen(true)}
  // ... rest of props
>
```

**Step 5: Add redeem promo action row**

```tsx
<ActionRow
  icon={Gift}
  iconColor="text-violet-500"
  iconBg="bg-violet-500/10"
  title="Redeem Promo Code"
  subtitle="Enter code for bonus balance"
  delay={0.25}
  onClick={() => setPromoOpen(true)}
/>
```

**Step 6: Add dialog components**

```tsx
{/* At end of component */}
<DepositDialog
  open={depositOpen}
  onOpenChange={setDepositOpen}
  upiId={upiId}
  onSuccess={() => refetchWallet()}
/>
<PromoDialog
  open={promoOpen}
  onOpenChange={setPromoOpen}
  onSuccess={() => refetchWallet()}
/>
```

**Step 7: Commit**

```bash
git add app/wallet/page.tsx
git commit -m "feat: integrate deposit and promo dialogs into wallet page"
```

### Task 4.5: Add Transaction History Display

**Files:**
- Modify: `app/wallet/page.tsx`

**Step 1: Add transaction type icons**

```tsx
const transactionIcons = {
  DEPOSIT: { icon: ArrowDownLeft, color: "text-green-500", bg: "bg-green-500/10" },
  PURCHASE: { icon: CreditCard, color: "text-amber-500", bg: "bg-amber-500/10" },
  REFUND: { icon: TrendingDown, color: "text-sky-500", bg: "bg-sky-500/10" },
  PROMO: { icon: Gift, color: "text-violet-500", bg: "bg-violet-500/10" },
  REFERRAL: { icon: Sparkles, color: "text-pink-500", bg: "bg-pink-500/10" },
};
```

**Step 2: Add transaction list section**

```tsx
{/* Transaction History */}
<motion.div {...fadeUp(0.2)}>
  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 px-1 mb-2">
    Recent Transactions
  </p>
  <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border/60">
    {transactions.length === 0 ? (
      <div className="flex flex-col items-center py-8 gap-2">
        <History size={20} className="text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No transactions yet</p>
      </div>
    ) : (
      transactions.map((tx, i) => {
        const config = transactionIcons[tx.type] || transactionIcons.DEPOSIT;
        const Icon = config.icon;
        const isCredit = ["DEPOSIT", "PROMO", "REFERRAL", "REFUND"].includes(tx.type);

        return (
          <motion.div
            key={tx.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3.5 px-4 py-3.5"
          >
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", config.bg)}>
              <Icon size={16} className={config.color} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground">{tx.type}</p>
              <p className="text-xs text-muted-foreground">{tx.description || formatDistanceToNow(new Date(tx.createdAt))}</p>
            </div>
            <p className={cn(
              "font-bold text-sm tabular-nums",
              isCredit ? "text-green-500" : "text-amber-500"
            )}>
              {isCredit ? "+" : "-"}${Math.abs(Number(tx.amount)).toFixed(2)}
            </p>
          </motion.div>
        );
      })
    )}
  </div>
</motion.div>
```

**Step 3: Add date-fns import**

```tsx
import { formatDistanceToNow } from "date-fns";
```

**Step 4: Commit**

```bash
git add app/wallet/page.tsx
git commit -m "feat: add transaction history display to wallet page"
```

---

## Phase 5: Final Polish

### Task 5.1: Add Settings Query for UPI ID

**Files:**
- Modify: `lib/trpc/routers/service.ts`

**Step 1: Add settings procedure**

```tsx
settings: publicProcedure.query(async () => {
  const settings = await prisma.settings.findUnique({
    where: { id: "1" },
    select: {
      upiId: true,
      minRechargeAmount: true,
      numberExpiryMinutes: true,
    },
  });
  return settings;
}),
```

**Step 2: Update wallet page to use settings**

```tsx
const { data: settings } = trpc.service.settings.useQuery();
const upiId = settings?.upiId;
```

**Step 3: Commit**

```bash
git add lib/trpc/routers/service.ts app/wallet/page.tsx
git commit -m "feat: add settings query for UPI ID"
```

### Task 5.2: Error Boundary and Loading States

**Files:**
- Modify: `app/page.tsx`, `app/numbers/page.tsx`, `app/wallet/page.tsx`

**Step 1: Add loading states to mutations**

For all mutations, add loading states:
```tsx
disabled={buyMutation.isPending}
```

**Step 2: Add error handling with toast**

Already covered in previous tasks with `onError` callbacks.

**Step 3: Commit**

```bash
git add app/page.tsx app/numbers/page.tsx app/wallet/page.tsx
git commit -m "feat: add loading states and error handling"
```

### Task 5.3: Build and Test

**Step 1: Run build**

```bash
npm run build
```

**Step 2: Run dev server**

```bash
npm run dev
```

**Step 3: Test all flows manually**

- [ ] Service list loads
- [ ] Server selection shows
- [ ] Buy number works
- [ ] Numbers page shows active numbers
- [ ] SMS polling works
- [ ] Cancel number works
- [ ] Wallet balance shows
- [ ] Deposit dialog works
- [ ] Promo dialog works
- [ ] Transaction history shows

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete frontend tRPC integration"
```

---

## Execution Order

1. Task 1.1 - Add TRPCProvider to Layout
2. Task 2.1 - Connect Service List to tRPC
3. Task 2.2 - Implement Server Selection Sheet
4. Task 2.3 - Implement Buy Number Mutation
5. Task 3.1 - Connect Active Numbers to tRPC
6. Task 3.2 - Implement SMS Polling
7. Task 3.3 - Implement Cancel Number Mutation
8. Task 3.4 - Add History Tab
9. Task 4.1 - Connect Wallet Balance to tRPC
10. Task 4.2 - Create Deposit Dialog Component
11. Task 4.3 - Create Promo Dialog Component
12. Task 4.4 - Integrate Dialogs into Wallet Page
13. Task 4.5 - Add Transaction History Display
14. Task 5.1 - Add Settings Query for UPI ID
15. Task 5.2 - Error Boundary and Loading States
16. Task 5.3 - Build and Test
