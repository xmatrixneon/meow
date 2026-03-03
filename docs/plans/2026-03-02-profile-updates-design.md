# Profile Page Updates - Design Document

> **Date:** 2026-03-02
> **For Claude:** Use `superpowers:executing-plans` to implement this plan.

## Goal

Update profile page to show real wallet stats, remove Account section, add Developer section with API key/docs, and convert Support/Terms to dialogs with Telegram support URL setting.

---

## Architecture Overview

```
Profile Page (app/profile/page.tsx)
    │
    ├── Hero Section (Real Stats from Wallet DB)
    │   ├── Numbers Purchased (wallet.totalOtp)
    │   ├── Total Spent (wallet.totalSpent in INR)
    │   └── Total Recharged (wallet.totalRecharge in INR)
    │
    ├── Developer Section
    │   └── API Key → Opens API Docs Dialog
    │
    └── Support Section
        ├── Help & FAQ → Opens Support Dialog
        └── Terms & Privacy → Opens Legal Dialog
```

---

## Section 1: Database Schema Changes

### Settings Model Addition

```prisma
model Settings {
  // ... existing fields
  telegramHelpUrl  String?  // URL to Telegram support chat
}
```

### Migration Required
Run `npx prisma migrate dev --name add_telegram_help_url` to add this field.

---

## Section 2: Profile Page Changes

### Layout Changes

**Removed:**
- Account section (Personal Info, Email, Wallet & Billing rows)

**Added:**
- Developer section with API Key row

### Stats Section (Hero)

Connected to real Wallet data:
- `trpc.wallet.stats.useQuery()` → returns `{ totalOtp, totalSpent, totalRecharge }`
- Display values formatted in INR: `₹100.00`

### New Sections

```
┌─────────────────────────────┐
│ Developer                 │
│ • API Key: 7910804076   │  → Opens API Docs dialog
└─────────────────────────────┘

┌─────────────────────────────┐
│ Support                   │
│ • Help & FAQ             │  → Opens Support dialog
│ • Terms & Privacy        │  → Opens Legal dialog
└─────────────────────────────┘
```

---

## Section 3: New Dialog Components

### 1. Support Dialog (`components/support-dialog.tsx`)

Features:
- FAQ accordion (from current `/support` page)
- "Contact on Telegram" button (opens `settings.telegramHelpUrl`)
- "Contact Support" button (placeholder or mailto)

Props interface:
```typescript
interface SupportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  telegramHelpUrl?: string | null;
}
```

### 2. Legal Dialog (`components/legal-dialog.tsx`)

Features:
- Tabs for "Terms of Service" and "Privacy Policy"
- Hardcoded content for each
- Scrollable content area

Props interface:
```typescript
interface LegalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

### 3. API Docs Dialog (`components/api-docs-dialog.tsx`)

Features:
- API Key display (user's Telegram ID) with copy button
- API Endpoint documentation:
  - `GET /api/stubs/handler_api.php?action=getNumber`
  - `GET /api/stubs/handler_api.php?action=getStatus`
  - `GET /api/stubs/handler_api.php?action=setStatus`
- Request/Response examples
- Error codes table (BAD_KEY, NO_BALANCE, etc.)

Props interface:
```typescript
interface ApiDocsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string;  // User's Telegram ID
}
```

---

## Section 4: Backend API Changes

### Wallet Router Addition

Add `stats` procedure to `lib/trpc/routers/wallet.ts`:

```typescript
wallet.stats: publicProcedure.query(async ({ ctx }) => {
  const wallet = await ctx.prisma.wallet.findUnique({
    where: { userId: ctx.user.id },
  });
  return {
    totalOtp: wallet?.totalOtp ?? 0,
    totalSpent: wallet?.totalSpent ?? new Decimal(0),
    totalRecharge: wallet?.totalRecharge ?? new Decimal(0),
  };
});
```

### Settings Router Update

Update `admin.settings.update` to accept `telegramHelpUrl`.

Add public settings query (already exists: `service.settings`) to include `telegramHelpUrl`.

---

## Section 5: Admin Settings UI

The admin panel will be able to set `telegramHelpUrl` via:
- `admin.settings.update({ telegramHelpUrl: "https://t.me/your_support_chat" })`

---

## Component Dependencies

```
components/support-dialog.tsx
    ├── Dialog (radix-ui)
    ├── Accordion (existing)
    └── ExternalLink (lucide-react)

components/legal-dialog.tsx
    ├── Dialog (radix-ui)
    └── Tabs (existing)

components/api-docs-dialog.tsx
    ├── Dialog (radix-ui)
    ├── ScrollArea (existing)
    └── Copy/Check icons (lucide-react)
```

---

## Data Flow

```
Profile Page mounts
    ↓
trpc.wallet.stats() → { totalOtp: 5, totalSpent: 50, totalRecharge: 100 }
    ↓
Render stats: "5" | "₹50.00" | "₹100.00"

User clicks "API Key"
    ↓
Open ApiDocsDialog with user's Telegram ID

User clicks "Help & FAQ"
    ↓
Open SupportDialog with telegramHelpUrl from settings

User clicks "Terms & Privacy"
    ↓
Open LegalDialog with hardcoded content
```

---

## Implementation Order

1. Database migration for `telegramHelpUrl`
2. Add `wallet.stats` tRPC procedure
3. Create Support Dialog component
4. Create Legal Dialog component
5. Create API Docs Dialog component
6. Update Profile Page:
   - Remove Account section
   - Update stats to use real data
   - Add Developer section
   - Wire up all dialogs
7. Update admin.settings router for telegramHelpUrl

---

## Edge Cases

- User has no wallet → Show "0" for all stats
- telegramHelpUrl not set → Hide "Contact on Telegram" button
- Copy to clipboard fails → Show fallback toast
- Dialog content overflow → Use ScrollArea component

---

## Success Criteria

- Profile shows real wallet stats (numbers, spent, recharged)
- Account section removed
- Developer section with API key added
- Help & FAQ opens in dialog
- Terms & Privacy opens in dialog
- Support dialog shows "Contact on Telegram" if URL configured
- All dialogs accessible via profile page
- Build passes with no errors
