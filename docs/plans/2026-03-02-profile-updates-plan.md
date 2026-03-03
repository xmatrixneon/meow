# Profile Updates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update profile page to show real wallet stats, remove Account section, add Developer section with API docs, and convert Support/Terms to dialogs.

**Architecture:** Connect profile stats to Wallet DB via tRPC, create three dialog components (Support, Legal, API Docs), add telegramHelpUrl to Settings model.

**Tech Stack:** Next.js 16, tRPC, Prisma PostgreSQL, Radix UI Dialog, Framer Motion

---

### Task 1: Add telegramHelpUrl to Settings schema

**Files:**
- Modify: `prisma/schema.prisma:283-297`

**Step 1: Add telegramHelpUrl field to Settings model**

```prisma
model Settings {
  id                  String  @id @default("1")
  bharatpeMerchantId  String?
  bharatpeToken       String?
  bharatpeQrImage     String?
  minRechargeAmount   Decimal @default(10) @db.Decimal(10, 2)
  maxRechargeAmount   Decimal @default(5000) @db.Decimal(10, 2)
  upiId               String?
  referralPercent     Float   @default(0)
  minRedeem           Decimal @default(0) @db.Decimal(10, 2)
  numberExpiryMinutes Int     @default(15)
  currency            String  @default("INR")
  minCancelMinutes    Int     @default(2)
  maintenanceMode     Boolean @default(false)
  telegramHelpUrl     String?  // Add this field
}
```

**Step 2: Run migration**

```bash
npx prisma migrate dev --name add_telegram_help_url
```

Expected: Migration created and applied, database schema updated.

**Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(settings): add telegramHelpUrl field for support chat link"
```

---

### Task 2: Add wallet.stats tRPC procedure

**Files:**
- Modify: `lib/trpc/routers/wallet.ts`

**Step 1: Add stats procedure to wallet router**

```typescript
import { router, publicProcedure } from "./trpc";

// ... existing imports

export const walletRouter = router({
  // ... existing procedures

  stats: publicProcedure.query(async ({ ctx }) => {
    const wallet = await ctx.prisma.wallet.findUnique({
      where: { userId: ctx.user.id },
    });

    return {
      totalOtp: wallet?.totalOtp ?? 0,
      totalSpent: wallet?.totalSpent ?? new Decimal(0),
      totalRecharge: wallet?.totalRecharge ?? new Decimal(0),
    };
  }),
});
```

**Step 2: Run build to check for errors**

```bash
npm run build 2>&1 | head -50
```

Expected: Build succeeds or shows only type errors to fix.

**Step 3: Commit**

```bash
git add lib/trpc/routers/wallet.ts
git commit -m "feat(wallet): add stats procedure for profile page"
```

---

### Task 3: Create Support Dialog component

**Files:**
- Create: `components/support-dialog.tsx`

**Step 1: Write the Support Dialog component**

```tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronUp, MessageCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface SupportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  telegramHelpUrl?: string | null;
}

const faqs = [
  {
    question: "How do I send an SMS?",
    answer: "Go to the Home page, enter the phone number and your message, then tap Send.",
  },
  {
    question: "How do I add funds to my wallet?",
    answer: "Navigate to Wallet page and tap Add Funds. We support UPI deposits.",
  },
  {
    question: "Is my data secure?",
    answer: "Yes. We use strong encryption and never share your data with third parties.",
  },
  {
    question: "How much does it cost?",
    answer: "Pricing depends on the destination country and service. Check the pricing on the home page.",
  },
  {
    question: "Can I use this outside Telegram?",
    answer: "Currently, MeowSMS works as a Telegram Mini App. A full web version is coming soon.",
  },
];

export function SupportDialog({ open, onOpenChange, telegramHelpUrl }: SupportDialogProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Help & FAQ</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          <AnimatePresence initial={false}>
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;

              return (
                <motion.div
                  key={index}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 280, damping: 24 }}
                  className="bg-muted/30 border border-border rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm font-medium text-foreground pr-4">
                      {faq.question}
                    </span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="px-4 pb-3 text-xs text-muted-foreground leading-relaxed"
                      >
                        {faq.answer}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Contact Options */}
        <div className="mt-6 space-y-2">
          {telegramHelpUrl && (
            <a
              href={telegramHelpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <MessageCircle size={16} />
              Contact on Telegram
              <ExternalLink size={14} />
            </a>
          )}

          <DialogClose asChild>
            <button className="w-full px-4 py-3 rounded-xl border border-border text-sm font-medium hover:bg-muted/50 transition-colors">
              Close
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add components/support-dialog.tsx
git commit -m "feat: create support dialog component"
```

---

### Task 4: Create Legal Dialog component

**Files:**
- Create: `components/legal-dialog.tsx`

**Step 1: Write the Legal Dialog component**

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X } from "lucide-react";

interface LegalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LegalDialog({ open, onOpenChange }: LegalDialogProps) {
  const [tab, setTab] = useState<"terms" | "privacy">("terms");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] p-0">
        {/* Header with tabs */}
        <div className="border-b border-border">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-lg">Terms & Privacy</DialogTitle>
          </DialogHeader>
          <div className="flex px-4 pb-2 gap-1">
            <button
              onClick={() => setTab("terms")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                tab === "terms"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              Terms of Service
            </button>
            <button
              onClick={() => setTab("privacy")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                tab === "privacy"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              Privacy Policy
            </button>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="h-[400px] px-4 py-4">
          {tab === "terms" ? (
            <div className="space-y-4 text-xs text-muted-foreground leading-relaxed">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">1. Acceptance of Terms</h3>
                <p>
                  By accessing and using MeowSMS services, you agree to be bound by these Terms of Service.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">2. Service Description</h3>
                <p>
                  MeowSMS provides virtual phone number services for receiving SMS messages. We do not guarantee
                  the delivery of SMS messages or the availability of phone numbers.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">3. User Responsibilities</h3>
                <p>
                  You agree to use our services for lawful purposes only. You are responsible for maintaining
                  the confidentiality of your account credentials.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">4. Payment & Refunds</h3>
                <p>
                  All purchases are final. Refunds are only processed for unused services or at our discretion.
                  Prices are subject to change without notice.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">5. Limitation of Liability</h3>
                <p>
                  MeowSMS shall not be liable for any indirect, incidental, special, or consequential damages
                  arising from the use of our services.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">6. Termination</h3>
                <p>
                  We reserve the right to suspend or terminate your account at any time for violation of these
                  terms or for any other reason at our sole discretion.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-xs text-muted-foreground leading-relaxed">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">1. Data Collection</h3>
                <p>
                  We collect information you provide directly, such as your Telegram profile data and wallet
                  information. We also collect usage data to improve our services.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">2. How We Use Your Data</h3>
                <p>
                  Your data is used to provide our services, process payments, and communicate with you about
                  your account. We do not sell your personal data to third parties.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">3. SMS Messages</h3>
                <p>
                  SMS messages received through our virtual numbers are stored temporarily and are deleted
                  after the number expires. We do not access or read message content for any purpose other
                  than delivering them to you.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">4. Data Security</h3>
                <p>
                  We implement industry-standard security measures to protect your data. However, no method
                  of transmission over the Internet is 100% secure.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">5. Third-Party Services</h3>
                <p>
                  We may use third-party services for payment processing and SMS delivery. These services
                  have their own privacy policies which we encourage you to review.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">6. Your Rights</h3>
                <p>
                  You have the right to access, correct, or delete your personal data. To exercise these
                  rights, please contact our support team.
                </p>
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <DialogClose asChild>
            <button className="w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              I Understand
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Add cn import check**

The component uses `cn` utility - verify it's imported. (Already imported above)

**Step 3: Commit**

```bash
git add components/legal-dialog.tsx
git commit -m "feat: create legal dialog component"
```

---

### Task 5: Create API Docs Dialog component

**Files:**
- Create: `components/api-docs-dialog.tsx`

**Step 1: Write the API Docs Dialog component**

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check, ExternalLink, Code, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ApiDocsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string;
}

const errorCodes = [
  { code: "BAD_KEY", description: "Invalid API key" },
  { code: "BAD_SERVICE", description: "Service not found or inactive" },
  { code: "NO_NUMBER", description: "No numbers available for this service" },
  { code: "NO_BALANCE", description: "Insufficient wallet balance" },
  { code: "NO_ACTIVATION", description: "Activation not found or expired" },
];

export function ApiDocsDialog({ open, onOpenChange, apiKey }: ApiDocsDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    toast.success("API Key copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://yourdomain.com";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-base">API Documentation</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[500px]">
          <div className="p-5 space-y-6">
            {/* API Key Section */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">Your API Key</span>
                <button
                  onClick={handleCopyKey}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <code className="block text-xs font-mono bg-card px-3 py-2 rounded-lg text-foreground/80">
                {apiKey}
              </code>
            </div>

            {/* Base URL */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Base URL</h3>
              <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                <Code size={14} className="text-muted-foreground" />
                <code className="text-xs font-mono text-muted-foreground">
                  {baseUrl}/api/stubs/handler_api.php
                </code>
              </div>
            </div>

            {/* Endpoint 1: getNumber */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-500 text-xs font-mono">GET</span>
                getNumber
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Purchase a virtual number for receiving SMS.
              </p>

              <div className="space-y-2">
                <div>
                  <span className="text-xs font-medium text-foreground">Parameters:</span>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">action</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"getNumber"</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">api_key</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">{apiKey}</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">service</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"service_code"</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">country</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"country_code"</code>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-medium text-foreground">Response:</span>
                  <div className="mt-2 bg-card border border-border rounded-lg p-3">
                    <code className="text-xs font-mono text-foreground/90">
                      ACCESS_NUMBER:orderId:phoneNumber
                    </code>
                  </div>
                </div>
              </div>
            </div>

            {/* Endpoint 2: getStatus */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-500 text-xs font-mono">GET</span>
                getStatus
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Get the status of your activation and retrieve SMS messages.
              </p>

              <div className="space-y-2">
                <div>
                  <span className="text-xs font-medium text-foreground">Parameters:</span>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">action</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"getStatus"</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">api_key</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">{apiKey}</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">id</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"order_id"</code>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-medium text-foreground">Responses:</span>
                  <div className="mt-2 space-y-2">
                    <div className="bg-card border border-border rounded-lg p-2">
                      <span className="text-[10px] font-medium text-muted-foreground block mb-1">Waiting for SMS:</span>
                      <code className="text-xs font-mono text-foreground/90">STATUS_WAIT_CODE</code>
                    </div>
                    <div className="bg-card border border-border rounded-lg p-2">
                      <span className="text-[10px] font-medium text-muted-foreground block mb-1">SMS Received:</span>
                      <code className="text-xs font-mono text-foreground/90">STATUS_OK:123456 is your OTP</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Endpoint 3: setStatus */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-500 text-xs font-mono">GET</span>
                setStatus
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Cancel an activation or mark it as complete.
              </p>

              <div className="space-y-2">
                <div>
                  <span className="text-xs font-medium text-foreground">Parameters:</span>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">action</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"setStatus"</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">api_key</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">{apiKey}</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">id</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"order_id"</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">status</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"8"</code>
                      <span className="text-muted-foreground">(cancel)</span>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-medium text-foreground">Response:</span>
                  <div className="mt-2 bg-card border border-border rounded-lg p-3">
                    <code className="text-xs font-mono text-foreground/90">
                      ACCESS_CANCEL
                    </code>
                  </div>
                </div>
              </div>
            </div>

            {/* Error Codes */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle size={14} />
                Error Codes
              </h3>
              <div className="border border-border rounded-xl overflow-hidden">
                {errorCodes.map(({ code, description }) => (
                  <div key={code} className="flex items-center justify-between px-4 py-2.5 last:border-0 border-b border-border/60">
                    <code className="text-xs font-mono text-foreground/90">{code}</code>
                    <span className="text-xs text-muted-foreground">{description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <DialogClose asChild>
            <button className="w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              Close
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add components/api-docs-dialog.tsx
git commit -m "feat: create api docs dialog component"
```

---

### Task 6: Update Profile Page with real stats and dialogs

**Files:**
- Modify: `app/profile/page.tsx`

**Step 1: Replace imports and add dialog imports**

```typescript
"use client";

import { motion } from "framer-motion";
import { authClient, trpc } from "@/lib/auth-client";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  User as UserIcon, Wallet, HelpCircle, FileText,
  Copy, CheckCheck, Sparkles, Zap, Code,
} from "lucide-react";
import { useState } from "react";
import { SupportDialog } from "@/components/support-dialog";
import { LegalDialog } from "@/components/legal-dialog";
import { ApiDocsDialog } from "@/components/api-docs-dialog";
```

**Step 2: Update component to add dialog state and queries**

Replace the component definition:

```typescript
export default function ProfilePage() {
  const [copied, setCopied] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [apiDocsOpen, setApiDocsOpen] = useState(false);

  const { data: session, isPending } = authClient.useSession();
  const user = session?.user as User | undefined;
  const queryClient = useQueryClient();

  const { data: settings } = trpc.service.settings.useQuery();
  const { data: stats } = trpc.wallet.stats.useQuery(undefined, {
    enabled: !!user,
  });

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.name ||
    user?.telegramUsername ||
    "User";

  const avatarUrl = user?.photoUrl ?? user?.image ?? null;
  const initials = displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const handleCopyId = () => {
    if (user?.telegramId) {
      navigator.clipboard.writeText(user.telegramId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Format currency in INR
  const formatCurrency = (amount: { toString: () => string } | number) => {
    if (typeof amount === "number") {
      return `₹${amount.toFixed(2)}`;
    }
    return `₹${parseFloat(amount.toString()).toFixed(2)}`;
  };

  // ── Skeleton
  if (isPending && !user) return <ProfileSkeleton />;

  // ── Not in Telegram
  if (!user) {
    return (
      <div className="min-h-[calc(100vh-7rem)] flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring" as const, stiffness: 300, damping: 22 }}
          className="bg-card border border-border rounded-3xl p-8 text-center max-w-sm w-full shadow-xl"
        >
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <Zap size={24} className="text-destructive" />
          </div>
          <p className="font-semibold text-foreground mb-1">Not available</p>
          <p className="text-sm text-muted-foreground">Open this app inside Telegram to continue.</p>
        </motion.div>
      </div>
    );
  }
```

**Step 3: Update Stats Section to show real data**

Replace the stats section in the return statement:

```typescript
        {/* Avatar Hero */}
        <motion.div
          {...fadeUp(0)}
          className="relative overflow-hidden rounded-3xl bg-primary/10 dark:bg-primary/15 border border-primary/20 px-5 py-6"
        >
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
          <div className="relative flex items-center gap-4">
            <div className="relative shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="w-20 h-20 rounded-2xl object-cover border-2 border-primary/30 shadow-lg" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold border-2 border-primary/30 shadow-lg">
                  {initials}
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-card shadow-sm" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-foreground truncate leading-tight">{displayName}</h1>
              {user.telegramUsername && (
                <p className="text-sm text-primary font-medium mt-0.5">@{user.telegramUsername}</p>
              )}
              {user.isPremium && (
                <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-semibold text-amber-500">
                  <Sparkles size={9} />
                  Telegram Premium
                </span>
              )}
              {user.telegramId && (
                <button
                  type="button"
                  onClick={handleCopyId}
                  className={cn(
                    "mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full",
                    "bg-card/80 border border-border text-xs text-muted-foreground",
                    "hover:border-primary/40 transition-colors duration-150"
                  )}
                >
                  {copied ? <CheckCheck size={11} className="text-green-500" /> : <Copy size={11} />}
                  <span className="font-mono">ID: {user.telegramId}</span>
                </button>
              )}
            </div>
          </div>
          <div className="relative mt-5 pt-4 border-t border-primary/15 flex items-center">
            <StatPill value={stats?.totalOtp?.toString() ?? "0"} label="Numbers" accent="text-primary" />
            <div className="w-px h-8 bg-primary/15" />
            <StatPill value={formatCurrency(stats?.totalSpent ?? 0)} label="Spent" accent="text-green-500" />
            <div className="w-px h-8 bg-primary/15" />
            <StatPill value={formatCurrency(stats?.totalRecharge ?? 0)} label="Recharged" accent="text-sky-500" />
          </div>
        </motion.div>
```

**Step 4: Remove Account section and add Developer section**

Replace the Account and Support sections:

```typescript
        {/* Developer */}
        <div>
          <SectionLabel label="Developer" />
          <SettingsCard delay={0.08}>
            <SettingsRow
              icon={Code}
              label="API Key"
              value={user.telegramId}
              onClick={() => setApiDocsOpen(true)}
            />
          </SettingsCard>
        </div>

        {/* Support */}
        <div>
          <SectionLabel label="Support" />
          <SettingsCard delay={0.16}>
            <SettingsRow icon={HelpCircle} label="Help & FAQ" onClick={() => setSupportOpen(true)} />
            <SettingsRow icon={FileText} label="Terms & Privacy" onClick={() => setLegalOpen(true)} />
          </SettingsCard>
        </div>

        {/* Dialogs */}
        <SupportDialog
          open={supportOpen}
          onOpenChange={setSupportOpen}
          telegramHelpUrl={settings?.telegramHelpUrl}
        />
        <LegalDialog open={legalOpen} onOpenChange={setLegalOpen} />
        <ApiDocsDialog
          open={apiDocsOpen}
          onOpenChange={setApiDocsOpen}
          apiKey={user.telegramId || ""}
        />
```

**Step 5: Run build to check for errors**

```bash
npm run build 2>&1 | tail -30
```

Expected: Build succeeds.

**Step 6: Commit**

```bash
git add app/profile/page.tsx
git commit -m "feat(profile): add real stats, dialogs, remove account section"
```

---

### Task 7: Update admin.settings router to accept telegramHelpUrl

**Files:**
- Modify: `lib/trpc/routers/admin.ts`

**Step 1: Update settings.update procedure**

Find the `settings.update` procedure and add `telegramHelpUrl` to the input schema and update logic:

```typescript
// In admin router
settings: adminProcedure
  .input(z.object({
    bharatpeMerchantId: z.string().optional(),
    bharatpeToken: z.string().optional(),
    bharatpeQrImage: z.string().url().optional(),
    upiId: z.string().optional(),
    minRechargeAmount: z.number().optional(),
    maxRechargeAmount: z.number().optional(),
    referralPercent: z.number().optional(),
    minRedeem: z.number().optional(),
    numberExpiryMinutes: z.number().optional(),
    currency: z.string().optional(),
    minCancelMinutes: z.number().optional(),
    maintenanceMode: z.boolean().optional(),
    telegramHelpUrl: z.string().url().optional(),  // Add this
  }))
  .mutation(async ({ ctx, input }) => {
    const settings = await ctx.prisma.settings.update({
      where: { id: "1" },
      data: input,
    });
    return settings;
  }),
```

**Step 2: Update service.settings to include telegramHelpUrl**

Modify the `service.settings` public procedure:

```typescript
// In service router
settings: publicProcedure.query(async ({ ctx }) => {
  const settings = await ctx.prisma.settings.findUnique({
    where: { id: "1" },
  });
  return {
    upiId: settings?.upiId,
    bharatpeQrImage: settings?.bharatpeQrImage,
    telegramHelpUrl: settings?.telegramHelpUrl,  // Add this
    currency: settings?.currency,
    minCancelMinutes: settings?.minCancelMinutes,
    maintenanceMode: settings?.maintenanceMode,
  };
}),
```

**Step 3: Run build**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add lib/trpc/routers/admin.ts lib/trpc/routers/service.ts
git commit -m "feat(admin): add telegramHelpUrl to settings router"
```

---

### Task 8: Final verification

**Files:**
- All modified files

**Step 1: Run full build**

```bash
npm run build
```

Expected: Build completes successfully with all routes generated.

**Step 2: Check git status**

```bash
git status
```

Expected: All changes committed.

**Step 3: Final commit summary**

```bash
git log --oneline -8
```

---

## Completion Checklist

- [ ] Database migration for `telegramHelpUrl` applied
- [ ] `wallet.stats` tRPC procedure created
- [ ] Support Dialog component created
- [ ] Legal Dialog component created
- [ ] API Docs Dialog component created
- [ ] Profile page updated with real stats
- [ ] Account section removed from profile
- [ ] Developer section added with API Key
- [ ] Support section opens dialogs instead of pages
- [ ] admin.settings router accepts `telegramHelpUrl`
- [ ] service.settings returns `telegramHelpUrl`
- [ ] Build passes with no errors
