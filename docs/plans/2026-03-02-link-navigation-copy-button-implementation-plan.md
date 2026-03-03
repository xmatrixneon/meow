# Link Navigation + Copy Button Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace useRouter with Next.js Link for all navigation, add copy green button next to phone number in NumberCard.

**Architecture:** Remove useRouter hook, use Link component for navigation, add green copy icon in card header.

**Tech Stack:** Next.js 16, Link from next/link, Framer Motion

---

## Task 1: Update Homepage Navigation (app/page.tsx)

**Files:**
- Modify: `app/page.tsx`

**Step 1: Remove useRouter import**

Remove from imports:
```tsx
import { useRouter } from "next/navigation";
```

**Step 2: Add Link import**

Add to imports:
```tsx
import Link from "next/link";
```

**Step 3: Remove router declaration**

Remove:
```tsx
const router = useRouter();
```

**Step 4: Replace RecentNumberCard click navigation**

Change from:
```tsx
<motion.div onClick={() => router.push("/numbers")}>
```

To:
```tsx
<Link href="/numbers">
  <motion.div>
```

Close with `</motion.div></Link>`

**Step 5: Replace "View All" button**

Change from:
```tsx
<button type="button" onClick={() => router.push("/numbers")}>
```

To:
```tsx
<Link href="/numbers" className="...">
```

---

## Task 2: Update Numbers Page Navigation (app/numbers/page.tsx)

**Files:**
- Modify: `app/numbers/page.tsx`

**Step 1: Remove useRouter import**

Remove from imports:
```tsx
import { useRouter } from "next/navigation";
```

**Step 2: Add Link import**

Add to imports:
```tsx
import Link from "next/link";
```

**Step 3: Remove router declaration**

Remove:
```tsx
const router = useRouter();
```

**Step 4: Replace "Get New Number" button**

Change from:
```tsx
<motion.button onClick={() => router.push("/")}>
```

To:
```tsx
<Link href="/" className="...">
```

**Step 5: Remove window.location.href from buy mutation**

Remove:
```tsx
window.location.href = "/";
```

---

## Task 3: Add Copy Green Icon Next to Phone Number (app/numbers/page.tsx)

**Files:**
- Modify: `app/numbers/page.tsx` - NumberCard component

**Step 1: Add copyNumber function (if not exists)**

```tsx
const copyNumber = () => {
  navigator.clipboard.writeText(item.number);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
};
```

**Step 2: Update number display section**

Add copy icon next to phone number:

```tsx
<div className="flex items-center gap-1.5">
  <span className="font-bold text-sm text-foreground font-mono">
    {item.number}
  </span>
  {/* Copy green icon */}
  <motion.button
    whileTap={{ scale: 0.92 }}
    type="button"
    onClick={copyNumber}
    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-green-500/80 hover:text-green-500 transition-colors"
  >
    <Copy size={13} />
  </motion.button>
  {item.code && (
    <span className="text-xs font-mono font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded">
      {item.code}
    </span>
  )}
</div>
```

---

## Task 4: Build and Test

**Files:**
- None (validation)

**Step 1: Run build**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors

**Step 2: Run lint**

```bash
npm run lint
```

Expected: No new linting errors

---

## Remember

- Wrap Link content properly with motion.div for animations
- Copy icon should use green color `text-green-500/80 hover:text-green-500`
- Use `whileTap={{ scale: 0.92 }}` on copy button
- Remove all `useRouter` and `router` references
- Test navigation in both pages
