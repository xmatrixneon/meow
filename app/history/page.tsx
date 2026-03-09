"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { authClient } from "@/lib/auth-client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Hash,
  Wallet,
  MessageSquare,
  Zap,
  CreditCard,
  IndianRupee,
  Gift,
  Sparkles,
  Settings,
  Clock,
  XCircle,
  AlertCircle,
  ShoppingBag,
  Loader2,
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

interface TransactionMetadata {
  serviceName?: string;
  orderId?: string;
  smsReceived?: boolean;
  payerVpa?: string;
  utr?: string;
  transactionDate?: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  status: string;
  description: string | null;
  txnId?: string | null;
  phoneNumber?: string | null;
  metadata: TransactionMetadata | null;
  createdAt: string;
}

const filters: { label: string; value: TxType; icon: React.ReactNode }[] = [
  { label: "Numbers", value: "numbers", icon: <CreditCard size={14} /> },
  { label: "Refunds", value: "refunds", icon: <Zap size={14} /> },
  { label: "Deposits", value: "deposits", icon: <Wallet size={14} /> },
  { label: "All", value: "all", icon: <Hash size={14} /> },
];

const statusConfig = {
  completed: { color: "text-green-500", bg: "bg-green-500/10", label: "Completed" },
  pending:   { color: "text-amber-500", bg: "bg-amber-500/10", label: "Pending" },
  failed:    { color: "text-rose-500",  bg: "bg-rose-500/10",  label: "Failed" },
} as const;

const getTransactionIcon = (type: string, status: string) => {
  if (status === "FAILED")  return <XCircle size={16} />;
  if (status === "PENDING") return <AlertCircle size={16} />;
  switch (type) {
    case "PURCHASE":   return <ShoppingBag size={16} />;
    case "DEPOSIT":    return <Wallet size={16} />;
    case "REFUND":     return <XCircle size={16} />;
    case "PROMO":      return <Gift size={16} />;
    case "REFERRAL":   return <Sparkles size={16} />;
    case "ADJUSTMENT": return <Settings size={16} />;
    default:           return <Clock size={16} />;
  }
};

const getTransactionColor = (type: string) => {
  switch (type) {
    case "DEPOSIT":    return { color: "text-green-500",        bg: "bg-green-500/10" };
    case "PURCHASE":   return { color: "text-amber-500",        bg: "bg-amber-500/10" };
    case "REFUND":     return { color: "text-sky-500",          bg: "bg-sky-500/10" };
    case "PROMO":      return { color: "text-violet-500",       bg: "bg-violet-500/10" };
    case "REFERRAL":   return { color: "text-pink-500",         bg: "bg-pink-500/10" };
    case "ADJUSTMENT": return { color: "text-orange-500",       bg: "bg-orange-500/10" };
    default:           return { color: "text-muted-foreground", bg: "bg-muted" };
  }
};

const getTransactionTitle = (tx: Transaction) => {
  const { type, description, metadata } = tx;

  if (type === "PURCHASE") {
    if (metadata?.serviceName) return metadata.serviceName;
    if (description) {
      const m = description.match(/^([A-Za-z]+)(?:\s+number)?/);
      return m ? m[1] : description;
    }
    return "Purchase";
  }

  if (type === "REFUND") {
    if (metadata?.serviceName) return metadata.serviceName;
    if (description) {
      const m = description.match(/^([A-Za-z]+)/);
      return m ? m[1] : description;
    }
    return "Refund";
  }

  if (description) return description;

  switch (type) {
    case "DEPOSIT":    return "Deposit";
    case "PROMO":      return "Promo Redeemed";
    case "REFERRAL":   return "Bonus";
    case "ADJUSTMENT": return "Adjustment";
    default:           return "Transaction";
  }
};

const getTransactionSubtitle = (tx: Transaction) => {
  const { type, description, metadata, createdAt, status, phoneNumber } = tx;
  if (status === "PENDING") return "Pending";
  if (status === "FAILED")  return "Failed";
  switch (type) {
    case "PURCHASE":
      return phoneNumber || "Number";
    case "DEPOSIT":
      return metadata?.payerVpa || (metadata?.utr ? metadata.utr.substring(0, 8) : "Wallet");
    case "REFUND":
      return phoneNumber || metadata?.serviceName || "Refunded";
    case "PROMO":
      return "Promo code applied";
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
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;

  const { data: walletData } = trpc.wallet.balance.useQuery(undefined, {
    enabled: !!user,
  });

  // Infinite query for transactions
  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.wallet.transactionsInfinite.useInfiniteQuery(
    { limit: 30, status: "ALL" },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: 30 * 1000,
    },
  );

  // Flatten pages into single array
  const allTransactions = useMemo(() => {
    return infiniteData?.pages.flatMap((page) => page.transactions) || [];
  }, [infiniteData]);

  const total = infiniteData?.pages[0]?.total || 0;

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: "100px" },
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const refundedOrderIds = useMemo(() => {
    const refunds = allTransactions.filter((tx) => tx.type === "REFUND");
    return new Set(refunds.map((tx) => (tx.metadata as TransactionMetadata)?.orderId).filter(Boolean));
  }, [allTransactions]);

  const filteredTransactions = useMemo(() => {
    if (filter === "all") return allTransactions;
    return allTransactions.filter((tx) => {
      if (filter === "numbers") {
        return (
          tx.type === "PURCHASE" &&
          !refundedOrderIds.has((tx.metadata as TransactionMetadata)?.orderId)
        );
      }
      if (filter === "refunds") return tx.type === "REFUND";
      if (filter === "deposits") return tx.type === "DEPOSIT" || tx.type === "PROMO";
      return true;
    });
  }, [allTransactions, filter, refundedOrderIds]);

  const filteredTotal = filter === "all" ? total : filteredTransactions.length;

  const balance       = Number(walletData?.balance      ?? 0);
  const totalSpent    = Number(walletData?.totalSpent    ?? 0);
  const totalRecharge = Number(walletData?.totalRecharge ?? 0);

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


        {/* ── Filter pills ── */}
        <motion.div {...fadeUp(0.06)} className="flex gap-2 overflow-x-auto pb-0.5">
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
                        ? allTransactions.filter((t) => t.type === "REFUND").length
                        : allTransactions.filter((t) => t.type === "DEPOSIT" || t.type === "PROMO").length}
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
              transition={{ type: "spring" as const, stiffness: 280, damping: 24 }}
              className="flex flex-col items-center justify-center py-16 gap-3"
            >
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                {filter === "numbers"  && <CreditCard size={22} className="text-muted-foreground" />}
                {filter === "refunds"  && <Zap        size={22} className="text-muted-foreground" />}
                {filter === "deposits" && <Wallet     size={22} className="text-muted-foreground" />}
                {filter === "all"      && <Hash       size={22} className="text-muted-foreground" />}
              </div>
              <p className="text-sm text-muted-foreground">
                {filter === "all"      ? "No transactions found"
                : filter === "numbers" ? "No numbers purchased yet"
                : filter === "refunds" ? "No refunds yet"
                :                        "No deposits yet"}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border/60"
            >
              {filteredTransactions.map((tx, i) => {
                const colorConfig = getTransactionColor(tx.type);
                const isCredit = ["DEPOSIT", "PROMO", "REFERRAL", "REFUND", "ADJUSTMENT"].includes(tx.type);
                const typedTx = { ...tx, metadata: tx.metadata as TransactionMetadata | null };
                const title    = getTransactionTitle(typedTx);
                const subtitle = getTransactionSubtitle(typedTx);

                return (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring" as const, stiffness: 280, damping: 24, delay: i * 0.04 }}
                    className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-muted/40 transition-colors duration-150"
                  >
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", colorConfig.bg)}>
                      <div className={colorConfig.color}>
                        {getTransactionIcon(tx.type, tx.status)}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{title}</p>
                      <p className="text-xs text-muted-foreground truncate">{subtitle}</p>

                      {/* PURCHASE: SMS badge */}
                      {tx.type === "PURCHASE" && typedTx.metadata?.smsReceived && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <MessageSquare size={9} className="text-green-500" />
                          <span className="text-[10px] text-green-500">SMS</span>
                        </div>
                      )}

                      {/* REFUND: service name badge */}
                      {tx.type === "REFUND" && typedTx.metadata?.serviceName && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Zap size={9} className="text-sky-500" />
                          <span className="text-[10px] text-sky-500">{typedTx.metadata.serviceName}</span>
                        </div>
                      )}

                      {/* PROMO: clean badge, no raw code */}
                      {tx.type === "PROMO" && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Gift size={9} className="text-violet-500" />
                          <span className="text-[10px] text-violet-500">Balance credited</span>
                        </div>
                      )}

                      {/* DEPOSIT: transaction date */}
                      {tx.type === "DEPOSIT" && typedTx.metadata?.transactionDate && (
                        <span className="text-[10px] text-muted-foreground/70">
                          {new Date(typedTx.metadata.transactionDate).toLocaleDateString()}
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
                        {formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Footer summary & Infinite scroll sentinel ── */}
        {filteredTransactions.length > 0 && (
          <>
            <motion.div
              {...fadeUp(0.22)}
              className="bg-card border border-border rounded-2xl px-4 py-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Showing</p>
                  <p className="text-sm font-bold text-foreground">
                    {filteredTransactions.length} of {filteredTotal}{" "}
                    {filter === "all" ? "total" : filter}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground mb-0.5">Filter</p>
                  <p className="text-sm font-bold text-primary capitalize">{filter}</p>
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

            {/* Infinite scroll sentinel - Intersection Observer target */}
            <div ref={loadMoreRef} className="flex justify-center py-4">
              {isFetchingNextPage && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">Loading more...</span>
                </div>
              )}
              {!hasNextPage && !isFetchingNextPage && filter === "all" && (
                <p className="text-xs text-muted-foreground">All transactions loaded</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}