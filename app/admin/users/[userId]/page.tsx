"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  User as UserIcon,
  Mail,
  Phone,
  Shield,
  Star,
  Calendar,
  IndianRupee,
  Edit,
  Trash2,
  Loader2,
  MoreVertical,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  Clock,
  Tag,
  Activity,
  History,
  CreditCard,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import type { User } from "@/types";

// Animation helper
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring" as const, stiffness: 280, damping: 24, delay },
});

// Format currency in INR
const formatCurrency = (value: number | { toNumber: () => number } | null | undefined) => {
  if (value === null || value === undefined) return "₹0.00";
  const num = typeof value === "number" ? value : value.toNumber();
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(num);
};

// Format date
const formatDate = (date: Date | string) => {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

// Format date short
const formatDateShort = (date: Date | string) => {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
};

// Get user initials for avatar
function getUserInitials(user: { firstName?: string | null; lastName?: string | null; telegramUsername?: string | null }): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  }
  if (user.firstName) {
    return user.firstName[0].toUpperCase();
  }
  if (user.telegramUsername) {
    return user.telegramUsername.slice(0, 2).toUpperCase();
  }
  return "U";
}

// Get user display name
function getUserDisplayName(user: { firstName?: string | null; lastName?: string | null; telegramUsername?: string | null }): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  if (user.firstName) {
    return user.firstName;
  }
  return user.telegramUsername || "Unknown";
}

// Transaction type badge colors
const getTransactionBadgeVariant = (type: string) => {
  switch (type) {
    case "DEPOSIT":
      return "default";
    case "PROMO":
      return "secondary";
    case "ADJUSTMENT":
      return "outline";
    case "PURCHASE":
      return "destructive";
    case "REFUND":
      return "secondary";
    default:
      return "outline";
  }
};

// Transaction status badge colors
const getTransactionStatusBadge = (status: string) => {
  switch (status) {
    case "COMPLETED":
      return "default";
    case "PENDING":
      return "secondary";
    case "FAILED":
      return "destructive";
    default:
      return "outline";
  }
};

// Tab type
type TabValue = "profile" | "wallet" | "stats" | "transactions";

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;

  // State
  const [tab, setTab] = useState<TabValue>("profile");
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [adjustBalanceOpen, setAdjustBalanceOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");

  // Edit profile form state
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAdmin, setEditAdmin] = useState(false);
  const [editPremium, setEditPremium] = useState(false);
  const [editReason, setEditReason] = useState("");

  // Balance adjustment form state
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustAction, setAdjustAction] = useState<"credit" | "debit">("credit");

  // Queries
  const { data: user, isLoading, refetch, isFetching } = trpc.admin.user.get.useQuery(
    { id: userId },
    { enabled: !!userId }
  );

  const { data: transactionsData } = trpc.admin.user.transactions.useQuery(
    { userId },
    { enabled: !!userId && !!user?.wallet?.id }
  );

  // Mutations
  const updateMutation = trpc.admin.user.update.useMutation({
    onSuccess: () => {
      toast.success("User updated successfully");
      setEditProfileOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const setAdminMutation = trpc.admin.user.setAdmin.useMutation({
    onSuccess: () => {
      toast.success("Admin status updated");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const balanceAdjustMutation = trpc.admin.user.balanceAdjust.useMutation({
    onSuccess: () => {
      toast.success("Balance adjusted successfully");
      setAdjustBalanceOpen(false);
      setAdjustAmount(0);
      setAdjustReason("");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = trpc.admin.user.delete.useMutation({
    onSuccess: () => {
      toast.success("User deleted successfully");
      setDeleteDialogOpen(false);
      router.push("/admin/users");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Initialize edit form when user loads
  if (user && editName === "") {
    setEditName(user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user.telegramUsername || "");
    setEditEmail(user.email || "");
    setEditAdmin(user.isAdmin ?? false);
    setEditPremium(user.isPremium ?? false);
  }

  // Handlers
  const handleEditProfile = () => {
    const names = editName.split(" ");
    const firstName = names[0] || user?.firstName || "";
    const lastName = names.slice(1).join(" ") || user?.lastName || null;

    updateMutation.mutate({
      id: userId,
      name: editName || user?.telegramUsername || undefined,
      email: editEmail || null,
      isAdmin: editAdmin,
      isPremium: editPremium,
      reason: editReason,
    });
  };

  const handleToggleAdmin = () => {
    setAdminMutation.mutate({
      userId,
      isAdmin: !user?.isAdmin,
    });
  };

  const handleBalanceAdjust = () => {
    const amount = adjustAction === "credit" ? Math.abs(adjustAmount) : -Math.abs(adjustAmount);
    balanceAdjustMutation.mutate({
      userId,
      amount,
      reason: adjustReason || "Manual adjustment by admin",
    });
  };

  const handleDeleteConfirm = () => {
    deleteMutation.mutate({
      id: userId,
      permanent: false,
      reason: deleteReason || "Deleted by admin",
    });
  };

  const handleCreditClick = () => {
    setAdjustAction("credit");
    setAdjustBalanceOpen(true);
  };

  const handleDebitClick = () => {
    setAdjustAction("debit");
    setAdjustBalanceOpen(true);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <motion.div {...fadeUp()} className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </motion.div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  // Not found
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <UserIcon size={64} className="text-muted-foreground/40 mb-4" />
        <h2 className="text-xl font-semibold mb-2">User not found</h2>
        <p className="text-muted-foreground mb-6">
          The user you're looking for doesn't exist or has been deleted.
        </p>
        <Button variant="outline" onClick={() => router.push("/admin/users")}>
          <ArrowLeft size={16} className="mr-2" />
          Back to Users
        </Button>
      </div>
    );
  }

  const displayName = getUserDisplayName(user);
  const initials = getUserInitials(user);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div {...fadeUp()} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/admin/users")}
            className="shrink-0"
          >
            <ArrowLeft size={18} />
          </Button>
          <Avatar size="lg" className="border-2 border-border">
            {user.photoUrl && <AvatarImage src={user.photoUrl} alt={displayName} />}
            {user.telegramUsername && !user.photoUrl && (
              <AvatarImage
                src={`https://t.me/i/userpic/320/${user.telegramUsername}.jpg`}
                alt={displayName}
              />
            )}
            <AvatarFallback className="text-lg">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              {displayName}
              {user.isPremium && (
                <Badge variant="outline" className="gap-1">
                  <Star size={12} fill="currentColor" />
                  Premium
                </Badge>
              )}
              {user.isAdmin && (
                <Badge className="gap-1">
                  <Shield size={12} />
                  Admin
                </Badge>
              )}
              {user.deletedAt && (
                <Badge variant="destructive">Deleted</Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              ID: {user.id.slice(0, 8)}...
              {user.telegramUsername && ` • @${user.telegramUsername}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isFetching}>
                {isFetching ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <MoreVertical size={16} />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditProfileOpen(true)}>
                <Edit size={14} className="mr-2" />
                Edit Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggleAdmin} disabled={!!user.deletedAt}>
                <UserCheck size={14} className="mr-2" />
                {user.isAdmin ? "Remove Admin" : "Make Admin"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {!user.isAdmin && !user.deletedAt && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 size={14} className="mr-2" />
                  Delete User
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <motion.div {...fadeUp(0.05)} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="bg-green-500/10 p-2 rounded-lg">
              <IndianRupee size={18} className="text-green-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-medium">Balance</p>
              <p className="text-xl font-bold text-foreground">
                {formatCurrency(user.wallet?.balance)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500/10 p-2 rounded-lg">
              <CreditCard size={18} className="text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-medium">Total Spent</p>
              <p className="text-xl font-bold text-foreground">
                {formatCurrency(user.wallet?.totalSpent)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="bg-purple-500/10 p-2 rounded-lg">
              <Tag size={18} className="text-purple-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-medium">Numbers</p>
              <p className="text-xl font-bold text-foreground">
                {user.stats?.totalNumbers || 0}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/10 p-2 rounded-lg">
              <Activity size={18} className="text-amber-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-medium">OTP Sold</p>
              <p className="text-xl font-bold text-foreground">
                {user.wallet?.totalOtp || 0}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div {...fadeUp(0.1)}>
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
          <TabsList className="w-full md:w-auto">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="wallet">Wallet</TabsTrigger>
            <TabsTrigger value="stats">Stats</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="mt-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-xl p-6 space-y-6"
            >
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <UserIcon size={18} />
                Profile Information
              </h2>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Basic Info */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Basic Information</h3>

                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Telegram ID</Label>
                      <p className="text-sm font-mono">{user.telegramId || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Username</Label>
                      <p>
                        {user.telegramUsername ? (
                          <Link
                            href={`https://t.me/${user.telegramUsername}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline text-sm"
                          >
                            @{user.telegramUsername}
                          </Link>
                        ) : (
                          <span className="text-sm">-</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Email</Label>
                      <p className="text-sm">{user.email || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Name</Label>
                      <p className="text-sm">
                        {user.firstName && user.lastName
                          ? `${user.firstName} ${user.lastName}`
                          : user.firstName || user.lastName || "-"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Account Status */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Account Status</h3>

                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Admin Status</Label>
                      <div className="flex items-center gap-2 mt-1">
                        {user.isAdmin ? (
                          <>
                            <CheckCircle2 size={16} className="text-green-500" />
                            <span className="text-sm">Administrator</span>
                          </>
                        ) : (
                          <>
                            <XCircle size={16} className="text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Regular User</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Premium Status</Label>
                      <div className="flex items-center gap-2 mt-1">
                        {user.isPremium ? (
                          <>
                            <Star size={16} className="text-amber-500" fill="currentColor" />
                            <span className="text-sm">Premium User</span>
                          </>
                        ) : (
                          <>
                            <Star size={16} className="text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Standard User</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Account Status</Label>
                      <div className="flex items-center gap-2 mt-1">
                        {user.deletedAt ? (
                          <>
                            <XCircle size={16} className="text-destructive" />
                            <span className="text-sm text-destructive">Deleted</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={16} className="text-green-500" />
                            <span className="text-sm">Active</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Joined</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Calendar size={16} className="text-muted-foreground" />
                        <span className="text-sm">{formatDateShort(user.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <Button onClick={() => setEditProfileOpen(true)}>
                  <Edit size={16} className="mr-2" />
                  Edit Profile
                </Button>
              </div>
            </motion.div>
          </TabsContent>

          {/* Wallet Tab */}
          <TabsContent value="wallet" className="mt-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Balance Card */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <IndianRupee size={18} />
                    Wallet Balance
                  </h2>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCreditClick}
                      disabled={!!user.deletedAt}
                    >
                      <ArrowUpDown size={14} className="mr-2 rotate-180" />
                      Add Funds
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDebitClick}
                      disabled={!!user.deletedAt}
                    >
                      <ArrowUpDown size={14} className="mr-2" />
                      Deduct
                    </Button>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl p-6">
                  <p className="text-sm text-muted-foreground mb-1">Current Balance</p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(user.wallet?.balance)}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Spent</p>
                    <p className="text-lg font-semibold">{formatCurrency(user.wallet?.totalSpent)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Recharged</p>
                    <p className="text-lg font-semibold">{formatCurrency(user.wallet?.totalRecharge)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">OTP Count</p>
                    <p className="text-lg font-semibold">{user.wallet?.totalOtp || 0}</p>
                  </div>
                </div>
              </div>

              {/* Recent Transactions */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <Clock size={18} />
                  Recent Transactions
                </h2>
                {transactionsData && transactionsData.transactions.length > 0 ? (
                  <div className="space-y-3">
                    {transactionsData.transactions.slice(0, 5).map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between p-3 bg-muted/40 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant={getTransactionBadgeVariant(tx.type)}>
                            {tx.type}
                          </Badge>
                          <div>
                            <p className="text-sm font-medium">{tx.description}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</p>
                          </div>
                        </div>
                        <p
                          className={`text-sm font-semibold ${
                            tx.type === "DEPOSIT" || tx.type === "PROMO"
                              ? "text-green-600 dark:text-green-400"
                              : "text-destructive"
                          }`}
                        >
                          {tx.type === "DEPOSIT" || tx.type === "PROMO" ? "+" : "-"}
                          {formatCurrency(tx.amount)}
                        </p>
                      </div>
                    ))}
                    {transactionsData.total > 5 && (
                      <div className="pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTab("transactions")}
                          className="w-full"
                        >
                          View all transactions
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CreditCard size={32} className="text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No transactions yet</p>
                  </div>
                )}
              </div>
            </motion.div>
          </TabsContent>

          {/* Stats Tab */}
          <TabsContent value="stats" className="mt-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Usage Stats */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <Activity size={18} />
                  Usage Statistics
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-muted/40 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Total Numbers</p>
                    <p className="text-2xl font-bold">{user.stats?.totalNumbers || 0}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">OTP Sold</p>
                    <p className="text-2xl font-bold">{user.wallet?.totalOtp || 0}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Promos Used</p>
                    <p className="text-2xl font-bold">{user.stats?.promoUsed || 0}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Custom Prices</p>
                    <p className="text-2xl font-bold">{user.stats?.customPrices || 0}</p>
                  </div>
                </div>
              </div>

              {/* Financial Stats */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <IndianRupee size={18} />
                  Financial Overview
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-muted/40 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Current Balance</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(user.wallet?.balance)}
                    </p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Total Spent</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(user.wallet?.totalSpent)}
                    </p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Total Recharged</p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(user.wallet?.totalRecharge)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Account Info */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <UserIcon size={18} />
                  Account Information
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-muted/40 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">User ID</p>
                    <p className="text-sm font-mono">{user.id}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Telegram ID</p>
                    <p className="text-sm font-mono">{user.telegramId || "-"}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Joined Date</p>
                    <p className="text-sm">{formatDate(user.createdAt)}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Last Updated</p>
                    <p className="text-sm">{formatDate(user.updatedAt)}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions" className="mt-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-xl p-6"
            >
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <History size={18} />
                Transaction History
              </h2>
              {transactionsData && transactionsData.transactions.length > 0 ? (
                <div className="space-y-3">
                  {transactionsData.transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-4 bg-muted/40 rounded-lg hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant={getTransactionBadgeVariant(tx.type)}>
                          {tx.type}
                        </Badge>
                        <Badge variant={getTransactionStatusBadge(tx.status)}>
                          {tx.status}
                        </Badge>
                        <div>
                          <p className="text-sm font-medium">{tx.description}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</p>
                          {tx.txnId && (
                            <p className="text-xs text-muted-foreground font-mono">
                              TXN: {tx.txnId}
                            </p>
                          )}
                        </div>
                      </div>
                      <p
                        className={`text-lg font-semibold ${
                          tx.type === "DEPOSIT" || tx.type === "PROMO"
                            ? "text-green-600 dark:text-green-400"
                            : "text-destructive"
                        }`}
                      >
                        {tx.type === "DEPOSIT" || tx.type === "PROMO" ? "+" : "-"}
                        {formatCurrency(tx.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <History size={48} className="text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">No transactions found</p>
                </div>
              )}
            </motion.div>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Edit Profile Dialog */}
      <Dialog open={editProfileOpen} onOpenChange={setEditProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Update user profile information and settings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editName">Name</Label>
              <Input
                id="editName"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="User name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editEmail">Email</Label>
              <Input
                id="editEmail"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1 flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="editAdmin"
                  checked={editAdmin}
                  onChange={(e) => setEditAdmin(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="editAdmin" className="text-sm">
                  Admin Access
                </Label>
              </div>
              <div className="flex-1 flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="editPremium"
                  checked={editPremium}
                  onChange={(e) => setEditPremium(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="editPremium" className="text-sm">
                  Premium User
                </Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editReason">Reason for change (optional)</Label>
              <Textarea
                id="editReason"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Describe the reason for this change..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProfileOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditProfile} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Balance Adjustment Dialog */}
      <Dialog open={adjustBalanceOpen} onOpenChange={setAdjustBalanceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {adjustAction === "credit" ? "Add Funds" : "Deduct Funds"}
            </DialogTitle>
            <DialogDescription>
              {adjustAction === "credit"
                ? "Add funds to user's wallet balance"
                : "Deduct funds from user's wallet balance"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="adjustAmount">Amount (₹)</Label>
              <Input
                id="adjustAmount"
                type="number"
                value={adjustAmount || ""}
                onChange={(e) => setAdjustAmount(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjustReason">Reason</Label>
              <Textarea
                id="adjustReason"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Describe the reason for this adjustment..."
                rows={3}
              />
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Current Balance:</p>
              <p className="text-lg font-bold">{formatCurrency(user.wallet?.balance)}</p>
              <p className="text-xs text-muted-foreground mt-2">
                New Balance:{" "}
                <span className="font-semibold">
                  {formatCurrency(
                    (user.wallet?.balance?.toNumber() || 0) +
                      (adjustAction === "credit" ? adjustAmount : -adjustAmount)
                  )}
                </span>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustBalanceOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBalanceAdjust}
              disabled={balanceAdjustMutation.isPending || adjustAmount <= 0}
              variant={adjustAction === "credit" ? "default" : "destructive"}
            >
              {balanceAdjustMutation.isPending ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Processing...
                </>
              ) : adjustAction === "credit" ? (
                <>
                  <ArrowUpDown size={16} className="mr-2 rotate-180" />
                  Add Funds
                </>
              ) : (
                <>
                  <ArrowUpDown size={16} className="mr-2" />
                  Deduct Funds
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{displayName}</strong>?
              This action can be undone by restoring the user from the deleted tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <Label className="text-sm font-medium">Reason (optional)</Label>
            <Input
              placeholder="Reason for deletion..."
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 size={16} className="mr-2" />
                  Delete User
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
