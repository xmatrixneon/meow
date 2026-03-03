# Telegram Mini App Authentication Design

**Date:** 2026-03-01
**Status:** Approved

## Overview

Redesign the Telegram Mini App authentication system to use TMA.js SDK properly with better-auth-telegram for secure, type-safe authentication.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (Browser)                        │
├─────────────────────────────────────────────────────────────┤
│  TelegramAuthProvider                                        │
│  ├── TMA.js SDK (init, useRawInitData)                      │
│  ├── AuthContext (state machine)                            │
│  │   ├── state: 'idle' | 'loading' | 'authenticated' |      │
│  │   │         'unauthenticated' | 'error'                  │
│  │   ├── user: User | null                                  │
│  │   ├── error: AuthError | null                            │
│  │   └── retry() => void                                    │
│  └── auto-auth on mount                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ POST /api/auth/telegram/miniapp/signin
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Server (Next.js)                        │
├─────────────────────────────────────────────────────────────┤
│  Better Auth + better-auth-telegram                         │
│  ├── Validates initData cryptographically                   │
│  ├── Checks auth_date freshness (maxAuthAge: 24h)           │
│  ├── Creates/updates user in database                       │
│  └── Sets HTTP-only session cookie (7 days)                 │
└─────────────────────────────────────────────────────────────┘
```

## Auth Flow

1. App loads → TMA.js SDK initializes via `init()`
2. TelegramAuthProvider mounts → Reads initData via `useRawInitData()`
3. Auto-auth triggers → Calls `authClient.signInWithMiniApp(initData)`
4. Server validates → better-auth-telegram validates signature + expiry
5. Session created → HTTP-only cookie set with 7-day expiry
6. State updates → Context provides user, isAuthenticated, etc.

## Design Decisions

### 1. Authentication Flow: Silent Auto-Auth
- Automatically authenticate on app load
- Seamless UX with strict server-side validation

### 2. Validation: Better-Auth Only
- Trust better-auth-telegram's built-in cryptographic validation
- Single point of validation, simpler architecture

### 3. Session Management: Secure with Refresh
- 7-day session expiry
- HTTP-only, secure cookies
- `sameSite: 'lax'`
- Refresh every 24 hours on activity

### 4. Error Handling: Graceful Degradation
- Toast notifications for errors
- Retry button available
- Limited app access during auth failure
- Clear error types for debugging

## State Machine

```
idle → loading → authenticated ✓
              → unauthenticated (no initData)
              → error (validation failed)

error → loading (retry)
```

## Error Types

| Code | Description | User Message |
|------|-------------|--------------|
| `NO_INIT_DATA` | Not running in Telegram | "Please open this app in Telegram" |
| `VALIDATION_FAILED` | Invalid signature/expired | "Session expired. Please reopen the app." |
| `NETWORK_ERROR` | Request failed | "Connection error. Please try again." |
| `SESSION_EXPIRED` | Session invalidated | "Session expired. Please reopen the app." |

## File Changes

### Modify
- `providers/telegram-auth-provider.tsx` - Rewrite using TMA.js SDK
- `lib/auth.ts` - Update session config
- `lib/auth-client.ts` - Minor cleanup
- `app/layout.tsx` - Initialize TMA.js SDK

### Create
- `hooks/use-telegram-auth.ts` - Auth hook
- `types/auth.ts` - Auth types

## Session Configuration

```typescript
session: {
  cookieCache: { enabled: true, maxAge: 300 }, // 5 min cache
  expiresIn: 60 * 60 * 24 * 7, // 7 days
  updateAge: 60 * 60 * 24, // Refresh every 24h
}
```

## Dependencies

Already installed:
- `@tma.js/sdk-react`: ^3.0.16
- `@tma.js/sdk`: 3.1.7 (transitive)
- `better-auth`: ^1.4.19
- `better-auth-telegram`: ^0.4.0
