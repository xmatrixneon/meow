# Wallet Page Simplification Design

**Goal:** Remove unnecessary payment method UI from wallet page and fix transaction history link.

## Changes Required

### 1. Wallet Page (`/wallet/page.tsx`)

#### Remove Elements:
- "Card / Bank" button from "Add Funds" grid (lines 245-261)
- "Payment Methods" row from "Manage" section (lines 283-291)
- "Add Funds" row from "Manage" section (lines 274-282) - redundant with top UPI button

#### Modify:
- Change "Transaction History" navigation from `/history` to `/transcations` (line 299)

#### Keep:
- Balance hero section
- "UPI" button in "Add Funds" section (opens deposit dialog)
- "Transaction History" row in Manage section (with corrected link)
- "Redeem Promo Code" row in Manage section
- Recent transactions list

### 2. Deposit Dialog (`/components/deposit-dialog.tsx`)

No changes needed - already has:
- QR code display (when configured)
- UPI ID display with copy button
- Responsive design

## Updated Layout

```
┌─────────────────────────────────────────────┐
│           Balance Hero                      │
│         ₹100.00 · INR                     │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Add Funds                               │
│  ┌───────────┐                          │
│  │           │  UPI                      │
│  │    ₹      │  INSTANT                 │
│  └───────────┘                          │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Manage                                  │
│  Transaction History   [→]               │
│  Redeem Promo Code    [→]               │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Recent Transactions                     │
│  • DEPOSIT  +₹100.00                 │
│  • PURCHASE -₹5.00                   │
└─────────────────────────────────────────────┘
```

## Files to Modify

- `/app/wallet/page.tsx` - Remove UI elements and fix link
