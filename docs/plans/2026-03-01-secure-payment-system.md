# Secure Payment System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement secure payment system with atomic balance deduction, auto-refund on expiry, duplicate UTR prevention, and real-time balance display.

**Architecture:** Balance is deducted immediately when purchasing numbers (before provider API call). Refunds happen automatically when SMS is not received within expiry time or on manual cancel. UTR uniqueness enforced at database level.

**Tech Stack:** Next.js 16, tRPC, Prisma, PostgreSQL, TypeScript

---

## Overview

The payment system works like this:

1. **Buy Number:** Deduct balance immediately → Call provider → Success=commit / Fail=rollback
2. **SMS Received:** Save SMS, keep balance deducted, mark COMPLETED
3. **SMS Not Received (Expiry/Cancel):** Refund balance, mark CANCELLED
4. **Deposit:** Verify UTR with BharatPe, credit balance, prevent duplicates

---

## Task 1: Update Database Schema

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add unique constraint to Transaction.txnId**

```prisma
model Transaction {
  id          String          @id @default(cuid())
  walletId    String
  type        TransactionType
  amount      Decimal         @db.Decimal(10, 2)
  status      TransactionStatus @default(COMPLETED)
  description String?
  txnId       String?  // UTR or reference
  metadata    Json?
  createdAt   DateTime @default(now())
  wallet      Wallet   @relation(fields: [walletId], references: [id], onDelete: Cascade)

  @@unique([txnId])  // ADD THIS: Prevent duplicate UTRs
  @@index([walletId, createdAt])
}
```

**Step 2: Add balanceDeducted field to ActiveNumber**

```prisma
model ActiveNumber {
  id          String       @id @default(cuid())
  userId      String
  serviceId   String
  orderId     String       @unique
  numberId    String       // External provider's number ID
  phoneNumber String
  serverId    String
  price       Decimal      @db.Decimal(10, 2)
  status      NumberStatus @default(PENDING)
  smsContent  String?
  balanceDeducted Boolean  @default(false)  // ADD THIS: Track balance deduction
  buyTime     DateTime     @default(now())
  expiresAt   DateTime
  createdAt   DateTime     @default(now())
  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  service     Service      @relation(fields: [serviceId], references: [id], onDelete: Restrict)
  server      OtpServer    @relation(fields: [serverId], references: [id])

  @@index([userId, status])
  @@index([status, expiresAt])
}
```

**Step 3: Run migration**

```bash
npx prisma migrate dev --name add_payment_security_fields
```

Expected: Migration created and applied successfully.

**Step 4: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: Client generated to `app/generated/prisma/`.

**Step 5: Commit**

```bash
git add prisma/schema.prisma
git add prisma/migrations
git commit -m "feat(db): add txnId unique constraint and balanceDeducted field"
```

---

## Task 2: Update Buy Number Router (Deduct Balance First)

**Files:**
- Modify: `lib/trpc/routers/number.ts`

**Step 1: Update buy mutation to deduct balance before provider call**

```typescript
buy: protectedProcedure
  .input(buySchema)
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;

    // 1. Validate service exists and is active
    const service = await prisma.service.findFirst({
      where: {
        id: input.serviceId,
        serverId: input.serverId,
        isActive: true,
      },
      include: {
        server: {
          include: {
            api: true,
          },
        },
      },
    });

    if (!service) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Service not found or inactive",
      });
    }

    if (!service.server.isActive || !service.server.api.isActive) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Server or API is currently unavailable",
      });
    }

    // 2. Calculate final price with custom discount
    const finalPrice = await calculateFinalPrice(userId, service.id, service.basePrice);

    // 3. Get number expiry setting
    const settings = await prisma.settings.findUnique({
      where: { id: "1" },
    });
    const expiryMinutes = settings?.numberExpiryMinutes ?? 20;

    // 4. Generate internal order ID
    const orderId = nanoid(16);

    // 5. Begin atomic transaction - deduct balance FIRST
    const result = await prisma.$transaction(async (tx) => {
      // Lock and update wallet - deduct balance atomically
      const walletUpdate = await tx.wallet.update({
        where: { userId },
        data: {
          balance: { decrement: finalPrice },
          totalSpent: { increment: finalPrice },
        },
      });

      // Verify balance was sufficient (will throw if negative)
      if (walletUpdate.balance.isNegative()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Insufficient balance",
        });
      }

      // Get the updated wallet for transaction record
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Wallet not found",
        });
      }

      // Create PURCHASE transaction record (balance already deducted)
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: "PURCHASE",
          amount: finalPrice,
          status: "COMPLETED",
          description: `Purchase pending: ${service.name}`,
          metadata: {
            orderId,
            serviceId: service.id,
            serviceName: service.name,
          },
        },
      });

      // Create ActiveNumber with balanceDeducted = true
      const activeNumber = await tx.activeNumber.create({
        data: {
          userId,
          serviceId: service.id,
          orderId,
          serverId: service.serverId,
          price: finalPrice,
          status: NumberStatus.PENDING,
          balanceDeducted: true,  // Balance already deducted
          expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
        },
        include: {
          service: true,
        },
      });

      return { activeNumber, wallet };
    });

    try {
      // 6. Call OTP provider to get a number (outside transaction)
      const otpClient = new OtpProviderClient({
        apiUrl: service.server.api.apiUrl,
        apiKey: service.server.api.apiKey,
      });

      const numberResponse = await otpClient.getNumber(
        service.code,
        service.server.countryCode
      );

      if (!numberResponse.success || !numberResponse.orderId || !numberResponse.phoneNumber) {
        // Provider failed - need to refund
        await handleBuyFailure(result.activeNumber.orderId, result.activeNumber.price, userId);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: numberResponse.error || "Failed to get phone number from provider",
        });
      }

      // 7. Update ActiveNumber with provider details
      const updatedNumber = await prisma.activeNumber.update({
        where: { id: result.activeNumber.id },
        data: {
          numberId: numberResponse.orderId,
          phoneNumber: numberResponse.phoneNumber,
        },
        include: {
          service: true,
        },
      });

      // 8. Update transaction description with phone number
      await prisma.transaction.updateMany({
        where: {
          metadata: {
            path: ["orderId"],
            equals: orderId,
          },
        },
        data: {
          description: `Purchased ${service.name} number: ${numberResponse.phoneNumber}`,
          metadata: {
            orderId,
            numberId: numberResponse.orderId,
            serviceId: service.id,
            serviceName: service.name,
          },
        },
      });

      return {
        success: true,
        number: updatedNumber,
        message: "Number purchased successfully",
      };
    } catch (error) {
      // Provider call failed - trigger refund
      await handleBuyFailure(result.activeNumber.orderId, result.activeNumber.price, userId);
      throw error;
    }
  }),
```

**Step 2: Add helper function for handling buy failures**

Add this before the router export:

```typescript
/**
 * Handle buy failure - refund the deducted balance
 */
async function handleBuyFailure(orderId: string, price: Prisma.Decimal, userId: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      // Find the active number
      const activeNumber = await tx.activeNumber.findFirst({
        where: { orderId, userId, balanceDeducted: true },
      });

      if (!activeNumber) {
        return; // Already handled or doesn't exist
      }

      // Update number status
      await tx.activeNumber.update({
        where: { id: activeNumber.id },
        data: {
          status: NumberStatus.CANCELLED,
          balanceDeducted: false,
        },
      });

      // Refund balance
      await tx.wallet.update({
        where: { userId },
        data: {
          balance: { increment: price },
          totalSpent: { decrement: price },
        },
      });

      // Get wallet for transaction
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (wallet) {
        // Create refund transaction
        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            type: "REFUND",
            amount: price,
            status: "COMPLETED",
            description: `Auto-refund: Failed to acquire number`,
            metadata: {
              orderId,
              reason: "provider_error",
            },
          },
        });
      }
    });
  } catch (error) {
    console.error("Failed to refund after buy error:", error);
  }
}
```

**Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: No TypeScript errors.

**Step 4: Commit**

```bash
git add lib/trpc/routers/number.ts
git commit -m "feat(payment): deduct balance before provider call in buy mutation"
```

---

## Task 3: Update Get Status Router (Auto-Refund on Expiry)

**Files:**
- Modify: `lib/trpc/routers/number.ts`

**Step 1: Update getStatus mutation with auto-refund logic**

Replace the existing getStatus with:

```typescript
  /**
   * Get status of a specific order (check for SMS)
   * Auto-refunds if expired without SMS
   */
  getStatus: protectedProcedure
    .input(getStatusSchema)
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Find active number
      const activeNumber = await prisma.activeNumber.findFirst({
        where: {
          orderId: input.orderId,
          userId,
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
      });

      if (!activeNumber) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      // If already completed or cancelled, return stored status
      if (activeNumber.status !== NumberStatus.PENDING) {
        return {
          status: activeNumber.status,
          sms: activeNumber.smsContent,
          phoneNumber: activeNumber.phoneNumber,
        };
      }

      // Check if expired
      const isExpired = activeNumber.expiresAt < new Date();

      // Check status with OTP provider
      const otpClient = new OtpProviderClient({
        apiUrl: activeNumber.service.server.api.apiUrl,
        apiKey: activeNumber.service.server.api.apiKey,
      });

      const statusResponse = await otpClient.getStatus(activeNumber.numberId);

      // If SMS received
      if (statusResponse.status === "RECEIVED" && statusResponse.sms) {
        await prisma.activeNumber.update({
          where: { id: activeNumber.id },
          data: {
            status: NumberStatus.COMPLETED,
            smsContent: statusResponse.sms,
          },
        });

        // Notify provider that we received the SMS
        await otpClient.finishOrder(activeNumber.numberId);

        // Increment total OTP count
        await prisma.wallet.update({
          where: { userId },
          data: { totalOtp: { increment: 1 } },
        });

        return {
          status: NumberStatus.COMPLETED,
          sms: statusResponse.sms,
          phoneNumber: activeNumber.phoneNumber,
        };
      }

      // If cancelled by provider
      if (statusResponse.status === "CANCELLED") {
        await handleAutoRefund(activeNumber, userId, "provider_cancelled");
        return {
          status: NumberStatus.CANCELLED,
          sms: undefined,
          phoneNumber: activeNumber.phoneNumber,
        };
      }

      // If expired without SMS - auto refund
      if (isExpired && !activeNumber.smsContent) {
        await handleAutoRefund(activeNumber, userId, "expired");
        return {
          status: NumberStatus.CANCELLED,
          sms: undefined,
          phoneNumber: activeNumber.phoneNumber,
        };
      }

      // Still waiting
      return {
        status: NumberStatus.PENDING,
        sms: undefined,
        phoneNumber: activeNumber.phoneNumber,
      };
    }),
```

**Step 2: Add helper function for auto-refund**

Add this after the handleBuyFailure function:

```typescript
/**
 * Handle auto-refund when SMS not received or provider cancelled
 */
async function handleAutoRefund(
  activeNumber: { id: string; price: Prisma.Decimal; phoneNumber: string; orderId: string; serviceId: string },
  userId: string,
  reason: "expired" | "provider_cancelled"
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Get wallet
    const wallet = await tx.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Wallet not found",
      });
    }

    // Find the service name
    const service = await tx.service.findUnique({
      where: { id: activeNumber.serviceId },
    });

    // Update number status and set balanceDeducted to false
    const updated = await tx.activeNumber.updateMany({
      where: {
        id: activeNumber.id,
        balanceDeducted: true,
        smsContent: null,
      },
      data: {
        status: NumberStatus.CANCELLED,
        balanceDeducted: false,
      },
    });

    // Only refund if we actually updated a record (prevents double refund)
    if (updated.count > 0) {
      // Refund balance
      await tx.wallet.update({
        where: { userId },
        data: {
          balance: { increment: activeNumber.price },
          totalSpent: { decrement: activeNumber.price },
          totalOtp: { decrement: 1 },
        },
      });

      // Create refund transaction
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: "REFUND",
          amount: activeNumber.price,
          status: "COMPLETED",
          description: `Auto-refund: ${reason === "expired" ? "Number expired without SMS" : "Provider cancelled order"}`,
          metadata: {
            orderId: activeNumber.orderId,
            reason,
            serviceId: activeNumber.serviceId,
            serviceName: service?.name,
          },
        },
      });
    }
  });
}
```

**Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: No TypeScript errors.

**Step 4: Commit**

```bash
git add lib/trpc/routers/number.ts
git commit -m "feat(payment): add auto-refund when SMS not received or expired"
```

---

## Task 4: Update Cancel Router (Check Balance Deducted)

**Files:**
- Modify: `lib/trpc/routers/number.ts`

**Step 1: Update cancel mutation with balanceDeducted check**

Replace the existing cancel mutation with:

```typescript
  /**
   * Cancel an active order and get a refund
   * Only refunds if SMS not received and balance was deducted
   */
  cancel: protectedProcedure
    .input(cancelSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Find active number
      const activeNumber = await prisma.activeNumber.findFirst({
        where: {
          orderId: input.orderId,
          userId,
          status: NumberStatus.PENDING,
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
      });

      if (!activeNumber) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Active order not found or already completed/cancelled",
        });
      }

      // Check if SMS already received - no refund if SMS received
      if (activeNumber.smsContent) {
        await prisma.activeNumber.update({
          where: { id: activeNumber.id },
          data: { status: NumberStatus.CANCELLED },
        });

        return {
          success: true,
          refundedAmount: 0,
          message: "Number cancelled (no refund - SMS was received)",
        };
      }

      // Check if balance was deducted (prevents double refund)
      if (!activeNumber.balanceDeducted) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Order already refunded or balance not deducted",
        });
      }

      // Check cancel timer - users cannot cancel within configured time limit
      const settings = await prisma.settings.findUnique({
        where: { id: "1" },
      });
      const minCancelMinutes = settings?.minCancelMinutes ?? 2;
      const minCancelMs = minCancelMinutes * 60 * 1000;

      const timeSincePurchase = Date.now() - activeNumber.createdAt.getTime();
      if (timeSincePurchase < minCancelMs) {
        const remainingSeconds = Math.ceil((minCancelMs - timeSincePurchase) / 1000);
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Cannot cancel within ${minCancelMinutes} minutes. Please wait ${remainingSeconds} seconds.`,
        });
      }

      // Get user's wallet
      const wallet = await prisma.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Wallet not found",
        });
      }

      // Cancel with OTP provider
      const otpClient = new OtpProviderClient({
        apiUrl: activeNumber.service.server.api.apiUrl,
        apiKey: activeNumber.service.server.api.apiKey,
      });

      const cancelResponse = await otpClient.cancelOrder(activeNumber.numberId);

      // Even if provider cancellation fails, we still refund user
      // (the order may have expired on provider side)

      // Process refund in atomic transaction
      const result = await prisma.$transaction(async (tx) => {
        // Update number status
        await tx.activeNumber.update({
          where: { id: activeNumber.id },
          data: {
            status: NumberStatus.CANCELLED,
            balanceDeducted: false,
          },
        });

        // Refund balance
        await tx.wallet.update({
          where: { userId },
          data: {
            balance: { increment: activeNumber.price },
            totalSpent: { decrement: activeNumber.price },
            totalOtp: { decrement: 1 },
          },
        });

        // Create refund transaction
        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            type: "REFUND",
            amount: activeNumber.price,
            status: "COMPLETED",
            description: `Refund for cancelled ${activeNumber.service.name} number: ${activeNumber.phoneNumber}`,
            metadata: {
              orderId: activeNumber.orderId,
              numberId: activeNumber.numberId,
              serviceId: activeNumber.serviceId,
              serviceName: activeNumber.service.name,
              providerCancelSuccess: cancelResponse.success,
              reason: "user_cancel",
            },
          },
        });

        return {
          success: true,
          refundedAmount: activeNumber.price.toNumber(),
        };
      });

      return result;
    }),
```

**Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add lib/trpc/routers/number.ts
git commit -m "feat(payment): update cancel to check balanceDeducted flag"
```

---

## Task 5: Update Wallet Router (Duplicate UTR Check with Unique Constraint)

**Files:**
- Modify: `lib/trpc/routers/wallet.ts`

**Step 1: Update deposit mutation**

Replace the existing UTR check section (lines 147-157) with better error handling:

```typescript
      // Check if this UTR has already been used
      try {
        const existingTransaction = await prisma.transaction.findUnique({
          where: { txnId: utr },
        });

        if (existingTransaction) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This UTR has already been used for a deposit.",
          });
        }
      } catch (error) {
        // Prisma error will be caught here if unique constraint is violated
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2002") {
            // Unique constraint violation
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This UTR has already been used for a deposit.",
            });
          }
        }
        throw error;
      }
```

**Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add lib/trpc/routers/wallet.ts
git commit -m "feat(payment): improve duplicate UTR check with constraint error handling"
```

---

## Task 6: Update Navbar with Real Balance

**Files:**
- Modify: `components/navbar.tsx`

**Step 1: Add tRPC import and use wallet balance query**

```typescript
"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, ChevronDown, Wallet, Cat, Settings, LogOut, User as UserIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/trpc/client";
import type { User } from "@/types";
import { useRouter } from "next/navigation";

type NavbarProps = {
  className?: string;
  notificationCount?: number;
};

export function Navbar({
  className,
  notificationCount = 3,
}: NavbarProps) {
  // Get current user from session
  const { data: session } = authClient.useSession();
  const user = session?.user as User | undefined;

  // Fetch wallet balance from tRPC
  const { data: walletData, isLoading: balanceLoading } = api.wallet.balance.useQuery(undefined, {
    enabled: !!user, // Only fetch if user is logged in
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const walletBalance = walletData?.balance ?? 0;
  const [showDropdown, setShowDropdown] = useState(false);
  const router = useRouter();
```

**Step 2: Update wallet balance display**

Replace the hardcoded balance section (lines 76-89) with:

```typescript
        {/* Wallet Balance */}
        <motion.div
          whileTap={{ scale: 0.97 }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer",
            "bg-primary/10 dark:bg-primary/15 text-primary",
            "transition-colors duration-200 h-9"
          )}
          onClick={() => router.push("/wallet")}
        >
          <Wallet size={15} strokeWidth={2} aria-hidden />
          {balanceLoading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <span className="font-semibold text-xs whitespace-nowrap">
              ₹{walletBalance.toFixed(2)}
            </span>
          )}
        </motion.div>
```

**Step 3: Add Wallet shortcut in dropdown**

Update the dropdown menu (add after Profile button):

```typescript
            {/* Wallet */}
            <button
              type="button"
              onClick={() => {
                setShowDropdown(false);
                router.push("/wallet");
              }}
              className={cn(
                "w-full text-left px-4 py-2 text-sm flex items-center gap-2",
                "text-foreground hover:bg-muted transition-colors duration-150"
              )}
            >
              <Wallet size={14} />
              Wallet
            </button>
```

**Step 4: Run type check**

```bash
npx tsc --noEmit
```

Expected: No TypeScript errors.

**Step 5: Commit**

```bash
git add components/navbar.tsx
git commit -m "feat(ui): show real wallet balance in navbar from tRPC"
```

---

## Task 7: Update Transaction History Display

**Files:**
- Modify: `app/wallet/page.tsx`

**Step 1: Ensure transactions are properly formatted**

Make sure the transactions display shows:

```typescript
// Inside the transactions list
{transactions.map((tx) => {
  const isCredit = tx.type === "DEPOSIT" || tx.type === "PROMO" || tx.type === "REFUND";
  const isDebit = tx.type === "PURCHASE";

  return (
    <div key={tx.id} className="flex items-center justify-between py-3 border-b border-border">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{tx.description || tx.type}</span>
        <span className="text-xs text-muted-foreground">
          {new Date(tx.createdAt).toLocaleString()}
        </span>
      </div>
      <span
        className={cn(
          "text-sm font-semibold",
          isCredit ? "text-green-500" : isDebit ? "text-red-500" : "text-foreground"
        )}
      >
        {isCredit ? "+" : "-"}₹{tx.amount.toFixed(2)}
      </span>
    </div>
  );
})}
```

**Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add app/wallet/page.tsx
git commit -m "feat(ui): improve transaction history display"
```

---

## Task 8: Add Settings Router for Admin

**Files:**
- Create: `lib/trpc/routers/settings.ts`

**Step 1: Create settings router**

```typescript
import { z } from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../trpc";
import { prisma } from "@/lib/db";
import { TRPCError } from "@trpc/server";

/**
 * Settings router
 * Public settings access + admin management
 */
export const settingsRouter = createTRPCRouter({
  /**
   * Get public settings (accessible to all users)
   */
  public: protectedProcedure.query(async () => {
    const settings = await prisma.settings.findUnique({
      where: { id: "1" },
    });

    return {
      currency: settings?.currency ?? "INR",
      minRechargeAmount: settings?.minRechargeAmount?.toNumber() ?? 10,
      numberExpiryMinutes: settings?.numberExpiryMinutes ?? 20,
      minCancelMinutes: settings?.minCancelMinutes ?? 2,
      upiId: settings?.upiId,
      bharatpeQrImage: settings?.bharatpeQrImage,
    };
  }),

  /**
   * Update settings (admin only)
   */
  update: adminProcedure
    .input(
      z.object({
        currency: z.string().optional(),
        minRechargeAmount: z.number().optional(),
        numberExpiryMinutes: z.number().optional(),
        minCancelMinutes: z.number().optional(),
        upiId: z.string().optional(),
        bharatpeQrImage: z.string().optional(),
        bharatpeMerchantId: z.string().optional(),
        bharatpeToken: z.string().optional(),
        referralPercent: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const settings = await prisma.settings.upsert({
        where: { id: "1" },
        update: input,
        create: {
          id: "1",
          ...input,
        },
      });

      return settings;
    }),
});
```

**Step 2: Add settings router to root router**

Modify `lib/trpc/index.ts`:

```typescript
import { router as settingsRouter } from "./routers/settings";

export const appRouter = createTRPCRouter({
  // ... existing routers
  settings: settingsRouter,
});
```

**Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: No TypeScript errors.

**Step 4: Commit**

```bash
git add lib/trpc/routers/settings.ts lib/trpc/index.ts
git commit -m "feat(admin): add settings router for public and admin settings"
```

---

## Task 9: Test the Implementation

**Step 1: Build the application**

```bash
npm run build
```

Expected: Build succeeds without errors.

**Step 2: Start dev server**

```bash
npm run dev
```

**Step 3: Test scenarios manually**

Test 1: Buy number with sufficient balance
- Expected: Balance deducted immediately, number purchased, transaction created

Test 2: Try to buy with insufficient balance
- Expected: Error "Insufficient balance", no deduction

Test 3: Wait for SMS on purchased number
- Expected: SMS displayed, balance stays deducted

Test 4: Let number expire without SMS
- Expected: Auto-refund, balance restored, refund transaction created

Test 5: Cancel number within minCancelMinutes
- Expected: Error "Cannot cancel within X minutes"

Test 6: Cancel number after minCancelMinutes
- Expected: Success, balance refunded

Test 7: Deposit with same UTR twice
- Expected: Second attempt fails with "UTR already used"

Test 8: Check navbar balance
- Expected: Shows real balance in INR, updates automatically

**Step 4: Run linting**

```bash
npm run lint
```

Expected: No linting errors.

**Step 5: Commit**

```bash
git commit -m "test: verified payment system implementation"
```

---

## Summary

This implementation provides:

1. **Atomic Balance Deduction:** Balance is deducted before provider API call
2. **Auto-Refund:** Numbers that expire without SMS are automatically refunded
3. **Duplicate Prevention:** UTR uniqueness enforced at database level
4. **Real-time Balance:** Navbar shows actual wallet balance from tRPC
5. **Proper Transactions:** All deposits, purchases, and refunds are tracked

---

## Notes for Implementation

- All wallet operations use Prisma transactions for atomicity
- `balanceDeducted` flag prevents double refunds
- UTR unique constraint provides dual protection (app + DB level)
- Balance displayed in INR (₹) format
- Auto-refund happens when SMS not received within expiry time
