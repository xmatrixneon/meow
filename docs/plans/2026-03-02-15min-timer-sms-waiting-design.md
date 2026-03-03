# 15-Minute Order Timer with SMS Display in Waiting Tab - Design

**Date:** 2026-03-02
**Status:** Approved

## Overview

This design changes the order lifecycle to:
1. Use a 15-minute order timer (instead of 20 minutes)
2. Keep SMS-received numbers in "Waiting" tab for the full 15 minutes
3. Only move numbers to "Received" tab after the 15-minute period expires

## Problem Statement

### Current Issues

1. **Order time is 20 minutes instead of 15**
   - Schema: `numberExpiryMinutes Int @default(20)`
   - External API: Hardcoded `20 * 60 * 1000`

2. **SMS received moves number to "Received" tab immediately**
   - When SMS is received, status changes to `COMPLETED`
   - Number appears in "Received" tab, losing visibility in "Waiting" tab
   - User cannot see the countdown for remaining time

### User Requirements

- Order time: **15 minutes**
- SMS received → Stay in **Waiting** tab (show SMS, show countdown)
- After 15 minutes → Move to **Received** tab (if SMS was received)
- After 15 minutes without SMS → Auto-refund to **Cancelled** tab

## Analysis: OTP Mart Implementation

OTP Mart uses two separate status fields to handle this:

### Status Fields

| Field | Values | Meaning |
|--------|---------|----------|
| `active_status` | '1' = Closed, '2' = Active | Controls UI: shows in Waiting vs History |
| `status` | '1' = Completed, '3' = Cancelled | Final outcome |

### Key Logic

1. **15-minute timer**: `define('MAX_LIFETIME', 15 * 60);`

2. **SMS does NOT change status**:
   ```php
   // When SMS received, only update sms_text
   UPDATE active_number SET sms_text = '$sms'
   // active_status remains '2' (active)
   ```

3. **Auto-close after 15 minutes**:
   ```php
   if ($total_elapsed >= MAX_LIFETIME) {
       UPDATE active_number
       SET active_status='1', status='1'  // Mark completed
   }
   ```

4. **Query for Waiting tab**:
   ```php
   SELECT * FROM active_number
   WHERE user_id = ? AND active_status = '2'
   ```

## Proposed Solution

### Architecture

Add `active_status` field to separate UI display (waiting vs history) from final outcome (completed vs cancelled).

### Database Schema Changes

```prisma
enum ActiveStatus {
  ACTIVE   // Shows in "Waiting" tab
  CLOSED    // Shows in "Received" or "Cancelled" tab
}

model ActiveNumber {
  // ... existing fields

  active_status ActiveStatus @default(ACTIVE)  // NEW
  status       NumberStatus   @default(PENDING) // Keep existing
}
```

### Settings Update

```prisma
model Settings {
  numberExpiryMinutes Int @default(15)  // Was 20
  // ... other fields
}
```

### Status Flow

| Time | Event | active_status | status | Tab |
|------|--------|---------------|---------|------|
| 0:00 | Purchase | ACTIVE | PENDING | Waiting |
| 0:30 | SMS received | ACTIVE | PENDING | Waiting (SMS visible) |
| 5:00 | Still active | ACTIVE | PENDING | Waiting |
| 15:00 | Time expired + SMS | CLOSED | COMPLETED | Received |
| 15:00 | Time expired + NO SMS | CLOSED | CANCELLED | Cancelled (refunded) |

### Query Logic

| Tab | Query Condition |
|-----|----------------|
| Waiting | `active_status = ACTIVE` (regardless of SMS) |
| Received | `active_status = CLOSED AND status = COMPLETED` |
| Cancelled | `active_status = CLOSED AND status = CANCELLED` |

## Implementation Files

| File | Changes |
|-------|----------|
| prisma/schema.prisma | Add `active_status` enum, add field to ActiveNumber, change numberExpiryMinutes to 15 |
| lib/trpc/routers/number.ts | Use active_status for tab queries, keep status for outcome |
| app/numbers/page.tsx | Update logic to use active_status |
| app/api/stubs/handler_api.php/route.ts | Add active_status logic, use Settings for expiry |

## Benefits

1. ✅ 15-minute order timer as required
2. ✅ SMS visible in "Waiting" tab for full 15 minutes
3. ✅ Clear countdown display
4. ✅ Proper separation of UI state (waiting) vs final outcome
5. ✅ Admin can configure timer via Settings

## Risks & Mitigations

| Risk | Mitigation |
|-------|------------|
| Database migration for new field | Use Prisma migrate, add default value |
| Existing data with wrong active_status | Migration to set correct values based on current status |
| External API compatibility | Update stubs API to use new field |

---

**Status:** Ready for implementation → invoke writing-plans skill
