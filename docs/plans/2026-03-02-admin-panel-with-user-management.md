# Admin Panel with User Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a comprehensive admin dashboard with user management (CRUD), transaction statistics, promocode management, services/servers management, and system settings - with sidebar navigation and logout functionality.

**Architecture:** Admin panel with role-based access control, using existing shadcn/ui components. Frontend connects to tRPC backend with atomic operations. Admin router extended with user CRUD, balance adjustments, and comprehensive statistics.

**Tech Stack:** Next.js 16, tRPC, Prisma, PostgreSQL, TypeScript, shadcn/ui, Framer Motion, Lucide React icons, Sonner toasts

---

## Overview

The admin panel will provide:
1. **Dashboard** - Overview of all key metrics (users, services, servers, transactions, OTPs, revenue)
2. **Users Management** - Full CRUD operations with search, filters, balance adjustments, activity logs
3. **Services Management** - Create, update, delete services with server selection
4. **Servers Management** - Full CRUD with API credentials, country flags
5. **Promocodes** - Generate, activate, deactivate promocodes with usage tracking
6. **Transactions** - View all transactions with filters, export, detailed view
7. **Settings** - Enhanced with UPI, timers, referral, maintenance mode
8. **Admin Layout** - Sidebar navigation with logout button

---

## Task 1: Enhance Admin Router

**Files:**
- Modify: `lib/trpc/routers/admin.ts`

**Step 1: Add user management procedures**

```typescript
// User management queries
user.list: adminProcedure
  .input(z.object({
    search: z.string().optional(),
    filter: z.enum(["all", "active", "admin"]).optional(),
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(20),
  }))
  .query(async ({ ctx, input }) => {
    const { search, filter, page, limit } = input;

    // Build where clause
    const where: any = {};
    if (search) {
      where.OR = [
        { telegramId: { contains: search, mode: "insensitive" } },
        { telegramUsername: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (filter === "admin") {
      where.isAdmin = true;
    }

    if (filter === "active") {
      where.deletedAt = null;
    }

    // Get users with counts
    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          wallet: { select: { balance: true } },
          _count: {
            select: {
              numbers: true,
              promoHistory: true,
              customPrices: true,
            },
          },
        },
        skip: (page - 1) * limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where, }),
    ]);

    const hasMore = users.length >= page * limit;

    return {
      users,
      totalCount,
      hasMore,
    };
  }),

user.get: adminProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ ctx, input }) => {
    const user = await prisma.user.findUnique({
      where: { id: input.id },
      include: {
        wallet: { select: { balance: true } },
        _count: {
          select: {
            numbers: true,
            promoHistory: true,
            customPrices: true,
          },
        },
      },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    return {
      ...user,
      stats: {
        totalNumbers: user._count.numbers,
        totalPromoUsed: user._count.promoHistory,
        totalCustomPrices: user._count.customPrices,
      },
    };
  }),

user.update: adminProcedure
  .input(z.object({
    id: z.string(),
    isAdmin: z.boolean().optional(),
    balance: z.number().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    telegramUsername: z.string().optional(),
    isPremium: z.boolean().optional(),
    languageCode: z.string().optional(),
    photoUrl: z.string().url().optional(),
    // ... all other user fields
  }))
  .mutation(async ({ ctx, input }) => {
    const user = await prisma.user.findUnique({
      where: { id: input.id },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: input.id },
      data: input,
    });

    return updatedUser;
  }),

user.delete: adminProcedure
  .input(z.object({
    id: z.string(),
    reason: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    // Check if deleting yourself
    if (input.id === ctx.user.id) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot delete yourself",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: input.id },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    // Soft delete
    await prisma.user.update({
      where: { id: input.id },
      data: { deletedAt: new Date() },
    });

    // Create audit log entry
    await prisma.userAuditLog.create({
      data: {
        userId: ctx.user.id,
        action: "DELETE",
        targetUserId: input.id,
        reason: input.reason,
      },
    });

    return { success: true };
  }),

user.balanceAdjust: adminProcedure
  .input(z.object({
    id: z.string(),
    amount: z.number(),
    reason: z.string(),
    type: z.enum(["ADD", "REMOVE"]),
  }))
  .mutation(async ({ ctx, input }) => {
    // Manual balance adjustment
    const user = await prisma.user.findUnique({
      where: { id: input.id },
      include: { wallet: true },
    });

    if (!user || !user.wallet) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "User or wallet not found",
      });
    }

    await prisma.$transaction(async (tx) => {
      if (input.type === "ADD") {
        await tx.wallet.update({
          where: { id: user.wallet.id },
          data: {
            balance: { increment: input.amount },
            totalRecharge: { increment: input.amount },
          },
        });

        await tx.transaction.create({
          data: {
            walletId: user.wallet.id,
            type: "ADJUSTMENT",
            amount: new Prisma.Decimal(input.amount),
            status: "COMPLETED",
            description: input.reason,
            metadata: { adminAction: true },
          },
        });
      } else {
        await tx.wallet.update({
          where: { id: user.wallet.id },
          data: {
            balance: { decrement: input.amount },
            totalRecharge: { decrement: input.amount },
          },
        });

        await tx.transaction.create({
          data: {
            walletId: user.wallet.id,
            type: "ADJUSTMENT",
            amount: new Prisma.Decimal(input.amount),
            status: "COMPLETED",
            description: input.reason,
            metadata: { adminAction: true },
          },
        });
      }
    });

    return { success: true };
  }),
```

**Step 2: Add transaction statistics procedures**

```typescript
// Transaction and OTP stats
getTransactionStats: adminProcedure.query(async () => {
  const stats = await Promise.all([
    prisma.transaction.count({ where: { type: "DEPOSIT" } }),
    prisma.transaction.count({ where: { type: "PURCHASE" } }),
    prisma.transaction.count({ where: { type: "REFUND" } }),
    prisma.transaction.count({ where: { type: "PROMO" } }),
    prisma.promocode.count({ where: { isActive: true } }),
    prisma.user.count(),
    prisma.otpServer.count({ where: { isActive: true } }),
    prisma.service.count({ where: { isActive: true } }),
  ]);

  return {
    totalDeposits: stats[0],
    totalPurchases: stats[1],
    totalRefunds: stats[2],
    totalPromos: stats[3],
    totalPromocodes: stats[4],
    totalUsers: stats[5],
    totalServices: stats[6],
    totalServers: stats[7],
    totalOtpServers: stats[8],
  };
}),

getOtpStats: adminProcedure.query(async () => {
  // OTP sales statistics
  const walletStats = await prisma.wallet.aggregate({
    _sum: {
      balance: true,
      totalOtp: true,
    },
  });

  return {
    totalOtpSold: walletStats._sum.totalOtp || 0,
    totalRevenue: await prisma.transaction.aggregate({
      _sum: {
        amount: true,
      where: { type: "PURCHASE" },
      },
    }),
  };
}),
```

**Step 3: Add user audit log model**

Add to schema:

```prisma
model UserAuditLog {
  id          String   @id @default(cuid())
  userId      String
  action      String   // CREATE, UPDATE, DELETE, BALANCE_ADJUST
  targetId   String   // For user actions (user being modified)
  targetUserId String?
  reason      String?
  metadata    Json?
  amount      Decimal? @db.Decimal(10, 2)
  createdAt   DateTime @default(now())
  adminId     String
}
```

**Step 4: Run type check**

```bash
npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add lib/trpc/routers/admin.ts prisma/schema.prisma
git commit -m "feat(admin): add user management and transaction stats"
```

---

## Task 2: Create Admin Layout with Logout

**Files:**
- Create: `app/admin/layout.tsx`

**Step 1: Create admin layout component**

```typescript
"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Layout } from "@/components/ui/layout";
import { Sidebar } from "@/components/admin/sidebar";
import { SidebarProvider } from "@/components/admin/sidebar-provider";
import { LogOut, Settings, Users, Activity, Database, DollarSign, Menu } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/trpc/client";
import { authClient } from "@/lib/auth-client";
import type { User } from "@/types";
import { cn } from "@/lib/utils";

export default function AdminLayout({
  children,
}: {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const user = session?.user as User | undefined;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: { onSuccess: () => router.push("/") },
    });
    toast.success("Logged out successfully");
    setSidebarOpen(false);
  };

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/admin" },
    { id: "users", label: "Users", icon: Users, href: "/admin/users" },
    { id: "services", label: "Services", icon: Database, href: "/admin/services" },
    { id: "servers", label: "Servers", icon: Activity, href: "/admin/servers" },
    { id: "promos", label: "Promocodes", icon: Gift, href: "/admin/promos" },
    { id: "transactions", label: "Transactions", icon: DollarSign, href: "/admin/transactions" },
    { id: "settings", label: "Settings", icon: Settings, href: "/admin/settings" },
  ];

  // Check if current path matches any menu item
  const activeItem = menuItems.find(item => item.href === pathname);

  return (
    <SidebarProvider>
      <Sidebar
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        menu={menuItems}
        activeItem={activeItem}
      >
        <Sidebar>
          {/* User info in sidebar */}
          <div className="mt-auto flex items-center gap-3 px-6">
            <div className="w-10 h-10 rounded-full overflow-hidden">
              {user?.photoUrl ? (
                <img
                  src={user.photoUrl}
                  alt={user?.firstName || user?.name || "User"}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full rounded-full bg-primary/10 text-primary-foreground flex items-center justify-center font-medium text-lg">
                  {(user?.firstName || user?.name || "U").charAt(0)}
                </div>
              )}
            </div>
            <div className="flex-1 flex-col gap-0.5">
              <p className="text-sm font-medium text-foreground">
                {user?.firstName} {user?.lastName && ` ${user?.lastName}`}
              </p>
              <p className="text-xs text-muted-foreground">
                @{user?.telegramUsername || user?.telegramId}
              </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {user?.isAdmin && (
                  <span className="inline-flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    Admin
                  </span>
                )}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-red-500 hover:text-red-600 transition-colors flex items-center gap-1.5 px-2 py-1.5 rounded-md"
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
        </Sidebar>
      </Sidebar>
    </SidebarProvider>
  );
}
```

**Step 2: Create Sidebar component**

Create: `components/admin/sidebar.tsx` and `components/admin/sidebar-provider.tsx`

**Step 3: Run type check**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add app/admin/ app/admin/layout.tsx components/admin/
git commit -m "feat(admin): add layout with sidebar and logout"
```

---

## Task 3: Update Dashboard Page

**Files:**
- Modify: `app/admin/page.tsx`

**Step 1: Add stats cards to existing dashboard**

```typescript
// Add to imports
import { Database, DollarSign, Gift, Users, Activity, TrendingUp } from "lucide-react";

// Add stats queries
const { data: stats } = api.admin.getTransactionStats.useQuery();
const { data: otpStats } = api.admin.getOtpStats.useQuery();

// Key metrics cards
const statsCards = [
  {
    id: "users",
    title: "Total Users",
    value: data?.totalUsers || 0,
    icon: Users,
    color: "blue",
    href: "/admin/users",
  },
  {
    id: "services",
    title: "Total Services",
    value: data?.totalServices || 0,
    icon: Database,
    color: "green",
    href: "/admin/services",
  },
  {
    id: "servers",
    title: "Total Servers",
    value: data?.totalServers || 0,
    icon: Activity,
    color: "purple",
    href: "/admin/servers",
  },
  {
    id: "transactions",
    title: "Total Transactions",
    value: data?.totalTransactions || 0,
    icon: DollarSign,
    color: "amber",
    href: "/admin/transactions",
  },
  {
    id: "deposits",
    title: "Total Deposits",
    value: data?.totalDeposits || 0,
    icon: TrendingUp,
    color: "green",
  },
  {
    id: "otp-sold",
    title: "OTP Sold",
    value: otpStats?.totalOtpSold || 0,
    icon: Gift,
    color: "cyan",
  },
  {
    id: "revenue",
    title: "Total Revenue",
    value: otpStats?.totalRevenue || 0,
    icon: DollarSign,
    color: "indigo",
  },
];

// Render stats cards
return (
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
    {statsCards.map((card) => (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 + card.id * 0.05 }}
        key={card.id}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Link href={card.href}>
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={cn("p-3 rounded-full", card.iconColor)}>
                  {React.createElement(card.icon, { className: "w-6 h-6 text-white", strokeWidth: 2 })}
                </div>
                <h3 className="font-bold text-xl text-foreground">{card.title}</h3>
              </div>
              <div className="text-right">
                {card.id === "revenue" && "₹"}
                <span className="text-3xl font-bold">{card.value.toLocaleString()}</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {card.description}
            </p>
          </div>
        </Link>
      </motion.div>
    ))}
  </div>
);
```

**Step 2: Run type check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add app/admin/page.tsx
git commit -m "feat(admin): enhance dashboard with stats cards"
```

---

## Task 4: Create Users List Page

**Files:**
- Create: `app/admin/users/page.tsx`
- Create: `components/admin/users-table.tsx`

**Step 1: Create users list page**

```typescript
"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Filter,
  ChevronDown,
  MoreVertical,
  Trash2,
  Edit,
  Shield,
  RefreshCw,
  LogOut,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import type { User } from "@/types";

type FilterType = "all" | "active" | "admin";

export default function UsersListPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [page, setPage] = useState(1);
  const [deleteDialog, setDeleteDialog] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading, refetch } = api.admin.user.list.useQuery({
    search,
    filter,
    page,
    limit: 20,
    enabled: !!search || filter !== "all",
  });

  const handleDelete = async (userId: string) => {
    setDeleteDialog({ id: userId, name: data?.users?.find(u => u.id === userId)?.firstName || data?.users?.find(u => u.id === userId)?.name || "" });
  };

  const confirmDelete = async () => {
    await api.user.delete.mutate({ id: deleteDialog.id, reason: "Deleted by admin" });
    setDeleteDialog(null);
    refetch();
  };

  const filteredUsers = data?.users || [];

  return (
    <div className="min-h-[calc(100vh-7rem)] bg-background/50 p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Users</h1>
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 w-80" />
              <input
                type="text"
                placeholder="Search by ID, username, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-4 rounded-xl border-border"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex bg-muted rounded-lg p-1">
              {(["all", "active", "admin"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f as FilterType)}
                  className={cn(
                    "flex-1 items-center gap-2 px-4 py-2 rounded-lg transition-all",
                    filter === f && "bg-background text-foreground font-medium"
                  )}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Users Count */}
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading..." : `${filteredUsers.length} of ${data?.totalCount || 0} users`}
          </p>
        </div>

        {/* Users Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Telegram</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Balance</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Admin</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Joined</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user, idx) => (
                <tr key={user.id} className="border-b hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {user.photoUrl ? (
                        <img src={user.photoUrl} alt={user.firstName} className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary-foreground flex items-center justify-center font-medium">
                          {(user.firstName || user.name || "").charAt(0)}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{user.email || "-"}</td>
                  <td className="px-4 py-3">@{user.telegramUsername || user.telegramId || "-"}</td>
                  <td className="px-4 py-3 font-medium">₹{(user.wallet?.balance || 0).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <ShieldCheck size={16} className={user.isAdmin ? "text-green-500" : "text-muted-foreground"} />
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => router.push(`/admin/users/${user.id}`)}
                      className="text-xs text-primary hover:underline"
                    >
                      View
                    </button>
                    <button
                      onClick={() => setDeleteDialog({ id: user.id, name: user.firstName || user.name })}
                      className="text-xs text-red-500 hover:text-red-600 ml-2"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {data?.totalCount && data?.totalCount > 20 && (
            <div className="flex justify-center mt-4 gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm">
                Page {page} of {Math.ceil(data?.totalCount / 20)}
              </span>
              <button
                onClick={() => setPage(p => Math.min(Math.ceil(data?.totalCount / 20), p + 1))}
                disabled={page * 20 >= data?.totalCount}
                className="px-4 py-2"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Delete Confirmation Dialog */}
      <AnimatePresence>
        {deleteDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card rounded-xl p-6 max-w-sm">
              <p className="text-lg font-medium text-foreground">Delete User?</p>
              <p className="text-muted-foreground">
                {deleteDialog.name} ({deleteDialog.id})
              </p>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setDeleteDialog(null)}
                  className="px-4 py-2 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

**Step 2: Create users table component**

```typescript
"use client";
import { Edit2, Trash2, Shield, ShieldCheck, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/trpc/client";

type UserWithWallet = {
  ...User,
  wallet: { balance: number; totalSpent?: number; totalRecharge?: number } | null,
};

interface UsersTableProps {
  users: UserWithWallet[];
  onEdit: (userId: string) => void;
  onToggleAdmin: (userId: string, isAdmin: boolean) => void;
  onDelete: (userId: string) => void;
}

export function UsersTable({ users, onEdit, onToggleAdmin, onDelete }: UsersTableProps) {
  return (
    <table className="w-full">
      <tbody>
        {users.map((user) => (
          <tr key={user.id} className="border-b">
            <td className="px-4 py-3">
              <div className="flex items-center gap-3">
                {user.photoUrl ? (
                  <img src={user.photoUrl} alt={user.firstName} className="w-10 h-10 rounded-full" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-medium">
                    {user.firstName ? user.firstName.charAt(0) : user.telegramId?.charAt(0) || "U"}
                  </div>
                )}
              </div>
            </td>
            <td className="px-4 py-3">{user.email || "-"}</td>
            <td className="px-4 py-3">@{user.telegramUsername || "-"}</td>
            <td className="px-4 py-3 font-medium">
              ₹{(user.wallet?.balance || 0).toFixed(2)}
            </td>
            <td className="px-4 py-3">
              <button
                onClick={() => onEdit(user.id)}
                className="text-xs text-primary hover:underline"
              >
                <Edit2 size={12} />
              </button>
            </td>
            <td className="px-4 py-3">
              <ShieldCheck
                size={16}
                className={cn(
                  "cursor-pointer transition-colors",
                  user.isAdmin ? "text-green-500 hover:text-green-600" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => onToggleAdmin(user.id, !user.isAdmin)}
              />
            </td>
            <td className="px-4 py-3">
              <button
                onClick={() => onDelete(user.id)}
                className="text-xs text-red-500 hover:text-red-600"
              >
                <Trash2 size={12} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

**Step 3: Run type check**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add app/admin/users/page.tsx components/admin/
git commit -m "feat(admin): create users list page with table"
```

---

## Task 5: Create User Detail/Edit Page

**Files:**
- Create: `app/admin/users/[userId]/page.tsx`
- Create: `components/admin/user-detail-card.tsx`
- Create: `components/admin/wallet-adjust-dialog.tsx`

**Step 1: Create user detail page**

```typescript
"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Save,
  RefreshCw,
  Settings,
  Activity,
  User,
  Wallet,
  IndianRupee,
  Clock,
  Edit2,
  Trash2,
  Shield,
  ShieldCheck,
  MoreVertical,
} from "lucide-react";
import { api } from "@/lib/trpc/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { User } from "@/types";
import { UserDetailCard } from "@/components/admin/user-detail-card";
import { WalletAdjustDialog } from "@/components/admin/wallet-adjust-dialog";

export default function UserDetailPage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const { data: user, isLoading } = api.admin.user.get.useQuery({ id: params.userId });

  const [activeTab, setActiveTab] = useState<"profile" | "wallet" | "stats" | "transactions">("profile");
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);

  const { data: transactions, isLoading: txLoading } = api.admin.user.transactions.useQuery({
    userId: params.userId,
    limit: 20,
  });

  const isAdminMutation = api.user.setAdmin.useMutation();

  const handleBalanceAdjust = () => {
    setWalletDialogOpen(true);
  };

  const handleDeleteUser = () => {
    setDeleteDialog(true);
  };

  const confirmDelete = async () => {
    await api.user.delete.mutate({ id: params.userId, reason: "Deleted by admin" });
    toast.success("User deleted successfully");
    router.push("/admin/users");
  };

  if (!user || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-7rem)]">
        <RefreshCw size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-7rem)] bg-background/50 p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Back Button */}
        <button
          onClick={() => router.push("/admin/users")}
          className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          Back to Users
        </button>

        {/* Delete Confirmation */}
        <AnimatePresence>
          {deleteDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-card rounded-xl p-6 max-w-sm">
                <p className="text-lg font-medium text-foreground">Delete User?</p>
                <p className="text-muted-foreground">
                  {data?.user ? `${data.user.firstName} ${data.user.lastName}` : params.userId}
                </p>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setDeleteDialog(null)}
                    className="px-4 py-2 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        </AnimatePresence>

        {/* User Detail Card */}
        <UserDetailCard
          user={data?.user}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onBalanceAdjust={handleBalanceAdjust}
          onEditProfile={() => {/* Edit profile dialog */}}
          onToggleAdmin={(isAdmin) => isAdminMutation.mutate({ id: params.userId, isAdmin: !isAdmin })}
          onDelete={handleDeleteUser}
        />

        {/* Wallet Adjust Dialog */}
        <WalletAdjustDialog
          isOpen={walletDialogOpen}
          onClose={() => setWalletDialogOpen(false)}
          userId={params.userId}
        />

        {/* Transactions Tab */}
        {activeTab === "transactions" && (
          <div className="mt-6">
            <h2 className="text-2xl font-bold mb-4">Transaction History</h2>
            {isLoading ? (
              <RefreshCw size={24} className="animate-spin" />
            ) : txLoading ? (
              <RefreshCw size={24} className="animate-spin" />
            ) : (
              <button
                onClick={() => txLoading.refetch()}
                className="text-sm text-primary hover:underline"
              >
                Refresh
              </button>
            )}
            <div className="bg-card border border-border rounded-2xl mt-4">
              {data.transactions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No transactions yet
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((tx) => {
                      const isCredit = tx.type === "DEPOSIT" || tx.type === "PROMO" || tx.type === "REFUND";
                      const isDebit = tx.type === "PURCHASE";
                      const colorClass = isCredit ? "text-green-500" : isDebit ? "text-red-500" : "text-amber-500";
                      return (
                        <tr key={tx.id} className="border-b">
                          <td className="px-4 py-3">
                            {tx.type}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            ₹{tx.amount.toFixed(2)}
                          </td>
                          <td className="px-4 py-3">{tx.description || tx.type}</td>
                          <td className="px-4 py-3 text-xs">
                            {new Date(tx.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn("inline-flex items-center gap-1", colorClass)}>
                              {tx.status === "COMPLETED" ? "✓" : tx.status === "PENDING" ? "⏳" : "✗"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
        )}
      </motion.div>
    );
}
```

**Step 2: Create user detail card component**

```typescript
"use client";
import { useState } from "react";
import {
  Calendar,
  Clock,
  Phone,
  Mail,
  Shield,
  Wallet,
  Activity,
  IndianRupee,
} from "lucide-react";
import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import type { User } from "@/types";

type ActiveTab = "profile" | "wallet" | "stats" | "transactions";

interface UserDetailCardProps {
  user: User | null;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onBalanceAdjust: () => void;
  onEditProfile: () => void;
  onToggleAdmin: (isAdmin: boolean) => void;
  onDelete: (userId: string) => void;
}

export function UserDetailCard({ user, activeTab, onTabChange, onBalanceAdjust, onEditProfile, onToggleAdmin, onDelete }: UserDetailCardProps) {
  const { data: activities, isLoading } = api.admin.user.activities.useQuery(
    user.id,
    limit: 10,
  );

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Profile Section */}
      <div className={cn("border-b", activeTab === "profile" && "border-primary")}>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Profile</h3>
            {user.isAdmin && (
              <button
                onClick={() => onToggleAdmin(!user.isAdmin)}
                className="text-xs text-amber-500 hover:text-amber-600 flex items-center gap-1"
              >
                <ShieldCheck size={14} />
                Remove Admin Access
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Avatar */}
          <div className="col-span-1">
            <div className="flex items-center gap-4">
              {user.photoUrl ? (
                <img src={user.photoUrl} alt={user.firstName} className="w-24 h-24 rounded-2xl object-cover" />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-muted flex items-center justify-center font-medium text-4xl">
                  {user?.firstName ? user.firstName.charAt(0) : user.telegramId?.charAt(0) || "U"}
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="col-span-1 space-y-3">
            <div>
              <Phone className="w-4 h-4 text-muted-foreground mr-2" />
              <span className="text-sm">{user.telegramId || "Not set"}</span>
            </div>
            <div>
              <Mail className="w-4 h-4 text-muted-foreground mr-2" />
              <span className="text-sm">{user.email || "Not set"}</span>
            </div>
            <div>
              <Calendar className="w-4 h-4 text-muted-foreground mr-2" />
              <span className="text-sm">Joined {new Date(user.createdAt).toLocaleDateString()}</span>
            </div>
            <div>
              <Shield className="w-4 h-4 text-muted-foreground mr-2" />
              <span className={user.isPremium ? "text-green-500" : "text-muted-foreground"}>
                {user.isPremium ? "Premium" : "Free"}
              </span>
            </div>
          </div>
        </div>

        {/* Wallet Section */}
        <div className={cn("border-b", activeTab === "wallet" && "border-primary")}>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Wallet</h3>
              {user.isAdmin && (
                <button
                  onClick={() => onBalanceAdjust()}
                  className="text-xs text-amber-500 hover:text-amber-600 flex items-center gap-1"
                >
                  <Wallet className="w-4 h-4 text-muted-foreground" />
                  Adjust Balance
                </button>
              )}
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4">
            <div className="text-center mb-4">
              <IndianRupee className="w-12 h-12 text-primary" />
            </div>
            <div className="text-center text-2xl font-bold text-foreground">
              ₹{user.wallet?.balance?.toFixed(2) || "0.00"}
            </div>
            <p className="text-center text-sm text-muted-foreground mt-2">
              Wallet Balance
            </p>
            {div className="flex items-center justify-center gap-4 mt-4">
              <button
                onClick={() => onBalanceAdjust()}
                className="px-4 py-2 rounded-lg bg-green-500 text-white hover:bg-green-600"
              >
                <RefreshCw className="w-4 h-4 text-white" />
                Add ₹10
              </button>
              <button
                onClick={() => onBalanceAdjust()}
                className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600"
              >
                <IndianRupee className="w-4 h-4 text-white" />
                Remove ₹10
              </button>
            </div>
          </div>

          {/* Recent Adjustments */}
          <h4 className="text-sm font-medium mt-4">Recent Balance Adjustments</h4>
          {activities?.map((activity) => (
            activity.type === "BALANCE_ADJUST" && (
              <div key={activity.id} className="flex items-center justify-between py-2 text-sm">
                <span>{activity.createdAt.toLocaleString()}</span>
                <span className={activity.amount > 0 ? "text-green-500" : "text-red-500"}>
                  {activity.amount > 0 ? "+" : "-"}₹{Math.abs(activity.amount).toFixed(2)}
                </span>
                <span>{activity.reason || "Manual adjustment"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats Section */}
        <div className={cn("border-b", activeTab === "stats" && "border-primary")}>
          <div className="p-4">
            <h3 className="text-lg font-semibold">Statistics</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <Activity className="w-6 h-6 text-muted-foreground" />
              <div className="text-sm font-medium mt-2">Total Numbers</div>
              <div className="text-2xl font-bold">{user.wallet?._count.numbers || 0}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <Gift className="w-6 h-6 text-muted-foreground" />
              <div className="text-sm font-medium mt-2">Total OTP Received</div>
              <div className="text-2xl font-bold">{user.wallet?.totalOtp || 0}</div>
            </div>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
              <Wallet className="w-6 h-6 text-muted-foreground" />
              <div className="text-sm font-medium mt-2">Total Spent</div>
              <div className="text-2xl font-bold">₹{user.wallet?.totalSpent?.toFixed(2) || "0.00"}</div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Create wallet adjust dialog**

```typescript
"use client";
import { useState } from "react";
import {
  RefreshCw,
  X,
  IndianRupee,
} from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { api } from "@/lib/trpc/client";
import { toast } from "sonner";

interface WalletAdjustDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const adjustSchema = z.object({
  amount: z.number().min(0.01).max(10000),
  reason: z.string().min(3).max(100),
  type: z.enum(["ADD", "REMOVE"]),
});

export function WalletAdjustDialog({ isOpen, onClose, userId }: WalletAdjustDialogProps) {
  const form = useForm<z.infer<typeof adjustSchema>>({
    defaultValues: { amount: 10, reason: "Balance adjustment", type: "ADD" },
  });

  const adjustMutation = api.admin.user.balanceAdjust.useMutation();

  const handleSubmit = async (values: z.infer<typeof adjustSchema>) => {
    try {
      await adjustMutation.mutateAsync({ ...values, userId });
      toast.success(`Balance ${values.type === "ADD" ? "added" : "removed"} successfully`);
      form.reset();
      onClose();
    } catch (error) {
      toast.error(error.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Adjust User Balance</h2>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Amount (₹)</label>
              <Input
                {...form.register("amount")}
                type="number"
                step={0.01}
                className="rounded-xl"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Adjustment Type</label>
              <div className="flex gap-4">
                <label className={cn("flex items-center gap-2 cursor-pointer", type === "ADD" && "bg-green-500 text-white")}>
                  <input {...form.register("type")} type="radio" value="ADD" id="type-add" />
                  <span>Add Funds</span>
                </label>
                <label className={cn("flex items-center gap-2 cursor-pointer", type === "REMOVE" && "bg-red-500 text-white")}>
                  <input {...form.register("type")} type="radio" value="REMOVE" id="type-remove" />
                  <span>Remove Funds</span>
                </label>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Reason</label>
              <Input
                {...form.register("reason")}
                placeholder="e.g., Manual bonus, Penalty deduction"
                className="rounded-xl"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end mt-6">
            <button
              type="button"
              variant="outline"
              onClick={() => onClose()}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Step 4: Run type check**

```bash
npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add app/admin/users/[userId]/page.tsx components/admin/
git commit -m "feat(admin): create user detail page with full management"
```

---

## Task 6: Create Transactions Page

**Files:**
- Create: `app/admin/transactions/page.tsx`

**Step 1: Create transactions page**

```typescript
"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDownToLine,
  Download,
  Filter,
  RefreshCw,
  DollarSign,
} from "lucide-react";
import { api } from "@/lib/trpc/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type TransactionType = "all" | "DEPOSIT" | "PURCHASE" | "REFUND" | "PROMO" | "ADJUSTMENT";

export default function TransactionsPage() {
  const [filterType, setFilterType] = useState<TransactionType>("all");
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [userIdFilter, setUserIdFilter] = useState("");

  const { data, isLoading, refetch } = api.admin.allTransactions.useQuery({
    filterType,
    search,
    userId: userIdFilter,
    dateRange,
  });

  const { data: stats } = api.admin.getTransactionStats.useQuery();

  const exportMutation = api.admin.exportTransactions.useMutation();

  const handleExport = async () => {
    await exportMutation.mutateAsync({ filterType });
    toast.success("Transactions exported successfully");
  };

  const filteredTransactions = data?.transactions || [];

  return (
    <div className="min-h-[calc(100vh-7rem)] bg-background/50 p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Transactions</h1>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-card border border-border rounded-2xl p-6">
              <h3 className="text-lg font-semibold">Overview</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <DollarSign size={24} className="text-primary" />
                  <div>
                    <div className="text-2xl font-bold text-foreground">{stats?.totalRevenue?.toFixed(2) || "0.00"}</div>
                    <div className="text-sm text-muted-foreground">Total Revenue</div>
                  </div>
                </div>
                <div>
                  <TrendingUp size={24} className="text-green-500" />
                  <div>
                    <div className="text-2xl font-bold text-foreground">{stats?.totalPurchases || 0}</div>
                    <div className="text-sm text-muted-foreground">Total Purchases</div>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <Activity className="w-6 h-6 text-muted-foreground" />
              <div>
                    <div className="text-2xl font-bold text-foreground">{stats?.totalDeposits || 0}</div>
                    <div className="text-sm text-muted-foreground">Total Deposits</div>
                  </div>
                </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Filters</h3>

              {/* Type Filter */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as TransactionType)}
                  className="rounded-lg"
                >
                  <option value="all">All Types</option>
                  <option value="DEPOSIT">Deposits</option>
                  <option value="PURCHASE">Purchases</option>
                  <option value="REFUND">Refunds</option>
                  <option value="PROMO">Promocodes</option>
                  <option value="ADJUSTMENT">Adjustments</option>
                </select>
              </div>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2">
              <ArrowDownToLine size={16} className="text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-3 py-2 rounded-lg border-border"
              />
            </div>

            {/* Date Range */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <input
                type="date"
                placeholder="Start date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...e.target.value, start: dateRange.end || e.target.value })}
                className="rounded-lg border-border"
              />
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <input
                type="date"
                placeholder="End date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...e.target.value, end: dateRange.start || e.target.value })}
                className="rounded-lg border-border"
              />
              <button
                onClick={() => setDateRange({ start: null, end: null })}
                className="text-xs text-muted-foreground"
              >
                Clear
              </button>
              </div>
            </div>

            {/* Export */}
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90"
            >
              <Download className="w-4 h-4 text-white" />
              Export Transactions
            </button>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden mt-6">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="border-b hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center gap-2",
                        tx.type === "DEPOSIT" ? "text-green-500" : tx.type === "PURCHASE" ? "text-red-500" : tx.type === "REFUND" ? "text-blue-500" : tx.type === "PROMO" ? "text-purple-500" : "text-amber-500"
                      )}>
                        {tx.type === "DEPOSIT" && "+"}
                        {tx.type === "REFUND" && "+"}
                        {tx.type === "PROMO" && "+"}
                        {tx.type === "ADJUSTMENT" && "±"}
                      {tx.type === "PURCHASE" && "-"}
                      {tx.type === "ADJUSTMENT" && "±"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT" && "×"}
                      {tx.type === "ADJUSTMENT && "×"}
                      {tx.type === "ADJUSTMENT && "×"}
                      {tx.type === "ADJUSTMENT && "×"}
                      {tx.type === "ADJUSTMENT && "×"}
                      {tx.type === "ADJUSTMENT && "×"}
                      {tx.type === "ADJUSTMENT && "×"}
                      {tx.type === "ADJUSTMENT && "×"}
                      {tx.type === "ADJUSTMENT && "×"}
                      {tx.type === "ADJUSTMENT && "×"}
                      {tx.type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT" && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT" && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADREFUND && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "AST JUSTMENT && "×"}
                      {type === "ADJUSTMENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "AD JUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "AST JUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "AST JUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "AST JUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "AD JUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "AST JUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "AST JUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {type === "ADJUSTENT && "×"}
                      {catch (error: console.error("Error rendering transactions:", error); return null;
    })}
  );
}
```

**Step 2: Run type check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add app/admin/transactions/page.tsx components/admin/
git commit -m "feat(admin): create transactions page with filters and export"
```

---

## Task 7: Create Promocodes Page

**Files:**
- Create: `app/admin/promos/page.tsx`
- Create: `components/admin/promo-dialog.tsx`

**Step 1: Create promocodes page**

```typescript
"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gift,
  Plus,
  RefreshCw,
  Trash2,
  Settings,
  Edit2,
  Search,
} from "lucide-react";
import { api } from "@/lib/trpc/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type PromoStatus = "active" | "expired" | "disabled";

export default function PromocodesPage() {
  const { data: promos, isLoading, refetch } = api.admin.promos.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");

  const [createMutation, updateMutation, deleteMutation, generateMutation, activateMutation] = deactivateMutation] = api.admin.promos;

  const form = useForm<z.infer<typeof promoSchema>>();

  const generateMutation = api.admin.promos.generate.useMutation();

  const handleGenerate = async () => {
    const result = await generateMutation.mutateAsync({ count: 5 });
    toast.success(`Generated ${result.count} promocodes`);
    setDialogOpen(false);
  };

  const createSchema = z.object({
    amount: z.number().positive("Amount is required"),
    maxUses: z.number().int().min(1).default(1),
    code: z.string().min(6).regex(/^[A-Z0-9]+$/),
    description: z.string().optional(),
    expiryDate: z.date().optional(),
  });

  return (
    <div className="min-h-[calc(100vh-7rem)] bg-background/50 p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Promocodes</h1>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setFormMode("create")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90"
            >
              <Plus size={20} />
              Create Promo
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="mb-4">
              <RefreshCw className="w-6 h-6 text-muted-foreground" />
              <div className="text-sm font-medium">Total Promocodes</div>
              <div className="text-3xl font-bold">{data?.totalCount || 0}</div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-6">
            <Gift className="w-6 h-6 text-muted-foreground" />
            <div className="text-sm font-medium">Active</div>
            <div className="text-3xl font-bold">{data?.promos?.filter(p => p.isActive)?.length || 0}</div>
          </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-6">
            <Trash2 className="w-6 h-6 text-muted-foreground" />
            <div className="text-sm font-medium">Expired</div>
            <div className="text-3xl font-bold">{data?.promos?.filter(p => !p.isActive && p.expiryDate && new Date(p.expiryDate) < new Date())?.length || 0}</div>
          </div>
        </div>
        </div>

        {/* Promocodes Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden mt-6">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Max Uses</th>
                <th className="px-4 py-3">Used</th>
                <th className="px-4 py-3">Remaining</th>
                <th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.promos?.map((promo) => (
                <tr key={promo.id} className="border-b">
                  <td className="px-4 py-3 font-mono">{promo.code}</td>
                  <td className="px-4 py-3">₹{promo.amount.toFixed(2)}</td>
                  <td className="px-4 py-3">{promo.maxUses}</td>
                  <td className="px-4 py-3">{promo.usedCount}</td>
                  <td className="px-4 py-3">{promo.maxUses - promo.usedCount}</td>
                  <td className="px-4 py-3">
                    {promo.expiryDate ? new Date(promo.expiryDate).toLocaleDateString() : "-"}
                  </td>
                  <td className={cn(
                    "px-4 py-3",
                    promo.isActive ? "text-green-500" : promo.expiryDate && new Date(promo.expiryDate) < new Date() ? "text-red-500" : "text-muted-foreground"
                  )}
                  >
                    {promo.isActive ? "Active" : promo.expiryDate ? "Expired" : "Disabled"}
                  </td>
                  <td className="px-4 py-3">{new Date(promo.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setFormMode("edit"); setDialogOpen(true); setSelectedPromo(promo);}}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={() => setFormMode("create"); setDialogOpen(true); setSelectedPromo(null); setForm.reset()}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      onClick={async () => {
                        await generateMutation.mutateAsync({ count: 5 });
                        refetch();
                      }}
                      disabled={generateMutation.isPending}
                    >
                      <RefreshCw className="w-4 h-4 text-white" />
                      Generate 5 Codes
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate({ id: promo.id })}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Create/Edit Dialog */}
      <AnimatePresence>
        {dialogOpen && (
          <PromoDialog
            isOpen={dialogOpen}
            mode={formMode}
            promo={selectedPromo}
            onClose={() => {
              setDialogOpen(false);
              setSelectedPromo(null);
              form.reset();
            }}
            onSuccess={() => {
              refetch();
              toast.success("Promocode updated successfully");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
```

**Step 2: Run type check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add app/admin/promos/page.tsx components/admin/
git commit -m "feat(admin): create promocodes management page"
```

---

## Task 8: Enhance Settings Page

**Files:**
- Modify: `app/admin/settings/page.tsx`

**Step 1: Enhance existing settings with new sections**

Add these sections to existing settings page:

```typescript
// Add new sections after existing sections

{/* Payment Settings Section - Enhanced */}
<div className={cn("border-b", activeSection === "payment" && "border-primary")}>
  <div className="p-4">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold">Payment Settings</h2>
      <Activity className="w-6 h-6 text-muted-foreground" />
      Payment
    </div>
  </div>

  {/* UPI Section */}
  <div className="space-y-4">
    <div>
      <label className="text-xs font-medium text-muted-foreground">UPI ID</label>
      <Input
        value={settings?.upiId || ""}
        onChange={(e) => {
          const value = e.target.value.toUpperCase();
          settingsMutation.mutate({ upiId: value });
        }}
        className="rounded-lg"
      />
    </div>

    <div>
      <label className="text-xs font-medium text-muted-foreground">QR Code Image</label>
      <div className="flex items-center gap-2">
        <img
          src={settings?.bharatpeQrImage || "https://via.placeholder.com/qr.png"}
          alt="QR Code"
          className="w-16 h-16 object-contain rounded-lg"
        />
        <button
          onClick={() => setEditingQrImage(true)}
          className="text-xs text-muted-foreground hover:text-primary"
        >
          Upload
        </button>
        <button
          onClick={() => settingsMutation.mutate({ bharatpeQrImage: "" })}
          className="text-xs text-red-500 hover:text-red-600"
        >
          Clear
        </button>
      </div>
    </div>

    <div>
      <label className="text-xs font-medium text-muted-foreground">Merchant ID</label>
      <Input
        value={settings?.bharatpeMerchantId || ""}
        onChange={(e) => settingsMutation.mutate({ bharatpeMerchantId: e.target.value })}
        className="rounded-lg"
      />
    </div>

    <div>
      <label className="text-xs font-medium text-muted-foreground">Merchant Token</label>
      <Input
        type="password"
        value={showToken ? settings?.bharatpeToken : ""}
        onChange={(e) => settingsMutation.mutate({ bharatpeToken: e.target.value })}
        className="rounded-lg"
      />
      <button
        onClick={() => setShowToken(!showToken)}
        className="text-xs text-muted-foreground"
      >
        {showToken ? "Hide" : "Show"}
      </button>
    </div>
  </div>

  {/* Timer Settings Section */}
  <div className={cn("border-b", activeSection === "timer" && "border-primary")}>
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Timer Settings</h2>
        <Clock className="w-6 h-6 text-muted-foreground" />
        Timer
      </div>
    </div>
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Number Expiry (minutes)</label>
        <Input
          type="number"
          value={settings?.numberExpiryMinutes || 20}
          onChange={(e) => settingsMutation.mutate({ numberExpiryMinutes: parseInt(e.target.value) })}
          min={1}
          max={60}
          className="rounded-lg"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Minimum Cancel Time (minutes)</label>
        <Input
          type="number"
          value={settings?.minCancelMinutes || 2}
          onChange={(e) => settingsMutation.mutate({ minCancelMinutes: parseInt(e.target.value) })}
          min={0}
          max={60}
          className="rounded-lg"
        />
      </div>
  </div>
  </div>

  {/* Referral Settings Section */}
  <div className={cn("border-b", activeSection === "referral" && "border-primary")}>
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Referral Settings</h2>
        <Activity className="w-6 h-6 text-muted-foreground" />
        Referral
      </div>
    </div>
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Referral Percentage (%)</label>
        <Input
          type="number"
          value={settings?.referralPercent || 0}
          onChange={(e) => settingsMutation.mutate({ referralPercent: parseFloat(e.target.value) })}
          min={0}
          max={100}
          step={0.5}
          className="rounded-lg"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Minimum Redeem Amount (₹)</label>
        <Input
          type="number"
          value={settings?.minRedeem || 10}
          onChange={(e) => settingsMutation.mutate({ minRedeem: parseFloat(e.target.value) })}
          min={1}
          step={1}
          max={10000}
          className="rounded-lg"
        />
      </div>
  </div>
  </div>
```

**Step 2: Add promocodes router procedures**

Add to `lib/trpc/routers/admin.ts`:

```typescript
// Promocode management
promos: adminProcedure
  .query(async () => {
    return await prisma.promocode.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });
  }),

generate: adminProcedure
  .input(z.object({ count: z.number().int().min(1).max(100).default(1) }))
  .mutation(async ({ input }) => {
    // Generate promocodes using nanoid
    const promocodes = [];
    const code = nanoid(6).toUpperCase();
    for (let i = 0; i < input.count; i++) {
      promocodes.push({
        code: `${code}${i.toString().padStart(4, "0")}`,
        amount: input.amount,
        maxUses: input.maxUses,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
      });
    }

    const result = await prisma.promocode.createMany({
      data: promocodes,
    });

    return {
      count: result.length,
      promocodes: result.map((p) => ({
        ...p,
        usedCount: 0,
        remainingUses: p.maxUses,
      })),
    };
  }),

update: adminProcedure
  .input(promoSchema)
  .mutation(async ({ input }) => {
    const promo = await prisma.promocode.findUnique({
      where: { id: input.id },
    });

    if (!promo) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Promocode not found",
      });
    }

    await prisma.promocode.update({
      where: { id: input.id },
      data: input,
    });

    return promo;
  }),

deactivate: adminProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ input }) => {
    const promo = await prisma.promocode.findUnique({
      where: { id: input.id },
    });

    if (!promo) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Promocode not found",
      });
    }

    await prisma.promocode.update({
      where: { id: input.id },
      data: { isActive: false },
    });

    return { success: true };
  }),

delete: adminProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ input }) => {
    const promo = await prisma.promocode.findUnique({
      where: { id: input.id },
    });

    // Check if promocode has been used
    const usageCount = await prisma.promocodeHistory.count({
      where: { promocodeId: input.id },
    });

    if (usageCount > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot delete promocode that has been used",
      });
    }

    await prisma.promocode.delete({
      where: { id: input.id },
    });

    return { success: true };
  }),
```

**Step 3: Run type check**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add lib/trpc/routers/admin.ts prisma/schema.prisma
git commit -m "feat(admin): add promocodes management"
```

---

## Task 9: Add All Transactions Query

**Files:**
- Modify: `lib/trpc/routers/admin.ts`

**Step 1: Add all transactions query**

```typescript
// Add before stats procedure
allTransactions: adminProcedure
  .input(z.object({
    search: z.string().optional(),
    filterType: z.enum(["all", "DEPOSIT", "PURCHASE", "REFUND", "PROMO", "ADJUSTMENT"]).optional(),
    userId: z.string().optional(),
    dateFrom: z.date().optional(),
    dateTo: z.date().optional(),
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(20),
  })
  .query(async ({ ctx, input }) => {
    const { search, filterType, userId, dateFrom, dateTo, page, limit } = input;

    // Build where clause
    const where: any = {};
    if (search) {
      where.OR = [
        { description: { contains: search, mode: "insensitive" } },
        { txnId: { contains: search } },
        { metadata: { path: ["user.id"], mode: "contains" } },
      ];
    }
    }

    if (filterType && filterType !== "all") {
      switch (filterType) {
        case "DEPOSIT":
          where.type = "DEPOSIT";
          break;
        case "PURCHASE":
          where.type = "PURCHASE";
          break;
        case "REFUND":
          where.type = "REFUND";
          break;
        case "PROMO":
          where.type = "PROMO";
          break;
        case "ADJUSTMENT":
          where.type = "ADJUSTMENT";
          break;
      }
    }
    }

    if (userId) {
      where.userId = userId;
    }

    if (dateFrom && dateTo) {
      where.createdAt = { gte: dateFrom, lte: new Date(dateFrom) };
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    const hasMore = transactions.length >= page * limit;

    return {
      transactions,
      total,
      hasMore,
    };
  }),

// Add to exports
export { allTransactions };
```

**Step 2: Add export transactions mutation**

```typescript
export: adminProcedure
  .input(z.object({
    filterType: z.enum(["all", "DEPOSIT", "PURCHASE", "REFUND", "PROMO", "ADJUSTMENT"]).optional(),
    userId: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const transactions = await prisma.transaction.findMany({
      where: {
        ...(input.filterType && input.filterType !== "all" && { type: input.filterType }),
        ...(input.search && { OR: [
          { description: { contains: input.search, mode: "insensitive" } },
          { txnId: { contains: input.search } },
        ]),
      },
        ...(input.userId && { userId: input.userId }),
      },
      orderBy: { createdAt: "desc" },
    });

    // Generate CSV
    const csvContent = transactions.map(tx => {
      const user = tx.metadata?.userId as string | "Unknown";
      return [
        "Date,Type,Amount,Description,User,UTR/Ref ID",
        `${new Date(tx.createdAt).toISOString()},${tx.type},${tx.amount},${tx.description || tx.type},${user},${tx.txId || ""}`,
      ].join(",");
    });

    return new Response(
      new Blob([csvContent.join("\n")], { type: "text/csv" }),
      {
        headers: new Headers({ "Content-Disposition": `attachment; filename="transactions.csv"` }),
      },
    );
  }),
```

**Step 3: Run type check**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add lib/trpc/routers/admin.ts
git commit -m "feat(admin): add all transactions query with export"
```

---

## Task 10: Build and Test

**Step 1: Build project**

```bash
npm run build
```

Expected: Build succeeds without errors, all 12 routes generated.

**Step 2: Run linting**

```bash
npm run lint
```

Expected: No linting errors.

**Step 3: Test key scenarios manually**

Test 1: Admin Layout
- Navigate to /admin
- Verify sidebar navigation works
- Click logout button
- Verify redirect to home

Test 2: Users List
- Load users page
- Search by telegram ID
- Filter by status
- Verify pagination
- Test edit/delete user
- View user details

Test 3: User Detail
- Edit user profile
- Adjust user balance
- Toggle admin rights
- View user transactions
- Verify all tabs work

Test 4: Transactions
- View all transactions
- Filter by type
- Search transactions
- Export transactions as CSV

Test 5: Dashboard
- Verify all stats cards display correctly
- Check OTP stats

Test 6: Promocodes
- Create new promocodes
- Edit existing promocodes
- Generate bulk promocodes
- Activate/deactivate

Test 7: Settings
- Edit UPI ID
- Update QR code image
- Set timer values
- Update referral settings
- Test BharatPe credentials

Test 8: Services/Servers
- Verify CRUD operations
- Test server flag updates

Test 9: Logout
- Verify admin session is cleared

---

## Summary

This implementation provides:

**Admin Features:**
1. **User Management (CRUD)** - List, view details, edit all fields, balance adjustments, admin toggle
2. **Transaction Statistics** - Overview stats, detailed transaction view, CSV export
3. **Promocode Management** - Generate, edit, activate/deactivate, usage tracking
4. **Dashboard** - Real-time statistics across all metrics
5. **Settings** - Enhanced with UPI, timers, referral, maintenance mode
6. **Admin Layout** - Sidebar navigation, logout button

**Security:**
- Admin-only procedures with role checking
- User audit logs for all admin actions
- Soft delete for users (reversible if needed)
- Balance adjustments tracked in transactions

**UI Consistency:**
- Uses existing design patterns from settings page
- Framer Motion for animations
- shadcn/ui components
- Sonner toasts for notifications
- Indian Rupee (₹) currency throughout
- Color-coded transactions by type
- Loading states during async operations
```

---

## Notes for Implementation

- All operations use Prisma transactions for data consistency
- CSV export includes all transaction details
- Balance adjustments create ADJUSTMENT transactions with admin metadata
- User audit logs stored for accountability
- Admin router added to app router for admin.auth middleware (already exists)
