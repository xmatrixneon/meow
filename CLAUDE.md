# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
npm run dev          # Start development server on localhost:3000
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npx tsx scripts/fetch.ts  # Run SMS poller (background process)
```

## Database / Prisma

The project uses Prisma with PostgreSQL (Neon).

```bash
# Generate Prisma client (outputs to app/generated/prisma/)
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Open Prisma Studio for database inspection
npx prisma studio

# Reset database (destructive)
npx prisma migrate reset
```

The Prisma client is generated to `app/generated/prisma/` (not the default location).

### Database Connection (`lib/db.ts`)
- Uses **PostgreSQL connection pool** with `@prisma/adapter-pg`
- **Important**: Both Pool and PrismaClient are cached globally to prevent connection leaks during development hot reloads
- Pool configuration: max 10 connections, 30s idle timeout, 5s connection timeout
- Exports default `prisma` instance for use throughout the app

## Authentication Architecture

This is a **Telegram Mini App** using Better Auth for authentication.

### Server-side Auth (`lib/auth.ts`)
- Configures `better-auth` with Prisma adapter
- Integrates `better-auth-telegram` plugin
- Uses Telegram Bot credentials from environment variables
- Requires `BETTER_AUTH_URL` or `NEXT_PUBLIC_APP_URL` to be set
- Uses custom PostgreSQL adapter (`@prisma/adapter-pg`) with a connection pool
- Cookie prefix: `meowsms_` (e.g., `meowsms_session_token`)
- Session: 7-day expiry, extends after 1 day of activity, 5-min cookie cache

### User Bootstrap (`lib/auth.ts`)
When a new user is created, `bootstrapUser()` runs asynchronously (via `setImmediate`) to create:
- **Wallet**: Initial balance of 0
- **UserData**: Status set to ACTIVE
- **UserApi**: Auto-generated 32-char API key

This is idempotent (uses upserts) and non-blocking. Layer 2 upserts in stubs/wallet routes provide fallback repair.

### Client-side Auth (`lib/auth-client.ts`)
- Creates auth client with `better-auth/react`
- Includes `telegramClient()` plugin from `better-auth-telegram/client`
- Exports `authClient` with methods like `signInWithMiniApp()`, `getSession()`, `signOut()`
- Uses `credentials: "include"` for cookie-based sessions

### API Route (`app/api/auth/[...all]/route.ts`)
- Uses `toNextJsHandler(auth.handler)` to handle auth requests

### Mini App Integration (`providers/telegram-auth-provider.tsx`)
- Uses `@telegram-apps/sdk-react` with `useRawInitData()` hook for Telegram SDK access
- Implements state machine with reducer: `loading` → `authenticated`/`unauthenticated`/`error`
- Auto-signs in via `authClient.signInWithMiniApp(initData)` on mount
- Checks existing session first, validates against current Telegram user
- Handles session mismatch by signing out and re-authenticating
- Provides `useTelegramAuth()` hook via context for consuming auth state
- Runs once per session using `useRef` guard
- Shows progress UI during authentication flow

### Auth Hook (`hooks/use-telegram-auth.ts`)
- Exports `TelegramAuthContext` and `useTelegramAuth()` hook
- Provides typed access to: `state`, `user`, `error`, `isAuthenticated`, `isLoading`, `retry`, `signOut`

### Required Environment Variables
```env
DATABASE_URL=              # PostgreSQL connection string
BETTER_AUTH_SECRET=        # Secret for Better Auth
TELEGRAM_BOT_TOKEN=        # Your Telegram bot token
TELEGRAM_BOT_USERNAME=     # Your Telegram bot username
BETTER_AUTH_URL=           # Auth base URL (e.g., ngrok URL)
NEXT_PUBLIC_APP_URL=       # Public app URL
```

## Database Schema

The schema is defined in `prisma/schema.prisma`:

### Core Auth Models
- **User**: Stores user profile with Telegram-specific fields (telegramId, telegramUsername, firstName, lastName, photoUrl, isPremium, etc.)
- **Account**: OAuth accounts (type="oauth", providerId="telegram")
- **Session**: User sessions
- **Verification**: Email verification tokens

### Wallet & Payments
- **Wallet**: User wallet with balance, totalSpent, totalOtp, totalRecharge (CHECK constraints enforce non-negative values)
- **Transaction**: Transaction history with type (DEPOSIT, PURCHASE, REFUND, PROMO, REFERRAL, ADJUSTMENT), status (PENDING, COMPLETED, FAILED), and dedup keys (txnId, refundOrderId)

### Phone Number Services
- **ActiveNumber**: Purchased phone numbers with status (PENDING/COMPLETED/CANCELLED), activeStatus (ACTIVE/CLOSED), expiresAt, price, smsContent, balanceDeducted flag
- **Service**: Available services with basePrice, iconUrl, per-server pricing
- **OtpServer**: OTP providers with country data, api credentials linkage
- **ApiCredential**: API credentials for OTP providers (note: apiKey stored in DB - rotate via admin panel, never commit)

### Discounts & Pricing
- **Promocode**: Discount codes with maxUses, usedCount, isActive
- **PromocodeHistory**: User promocode usage tracking
- **CustomPrice**: Per-user per-service custom pricing (FLAT/PERCENT discount types)

### User Management
- **UserData**: Extended user data with status (ACTIVE/BLOCKED/SUSPENDED), apiCalls, lastApiCall
- **UserApi**: API access for users with apiKey, rateLimit, refreshCount
- **UserApiRefreshLog**: Rate limiting for API key refreshes
- **UserAuditLog**: Audit trail with target user, admin performer, action, changes, reason

### Configuration
- **Settings**: Global app settings (bharatpeMerchantId, bharatpeToken, bharatpeQrImage, upiId, minRechargeAmount, maxRechargeAmount, numberExpiryMinutes, minCancelMinutes, currency, maintenanceMode, referralPercent, telegramHelpUrl, telegramSupportUsername, apiDocsBaseUrl)

### Important Schema Notes
- **Non-negative constraints**: Wallet and ActiveNumber fields have DB CHECK constraints (see migration: `add_wallet_check_constraints.sql`)
- **UserStatus enum**: Use the enum (ACTIVE/BLOCKED/SUSPENDED) for status checks - never raw strings
- **Indexes**: Key indexes exist for performance (e.g., `[userId, status]`, `[activeStatus, expiresAt]`, `[orderId, userId]`)
- **Cascade deletes**: Users cascade to their accounts, sessions, wallets, and related data

## tRPC Architecture

The project uses **tRPC** with **React Query** for type-safe API communication.

### Server-side tRPC (`lib/trpc/trpc.ts`)
- **Context**: Created with `createTRPCContext()` - extracts session from Better Auth cookies
- **Procedures**: `publicProcedure` (no auth), `protectedProcedure` (requires authenticated user)
- **Transformer**: Uses `superjson` for automatic serialization (Date, BigInt, Map, Set, undefined preserved)
- **Error handling**: Formats Zod errors with flattened output
- **Both client and server must use the same transformer** - superjson is configured in both `trpc.ts` (server) and `provider.tsx` (client)

### tRPC Routers (`lib/trpc/routers/`)
- **_app.ts**: Main router merging all feature routers
- **service.ts**: Service/number provider operations
- **number.ts**: Active number management (purchase, cancel, get SMS)
- **wallet.ts**: Wallet operations (balance, transactions, deposits)
- **api-key.ts**: User API key management (with rate limiting)

### API Handler (`app/api/trpc/[trpc]/route.ts`)
- Uses `fetchRequestHandler` from `@trpc/server/adapters/fetch`
- Endpoint: `/api/trpc`

### Client-side tRPC (`lib/trpc/client.ts`)
- Exports `trpc` client created with `createTRPCReact<AppRouter>()`
- Integration with TanStack Query for caching and state management

### tRPC Provider (`lib/trpc/provider.tsx`)
- `TRPCProvider` component wraps the app with tRPC and React Query providers
- Configures `httpBatchLink` with superjson transformer
- Includes error handling for non-JSON responses
- QueryClient: 5-minute stale time, no refetch on window focus

### Usage Example
```tsx
import { trpc } from "@/lib/trpc/client";

// Client component
function MyComponent() {
  const { data, isLoading } = trpc.wallet.balance.useQuery();
  const { mutate } = trpc.wallet.deposit.useMutation();

  return <div>{data?.balance}</div>;
}
```

### Debug Mode
Set `DEBUG_TRPC=1` in `.env` to enable tRPC request logging in development.

## OTP Provider Client

The project includes an OTP provider client for communicating with external SMS/OTP APIs.

### Module (`lib/providers/`)
- **client.ts**: `OtpProviderClient` class for API communication
- **types.ts**: Type definitions and error messages
- **index.ts**: Exports client, types, and error messages

### Key Methods
- `getNumber(service, country)`: Purchase a phone number for receiving SMS
- `getStatus(id)`: Check SMS delivery status (WAITING/RECEIVED/CANCELLED)
- `setStatus(id, status)`: Update order status (cancel=8, finish=6, get next SMS=3)
- `getNextSms(id)`: Request another SMS for multi-SMS support
- `getBalance()`: Check upstream provider balance

### API Format
- Path: `/stubs/handler_api.php` (configurable via `apiPath`)
- Params: `api_key`, `action`, and action-specific parameters
- Response formats: Plain text with prefixes (e.g., `ACCESS_NUMBER:id:phone`)

### Error Handling
- Known error codes mapped via `OTP_ERROR_MESSAGES`
- Network errors return safe defaults (e.g., WAITING status) to avoid crashing pollers

## Infinite Scroll Pattern

The app uses cursor-based pagination for infinite scrolling on list pages.

### Server-side (tRPC Routers)
```typescript
// Cursor-based pagination schema
const historySchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional(), // ISO date string
});

// Query pattern
const items = await prisma.model.findMany({
  where: {
    userId,
    ...(cursor && { createdAt: { lt: new Date(cursor) } }),
  },
  orderBy: { createdAt: "desc" },
  take: limit + 1, // Fetch one extra to determine hasMore
});

// Return cursor for next page
let nextCursor: string | null = null;
if (items.length > limit) {
  items.pop(); // Remove extra item
  nextCursor = items[items.length - 1].createdAt.toISOString();
}
return { items, nextCursor };
```

### Client-side (React Components)
```typescript
// Use tRPC infinite query
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
  trpc.resource.listInfinite.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (page) => page.nextCursor }
  );

// Flatten pages
const items = useMemo(() =>
  data?.pages.flatMap((page) => page.items) ?? [],
[data]);

// Intersection Observer for auto-loading
const loadMoreRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    { threshold: 0.1, rootMargin: "100px" }
  );
  if (loadMoreRef.current) observer.observe(loadMoreRef.current);
  return () => observer.disconnect();
}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

// Sentinel element in JSX
<div ref={loadMoreRef}>
  {isFetchingNextPage && <Spinner />}
</div>
```

### Endpoints Using Infinite Scroll
- `wallet.transactionsInfinite`: Transaction history
- `number.getReceivedInfinite`: Completed numbers
- `number.getCancelledInfinite`: Cancelled numbers

## Rate Limiting

The project uses `rate-limiter-flexible` for API key refresh rate limiting (`lib/rate-limiter.ts`).

### API Key Refresh Limits
- **30-minute cooldown** between refreshes
- **3 refreshes per day**
- **10 refreshes per week**

### Helper Functions
- `getRefreshRateLimitInfo(userId)`: Returns `dailyRemaining`, `weeklyRemaining`, `cooldownRemainingMs`, `canRefresh`
- `consumeRefreshQuota(userId)`: Attempts to consume quota, returns `success` and `retryAfterMs` on failure

Uses in-memory store. For distributed systems, replace with `RateLimiterRedis`.

## SMS Content Utilities (`lib/sms.ts`)

Utilities for handling SMS content in ActiveNumber records.

### Functions
- `computeSmsUpdate(existing, newSms)`: Pure computation — parses existing smsContent (handles legacy string format and current array format), checks for duplicates, returns `{ added, updatedList }`. Callers persist the result.
- `appendSmsContent(numberId, newSms)`: DB read + write convenience wrapper. **IMPORTANT**: Call OUTSIDE of `prisma.$transaction` blocks to avoid isolation conflicts.

### SMS Format
```typescript
type SmsEntry = { content: string; receivedAt: string };
// Stored as JSON array in ActiveNumber.smsContent
```

## Sound Notifications (`lib/sound.ts`)

Client-side notification sound utilities.

- `preloadNotificationSound()`: Preloads `/notification.wav` into AudioContext
- `playNotificationSound()`: Plays notification if user hasn't disabled it (checks `localStorage.sms-sound-enabled`)

## Bot Integration

The project includes a **Telegram Bot** built with Grammy.

### SMS Poller (`scripts/fetch.ts`)
Background process that polls OTP providers for incoming SMS and handles auto-refunds.

**Key Responsibilities:**
- Polls active numbers for SMS delivery status (configurable via `POLL_INTERVAL` env var, default 5s)
- Handles multi-SMS support (requests additional SMS after first is received)
- Auto-refunds in three scenarios:
  - **expired**: Number timed out without receiving SMS
  - **provider_cancelled**: Provider explicitly cancelled the order
  - **buy_failed**: Ghost PENDING records (provider never responded, 5-min TTL)
- Closes completed numbers and notifies provider via `finishOrder`

**Refund Guards:**
- `balanceDeducted` flag prevents double-refunds from concurrent poller cycles
- `refundOrderId` unique constraint provides DB-level dedup
- Wallet fetched first — if missing, transaction rolls back and number stays open for retry

**Concurrency:**
- Guard flag prevents overlapping poll cycles
- `Promise.allSettled` ensures one failure doesn't abort processing of other numbers
- Clean shutdown on SIGINT/SIGTERM

### Bot Setup (`lib/bot.ts`)
- **Commands**: `/start` (opens mini app with welcome message), `/help` (help text)
- **Webhook**: Handled at `app/api/bot/route.ts`
- **Environment**: Uses `TELEGRAM_BOT_TOKEN` and `NEXT_PUBLIC_APP_URL` for web_app links

### Bot Flow
1. User opens bot in Telegram
2. `/start` command replies with photo and "Open MeowSMS" button
3. Button opens the mini app via `web_app: { url: APP_URL }`
4. Mini app handles authentication via TelegramAuthProvider

## Payment Integration

The project supports **BharatPe** payment integration.

### Payment Module (`lib/payments/`)
- **bharatpe.ts**: BharatPe client for transaction verification
- **Exports**: `BharatPeClient`, `createBharatPeClient`, types for transactions

### Configuration
- Settings stored in `Settings` table: `bharatpeMerchantId`, `bharatpeToken`, `bharatpeQrImage`, `upiId`

## Project Structure

```
app/                      # Next.js App Router
  api/auth/[...all]/      # Auth API handler (Better Auth)
  api/trpc/[trpc]/        # tRPC API handler
  api/bot/route.ts        # Grammy bot webhook
  api/stubs/handler_api.php/route.ts  # API stubs
  generated/prisma/       # Generated Prisma client (custom location)
  layout.tsx              # Root layout with TelegramAuthProvider
  page.tsx                # Home page
  numbers/                # Phone numbers management
  profile/                # User profile page
  wallet/                 # Wallet/balance page
  history/                # Transaction history
  error.tsx               # Error boundary
components/
  navbar.tsx              # Top navigation bar
  ui/                     # shadcn/ui components (auto-generated)
lib/
  auth.ts                 # Server-side Better Auth config
  auth-client.ts          # Client-side Better Auth client
  bot.ts                  # Grammy Telegram bot with /start, /help commands
  db.ts                   # Prisma client with PostgreSQL connection pool
  rate-limiter.ts         # API key refresh rate limiting
  sms.ts                  # SMS content utilities
  sound.ts                # Notification sound utilities
  telegram-web-app.ts     # Telegram WebApp helpers
  payments/               # Payment integration (BharatPe)
    bharatpe.ts           # BharatPe client and transaction verification
  providers/              # OTP provider client
    client.ts             # OtpProviderClient class
    types.ts              # Type definitions and error messages
  trpc/                   # tRPC setup and routers
    trpc.ts               # tRPC context, procedures, error formatter
    client.ts             # tRPC React client
    routers/              # tRPC route definitions
      _app.ts             # Main router merging all routers
      service.ts          # Service/OTP provider operations
      number.ts           # Phone number operations
      wallet.ts           # Wallet operations
      api-key.ts          # User API key management
  utils.ts                # Utility functions (cn for classnames)
types/
  index.ts                # TypeScript types (User, ExtendedSession, ERROR_CODES)
  auth.ts                 # Auth-specific types (AuthState, AuthError, TelegramAuthContextValue)
providers/
  index.tsx               # TRPCProvider wrapper
  telegram-auth-provider.tsx  # Auto-auth for Telegram Mini Apps
hooks/
  use-mobile.ts           # React hooks
  use-telegram-auth.ts    # Auth hook and context (useTelegramAuth)
scripts/
  fetch.ts                # SMS poller (background process)
prisma/
  schema.prisma           # Database schema
  migrations/             # Database migrations
```

## Next.js Configuration

- **Version**: Next.js 16.1.6
- **App Router**: Yes
- **allowedDevOrigins**: Includes ngrok domains for development
- **Path alias**: `@/*` maps to project root
- **Images**: Configured for Telegram domains (t.me, telegram.org)
- **Rewrites**: `/stubs/handler_api.php` → `/api/stubs/handler_api.php`

## Layout Structure

The root layout (`app/layout.tsx`) wraps the app with `TelegramAuthProvider`. The Telegram SDK (`@telegram-apps/sdk-react`) handles Telegram WebApp initialization automatically. The layout includes:
- Top navbar (fixed)
- Main content area (with padding for navbars)
- Bottom navigation bar (fixed)

## UI Components

The project uses shadcn/ui with:
- Radix UI primitives
- Tailwind CSS v4
- lucide-react icons
- Framer Motion for animations

Components in `components/ui/` are auto-generated - do not manually edit them.

## TypeScript Configuration

- Strict mode enabled
- JSX transform: `react-jsx`
- Includes `.mts` files

## Type Extensions (`types/index.ts`)

The project extends Better Auth's session types with Telegram fields:

```typescript
import type { auth } from "@/lib/auth";
type BaseSession = typeof auth.$Infer.Session;

export type User = BaseSession["user"] & {
  telegramId?: string | null;
  telegramUsername?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  // ... other Telegram fields
};
```

This pattern ensures type safety when accessing Telegram user properties from the session.

## Auth Types (`types/auth.ts`)

The auth types file defines the authentication state machine and context types:

```typescript
export type AuthState = 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'error';

export type AuthErrorCode = 'NO_INIT_DATA' | 'VALIDATION_FAILED' | 'NETWORK_ERROR' | 'SESSION_EXPIRED';

export interface AuthError {
  code: AuthErrorCode;
  message: string;
}

export interface TelegramAuthContextValue {
  state: AuthState;
  user: User | null;
  error: AuthError | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  retry: () => void;
  signOut: () => Promise<void>;
}
```

This pattern provides a type-safe state machine for authentication flows with clear error handling.

## Key Dependencies

### Framework & Core
- **Next.js** (16.1.6): React framework with App Router
- **React** (19.2.3): UI library
- **TypeScript** (5): Type safety

### Auth & Telegram
- **better-auth** (1.5.1): Authentication server
- **better-auth-telegram** (1.4.0): Telegram OAuth integration
- **@telegram-apps/sdk-react** (3.3.9): Telegram Mini App SDK
- **grammy** (1.40.0): Telegram bot framework

### API & Type Safety
- **@trpc/server** (11.10.0): End-to-end typesafe APIs
- **@trpc/react-query** (11.10.0): tRPC + TanStack Query integration
- **@tanstack/react-query** (5.90.21): Data fetching and caching
- **zod** (4.3.6): Schema validation
- **superjson** (2.2.6): tRPC data transformer for Date, BigInt, Map, Set serialization

### Database
- **prisma** (7.4.1): TypeScript ORM
- **@prisma/adapter-pg** (7.4.1): PostgreSQL adapter
- **pg** (8.18.0): PostgreSQL client for connection pool

### UI & Styling
- **Tailwind CSS** (v4): Utility-first CSS framework
- **shadcn** (3.8.5): Component system with Radix UI primitives
- **framer-motion** (12.34.3): Animation library
- **lucide-react** (0.575.0): Icon library

### Forms & Input
- **react-hook-form** (7.71.2): Form handling
- **@hookform/resolvers** (5.2.2): Form validation with zod

### Payments & Utilities
- **date-fns** (4.1.0): Date manipulation
- **nanoid** (5.1.6): ID generation
- **rate-limiter-flexible** (9.1.1): Rate limiting for API key refreshes
- **dotenv** (17.3.1): Environment variable loading for scripts

## Environment Variables

```env
# Database
DATABASE_URL=              # PostgreSQL connection string

# Better Auth
BETTER_AUTH_SECRET=        # Secret for Better Auth
BETTER_AUTH_URL=           # Auth base URL (e.g., ngrok URL)

# Telegram Bot
TELEGRAM_BOT_TOKEN=        # Your Telegram bot token
TELEGRAM_BOT_USERNAME=     # Your Telegram bot username

# App URLs
NEXT_PUBLIC_APP_URL=       # Public app URL

# Optional
DEBUG_TRPC=1               # Enable tRPC request logging in dev
POLL_INTERVAL=5000         # SMS poller interval in ms (default: 5000)
```
