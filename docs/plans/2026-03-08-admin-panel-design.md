# Admin Panel Design Document

**Date:** 2026-03-08
**Project:** MeowSMS Admin Dashboard (admin-bear)
**Approach:** Monolithic Admin - Separate Next.js App

---

## Overview

A comprehensive admin panel for managing the MeowSMS virtual number service platform. Features include admin authentication, user management, server/service configuration, payment/wallet control, settings management, and audit logging.

---

## 1. Authentication Architecture

### Current State
- `meowsms`: Uses Better Auth with Telegram OAuth only
- `admin-bear`: Uses custom token-based auth with env variables

### Proposed Solution - Separate Admin Schema

### Database Schema - New `AdminUser` Table
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

### Implementation
1. **Better Auth with credentials adapter** for admin users
2. **Separate auth context** - Admin users use `/api/admin/auth/*` routes
3. **Regular users** continue using Telegram OAuth

### Security
- Admin users completely separate from regular User table
- No mixing of admin and regular user sessions
- Admin sessions stored in localStorage

---

## 2. Dashboard Overview

### Purpose
Admin home page showing key metrics at a glance

### Components

**Stats Cards Row**
- Total Users (active, blocked)
- Total Wallets / Combined Balance
- Total Numbers Active
- Total Transactions Today
- Revenue (deposits today, purchases today)

**Charts**
- Transaction Trends (last 30 days) - line chart
- Revenue by Service - bar chart
- User Growth (last 7 days) - area chart

**Recent Activity**
- Last 5 transactions (deposits, purchases, refunds)
- Last 5 admin actions (from audit log)

---

## 3. User Management

### Purpose
View, search, and manage regular users (from `User` table)

### Features

**User List Page** (`/admin/users`)
- Paginated table with search by email, username, phone
- Filters: Status (Active, Blocked, Suspended), Created Date range
- Columns: User ID, Name, Email, Phone, Wallet Balance, Status, Created At, Actions

**User Detail Page** (`/admin/users/[userId]`)
- User profile info
- Wallet balance and transaction history
- Active numbers (count, list with status)
- Manual balance adjustment form
- Reset password option
- Block/Unblock action with reason

### Actions
- Block user (soft delete)
- Unblock user
- Manual balance adjustment
- Add deposit

---

## 4. Server & Service Management

### Purpose
Full CRUD for OTP providers (servers) and available services

### Features

**Servers Page** (`/admin/servers`)
- List all OTP servers with status, country, API credential
- Create new server
- Edit server (name, isActive, API credential)
- Delete server (with confirmation)
- Test API connection button

**Services Page** (`/admin/services`)
- List all services with pricing, linked server
- Create new service
- Edit service (name, basePrice, iconUrl, isActive)
- Delete service
- Sync services from API button

### API Schema
```prisma
// Existing tables - OtpServer and Service with proper relations
model Service {
  id          String   @id @default(cuid())
  code        String   @unique
  name        String
  serverId    String
  basePrice   Decimal
  iconUrl     String?
  isActive    Boolean  @default(true)
  server      OtpServer @relation(fields: [serverId], references: [id])
}

model OtpServer {
  id          String   @id @default(cuid())
  name        String
  apiId       String
  isActive    Boolean  @default(true)
  services    Service[]
  api         ApiCredential @relation(fields: [apiId], references: [id])
}
```

---

## 5. Payment & Wallet Management

### Purpose
Full control over user wallets, deposits, and transactions

### Features

**Wallets Page** (`/admin/wallets`)
- List all user wallets with balance, total spent, OTP count
- Search by user ID, email
- Manual balance adjustment modal
- Add deposit modal
- Export CSV button

**Transactions Page** (`/admin/transactions`)
- Paginated table with filters (type, date range, user ID)
- Columns: ID, User, Type, Amount, Status, Phone Number, Description, Created At
- View transaction details
- Reverse/refund transaction action
- Manual add deposit action

**Transaction Stats** (`/admin/transactions/stats`)
- Daily/Weekly/Monthly revenue chart
- Breakdown by type (deposits, purchases, refunds)
- Top users by volume

### Actions
- Adjust balance (refund/adjustment)
- Add manual deposit
- Reverse/refund transaction

---

## 6. Settings Management

### Purpose
Configure all application settings from one place

### Features

**Settings Page** (`/admin/settings`)
Tabbed interface for organized access:

**Operations Tab**
- Maintenance Mode toggle
- Number Expiry Minutes (default 15)
- Min Cancel Minutes (default 2)

**Finance Tab**
- Min Recharge Amount (default 10)
- Max Recharge Amount (default 5000)
- Currency (default ₹)
- Referral Percentage (default 0)

**Promos Tab**
- Referral Percent (default 0)
- Min Redeem Amount (default 0)

**Payment Tab**
- BharatPe Merchant ID (input)
- BharatPe Token (masked in UI)
- BharatPe QR Image URL (input)

---

## 7. Audit Logging & Trail

### Purpose
Track all admin actions with automatic logging + manual notes

### Features

**Audit Logs Page** (`/admin/audit-logs`)
- Paginated table with search filters
- Columns: Timestamp, Admin Email, Action, Target User, Reason, Details
- Export CSV button
- Filter by date range, admin user, action type

**Actions That Log Automatically**
- Create/Update/Delete servers
- Create/Update/Delete services
- Adjust user balances
- Add manual deposits
- Reverse transactions
- Change application settings
- Block/Unblock users
- Reset user passwords

### Database Schema - Update existing `UserAuditLog`
```prisma
model UserAuditLog {
  id          String   @id @default(cuid())
  targetUser  User?    @relation(fields: [targetUserId], references: [id])
  targetUserId String?  @unique
  adminUser   AdminUser @relation(fields: [adminUserId], references: [id])
  adminUserId String
  action      String
  reason      String?
  metadata    Json?
  createdAt   DateTime @default(now())
}
```

---

## Environment Variables

```env
# Admin App
DATABASE_URL=postgresql://meowsms:9798@localhost:5432/meowsms
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3001
ADMIN_EMAIL=admin@meowsms.com
ADMIN_PASSWORD=YourSecurePassword
```

---

## Next Steps

This design document covers all required features. Proceeding to implementation planning.
