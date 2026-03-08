# Admin Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build comprehensive admin panel with Better Auth email/password authentication, user management, server/service CRUD, payment/wallet control, settings management, and audit logging.

**Architecture:** Monolithic admin app in `/admin-bear` directory, sharing PostgreSQL database with main meowsms app. Separate AdminUser schema for admin authentication using Better Auth credentials adapter.

**Tech Stack:** Next.js 16, React 19, TypeScript, Better Auth 1.5, Prisma 7.4, PostgreSQL, shadcn/ui, TanStack Query, Recharts, bcryptjs

---

## Database Schema Changes

### Task 1: Add AdminUser Table

**Files:**
- Modify: `admin-bear/prisma/schema.prisma`

**Step 1: Add AdminUser model to schema**
```prisma
model AdminUser {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String   // bcrypt hashed
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Step 2: Run migration**
```bash
cd admin-bear
npx prisma migrate dev --name add_admin_user_table
```

**Step 3: Commit**
```bash
cd admin-bear
git add prisma/schema.prisma prisma/migrations
git commit -m "schema: add AdminUser table with email/password auth"
```

---

## Better Auth Configuration

### Task 2: Configure Better Auth with Credentials

**Files:**
- Modify: `admin-bear/lib/auth.ts`
- Create: `admin-bear/lib/auth-admin.ts`

**Step 1: Create admin auth configuration**

Create `admin-bear/lib/auth-admin.ts`:
```typescript
import { betterAuth } from "better-auth";
import { prisma } from "@/lib/db";

export const auth = betterAuth({
  database: prisma,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24, // 24 hours
    updateAge: 60 * 60,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: [],
    },
  },
});
```

**Step 2: Generate database client**
```bash
cd admin-bear
npx prisma generate
```

**Step 3: Create auth API routes**
Create `admin-bear/app/api/auth/[...all]/route.ts`:
```typescript
import { authHandler } from "@/lib/auth-admin";
import { toNextJsHandler } from "better-auth/next";

export const { GET, POST } = toNextJsHandler(authHandler);
```

**Step 4: Create login page**
Create `admin-bear/app/login/page.tsx` with email/password form.

**Step 5: Commit**
```bash
cd admin-bear
git add lib/auth-admin.ts app/login app/api/auth
git commit -m "feat: add Better Auth email/password for admin login"
```

---

## Dashboard Pages

### Task 3: Create Dashboard Page

**Files:**
- Create: `admin-bear/app/dashboard/page.tsx`
- Modify: `admin-bear/app/dashboard/components/stats-cards.tsx`
- Modify: `admin-bear/app/dashboard/components/recent-activity.tsx`

**Step 1: Create dashboard page skeleton**
```typescript
// app/dashboard/page.tsx
import { api } from "@/lib/api";

export default async function DashboardPage() {
  const stats = await api.getDashboardStats();
  return <DashboardView stats={stats} />;
}
```

**Step 2: Create stats cards component**
Create reusable stats cards with user count, balance, numbers, transactions.

**Step 3: Create recent activity component**
Display recent transactions and admin actions.

**Step 4: Commit**
```bash
cd admin-bear
git add app/dashboard app/dashboard/components
git commit -m "feat: add dashboard page with stats and recent activity"
```

### Task 4: Add Dashboard Charts

**Files:**
- Create: `admin-bear/app/dashboard/components/charts.tsx`

**Step 1: Add Recharts**
```bash
cd admin-bear
npm install recharts
```

**Step 2: Create charts component**
Transaction trends line chart, revenue by service bar chart, user growth area chart.

**Step 3: Commit**
```bash
cd admin-bear
git add app/dashboard/components/charts.tsx package.json
git commit -m "feat: add dashboard charts with recharts"
```

---

## User Management

### Task 5: Create User List Page

**Files:**
- Create: `admin-bear/app/users/page.tsx`
- Create: `admin-bear/app/users/components/user-table.tsx`
- Create: `admin-bear/lib/api/users.ts`

**Step 1: Create user API methods**
```typescript
// lib/api/users.ts
export const getUsers = async (params: GetUsersParams) => {
  const response = await fetch('/api/admin/users?' + new URLSearchParams(params as any));
  return response.json();
};
```

**Step 2: Create user list page**
Paginated table with search and filters.

**Step 3: Create user table component**
Reusable table component with user data display.

**Step 4: Commit**
```bash
cd admin-bear
git add app/users app/users/components lib/api
git commit -m "feat: add user list page with pagination and search"
```

### Task 6: Create User Detail Page

**Files:**
- Create: `admin-bear/app/users/[userId]/page.tsx`
- Create: `admin-bear/app/users/[userId]/components/wallet-info.tsx`
- Create: `admin-bear/app/users/[userId]/components/active-numbers.tsx`

**Step 1: Create user detail page**
Fetch user data, wallet, transactions, active numbers.

**Step 2: Create wallet info component**
Display balance, spent, OTP count.

**Step 3: Create active numbers component**
List user's active phone numbers.

**Step 4: Commit**
```bash
cd admin-bear
git add app/users/[userId] app/users/[userId]/components
git commit -m "feat: add user detail page with wallet and numbers"
```

### Task 7: Add User Actions (Block, Adjust Balance, Reset Password)

**Files:**
- Modify: `admin-bear/app/users/[userId]/page.tsx`
- Create: `admin-bear/lib/api/user-actions.ts`

**Step 1: Create user action API methods**
Block, unblock, balance adjustment, reset password endpoints.

**Step 2: Add action modals**
Block/unblock confirmation modal, balance adjustment form, password reset form.

**Step 3: Commit**
```bash
cd admin-bear
git add app/users/[userId] lib/api
git commit -m "feat: add user actions - block, balance adjustment, reset password"
```

---

## Server & Service Management

### Task 8: Create Servers Page

**Files:**
- Create: `admin-bear/app/servers/page.tsx`
- Create: `admin-bear/app/servers/components/server-form.tsx`
- Create: `admin-bear/app/servers/components/server-list.tsx`
- Create: `admin-bear/lib/api/servers.ts`

**Step 1: Create server API methods**
CRUD operations for OtpServer table.

**Step 2: Create servers page**
List view with create/edit/delete actions.

**Step 3: Create server form component**
Name, isActive, API credential selection, test API button.

**Step 4: Commit**
```bash
cd admin-bear
git add app/servers app/servers/components lib/api
git commit -m "feat: add servers management page with CRUD"
```

### Task 9: Create Services Page

**Files:**
- Create: `admin-bear/app/services/page.tsx`
- Create: `admin-bear/app/services/components/service-form.tsx`
- Create: `admin-bear/app/services/components/service-list.tsx`
- Create: `admin-bear/lib/api/services.ts`

**Step 1: Create service API methods**
CRUD operations for Service table.

**Step 2: Create services page**
List view with create/edit/delete actions.

**Step 3: Create service form component**
Name, basePrice, iconUrl, isActive, server selection.

**Step 4: Commit**
```bash
cd admin-bear
git add app/services app/services/components lib/api
git commit -m "feat: add services management page with CRUD"
```

---

## Payment & Wallet Management

### Task 10: Create Wallets Page

**Files:**
- Create: `admin-bear/app/wallets/page.tsx`
- Create: `admin-bear/app/wallets/components/wallet-list.tsx`
- Create: `admin-bear/lib/api/wallets.ts`

**Step 1: Create wallet API methods**
List wallets with pagination and search.

**Step 2: Create wallets page**
Table with balance, spent, OTP count.

**Step 3: Create wallet list component**
Display wallet data with actions.

**Step 4: Commit**
```bash
cd admin-bear
git add app/wallets app/wallets/components lib/api
git commit -m "feat: add wallets management page"
```

### Task 11: Create Transactions Page

**Files:**
- Create: `admin-bear/app/transactions/page.tsx`
- Create: `admin-bear/app/transactions/components/transaction-table.tsx`
- Create: `admin-bear/app/transactions/components/filters.tsx`
- Create: `admin-bear/lib/api/transactions.ts`

**Step 1: Create transaction API methods**
List with filters (type, date range, user ID).

**Step 2: Create transactions page**
Paginated table with filters and detail view.

**Step 3: Create transaction table component**
Display transaction data.

**Step 4: Commit**
```bash
cd admin-bear
git add app/transactions app/transactions/components lib/api
git commit -m "feat: add transactions page with filters and pagination"
```

### Task 12: Add Transaction Stats

**Files:**
- Create: `admin-bear/app/transactions/stats/page.tsx`

**Step 1: Create stats API method**
Daily/weekly/monthly revenue breakdown.

**Step 2: Create stats page**
Charts showing transaction trends and breakdown.

**Step 3: Commit**
```bash
cd admin-bear
git add app/transactions/stats lib/api
git commit -m "feat: add transaction statistics page"
```

### Task 13: Add Manual Deposit & Adjustment

**Files:**
- Modify: `admin-bear/lib/api/transactions.ts`
- Create: `admin-bear/app/transactions/components/deposit-modal.tsx`
- Create: `admin-bear/app/transactions/components/adjustment-modal.tsx`

**Step 1: Create deposit API method**
Add manual deposit endpoint.

**Step 2: Create balance adjustment API method**
Add adjustment endpoint.

**Step 3: Create modals**
Deposit form, adjustment form.

**Step 4: Commit**
```bash
cd admin-bear
git add lib/api app/transactions/components
git commit -m "feat: add manual deposit and balance adjustment modals"
```

---

## Settings Management

### Task 14: Create Settings Page

**Files:**
- Create: `admin-bear/app/settings/page.tsx`
- Create: `admin-bear/app/settings/components/operations-tab.tsx`
- Create: `admin-bear/app/settings/components/finance-tab.tsx`
- Create: `admin-bear/app/settings/components/promos-tab.tsx`
- Create: `admin-bear/app/settings/components/payment-tab.tsx`
- Create: `admin-bear/lib/api/settings.ts`

**Step 1: Create settings API methods**
Get and update all settings.

**Step 2: Create settings page**
Tabbed interface with all sections.

**Step 3: Create tab components**
Operations, Finance, Promos, Payment tabs with respective settings.

**Step 4: Commit**
```bash
cd admin-bear
git add app/settings app/settings/components lib/api
git commit -m "feat: add settings page with tabbed interface"
```

---

## Audit Logging

### Task 15: Update UserAuditLog Schema

**Files:**
- Modify: `admin-bear/prisma/schema.prisma`

**Step 1: Add relations to UserAuditLog**
Update UserAuditLog model to relate to AdminUser and User.

**Step 2: Run migration**
```bash
cd admin-bear
npx prisma migrate dev --name update_audit_log_relations
```

**Step 3: Commit**
```bash
cd admin-bear
git add prisma/schema.prisma prisma/migrations
git commit -m "schema: add AdminUser and User relations to UserAuditLog"
```

### Task 16: Create Audit Logs Page

**Files:**
- Create: `admin-bear/app/audit-logs/page.tsx`
- Create: `admin-bear/app/audit-logs/components/audit-table.tsx`
- Create: `admin-bear/lib/api/audit-logs.ts`

**Step 1: Create audit logs API method**
List with filters (date range, admin user, action type).

**Step 2: Create audit logs page**
Paginated table with search and filters.

**Step 3: Create audit table component**
Display audit log data.

**Step 4: Commit**
```bash
cd admin-bear
git add app/audit-logs app/audit-logs/components lib/api
git commit -m "feat: add audit logs page with filters"
```

### Task 17: Add Automatic Audit Logging Middleware

**Files:**
- Create: `admin-bear/lib/middleware/audit-logger.ts`

**Step 1: Create audit logging utility**
```typescript
export const logAudit = async (action: string, reason?: string, targetUserId?: string, metadata?: any) => {
  const adminId = await verifyAdminToken();
  await prisma.userAuditLog.create({
    adminUserId: adminId,
    action,
    reason,
    targetUserId,
    metadata
  });
};
```

**Step 2: Apply to all admin API routes**
Add logging calls to user, wallet, transaction, settings, server, service endpoints.

**Step 3: Commit**
```bash
cd admin-bear
git add lib/middleware lib/api
git commit -m "feat: add automatic audit logging middleware"
```

---

## Layout & Navigation

### Task 18: Create Admin Layout

**Files:**
- Create: `admin-bear/app/layout.tsx`
- Create: `admin-bear/components/admin-sidebar.tsx`

**Step 1: Create admin layout wrapper**
Theme provider, admin sidebar, main content area.

**Step 2: Create sidebar component**
Navigation menu with all admin sections.

**Step 3: Commit**
```bash
cd admin-bear
git add app/layout components/admin-sidebar
git commit -m "feat: add admin layout with sidebar navigation"
```

### Task 19: Create API Client

**Files:**
- Create: `admin-bear/lib/api.ts`

**Step 1: Create base API client**
Fetch wrapper with auth headers and error handling.

**Step 2: Create type-safe API methods**
All admin API methods (users, wallets, transactions, settings, servers, services, audit).

**Step 3: Commit**
```bash
cd admin-bear
git add lib/api
git commit -m "feat: create type-safe API client with auth"
```

---

## Fix: Main App Buy Schema

### Task 20: Fix Main App Buy Schema CUID Validation

**Files:**
- Modify: `meowsms/lib/trpc/routers/number.ts`

**Step 1: Change buySchema validation**
Remove `.cuid()` requirement for serviceId and serverId since database uses text IDs.

**Step 2: Commit**
```bash
git add lib/trpc/routers/number.ts
git commit -m "fix: remove CUID validation from buy schema for text IDs"
```

---

## Seed Data

### Task 21: Create Admin Seed Script

**Files:**
- Create: `admin-bear/prisma/seed-admin.ts`

**Step 1: Create admin user seed**
Create initial admin user with bcrypt hashed password.

**Step 2: Commit**
```bash
cd admin-bear
git add prisma/seed-admin.ts
git commit -m "chore: add admin user seed script"
```

### Task 22: Run Seed

**Step 1: Run seed script**
```bash
cd admin-bear
npx tsx prisma/seed-admin.ts
```

**Step 2: Commit .env with credentials (optional)**
```bash
cd admin-bear
git add .env
git commit -m "chore: add default admin credentials to .env"
```

---

## Testing & Deployment

### Task 23: Test Admin Auth Flow

**Files:**
- Test: Manual testing in browser

**Step 1: Test login**
Navigate to `/login`, enter admin credentials, verify session creation.

**Step 2: Test protected routes**
Access protected pages, verify auth check works.

**Step 3: Test session timeout**
Wait for session expiry, verify re-auth prompt.

**Step 4: Commit** (if any fixes needed)

### Task 24: Test All Admin Pages

**Files:**
- Test: Manual testing in browser

**Step 1: Test dashboard**
Verify stats, charts, recent activity load correctly.

**Step 2: Test user management**
List, search, filters, user details, actions work.

**Step 3: Test server/service management**
Create, edit, delete operations work correctly.

**Step 4: Test payment management**
Wallets list, transactions, manual deposits work.

**Step 5: Test settings**
All settings save and persist correctly.

**Step 6: Test audit logs**
All actions are logged and displayed.

**Step 7: Commit** (if any fixes needed)

### Task 25: Fix Main App Buy Schema (if not done)

**Step 1: Apply fix from Task 20**
Ensure main app buy schema uses text ID validation.

**Step 2: Commit** (in main app)

```bash
cd ../meowsms
git add lib/trpc/routers/number.ts
git commit -m "fix: remove CUID validation from buy schema"
```

---

## Summary

Total Tasks: 25
Estimated Time: 8-12 hours

**Key Dependencies:**
- Better Auth 1.5 with credentials adapter
- bcryptjs for password hashing
- Recharts for data visualization
- TypeScript strict mode

**Database Changes:**
1. Add `AdminUser` table
2. Update `UserAuditLog` with AdminUser and User relations

**API Routes:**
- `/api/auth/[...all]` - Better Auth handler
- `/api/admin/users` - User CRUD
- `/api/admin/users/[userId]/*` - User actions
- `/api/admin/servers` - Server CRUD
- `/api/admin/services` - Service CRUD
- `/api/admin/wallets` - Wallet operations
- `/api/admin/transactions` - Transaction operations
- `/api/admin/settings` - Settings operations
- `/api/admin/audit-logs` - Audit logging

**Pages:**
- `/login` - Admin login
- `/dashboard` - Admin dashboard
- `/users` - User list
- `/users/[userId]` - User details
- `/servers` - Server management
- `/services` - Service management
- `/wallets` - Wallet management
- `/transactions` - Transaction management
- `/settings` - Settings management
- `/audit-logs` - Audit logs
