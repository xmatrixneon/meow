# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
npm run dev          # Start development server on localhost:3000
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run seed:bharatpe # Seed BharatPe payment data (uses tsx)
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

### Client-side Auth (`lib/auth-client.ts`)
- Creates auth client with `better-auth/react`
- Includes `telegramClient()` plugin from `better-auth-telegram/client`
- Exports `authClient` with methods like `signInWithMiniApp()`, `getSession()`, `signOut()`
- Uses `credentials: "include"` for cookie-based sessions

### API Route (`app/api/auth/[...all]/route.ts`)
- Uses `toNextJsHandler(auth.handler)` to handle auth requests

### Mini App Integration (`providers/telegram-auth-provider.tsx`)
- Uses `@tma.js/sdk` with `init()` and `retrieveRawInitData()` for Telegram SDK access
- Implements state machine: `idle` → `loading` → `authenticated`/`unauthenticated`/`error`
- Auto-signs in via `authClient.signInWithMiniApp(initData)` on mount
- Checks existing session first, validates against current Telegram user
- Handles session mismatch by signing out and re-authenticating
- Provides `useTelegramAuth()` hook via context for consuming auth state
- Runs once per session using `useRef` guard

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
- **Transaction**: Transaction history (DEPOSIT, PURCHASE, REFUND, PROMO, REFERRAL, ADJUSTMENT) with dedup keys (txnId, refundOrderId)

### Phone Number Services
- **ActiveNumber**: Purchased phone numbers with status (PENDING/COMPLETED/CANCELLED), expiresAt, price, smsContent
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
- **Settings**: Global app settings (bharatpeMerchantId, minRechargeAmount, maxRechargeAmount, numberExpiryMinutes, currency, maintenanceMode, etc.)

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
- **Transformer**: Uses `superjson` for automatic serialization
- **Error handling**: Formats Zod errors with flattened output

### tRPC Routers (`lib/trpc/routers/`)
- **_app.ts**: Main router merging all feature routers
- **service.ts**: Service/number provider operations
- **number.ts**: Active number management (purchase, cancel, get SMS)
- **wallet.ts**: Wallet operations (balance, transactions, deposits)
- **apiKey.ts**: User API key management

### API Handler (`app/api/trpc/[trpc]/route.ts`)
- Uses `fetchRequestHandler` from `@trpc/server/adapters/fetch`
- Endpoint: `/api/trpc`

### Client-side tRPC (`lib/trpc/client.ts`)
- Exports `trpc` client created with `createTRPCReact<AppRouter>()`
- Integration with TanStack Query for caching and state management

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

## Bot Integration

The project includes a **Telegram Bot** built with Grammy.

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
- Settings stored in `Settings` table: `bharatpeMerchantId`, `bharatpeToken`, `bharatpeQrImage`
- Seed script: `npm run seed:bharatpe` to populate initial data

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
  transactions/           # Transaction history
  support/                # Support page
  error.tsx               # Error boundary
components/
  navbar.tsx              # Top navigation bar
  ui/                     # shadcn/ui components (auto-generated)
lib/
  auth.ts                 # Server-side Better Auth config
  auth-client.ts          # Client-side Better Auth client
  bot.ts                  # Grammy Telegram bot with /start, /help commands
  db.ts                   # Prisma client with PostgreSQL connection pool
  payments/               # Payment integration (BharatPe)
    bharatpe.ts           # BharatPe client and transaction verification
  trpc/                   # tRPC setup and routers
    trpc.ts               # tRPC context, procedures, error formatter
    client.ts             # tRPC React client
    routers/              # tRPC route definitions
      _app.ts             # Main router merging all routers
      service.ts          # Service/OTP provider operations
      number.ts           # Phone number operations
      wallet.ts           # Wallet operations
      apiKey.ts           # User API key management
  utils.ts                # Utility functions (cn for classnames)
types/
  index.ts                # TypeScript types (User, ExtendedSession, ERROR_CODES)
  auth.ts                 # Auth-specific types (AuthState, AuthError, TelegramAuthContextValue)
providers/
  telegram-auth-provider.tsx  # Auto-auth for Telegram Mini Apps
hooks/
  use-mobile.ts           # React hooks
  use-telegram-auth.ts    # Auth hook and context (useTelegramAuth)
prisma/
  schema.prisma           # Database schema
  migrations/             # Database migrations
  seed-bharatpe.ts        # BharatPe payment seed script
```

## Next.js Configuration

- **Version**: Next.js 16.1.6
- **App Router**: Yes
- **allowedDevOrigins**: Includes ngrok domains for development
- **Path alias**: `@/*` maps to project root
- **Images**: Configured for Telegram domains (t.me, telegram.org)
- **Rewrites**: `/stubs/handler_api.php` → `/api/stubs/handler_api.php`

## Layout Structure

The root layout (`app/layout.tsx`) wraps the app with `TelegramAuthProvider`. The TMA.js SDK (`@tma.js/sdk`) handles Telegram WebApp script loading automatically via its `init()` function, so no manual script tag is needed. The layout includes:
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
- **@tma.js/sdk-react** (3.0.16): Telegram Mini App SDK
- **grammy** (1.40.0): Telegram bot framework

### API & Type Safety
- **@trpc/server** (11.10.0): End-to-end typesafe APIs
- **@trpc/react-query** (11.10.0): tRPC + TanStack Query integration
- **@tanstack/react-query** (5.90.21): Data fetching and caching
- **zod** (4.3.6): Schema validation
- **superjson** (2.2.6): tRPC data transformer

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

# Optional Debug
DEBUG_TRPC=1               # Enable tRPC request logging in dev
```
