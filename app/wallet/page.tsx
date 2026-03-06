"use client";

import { useCallback, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Skeleton } from "@/components/ui/skeleton";
import type { User } from "@/types";
import {
  ChevronRight,
  ArrowDownLeft,
  History,
  Sparkles,
  Zap,
  Gift,
  IndianRupee,
  CheckCircle2,
  CreditCard,
  TrendingDown,
  TrendingUp,
  Wallet,
  IndianRupeeIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { DepositDialog } from "@/components/deposit-dialog";
import { PromoDialog } from "@/components/promo-dialog";
import { formatDistanceToNow } from "date-fns";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring" as const, stiffness: 280, damping: 24, delay },
});

const transactionIcons = {
  DEPOSIT: { icon: ArrowDownLeft, color: "text-green-500",  bg: "bg-green-500/10" },
  PURCHASE: { icon: CreditCard,   color: "text-amber-500",  bg: "bg-amber-500/10" },
  REFUND:   { icon: TrendingDown, color: "text-sky-500",    bg: "bg-sky-500/10" },
  PROMO:    { icon: Gift,         color: "text-violet-500", bg: "bg-violet-500/10" },
  REFERRAL: { icon: Sparkles,     color: "text-pink-500",   bg: "bg-pink-500/10" },
  ADJUSTMENT: { icon: Zap,        color: "text-orange-500", bg: "bg-orange-500/10" },
};

/** Human-readable title for a transaction type */
function getTxTitle(type: string): string {
  switch (type) {
    case "DEPOSIT":    return "Deposit";
    case "PROMO":      return "Promo Redeemed";
    case "REFUND":     return "Refund";
    case "REFERRAL":   return "Referral Bonus";
    case "ADJUSTMENT": return "Adjustment";
    case "PURCHASE":   return "Purchase";
    default:           return type.charAt(0) + type.slice(1).toLowerCase();
  }
}

function ActionRow({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  delay,
  onClick,
  badge,
  superscript,
}: {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  delay: number;
  onClick?: () => void;
  badge?: string;
  superscript?: string;
}) {
  return (
    <motion.button
      {...fadeUp(delay)}
      whileTap={{ scale: 0.985 }}
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-muted/50 transition-colors duration-150 text-left group"
    >
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
        <Icon size={16} strokeWidth={2} className={iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        {/* Title with optional superscript badge */}
        <p className="font-semibold text-sm text-foreground inline-flex items-start gap-0.5">
          {title}
          {superscript && (
            <span className="text-[8px] font-bold text-green-500 leading-none mt-0.5 px-1 py-0.5 rounded bg-green-500/10">
              {superscript}
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {badge && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
          {badge}
        </span>
      )}
      <ChevronRight
        size={15}
        strokeWidth={2.5}
        className="text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0"
      />
    </motion.button>
  );
}

function WalletSkeleton() {
  return (
    <div className="flex-1 px-4 pt-5 pb-28 max-w-md mx-auto w-full space-y-5">
      <div className="rounded-3xl border border-border px-5 py-5 space-y-4">
        <Skeleton className="h-3 w-24" />
        <div className="flex items-end gap-3">
          <Skeleton className="h-12 w-28" />
          <Skeleton className="h-4 w-16 mb-1" />
        </div>
        <Skeleton className="h-3 w-36" />
        <div className="pt-4 border-t border-border grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <Skeleton className="w-9 h-9 rounded-lg" />
              <Skeleton className="h-2.5 w-12" />
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border/60">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3.5 px-4 py-3.5">
              <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WalletPage() {
  const router = useRouter();
  const [depositOpen, setDepositOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);

  const { data: session, isPending } = authClient.useSession();
  const user = session?.user as User | undefined;

  const { data: walletData, refetch: refetchWallet } =
    trpc.wallet.balance.useQuery(undefined, {
      staleTime: 0,
      refetchInterval: 60000,
    });
  const { data: transactionsData } = trpc.wallet.transactions.useQuery({
    limit: 10,
  });
  const { data: settings } = trpc.service.settings.useQuery();

  const balance       = Number(walletData?.balance      ?? 0);
  const totalSpent    = Number(walletData?.totalSpent    ?? 0);
  const totalRecharge = Number(walletData?.totalRecharge ?? 0);

  const transactions =
    transactionsData?.transactions?.filter(
      (tx) => tx.type === "DEPOSIT" || tx.type === "PROMO",
    ) || [];

  const handleNav = useCallback((href: string) => router.push(href), [router]);

  if (isPending && !user) return <WalletSkeleton />;

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

        {/* ── Balance hero ── */}
        <motion.div
          {...fadeUp(0)}
          className="relative overflow-hidden rounded-3xl bg-primary/10 dark:bg-primary/15 border border-primary/20 px-5 py-5"
        >
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-primary/5 blur-2xl pointer-events-none" />

          <div className="relative">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 mb-3">
              Wallet
            </p>
            <div className="flex items-end gap-2 mb-1">
              <IndianRupee size={32} className="text-primary" strokeWidth={2.5} />
              <h1 className="text-4xl font-bold text-foreground tabular-nums tracking-tight">
                {Number(balance).toFixed(2)}
              </h1>
              <span className="text-sm text-muted-foreground mb-1">INR</span>
            </div>
            <div className="flex items-center gap-1.5 mb-5">
              <CheckCircle2 size={12} className="text-green-500" />
              <p className="text-xs text-muted-foreground">MeowSMS Wallet · Active</p>
            </div>

            <div className="pt-4 border-t border-primary/15 grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-9 h-9 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
                  <TrendingDown size={15} className="text-rose-500" />
                </div>
                <p className="text-[10px] text-muted-foreground text-center leading-tight">Spent</p>
                <p className="text-sm font-bold text-rose-500 tabular-nums flex items-center gap-0">
                  <IndianRupee size={11} strokeWidth={2.5} />
                  {Number(totalSpent).toFixed(2)}
                </p>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Wallet size={15} className="text-primary" />
                </div>
                <p className="text-[10px] text-muted-foreground text-center leading-tight">Balance</p>
                <p className="text-sm font-bold text-primary tabular-nums flex items-center gap-0">
                  <IndianRupee size={11} strokeWidth={2.5} />
                  {Number(balance).toFixed(2)}
                </p>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                  <TrendingUp size={15} className="text-green-500" />
                </div>
                <p className="text-[10px] text-muted-foreground text-center leading-tight">Recharge</p>
                <p className="text-sm font-bold text-green-500 tabular-nums flex items-center gap-0">
                  <IndianRupee size={11} strokeWidth={2.5} />
                  {Number(totalRecharge).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Manage ── */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 px-1 mb-2">
            Manage
          </p>
          <motion.div
            {...fadeUp(0.14)}
            className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border/60"
          >
            <ActionRow
              icon={IndianRupeeIcon}
              iconColor="text-amber-500"
              iconBg="bg-amber-500/10"
              title="Add Funds"
              subtitle="Google Pay, Paytm, PhonePe"
              delay={0.16}
              onClick={() => setDepositOpen(true)}
              superscript="INSTANT"
            />
            <ActionRow
              icon={History}
              iconColor="text-violet-500"
              iconBg="bg-violet-500/10"
              title="Transaction History"
              subtitle="View all past transactions"
              delay={0.19}
              onClick={() => handleNav("/transactions")}
            />
            <ActionRow
              icon={Gift}
              iconColor="text-violet-500"
              iconBg="bg-violet-500/10"
              title="Redeem Promo Code"
              subtitle="Enter code for bonus balance"
              delay={0.25}
              onClick={() => setPromoOpen(true)}
            />
          </motion.div>
        </div>

        {/* ── Recent Transactions ── */}
        <motion.div {...fadeUp(0.2)}>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 px-1 mb-2">
            Recent Transactions
          </p>
          <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border/60">
            {transactions.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-2">
                <History size={20} className="text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No transactions yet</p>
              </div>
            ) : (
              transactions.map((tx, i) => {
                const config =
                  transactionIcons[tx.type as keyof typeof transactionIcons] ||
                  transactionIcons.DEPOSIT;
                const Icon = config.icon;
                const isCredit = ["DEPOSIT", "PROMO", "REFERRAL", "REFUND", "ADJUSTMENT"].includes(tx.type);

                return (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3.5 px-4 py-3.5"
                  >
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", config.bg)}>
                      <Icon size={16} className={config.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Clean title — no raw type string, no promo code */}
                      <p className="font-semibold text-sm text-foreground">
                        {getTxTitle(tx.type)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {tx.type === "PROMO"
                          ? "Promo code applied"
                          : tx.description ||
                            formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "font-bold text-sm tabular-nums flex items-center gap-0.5 shrink-0",
                        isCredit ? "text-green-500" : "text-amber-500",
                      )}
                    >
                      {isCredit ? "+" : "-"}
                      <IndianRupee size={12} strokeWidth={2.5} />
                      {Math.abs(Number(tx.amount)).toFixed(2)}
                    </p>
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.div>

        {/* ── Coming soon ── */}
        <motion.div
          {...fadeUp(0.26)}
          className="flex items-center gap-3 px-4 py-3.5 bg-card border border-border rounded-2xl"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <Sparkles size={16} className="text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">More features coming soon</p>
            <p className="text-xs text-muted-foreground">Auto top-up, spending limits & more</p>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 shrink-0">
            Soon
          </span>
        </motion.div>
      </div>

      <DepositDialog
        open={depositOpen}
        onOpenChange={setDepositOpen}
        upiId={settings?.upiId}
        qrImage={settings?.bharatpeQrImage}
        onSuccess={() => refetchWallet()}
      />
      <PromoDialog
        open={promoOpen}
        onOpenChange={setPromoOpen}
        onSuccess={() => refetchWallet()}
      />
    </div>
  );
}