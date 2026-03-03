"use client";

import { motion } from "framer-motion";
import {
  Users,
  Wallet,
  Activity,
  Server,
  ArrowUpRight,
  CreditCard,
  MessageSquare,
  DollarSign,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";

// Animation helper
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring" as const, stiffness: 280, damping: 24, delay },
});

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  bgColor,
  loading = false,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  loading?: boolean;
}) {
  return (
    <motion.div {...fadeUp()} className={`${bgColor} rounded-xl p-4 border border-border`}>
      <div className="flex items-center gap-3">
        <div className={`${color} p-2 rounded-lg`}>
          <Icon size={18} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="h-6 w-16 mt-1" />
          ) : (
            <p className="text-xl font-bold">{value}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function AdminDashboardPage() {
  // Stats queries
  const { data: generalStats, isLoading: generalStatsLoading } =
    trpc.admin.stats.useQuery();

  const { data: transactionStats, isLoading: transactionStatsLoading } =
    trpc.admin.getTransactionStats.useQuery({});

  const { data: otpStats, isLoading: otpStatsLoading } =
    trpc.admin.getOtpStats.useQuery({});

  const isLoading =
    generalStatsLoading || transactionStatsLoading || otpStatsLoading;

  // Calculate values
  const totalUsers = generalStats?.totalUsers || 0;
  const totalServices = generalStats?.totalServices || 0;
  const totalServers = generalStats?.totalServers || 0;
  const totalTransactions = transactionStats?.total || 0;
  const totalDeposits = transactionStats?.byType?.DEPOSIT?.amount || 0;
  const totalOtpSold = otpStats?.total || 0;
  const totalRevenue = generalStats?.totalRevenue || otpStats?.totalRevenue || 0;

  // Format number with Indian currency
  const formatCurrency = (value: number | { toNumber: () => number }) => {
    const num = typeof value === "number" ? value : value.toNumber();
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(num);
  };

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <motion.div {...fadeUp()}>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your virtual number service
        </p>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={totalUsers}
          icon={Users}
          color="text-blue-500"
          bgColor="bg-blue-500/5"
          loading={generalStatsLoading}
        />
        <StatCard
          title="Total Services"
          value={totalServices}
          icon={Server}
          color="text-amber-500"
          bgColor="bg-amber-500/5"
          loading={generalStatsLoading}
        />
        <StatCard
          title="Total Servers"
          value={totalServers}
          icon={Server}
          color="text-purple-500"
          bgColor="bg-purple-500/5"
          loading={generalStatsLoading}
        />
        <StatCard
          title="Total Transactions"
          value={totalTransactions}
          icon={Activity}
          color="text-cyan-500"
          bgColor="bg-cyan-500/5"
          loading={transactionStatsLoading}
        />
        <StatCard
          title="Total Deposits"
          value={formatCurrency(totalDeposits)}
          icon={CreditCard}
          color="text-green-500"
          bgColor="bg-green-500/5"
          loading={transactionStatsLoading}
        />
        <StatCard
          title="OTP Sold"
          value={totalOtpSold}
          icon={MessageSquare}
          color="text-rose-500"
          bgColor="bg-rose-500/5"
          loading={otpStatsLoading}
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(totalRevenue)}
          icon={DollarSign}
          color="text-primary"
          bgColor="bg-primary/5"
          loading={generalStatsLoading || otpStatsLoading}
        />
        <StatCard
          title="Active Orders"
          value={generalStats?.activeNumbers || 0}
          icon={Wallet}
          color="text-orange-500"
          bgColor="bg-orange-500/5"
          loading={generalStatsLoading}
        />
      </div>

      {/* Quick Actions */}
      <motion.div {...fadeUp(0.1)}>
        <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <a
            href="/admin/users"
            className="bg-card hover:bg-muted border border-border rounded-xl p-4 flex flex-col items-center gap-2 transition-colors"
          >
            <Users size={24} className="text-blue-500" />
            <span className="text-sm font-medium">Users</span>
            <ArrowUpRight size={14} className="text-muted-foreground" />
          </a>
          <a
            href="/admin/services"
            className="bg-card hover:bg-muted border border-border rounded-xl p-4 flex flex-col items-center gap-2 transition-colors"
          >
            <Server size={24} className="text-amber-500" />
            <span className="text-sm font-medium">Services</span>
            <ArrowUpRight size={14} className="text-muted-foreground" />
          </a>
          <a
            href="/admin/promocodes"
            className="bg-card hover:bg-muted border border-border rounded-xl p-4 flex flex-col items-center gap-2 transition-colors"
          >
            <Activity size={24} className="text-green-500" />
            <span className="text-sm font-medium">Promocodes</span>
            <ArrowUpRight size={14} className="text-muted-foreground" />
          </a>
          <a
            href="/admin/settings"
            className="bg-card hover:bg-muted border border-border rounded-xl p-4 flex flex-col items-center gap-2 transition-colors"
          >
            <Wallet size={24} className="text-primary" />
            <span className="text-sm font-medium">Settings</span>
            <ArrowUpRight size={14} className="text-muted-foreground" />
          </a>
        </div>
      </motion.div>

      {/* Recent Activity Placeholder */}
      <motion.div {...fadeUp(0.15)} className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-3">Recent Activity</h2>
        <div className="text-center py-8 text-muted-foreground text-sm">
          Recent activity will be shown here
        </div>
      </motion.div>
    </div>
  );
}
