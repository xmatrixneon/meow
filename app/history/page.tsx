"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { authClient } from "@/lib/auth-client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Hash, Wallet, MessageSquare, Zap, CreditCard, IndianRupee,
  Gift, Sparkles, Settings, Clock, XCircle, AlertCircle,
  ShoppingBag, Loader2, TrendingDown, TrendingUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { formatDistanceToNow } from "date-fns";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring" as const, stiffness: 280, damping: 26, delay },
});

type TxType = "numbers" | "refunds" | "deposits" | "all";

interface TransactionMetadata {
  serviceName?: string; orderId?: string; smsReceived?: boolean;
  payerVpa?: string; utr?: string; transactionDate?: string;
}

interface Transaction {
  id: string; type: string; amount: number; status: string;
  description: string | null; txnId?: string | null; phoneNumber?: string | null;
  metadata: TransactionMetadata | null; createdAt: string;
}

// Tabs with icons
const TABS: { label: string; value: TxType; icon: React.ElementType }[] = [
  { label: "Numbers", value: "numbers", icon: ShoppingBag },
  { label: "Refunds", value: "refunds", icon: TrendingDown },
  { label: "Deposits", value: "deposits", icon: TrendingUp },
  { label: "All", value: "all", icon: Hash },
];

const getTransactionIcon = (type: string, status: string) => {
  if (status === "FAILED") return <XCircle size={15} />;
  if (status === "PENDING") return <AlertCircle size={15} />;
  switch (type) {
    case "PURCHASE": return <ShoppingBag size={15} />;
    case "DEPOSIT": return <Wallet size={15} />;
    case "REFUND": return <TrendingDown size={15} />;
    case "PROMO": return <Gift size={15} />;
    case "REFERRAL": return <Sparkles size={15} />;
    case "ADJUSTMENT": return <Settings size={15} />;
    default: return <Clock size={15} />;
  }
};

const getTransactionStyle = (type: string) => {
  switch (type) {
    case "DEPOSIT": return { color: "text-green-500", bg: "bg-green-500/10" };
    case "PURCHASE": return { color: "text-foreground", bg: "bg-muted" };
    case "REFUND": return { color: "text-sky-500", bg: "bg-sky-500/10" };
    case "PROMO": return { color: "text-violet-500", bg: "bg-violet-500/10" };
    case "REFERRAL": return { color: "text-pink-500", bg: "bg-pink-500/10" };
    case "ADJUSTMENT": return { color: "text-orange-500", bg: "bg-orange-500/10" };
    default: return { color: "text-muted-foreground", bg: "bg-muted" };
  }
};

const getTitle = (tx: Transaction) => {
  if (tx.type === "PURCHASE") {
    if (tx.metadata?.serviceName) return tx.metadata.serviceName;
    if (tx.description) return tx.description.match(/^([A-Za-z]+)/)?.[1] ?? tx.description;
    return "Purchase";
  }
  if (tx.type === "REFUND") return tx.metadata?.serviceName || "Refund";
  if (tx.description) return tx.description;
  switch (tx.type) {
    case "DEPOSIT": return "Deposit";
    case "PROMO": return "Promo Redeemed";
    case "REFERRAL": return "Referral Bonus";
    case "ADJUSTMENT": return "Adjustment";
    default: return "Transaction";
  }
};

const getSubtitle = (tx: Transaction) => {
  if (tx.status === "PENDING") return "Pending";
  if (tx.status === "FAILED") return "Failed";
  switch (tx.type) {
    case "PURCHASE": return tx.phoneNumber || "Number";
    case "DEPOSIT": return tx.metadata?.payerVpa || (tx.metadata?.utr ? `UTR: ${tx.metadata.utr.slice(0, 10)}` : "Wallet");
    case "REFUND": return tx.phoneNumber || tx.metadata?.serviceName || "Refunded";
    case "PROMO": return "Promo code applied";
    case "REFERRAL": return "Referral reward";
    default: return formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true });
  }
};

function TransactionsSkeleton() {
  return (
    <div className="flex-1 px-4 pt-4 pb-28 max-w-md mx-auto w-full space-y-4">
      <div className="grid grid-cols-4 gap-1.5">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 rounded-lg" />)}
      </div>
      <div className="border border-border rounded-xl overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border/60 last:border-0">
            <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="text-right space-y-1.5">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-3 w-12" />
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

  const { data: walletData } = trpc.wallet.balance.useQuery(undefined, { enabled: !!user });

  const { data: infiniteData, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.wallet.transactionsInfinite.useInfiniteQuery(
      { limit: 30, status: "ALL" },
      { getNextPageParam: (lastPage) => lastPage.nextCursor, staleTime: 30 * 1000 },
    );

  const allTransactions = useMemo(
    () => infiniteData?.pages.flatMap((page) => page.transactions) || [],
    [infiniteData],
  );
  const total = infiniteData?.pages[0]?.total || 0;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { threshold: 0.1, rootMargin: "100px" },
    );
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const refundedOrderIds = useMemo(() => new Set(
    allTransactions
      .filter((tx) => tx.type === "REFUND")
      .map((tx) => (tx.metadata as TransactionMetadata)?.orderId)
      .filter(Boolean),
  ), [allTransactions]);

  const filteredTransactions = useMemo(() => {
    if (filter === "all") return allTransactions;
    return allTransactions.filter((tx) => {
      if (filter === "numbers") return tx.type === "PURCHASE" && !refundedOrderIds.has((tx.metadata as TransactionMetadata)?.orderId);
      if (filter === "refunds") return tx.type === "REFUND";
      if (filter === "deposits") return tx.type === "DEPOSIT" || tx.type === "PROMO";
      return true;
    });
  }, [allTransactions, filter, refundedOrderIds]);

  const getCounts = (f: TxType) => {
    if (f === "all") return total;
    if (f === "numbers") return allTransactions.filter((t) => t.type === "PURCHASE" && !refundedOrderIds.has((t.metadata as any)?.orderId)).length;
    if (f === "refunds") return allTransactions.filter((t) => t.type === "REFUND").length;
    return allTransactions.filter((t) => t.type === "DEPOSIT" || t.type === "PROMO").length;
  };

  const balance = Number(walletData?.balance ?? 0);
  const totalSpent = Number(walletData?.totalSpent ?? 0);
  const totalRecharge = Number(walletData?.totalRecharge ?? 0);

  if (isPending && !user) return <TransactionsSkeleton />;

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-7rem)] flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-card border border-border rounded-2xl p-8 text-center max-w-sm w-full"
        >
          <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <Zap size={22} className="text-destructive" />
          </div>
          <p className="font-semibold mb-1">Not available</p>
          <p className="text-sm text-muted-foreground">Open this app inside Telegram to continue.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-7rem)] flex flex-col">
      <div className="flex-1 px-4 pt-4 pb-28 max-w-md mx-auto w-full space-y-4">

        {/* Tabs with horizontal scroll */}
        <motion.div {...fadeUp(0.04)} className="flex gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = filter === tab.value;
            const count = getCounts(tab.value);
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setFilter(tab.value)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 border",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card text-muted-foreground border-border hover:border-border/80 hover:text-foreground",
                )}
              >
                <Icon size={13} />
                {tab.label}
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded-md text-[10px] font-bold",
                    isActive ? "bg-white/20" : "bg-muted",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </motion.div>

        {/* Transaction list */}
        <AnimatePresence mode="popLayout">
          {filteredTransactions.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16 gap-3"
            >
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <Hash size={22} className="text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">
                {filter === "all" ? "No transactions" : filter === "numbers" ? "No purchases yet" : filter === "refunds" ? "No refunds yet" : "No deposits yet"}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border/60"
            >
              {filteredTransactions.map((tx, i) => {
                const style = getTransactionStyle(tx.type);
                const isCredit = ["DEPOSIT", "PROMO", "REFERRAL", "REFUND", "ADJUSTMENT"].includes(tx.type);
                const typedTx = { ...tx, metadata: tx.metadata as TransactionMetadata | null };
                const title = getTitle(typedTx);
                const subtitle = getSubtitle(typedTx);
                const isFailed = tx.status === "FAILED";

                return (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors duration-100"
                  >
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", style.bg)}>
                      <div className={style.color}>{getTransactionIcon(tx.type, tx.status)}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{title}</p>
                      <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
                      {tx.type === "PURCHASE" && typedTx.metadata?.smsReceived && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <MessageSquare size={9} className="text-green-500" />
                          <span className="text-[10px] text-green-500 font-medium">SMS received</span>
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn(
                        "text-sm font-bold tabular-nums flex items-center justify-end gap-0.5",
                        isFailed ? "text-muted-foreground line-through" : isCredit ? "text-green-500" : "text-foreground",
                      )}>
                        {isCredit ? "+" : "−"}
                        <IndianRupee size={11} strokeWidth={2.5} />
                        {Math.abs(tx.amount || 0).toFixed(2)}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer summary */}
        {filteredTransactions.length > 0 && (
          <motion.div {...fadeUp(0.16)}>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center gap-0.5">
                  <Wallet size={13} className="text-primary" />
                  <p className="text-sm font-bold text-primary tabular-nums">₹{balance.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground">Balance</p>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <TrendingDown size={13} className="text-rose-500" />
                  <p className="text-sm font-bold text-rose-500 tabular-nums">₹{totalSpent.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground">Spent</p>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <TrendingUp size={13} className="text-green-500" />
                  <p className="text-sm font-bold text-green-500 tabular-nums">₹{totalRecharge.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground">Recharged</p>
                </div>
              </div>
            </div>

            <div ref={loadMoreRef} className="flex justify-center py-4">
              {isFetchingNextPage && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-xs">Loading more…</span>
                </div>
              )}
              {!hasNextPage && !isFetchingNextPage && filteredTransactions.length > 10 && (
                <p className="text-xs text-muted-foreground/50">All transactions loaded</p>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}