# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
npm run dev          # Start development server on localhost:3000
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
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

- **User**: Stores user profile with Telegram-specific fields (telegramId, telegramUsername, firstName, lastName, photoUrl, isPremium, etc.)
- **Account**: OAuth accounts (type="oauth", providerId="telegram")
- **Session**: User sessions
- **Verification**: Email verification tokens

## Project Structure

```
app/                      # Next.js App Router
  api/auth/[...all]/      # Auth API handler
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
```

## Next.js Configuration

- **Version**: Next.js 16.1.6
- **App Router**: Yes
- **allowedDevOrigins**: Includes ngrok domains for development
- **Path alias**: `@/*` maps to project root
- **Images**: Configured for Telegram domains (t.me, telegram.org)

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
