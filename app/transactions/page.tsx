"use client";

import { useState, useMemo } from "react";
import { authClient } from "@/lib/auth-client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Hash,
  Wallet,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  Zap,
  CreditCard,
  IndianRupee,
  Gift,
  Sparkles,
  Settings,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShoppingBag,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { formatDistanceToNow } from "date-fns";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring" as const, stiffness: 280, damping: 24, delay },
});

type TxType = "numbers" | "refunds" | "deposits" | "all";

const filters: { label: string; value: TxType; icon: any }[] = [
  { label: "Numbers", value: "numbers", icon: <CreditCard size={14} /> },
  { label: "Refunds", value: "refunds", icon: <Zap size={14} /> },
  { label: "Deposits", value: "deposits", icon: <Wallet size={14} /> },
  { label: "All", value: "all", icon: <Hash size={14} /> },
];

const statusConfig = {
  completed: {
    color: "text-green-500",
    bg: "bg-green-500/10",
    label: "Completed",
  },
  pending: { color: "text-amber-500", bg: "bg-amber-500/10", label: "Pending" },
  failed: { color: "text-rose-500", bg: "bg-rose-500/10", label: "Failed" },
} as const;

const getTransactionIcon = (type: string, status: string) => {
  // Show status-based icons
  if (status === "FAILED") return <XCircle size={16} />;
  if (status === "PENDING") return <AlertCircle size={16} />;

  // Show action-based icons for completed transactions
  switch (type) {
    case "PURCHASE":
      return <ShoppingBag size={16} />; // Purchased
    case "DEPOSIT":
      return <Wallet size={16} />; // Deposited
    case "REFUND":
      return <XCircle size={16} />; // Cancelled/Refunded
    case "PROMO":
      return <Gift size={16} />; // Promo
    case "REFERRAL":
      return <Sparkles size={16} />; // Bonus
    case "ADJUSTMENT":
      return <Settings size={16} />; // Adjustment
    default:
      return <Clock size={16} />;
  }
};

const getTransactionColor = (type: string) => {
  switch (type) {
    case "DEPOSIT":
      return { color: "text-green-500", bg: "bg-green-500/10" };
    case "PURCHASE":
      return { color: "text-amber-500", bg: "bg-amber-500/10" };
    case "REFUND":
      return { color: "text-sky-500", bg: "bg-sky-500/10" };
    case "PROMO":
      return { color: "text-violet-500", bg: "bg-violet-500/10" };
    case "REFERRAL":
      return { color: "text-pink-500", bg: "bg-pink-500/10" };
    case "ADJUSTMENT":
      return { color: "text-orange-500", bg: "bg-orange-500/10" };
    default:
      return { color: "text-muted-foreground", bg: "bg-muted" };
  }
};

const getTransactionTitle = (tx: {
  type: string;
  description: string | null;
  metadata: any;
}) => {
  const { type, description, metadata } = tx;

  // For PURCHASE and REFUND, extract just the service name from description or metadata
  if (type === "PURCHASE") {
    // First try to get serviceName from metadata
    if (metadata?.serviceName) return metadata.serviceName;
    // Otherwise extract from description (e.g., "BigBasket number purchased" → "BigBasket")
    if (description) {
      const serviceMatch = description.match(/^([A-Za-z]+)(?:\s+number)?/);
      return serviceMatch ? serviceMatch[1] : description;
    }
    return "Purchase";
  }

  if (type === "REFUND") {
    // First try to get serviceName from metadata
    if (metadata?.serviceName) return metadata.serviceName;
    // Otherwise extract from description
    if (description) {
      const serviceMatch = description.match(/^([A-Za-z]+)/);
      return serviceMatch ? serviceMatch[1] : description;
    }
    return "Refund";
  }

  // For other types, use description if available
  if (description) return description;

  switch (type) {
    case "DEPOSIT":
      return "Deposit";
    case "PROMO":
      return "Promo";
    case "REFERRAL":
      return "Bonus";
    case "ADJUSTMENT":
      return "Adjustment";
    default:
      return "Transaction";
  }
};

const getTransactionSubtitle = (tx: {
  type: string;
  metadata: any;
  createdAt: string;
  status: string;
  phoneNumber: string | null;
}) => {
  const { type, metadata, createdAt, status, phoneNumber } = tx;
  if (status === "PENDING") return "Pending";
  if (status === "FAILED") return "Failed";
  switch (type) {
    case "PURCHASE":
      return phoneNumber || "Number";
    case "DEPOSIT":
      return metadata?.payerVpa || metadata?.utr?.substring(0, 8) || "Wallet";
    case "REFUND":
      return phoneNumber || metadata?.serviceName || "Refunded";
    case "PROMO":
      return metadata?.promocodeCode || "Code";
    case "REFERRAL":
      return "Referral";
    case "ADJUSTMENT":
      return "Balance";
    default:
      return formatDistanceToNow(new Date(createdAt), { addSuffix: true });
  }
};

function TransactionsSkeleton() {
  return (
    <div className="flex-1 px-4 pt-5 pb-28 max-w-md mx-auto w-full space-y-5">
      <div className="rounded-3xl border border-border px-5 py-5 space-y-4">
        <Skeleton className="h-3 w-28" />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <Skeleton className="w-9 h-9 rounded-lg" />
              <Skeleton className="h-2.5 w-12" />
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
        <div className="pt-3 border-t border-border flex items-center justify-between">
          <Skeleton className="h-8 w-28 rounded-xl" />
          <Skeleton className="h-8 w-28 rounded-xl" />
        </div>
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border/60">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3.5 px-4 py-3.5">
            <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="text-right space-y-1.5">
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TransactionsPage() {
  const [filter, setFilter] = useState<TxType>("numbers");
  const [txOffset, setTxOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;

  const { data: walletData } = trpc.wallet.balance.useQuery(undefined, {
    enabled: !!user,
  });

  const { data } = trpc.wallet.transactions.useQuery(
    { limit: 50, offset: txOffset, status: "ALL" },
    { staleTime: 30 * 1000 },
  );

  const allTransactions = data?.transactions || [];
  const total = data?.total || 0;
  const hasMore = txOffset + 50 < total;

  // Filter transactions based on selected type
  // Get set of refunded orderIds to exclude cancelled purchases from "Numbers" filter
  const refundedOrderIds = useMemo(() => {
    const refunds = allTransactions.filter((tx) => tx.type === "REFUND");
    return new Set(refunds.map((tx) => (tx.metadata as any)?.orderId));
  }, [allTransactions]);

  const filteredTransactions =
    filter === "all"
      ? allTransactions
      : allTransactions.filter((tx) => {
          if (filter === "numbers") {
            // Only show PURCHASE transactions that haven't been refunded
            return (
              tx.type === "PURCHASE" &&
              !refundedOrderIds.has((tx.metadata as any)?.orderId)
            );
          }
          if (filter === "refunds") return tx.type === "REFUND";
          if (filter === "deposits") return tx.type === "DEPOSIT";
          return true;
        });

  const filteredTotal = filter === "all" ? total : filteredTransactions.length;

  // ── same pattern as profile / wallet ──
  const balance = Number(walletData?.balance ?? 0);
  const totalSpent = Number(walletData?.totalSpent ?? 0);
  const totalRecharge = Number(walletData?.totalRecharge ?? 0);

  // Use backend statistics for accurate counts
  const numberCount = data?.statistics?.numberCountWithSms ?? 0;

  if (isPending && !user) return <TransactionsSkeleton />;

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-7rem)] flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring" as const, stiffness: 300, damping: 22 }}
          className="bg-card border border-border rounded-3xl p-8 text-center max-w-sm w-full shadow-xl"
        >
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <Zap size={24} className="text-destructive" />
          </div>
          <p className="font-semibold text-foreground mb-1">Not available</p>
          <p className="text-sm text-muted-foreground">
            Open this app inside Telegram to continue.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-7rem)] flex flex-col">
      <div className="flex-1 px-4 pt-5 pb-28 max-w-md mx-auto w-full space-y-5">
        {/* ── Hero ── */}
        <motion.div
          {...fadeUp(0)}
          className="relative overflow-hidden rounded-3xl bg-primary/10 dark:bg-primary/15 border border-primary/20 px-5 py-5"
        >
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-primary/10 blur-2xl pointer-events-none" />

          <div className="relative">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 mb-4">
              Wallet Overview
            </p>

            {/* Stats — identical to profile & wallet */}
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-9 h-9 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
                  <TrendingDown size={15} className="text-rose-500" />
                </div>
                <p className="text-[10px] text-muted-foreground text-center leading-tight">
                  Spent
                </p>
                <p className="text-sm font-bold text-rose-500 tabular-nums flex items-center gap-0">
                  <IndianRupee size={11} strokeWidth={2.5} />
                  {totalSpent.toFixed(2)}
                </p>
              </div>

              <div className="flex flex-col items-center gap-1.5">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Wallet size={15} className="text-primary" />
                </div>
                <p className="text-[10px] text-muted-foreground text-center leading-tight">
                  Balance
                </p>
                <p className="text-sm font-bold text-primary tabular-nums flex items-center gap-0">
                  <IndianRupee size={11} strokeWidth={2.5} />
                  {balance.toFixed(2)}
                </p>
              </div>

              <div className="flex flex-col items-center gap-1.5">
                <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                  <TrendingUp size={15} className="text-green-500" />
                </div>
                <p className="text-[10px] text-muted-foreground text-center leading-tight">
                  Recharge
                </p>
                <p className="text-sm font-bold text-green-500 tabular-nums flex items-center gap-0">
                  <IndianRupee size={11} strokeWidth={2.5} />
                  {totalRecharge.toFixed(2)}
                </p>
              </div>
            </div>
            {/* Transaction stats */}
            <div className="mt-4 pt-4 border-t border-primary/15 grid grid-cols-2 gap-2">
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <CreditCard size={15} className="text-amber-500" />
                </div>
                <p className="text-[10px] text-muted-foreground text-center leading-tight">
                  Numbers bought
                </p>
                <p className="text-sm font-bold text-amber-500 tabular-nums">
                  {data?.statistics?.numberCountWithSms ?? 0}
                </p>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-9 h-9 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
                  <Zap size={15} className="text-sky-500" />
                </div>
                <p className="text-[10px] text-muted-foreground text-center leading-tight">
                  Refunds
                </p>
                <p className="text-sm font-bold text-sky-500 tabular-nums">
                  {allTransactions.filter((t) => t.type === "REFUND").length}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Filter pills ── */}
        <motion.div
          {...fadeUp(0.06)}
          className="flex gap-2 overflow-x-auto pb-0.5"
        >
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors duration-200 border",
                filter === f.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/40",
              )}
            >
              {f.icon}
              <span>{f.label}</span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded-full text-[10px]",
                  filter === f.value ? "bg-primary-foreground/20" : "bg-muted",
                )}
              >
                {filter === f.value
                  ? filteredTotal
                  : f.value === "all"
                    ? total
                    : f.value === "numbers"
                      ? allTransactions.filter(
                          (t) =>
                            t.type === "PURCHASE" &&
                            !refundedOrderIds.has((t.metadata as any)?.orderId),
                        ).length
                      : f.value === "refunds"
                        ? allTransactions.filter((t) => t.type === "REFUND")
                            .length
                        : allTransactions.filter((t) => t.type === "DEPOSIT")
                            .length}
              </span>
            </button>
          ))}
        </motion.div>

        {/* ── List ── */}
        <AnimatePresence mode="popLayout">
          {filteredTransactions.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                type: "spring" as const,
                stiffness: 280,
                damping: 24,
              }}
              className="flex flex-col items-center justify-center py-16 gap-3"
            >
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                {filter === "numbers" && (
                  <CreditCard size={22} className="text-muted-foreground" />
                )}
                {filter === "refunds" && (
                  <Zap size={22} className="text-muted-foreground" />
                )}
                {filter === "deposits" && (
                  <Wallet size={22} className="text-muted-foreground" />
                )}
                {filter === "all" && (
                  <Hash size={22} className="text-muted-foreground" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {filter === "all"
                  ? "No transactions found"
                  : filter === "numbers"
                    ? "No numbers purchased yet"
                    : filter === "refunds"
                      ? "No refunds yet"
                      : "No deposits yet"}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border/60"
            >
              {filteredTransactions.map((tx, i) => {
                const colorConfig = getTransactionColor(tx.type);
                const isCredit = [
                  "DEPOSIT",
                  "PROMO",
                  "REFERRAL",
                  "REFUND",
                  "ADJUSTMENT",
                ].includes(tx.type);
                const title = getTransactionTitle(tx);
                const subtitle = getTransactionSubtitle(tx);

                return (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      type: "spring" as const,
                      stiffness: 280,
                      damping: 24,
                      delay: i * 0.04,
                    }}
                    className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-muted/40 transition-colors duration-150"
                  >
                    <div
                      className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                        colorConfig.bg,
                      )}
                    >
                      <div className={colorConfig.color}>
                        {getTransactionIcon(tx.type, tx.status)}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">
                        {title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {subtitle}
                      </p>

                      {/* PURCHASE: Show SMS status */}
                      {tx.type === "PURCHASE" && (
                        <>
                          {(tx.metadata as any)?.smsReceived && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <MessageSquare
                                size={9}
                                className="text-green-500"
                              />
                              <span className="text-[10px] text-green-500">
                                SMS
                              </span>
                            </div>
                          )}
                        </>
                      )}

                      {/* REFUND: Show service name */}
                      {tx.type === "REFUND" && (
                        <>
                          {(tx.metadata as any)?.serviceName && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Zap size={9} className="text-sky-500" />
                              <span className="text-[10px] text-sky-500">
                                {(tx.metadata as any)?.serviceName}
                              </span>
                            </div>
                          )}
                        </>
                      )}

                      {/* DEPOSIT: Show transaction date */}
                      {tx.type === "DEPOSIT" &&
                        (tx.metadata as any)?.transactionDate && (
                          <span className="text-[10px] text-muted-foreground/70">
                            {new Date(
                              (tx.metadata as any)?.transactionDate,
                            ).toLocaleDateString()}
                          </span>
                        )}
                    </div>

                    <div className="text-right shrink-0">
                      <p
                        className={cn(
                          "text-sm font-bold tabular-nums flex items-center justify-end gap-0.5",
                          tx.status === "FAILED"
                            ? "text-muted-foreground line-through"
                            : isCredit
                              ? "text-green-500"
                              : "text-foreground",
                        )}
                      >
                        {isCredit ? "+" : "-"}
                        <IndianRupee size={12} strokeWidth={2.5} />
                        {Math.abs(tx.amount || 0).toFixed(2)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(tx.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Footer summary ── */}
        {filteredTransactions.length > 0 && (
          <>
            <motion.div
              {...fadeUp(0.22)}
              className="bg-card border border-border rounded-2xl px-4 py-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">
                    Showing
                  </p>
                  <p className="text-sm font-bold text-foreground">
                    {filteredTransactions.length} of {filteredTotal}{" "}
                    {filter === "all" ? "total" : filter}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground mb-0.5">Filter</p>
                  <p className="text-sm font-bold text-primary capitalize">
                    {filter}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Total Spent</span>
                  <span className="font-bold text-rose-500 tabular-nums flex items-center gap-0.5">
                    <IndianRupee size={8} strokeWidth={2.5} />
                    {totalSpent.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Total Recharge</span>
                  <span className="font-bold text-green-500 tabular-nums flex items-center gap-0.5">
                    <IndianRupee size={8} strokeWidth={2.5} />
                    {totalRecharge.toFixed(2)}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Only show load more for "all" filter since we fetch 50 at once */}
            {filter === "all" && hasMore && (
              <motion.div
                {...fadeUp(0.28)}
                className="flex justify-center py-4"
              >
                <button
                  onClick={() => {
                    setLoadingMore(true);
                    setTxOffset((prev) => prev + 50);
                  }}
                  disabled={loadingMore}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-full text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-200"
                >
                  {loadingMore ? "Loading..." : "Load More"}
                </button>
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
