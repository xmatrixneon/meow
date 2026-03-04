# Standalone Admin App Design

**Date:** 2026-03-04
**Status:** Approved
**Purpose:** Create a standalone Next.js admin application for managing the meowsms virtual number service

---

## Overview

A separate Next.js application for admin functionality that connects to the same PostgreSQL database as the main Telegram Mini App. This provides a clean separation of concerns, independent deployment, and allows admins to access the panel via regular web browser (not requiring Telegram).

**Key Goals:**
- Browser-based admin access (no Telegram Mini App requirement)
- Email/password authentication via Better Auth
- Flag-based admin access control (`isAdmin = true` in database)
- Independent deployment to Vercel
- Reuse existing database schema and business logic

---

## Architecture

### Application Structure

```
meowsms/                          # Main Mini App (existing)
  ├── prisma/
  │   └── schema.prisma           # Shared schema
  ├── lib/
  │   ├── auth.ts                 # Telegram auth (Mini App)
  │   └── trpc/
  │       └── routers/
  └── ...

meowsms-admin/                   # NEW: Standalone Admin App
  ├── app/
  │   ├── (auth)/
  │   │   ├── login/
  │   │   │   └── page.tsx
  │   │   └── signup/
  │   │       └── page.tsx
  │   ├── (dashboard)/
  │   │   ├── dashboard/
  │   │   │   └── page.tsx       # Stats overview
  │   │   ├── users/
  │   │   │   ├── page.tsx       # User list
  │   │   │   └── [userId]/
  │   │   │       └── page.tsx   # User details
  │   │   ├── transactions/
  │   │   │   └── page.tsx       # Transaction history
  │   │   ├── numbers/
  │   │   │   ├── page.tsx       # Active orders
  │   │   │   └── history/
  │   │   │       └── page.tsx   # Order history
  │   │   ├── services/
  │   │   │   └── page.tsx       # Service CRUD
  │   │   ├── servers/
  │   │   │   └── page.tsx       # Server CRUD
  │   │   ├── promocodes/
  │   │   │   └── page.tsx       # Promo management
  │   │   └── settings/
  │   │       └── page.tsx       # Settings & config
  │   ├── api/
  │   │   └── auth/[...all]/
  │   │       └── route.ts       # Better Auth handler
  │   ├── layout.tsx             # Root layout
  │   └── page.tsx               # Landing/redirect
  ├── lib/
  │   ├── auth-admin.ts          # Better Auth config
  │   ├── db.ts                  # Prisma client
  │   └── trpc/
  │       ├── client.ts          # tRPC client
  │       ├── server.ts          # tRPC server
  │       └── routers/
  │           ├── index.ts       # Root router
  │           └── admin.ts       # Admin routes
  ├── components/
  │   ├── admin/
  │   │   ├── admin-sidebar.tsx
  │   │   ├── admin-header.tsx
  │   │   ├── stat-card.tsx
  │   │   └── data-table.tsx
  │   └── ui/                    # shadcn/ui components
  ├── middleware.ts              # Route protection
  ├── next.config.mjs
  ├── package.json
  └── tsconfig.json
```

---

## Authentication System

### Better Auth Configuration

**File:** `lib/auth-admin.ts`

```typescript
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const auth = betterAuth({
  baseURL: process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3001",
  trustedOrigins: [
    process.env.NEXT_PUBLIC_ADMIN_URL,
    "http://localhost:3001",
  ].filter(Boolean),
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Enable in production
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Refresh daily
  },
});

export type AdminAuth = typeof auth;
```

### Admin Middleware

**File:** `middleware.ts`

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "./lib/auth-admin";

export async function middleware(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login") ||
                      request.nextUrl.pathname.startsWith("/signup");
  const isAdminRoute = request.nextUrl.pathname.startsWith("/dashboard");

  // If not authenticated and trying to access admin routes
  if (isAdminRoute && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // If authenticated but not admin and trying to access admin routes
  if (isAdminRoute && session && !session.user.isAdmin) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  // If authenticated and trying to access auth routes
  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup"],
};
```

### Key Auth Files

- `lib/auth-admin.ts` - Better Auth configuration
- `app/api/auth/[...all]/route.ts` - API handler
- `middleware.ts` - Route protection
- `app/(auth)/login/page.tsx` - Login page
- `app/(auth)/signup/page.tsx` - Signup page

---

## Admin Dashboard Pages

### Layout & Navigation

**Admin Layout:**
- Fixed sidebar navigation
- Responsive design (collapsible on mobile)
- Header with user info and logout

**Navigation Items:**
- Dashboard (`/dashboard`)
- Users (`/dashboard/users`)
- Transactions (`/dashboard/transactions`)
- Numbers (`/dashboard/numbers`)
- Services (`/dashboard/services`)
- Servers (`/dashboard/servers`)
- Promocodes (`/dashboard/promocodes`)
- Settings (`/dashboard/settings`)

### Page Specifications

#### Dashboard (`/dashboard`)
- Stats cards: Total users, Total revenue, Total transactions, OTP sold, Active orders
- Quick links to other sections
- Recent activity feed

#### Users (`/dashboard/users`)
- Table with: Email, Telegram username, Balance, Admin status, Created at
- Search by email or username
- Filter by admin status
- Actions: View details, Edit user, Set admin, Ban user

#### User Details (`/dashboard/users/[userId]`)
- User profile info
- Wallet balance and transaction history
- Phone numbers purchase history
- API access settings
- Actions: Adjust balance, Reset API key, Ban user

#### Transactions (`/dashboard/transactions`)
- Table with: User, Type, Amount, Status, Date, Description
- Filter by type (Deposit, Purchase, Refund, Promo)
- Filter by status
- Date range picker

#### Numbers (`/dashboard/numbers`)
- Active orders tab
- History tab
- View SMS messages for each order
- Order details

#### Services (`/dashboard/services`)
- List all services
- Create new service (code, name, server, price)
- Edit service
- Delete service
- Toggle active status

#### Servers (`/dashboard/servers`)
- List all servers
- Add new server (API credentials, country)
- Edit server details
- Delete server
- Test API connection

#### Promocodes (`/dashboard/promocodes`)
- List all promocodes
- Create new promocode (code, amount, max uses)
- View usage history
- Edit/Delete promocodes

#### Settings (`/dashboard/settings`)
- **Payment Config:** BharatPe merchant ID, token, QR image
- **General Settings:** Min/max recharge, referral %, number expiry
- **Maintenance Mode:** Toggle on/off
- **Telegram Support:** Help URL

---

## Database & API Layer

### Shared Prisma Schema

Both applications share the same database schema:

- Admin app connects to the same PostgreSQL database
- Uses the existing `User.isAdmin` flag for access control
- All existing models (User, Wallet, Transaction, ActiveNumber, etc.) are accessible

### tRPC Routers

Reuse and adapt existing admin routes from the main app:

**File:** `lib/trpc/routers/admin.ts`

Key procedures:
- `stats` - Get dashboard statistics
- `getUsers` - List users with pagination
- `getUser` - Get user details
- `updateUser` - Update user (balance, admin status, etc.)
- `getTransactions` - List transactions with filters
- `getNumbers` - List phone numbers/orders
- `getServices` - List services
- `createService` - Create new service
- `updateService` - Update service
- `deleteService` - Delete service
- `getServers` - List servers
- `createServer` - Create new server
- `updateServer` - Update server
- `deleteServer` - Delete server
- `getPromocodes` - List promocodes
- `createPromocode` - Create promocode
- `updatePromocode` - Update promocode
- `deletePromocode` - Delete promocode
- `getSettings` - Get settings
- `updateSettings` - Update settings

### Environment Variables

**Admin App (.env.local):**
```env
DATABASE_URL=                # PostgreSQL connection string (same as main app)
NEXT_PUBLIC_ADMIN_URL=       # Admin app URL (e.g., https://admin.yourdomain.com)
BETTER_AUTH_SECRET=          # Auth secret (can be same as main app or different)
```

---

## Initial Admin Setup

### Bootstrapping the First Admin

**Recommended: SQL Script**

After setting up the admin app and connecting to the database, run:

```sql
-- Set a user as admin by their email
UPDATE "User"
SET "isAdmin" = true
WHERE email = 'your-admin@email.com';

-- Or by telegram ID
UPDATE "User"
SET "isAdmin" = true
WHERE "telegramId" = 'your-telegram-id';
```

**Alternative: Temporary First-User-Admin**

For initial setup, create a temporary endpoint that makes the first registered user an admin, then remove it after use.

**File:** `app/api/setup-admin/route.ts`

```typescript
// TEMPORARY - Remove after first admin is created
// Protected by environment variable
export async function POST(request: Request) {
  if (request.headers.get('x-setup-key') !== process.env.SETUP_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { email } = await request.json();
  // Update user to admin...
}
```

---

## UI Components

### Technology Stack

- **UI Framework:** shadcn/ui (Radix UI + Tailwind CSS)
- **Icons:** lucide-react
- **Forms:** react-hook-form + zod validation
- **Tables:** TanStack Table (react-table)
- **Data Fetching:** tRPC React
- **State Management:** React Context API

### Key Components

#### Admin Sidebar
- Navigation links
- Active state highlighting
- Mobile responsive (drawer)

#### Admin Header
- User info display
- Logout button
- Mobile menu toggle

#### Stat Card
- Title, value, icon
- Loading state
- Color-coded

#### Data Table
- Sortable columns
- Search functionality
- Pagination
- Row actions menu

#### Forms
- UserForm (edit user)
- ServiceForm (create/edit service)
- ServerForm (create/edit server)
- PromocodeForm (create/edit promocode)
- SettingsForm (update settings)

---

## Deployment to Vercel

### Environment Variables

Configure in Vercel project settings:

```env
DATABASE_URL=                # PostgreSQL connection string
NEXT_PUBLIC_ADMIN_URL=       # https://admin.yourdomain.com
BETTER_AUTH_SECRET=          # Generate with: openssl rand -base64 32
```

### Deployment Steps

1. **Create new Vercel project**
   - Link to Git repository
   - Select `meowsms-admin` directory (or set root directory)

2. **Configure build settings**
   ```json
   {
     "framework": "nextjs",
     "buildCommand": "npm run build",
     "devCommand": "npm run dev",
     "installCommand": "npm install"
   }
   ```

3. **Set environment variables**

4. **Deploy**

### Vercel Configuration

**File:** `vercel.json`

```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "framework": "nextjs",
  "installCommand": "npm install"
}
```

---

## Security Considerations

1. **Admin Access Control**
   - Strict middleware checks for `isAdmin` flag
   - Unauthorized access redirects to error page

2. **Environment Variables**
   - Never commit secrets
   - Use different `BETTER_AUTH_SECRET` for production

3. **Rate Limiting**
   - Implement rate limiting on login attempts
   - Consider CAPTCHA for signup

4. **Session Management**
   - 7-day session expiry
   - Secure cookie settings (httpOnly, secure in production)

5. **Audit Logging**
   - Use existing `UserAuditLog` model
   - Log all admin actions

---

## Next Steps

1. Create implementation plan with detailed steps
2. Set up the new admin app structure
3. Implement authentication system
4. Build dashboard pages
5. Deploy to Vercel
6. Set up initial admin user
7. Remove/replace existing admin routes from main app
