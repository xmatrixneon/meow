"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  Wallet,
  Download,
  Search,
  Filter,
  RefreshCw,
  ArrowUpDown,
  IndianRupee,
  Calendar,
  FileText,
  User,
  Loader2,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";

// Animation helper
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring" as const, stiffness: 280, damping: 24, delay },
});

// Transaction type options
type TransactionType = "DEPOSIT" | "PURCHASE" | "REFUND" | "PROMO" | "REFERRAL" | "ADJUSTMENT" | undefined;

const typeOptions: { value: TransactionType; label: string; color: string }[] = [
  { value: undefined, label: "All Types", color: "bg-gray-500" },
  { value: "DEPOSIT", label: "Deposit", color: "bg-green-500" },
  { value: "PURCHASE", label: "Purchase", color: "bg-blue-500" },
  { value: "REFUND", label: "Refund", color: "bg-orange-500" },
  { value: "PROMO", label: "Promo", color: "bg-purple-500" },
  { value: "REFERRAL", label: "Referral", color: "bg-pink-500" },
  { value: "ADJUSTMENT", label: "Adjustment", color: "bg-cyan-500" },
];

// Transaction status options
type TransactionStatus = "PENDING" | "COMPLETED" | "FAILED" | undefined;

const statusOptions: { value: TransactionStatus; label: string }[] = [
  { value: undefined, label: "All Statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
];

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

// Format date only (for filters)
const formatDateOnly = (date: Date | string) => {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
};

// Get transaction type badge variant
function getTypeBadge(type: string) {
  switch (type) {
    case "DEPOSIT":
      return <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">Deposit</Badge>;
    case "PURCHASE":
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">Purchase</Badge>;
    case "REFUND":
      return <Badge variant="outline" className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20">Refund</Badge>;
    case "PROMO":
      return <Badge variant="outline" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">Promo</Badge>;
    case "REFERRAL":
      return <Badge variant="outline" className="bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20">Referral</Badge>;
    case "ADJUSTMENT":
      return <Badge variant="outline" className="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20">Adjustment</Badge>;
    default:
      return <Badge variant="outline">{type}</Badge>;
  }
}

// Get status badge
function getStatusBadge(status: string) {
  switch (status) {
    case "COMPLETED":
      return <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 gap-1"><CheckCircle2 size={10} />Completed</Badge>;
    case "PENDING":
      return <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20 gap-1"><Clock size={10} />Pending</Badge>;
    case "FAILED":
      return <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 gap-1"><XCircle size={10} />Failed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// Get user display name
function getUserDisplayName(user: { firstName?: string | null; lastName?: string | null; telegramUsername?: string | null } | null): string {
  if (!user) return "Unknown";
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  if (user.firstName) {
    return user.firstName;
  }
  return user.telegramUsername || "Unknown";
}

// Download CSV
function downloadCSV(transactions: any[], stats: any) {
  // Add summary rows at the top
  const rows = [
    ["TRANSACTIONS REPORT"],
    [`Generated: ${new Date().toISOString()}`],
    [`Date Range: ${formatDateOnly(stats.startDate)} - ${formatDateOnly(stats.endDate)}`],
    [""],
    ["SUMMARY"],
    ["Total Transactions", stats.totalTransactions.toString()],
    ["Total Volume", formatCurrency(stats.totalVolume)],
    ["Deposits", formatCurrency(stats.deposits)],
    ["Purchases", formatCurrency(stats.purchases)],
    ["Refunds", formatCurrency(stats.refunds)],
    ["Promos", formatCurrency(stats.promos)],
    ["Adjustments", formatCurrency(stats.adjustments)],
    ["Net Revenue", formatCurrency(stats.netRevenue)],
    [""],
    ["TRANSACTIONS"],
    ["ID", "Date", "Type", "Status", "Amount", "User", "Telegram ID", "Description", "Transaction ID"],
    ...transactions.map((tx) => [
      tx.id.slice(0, 8),
      formatDate(tx.createdAt),
      tx.type,
      tx.status,
      formatCurrency(tx.amount),
      getUserDisplayName(tx.user),
      tx.user?.telegramId || "",
      tx.description || "",
      tx.txnId || "",
    ]),
  ];

  // Convert to CSV string
  const csvContent = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  // Create download link
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `transactions_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return true;
}

export default function TransactionsPage() {
  // State
  const [search, setSearch] = useState("");
  const [type, setType] = useState<TransactionType>(undefined);
  const [status, setStatus] = useState<TransactionStatus>(undefined);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [searchInputValue, setSearchInputValue] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  // Ref for stats
  const statsDataRef = useRef<any>(null);

  // Queries
  const { data, isLoading, refetch, isFetching } = trpc.admin.transactions.list.useQuery({
    type,
    status,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    search: search || undefined,
    page,
    pageSize: 50,
  });

  const { data: stats, isLoading: statsLoading } = trpc.admin.transactions.stats.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  // Update stats ref when data changes
  if (stats) {
    statsDataRef.current = stats;
  }

  // Handlers
  const handleSearch = (value: string) => {
    setSearchInputValue(value);
    if (value.length >= 2 || value.length === 0) {
      setSearch(value);
      setPage(1);
    }
  };

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    setPage(1);
  };

  const handleStatusChange = (newStatus: TransactionStatus) => {
    setStatus(newStatus);
    setPage(1);
  };

  const handleExport = () => {
    setIsExporting(true);
    try {
      // Use current data for export (already filtered)
      downloadCSV(data?.transactions || [], statsDataRef.current || stats);
      toast.success("CSV downloaded successfully");
    } catch (error) {
      toast.error("Failed to download CSV");
    } finally {
      setIsExporting(false);
    }
  };

  const handleResetFilters = () => {
    setType(undefined);
    setStatus(undefined);
    setStartDate("");
    setEndDate("");
    setSearch("");
    setSearchInputValue("");
    setPage(1);
  };

  const hasActiveFilters = type || status || startDate || endDate || search;

  const totalPages = data?.pagination.totalPages || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div {...fadeUp()} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            View and manage all wallet transactions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 size={16} className="animate-spin mr-2" />
            ) : (
              <RefreshCw size={16} className="mr-2" />
            )}
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting || !data?.transactions.length}
          >
            {isExporting ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download size={16} className="mr-2" />
                Export CSV
              </>
            )}
          </Button>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <motion.div {...fadeUp(0.05)} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500/10 p-2 rounded-lg">
              <FileText size={18} className="text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-medium">Total Transactions</p>
              <p className="text-xl font-bold text-foreground">
                {stats?.totalTransactions || 0}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="bg-green-500/10 p-2 rounded-lg">
              <TrendingUp size={18} className="text-green-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-medium">Total Volume</p>
              <p className="text-xl font-bold text-foreground">
                {formatCurrency(stats?.totalVolume || 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="bg-purple-500/10 p-2 rounded-lg">
              <IndianRupee size={18} className="text-purple-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-medium">Deposits</p>
              <p className="text-xl font-bold text-foreground">
                {formatCurrency(stats?.deposits || 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500/10 p-2 rounded-lg">
              <TrendingDown size={18} className="text-orange-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-medium">Net Revenue</p>
              <p className="text-xl font-bold text-foreground">
                {formatCurrency(stats?.netRevenue || 0)}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Search and Filters */}
      <motion.div {...fadeUp(0.1)} className="bg-card border border-border rounded-xl p-4 space-y-4">
        {/* Search Row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by ID, UTR, or description..."
              value={searchInputValue}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9 rounded-lg"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter size={14} />
                <span>Filters</span>
                {hasActiveFilters && (
                  <span className="w-2 h-2 bg-primary rounded-full" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Filter By</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Type</DropdownMenuLabel>
              {typeOptions.map((option) => (
                <DropdownMenuItem
                  key={option.label}
                  onClick={() => handleTypeChange(option.value)}
                  className="flex items-center gap-2"
                >
                  {option.value && (
                    <span className={`w-2 h-2 rounded-full ${option.color}`} />
                  )}
                  <span className="flex-1">{option.label}</span>
                  {type === option.value && (
                    <CheckCircle2 size={12} className="text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Status</DropdownMenuLabel>
              {statusOptions.map((option) => (
                <DropdownMenuItem
                  key={option.label}
                  onClick={() => handleStatusChange(option.value)}
                  className="flex items-center gap-2"
                >
                  <span className="flex-1">{option.label}</span>
                  {status === option.value && (
                    <CheckCircle2 size={12} className="text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleResetFilters}>
              Reset
            </Button>
          )}
        </div>

        {/* Date Range */}
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Calendar size={12} />
              From Date
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="rounded-lg"
            />
          </div>
          <div className="flex-1 space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Calendar size={12} />
              To Date
            </label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="rounded-lg"
            />
          </div>
        </div>

        {/* Active Filter Chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2">
            {type && (
              <Badge variant="secondary" className="gap-1">
                Type: {typeOptions.find((t) => t.value === type)?.label}
                <button
                  onClick={() => handleTypeChange(undefined)}
                  className="hover:bg-secondary-foreground/20 rounded-full p-0.5"
                >
                  <XCircle size={10} />
                </button>
              </Badge>
            )}
            {status && (
              <Badge variant="secondary" className="gap-1">
                Status: {statusOptions.find((s) => s.value === status)?.label}
                <button
                  onClick={() => handleStatusChange(undefined)}
                  className="hover:bg-secondary-foreground/20 rounded-full p-0.5"
                >
                  <XCircle size={10} />
                </button>
              </Badge>
            )}
            {startDate && (
              <Badge variant="secondary" className="gap-1">
                From: {formatDateOnly(startDate)}
                <button
                  onClick={() => setStartDate("")}
                  className="hover:bg-secondary-foreground/20 rounded-full p-0.5"
                >
                  <XCircle size={10} />
                </button>
              </Badge>
            )}
            {endDate && (
              <Badge variant="secondary" className="gap-1">
                To: {formatDateOnly(endDate)}
                <button
                  onClick={() => setEndDate("")}
                  className="hover:bg-secondary-foreground/20 rounded-full p-0.5"
                >
                  <XCircle size={10} />
                </button>
              </Badge>
            )}
          </div>
        )}
      </motion.div>

      {/* Transactions Table */}
      <motion.div {...fadeUp(0.15)}>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Transaction ID</TableHead>
                  <TableHead className="w-[140px]">Date</TableHead>
                  <TableHead className="w-[100px]">Type</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[100px]">Amount</TableHead>
                  <TableHead className="w-[140px]">User</TableHead>
                  <TableHead className="w-[140px]">Telegram ID</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[140px]">UTR/Ref</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    </TableRow>
                  ))
                ) : data?.transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <Wallet size={48} className="text-muted-foreground/40" />
                        <p className="text-muted-foreground">No transactions found</p>
                        {hasActiveFilters && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleResetFilters}
                          >
                            Clear filters
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.transactions.map((tx, index) => (
                    <motion.tr
                      key={tx.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 + index * 0.02 }}
                      className="hover:bg-muted/50 transition-colors border-b"
                    >
                      {/* Transaction ID */}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <FileText size={12} className="text-muted-foreground" />
                          <span className="font-mono text-xs">{tx.id.slice(0, 12)}...</span>
                        </div>
                      </TableCell>

                      {/* Date */}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Calendar size={12} className="text-muted-foreground" />
                          <span className="text-xs">{formatDate(tx.createdAt)}</span>
                        </div>
                      </TableCell>

                      {/* Type */}
                      <TableCell>
                        {getTypeBadge(tx.type)}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        {getStatusBadge(tx.status)}
                      </TableCell>

                      {/* Amount */}
                      <TableCell>
                        <div className={`flex items-center gap-1.5 ${
                          ["DEPOSIT", "PROMO", "REFERRAL", "ADJUSTMENT"].includes(tx.type) && parseFloat(tx.amount.toString()) > 0
                            ? "text-green-600 dark:text-green-400"
                            : ["PURCHASE", "REFUND"].includes(tx.type) || parseFloat(tx.amount.toString()) < 0
                            ? "text-red-600 dark:text-red-400"
                            : ""
                        }`}>
                          <IndianRupee size={12} />
                          <span className="font-semibold text-sm">
                            {formatCurrency(tx.amount)}
                          </span>
                        </div>
                      </TableCell>

                      {/* User */}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <User size={12} className="text-muted-foreground" />
                          <span className="text-sm truncate max-w-[120px]">
                            {getUserDisplayName(tx.user)}
                          </span>
                        </div>
                      </TableCell>

                      {/* Telegram ID */}
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {tx.user?.telegramId || "-"}
                        </span>
                      </TableCell>

                      {/* Description */}
                      <TableCell>
                        <span className="text-sm text-muted-foreground truncate max-w-[150px] block">
                          {tx.description || "-"}
                        </span>
                      </TableCell>

                      {/* UTR/Reference */}
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground truncate max-w-[100px] block">
                          {tx.txnId || "-"}
                        </span>
                      </TableCell>
                    </motion.tr>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data && data.pagination.totalPages > 1 && (
            <div className="border-t border-border p-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }

                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          onClick={() => setPage(pageNum)}
                          isActive={page === pageNum}
                          className="cursor-pointer"
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
