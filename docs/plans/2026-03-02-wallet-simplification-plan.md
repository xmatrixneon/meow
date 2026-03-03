# Wallet Page Simplification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify wallet page by removing unnecessary payment method UI and fixing the transaction history link.

**Architecture:** Remove redundant UI elements from wallet page, fix navigation link to transaction page. Deposit dialog already has all required features.

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind CSS, Framer Motion, lucide-react icons

---

### Task 1: Remove Card/Bank button from Add Funds section

**Files:**
- Modify: `app/wallet/page.tsx:245-261`

**Step 1: Remove the Card/Bank button from the grid**

Delete the second `motion.button` in the "Add Funds" grid (lines 245-261). This removes the "Card / Bank" payment method option.

After removal, the grid should only contain the UPI button:
```tsx
<div className="grid grid-cols-1 gap-3">
  <motion.button
    {...fadeUp(0.06)}
    whileTap={{ scale: 0.96 }}
    type="button"
    onClick={() => setDepositOpen(true)}
    className={cn(
      "flex flex-col items-center gap-2 py-4 bg-card border border-border rounded-2xl transition-colors duration-200 hover:border-amber-500/30"
    )}
  >
    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500/10">
      <IndianRupee size={20} strokeWidth={2} className="text-amber-500" />
    </div>
    <div className="text-center">
      <p className="text-sm font-semibold text-foreground">UPI</p>
      <p className="text-[10px] text-muted-foreground">INSTANT</p>
    </div>
  </motion.button>
</div>
```

**Step 2: Remove unused Banknote icon import**

Remove `Banknote` from the lucide-react imports at the top of the file (line 10).

**Step 3: Test**

Run: `npm run build`
Expected: Build succeeds without TypeScript errors

**Step 4: Commit**

```bash
git add app/wallet/page.tsx
git commit -m "refactor(wallet): remove Card/Bank payment method button"
```

---

### Task 2: Remove Payment Methods row from Manage section

**Files:**
- Modify: `app/wallet/page.tsx:283-291`

**Step 1: Remove the Payment Methods ActionRow**

Delete the entire "Payment Methods" ActionRow component from the Manage section (lines 283-291).

**Step 2: Remove unused CreditCard icon import**

Remove `CreditCard` from the lucide-react imports at the top of the file (line 8).

**Step 3: Test**

Run: `npm run build`
Expected: Build succeeds without TypeScript errors

**Step 4: Commit**

```bash
git add app/wallet/page.tsx
git commit -m "refactor(wallet): remove Payment Methods row from Manage section"
```

---

### Task 3: Remove Add Funds row from Manage section

**Files:**
- Modify: `app/wallet/page.tsx:274-282`

**Step 1: Remove the Add Funds ActionRow**

Delete the "Add Funds" ActionRow from the Manage section (lines 274-282). This is redundant since we have the UPI button at the top.

**Step 2: Remove unused Plus icon import**

Remove `Plus` from the lucide-react imports at the top of the file (line 8).

**Step 3: Test**

Run: `npm run build`
Expected: Build succeeds without TypeScript errors

**Step 4: Commit**

```bash
git add app/wallet/page.tsx
git commit -m "refactor(wallet): remove redundant Add Funds row from Manage section"
```

---

### Task 4: Fix Transaction History link

**Files:**
- Modify: `app/wallet/page.tsx:299`

**Step 1: Update navigation path**

Change the Transaction History row's onClick from `/history` to `/transcations`:

```tsx
<ActionRow
  icon={History}
  iconColor="text-violet-500"
  iconBg="bg-violet-500/10"
  title="Transaction History"
  subtitle="View all past transactions"
  delay={0.22}
  onClick={() => handleNav("/transcations")}
/>
```

**Step 2: Test**

Run: `npm run build`
Expected: Build succeeds without TypeScript errors

**Step 3: Commit**

```bash
git add app/wallet/page.tsx
git wallet commit -m "fix(wallet): link Transaction History to /transcations page"
```

---

### Task 5: Verify UI and test deposit flow

**Files:**
- Test: Manual UI verification

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Verify wallet page layout**

1. Navigate to `/wallet`
2. Verify only "UPI" button shows in "Add Funds" section
3. Verify "Payment Methods" row is removed from Manage section
4. Verify "Add Funds" row is removed from Manage section
5. Verify "Transaction History" navigates to `/transcations`
6. Verify "Redeem Promo Code" still opens promo dialog

**Step 3: Test deposit dialog**

1. Click "UPI" button
2. Verify deposit dialog opens
3. Verify UPI ID is displayed with copy button
4. Verify copy button works (click and check clipboard)
5. Verify QR code displays (if configured in settings)
6. Enter a test UTR and verify form validation works

**Step 4: Verify responsive design**

Resize browser to mobile width (375px) and verify:
- Deposit dialog fits on screen
- All buttons are tappable
- Text is readable

**Step 5: Commit final changes if any**

```bash
git add .
git commit -m "chore: wallet simplification complete"
```

---

## Summary of Changes

1. ✅ Removed "Card / Bank" button from Add Funds section
2. ✅ Removed "Payment Methods" row from Manage section
3. ✅ Removed redundant "Add Funds" row from Manage section
4. ✅ Fixed Transaction History link to point to `/transcations`
5. ✅ Deposit dialog already has UPI ID copy button and responsive design

**Result:** Simplified wallet page with only UPI payment method and direct access to full transaction history.
