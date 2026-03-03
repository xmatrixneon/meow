# Link Navigation + Copy Button Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace useRouter with Next.js Link for all navigation, add copy green button next to phone number in NumberCard.

**Architecture:** Remove useRouter hook, use Link component for navigation, add green copy icon in card header.

**Tech Stack:** Next.js 16, Link from next/link, Framer Motion

---

## Section 1: Navigation - Replace useRouter with Link

### Files to Modify:
- `app/page.tsx` (homepage)
- `app/numbers/page.tsx` (numbers page)

### Changes Required:

**app/page.tsx:**
1. Remove `useRouter` from `next/navigation`
2. Add `Link` from `next/link`
3. Replace `<button onClick={() => router.push("/numbers")}>` with `<Link href="/numbers">`
4. Remove `const router = useRouter()` declaration

**app/numbers/page.tsx:**
1. Remove `useRouter` from `next/navigation`
2. Add `Link` from `next/link`
3. Replace "Get New Number" button with `<Link href="/">`
4. Replace `window.location.href = "/"` in buy mutation with `router.push("/")` (or use Link directly)
5. Remove `const router = useRouter()` declaration

---

## Section 2: Number Card - Add Copy Button Next to Phone Number

### Location: `app/numbers/page.tsx` - NumberCard component

### Current Layout:
```
[Flag] [Phone Number + OTP Badge] [Copy/Refresh/Cancel (bottom)]
```

### New Layout:
```
[Flag] [Phone Number] [Copy Icon] [OTP Badge] [Refresh/Cancel (bottom)]
```

### Implementation Details:

**Add Copy Button Next to Phone Number:**

```tsx
{/* Copy green icon next to phone number */}
<motion.button
  whileTap={{ scale: 0.92 }}
  type="button"
  onClick={copyNumber}
  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-green-500 hover:text-green-600 transition-colors"
>
  <Copy size={14} />
</motion.button>
```

**Updated Number + Copy + Badge Section:**

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
  {/* OTP Badge */}
  {item.code && (
    <span className="text-xs font-mono font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded">
      {item.code}
    </span>
  )}
</div>
```

---

## Section 3: Import Changes

### Remove:
```tsx
import { useRouter } from "next/navigation";
```

### Add:
```tsx
import Link from "next/link";
```

---

## Files to Modify

| File | Changes |
|-------|----------|
| `app/page.tsx` | Remove useRouter, add Link, replace navigation buttons |
| `app/numbers/page.tsx` | Remove useRouter, add Link, add copy icon next to phone, replace navigation |

---

## Success Criteria

- ✅ All navigation uses Next.js Link component
- ✅ useRouter removed from both pages
- ✅ Green copy icon appears next to phone number in NumberCard
- ✅ Copy icon has proper tap animation
- ✅ Copy functionality works (copies phone number)
- ✅ Build passes TypeScript checks
- ✅ No hydration errors
