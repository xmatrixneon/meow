"use client";

import { useCallback, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
  Bitcoin,
  IndianRupeeIcon,
  Shield,
  ShieldCheck,
  Lock,
  Fingerprint,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { DepositDialog } from "@/components/deposit-dialog";
import { PromoDialog } from "@/components/promo-dialog";
import { formatDistanceToNow } from "date-fns";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring" as const, stiffness: 280, damping: 26, delay },
});

const transactionIcons = {
  DEPOSIT: { icon: ArrowDownLeft, color: "text-green-500", bg: "bg-green-500/10" },
  PURCHASE: { icon: CreditCard, color: "text-amber-500", bg: "bg-amber-500/10" },
  REFUND: { icon: TrendingDown, color: "text-sky-500", bg: "bg-sky-500/10" },
  PROMO: { icon: Gift, color: "text-violet-500", bg: "bg-violet-500/10" },
  REFERRAL: { icon: Sparkles, color: "text-pink-500", bg: "bg-pink-500/10" },
  ADJUSTMENT: { icon: Zap, color: "text-orange-500", bg: "bg-orange-500/10" },
};

function getTxTitle(type: string): string {
  switch (type) {
    case "DEPOSIT": return "Deposit";
    case "PROMO": return "Promo Redeemed";
    case "REFUND": return "Refund";
    case "REFERRAL": return "Referral Bonus";
    case "ADJUSTMENT": return "Adjustment";
    case "PURCHASE": return "Purchase";
    default: return type.charAt(0) + type.slice(1).toLowerCase();
  }
}

function StatCard({
  icon: Icon,
  label,
  value,
  iconClass,
  valueClass,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  iconClass: string;
  valueClass: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 flex-1 py-3">
      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
        <Icon size={14} strokeWidth={2} className={iconClass} />
      </div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-bold tabular-nums flex items-center gap-0", valueClass)}>
        <IndianRupee size={10} strokeWidth={2.5} />
        {value}
      </p>
    </div>
  );
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
  superscriptClass,
  disabled,
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
  superscriptClass?: string;
  disabled?: boolean;
}) {
  return (
    <motion.button
      {...fadeUp(delay)}
      whileTap={!disabled ? { scale: 0.99 } : undefined}
      type="button"
      onClick={!disabled ? onClick : undefined}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-150",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-accent",
      )}
    >
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
        <Icon size={16} strokeWidth={2} className={iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground inline-flex items-center gap-1.5">
          {title}
          {superscript && (
            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-md leading-none", superscriptClass)}>
              {superscript}
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      {badge && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
          {badge}
        </span>
      )}
      <ChevronRight size={14} strokeWidth={2.5} className={cn("shrink-0", disabled ? "text-muted-foreground/20" : "text-muted-foreground/40")} />
    </motion.button>
  );
}

function WalletSkeleton() {
  return (
    <div className="flex-1 px-4 pt-4 pb-28 max-w-md mx-auto w-full space-y-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <div className="border border-border rounded-xl overflow-hidden">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
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

  const { data: walletData, refetch: refetchWallet } = trpc.wallet.balance.useQuery(undefined, {
    staleTime: 0,
    refetchInterval: 60000,
  });
  const { data: transactionsData } = trpc.wallet.transactions.useQuery({ limit: 10 });
  const { data: settings } = trpc.service.protectedSettings.useQuery();

  const balance = Number(walletData?.balance ?? 0);
  const totalSpent = Number(walletData?.totalSpent ?? 0);
  const totalRecharge = Number(walletData?.totalRecharge ?? 0);

  const transactions =
    transactionsData?.transactions?.filter((tx) => tx.type === "DEPOSIT" || tx.type === "PROMO") || [];

  const handleNav = useCallback((href: string) => router.push(href), [router]);

  if (isPending && !user) return <WalletSkeleton />;

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

        {/* Balance card */}
        <motion.div
          {...fadeUp(0)}
          className="bg-card border border-border rounded-xl overflow-hidden"
        >
          {/* Balance row */}
          <div className="px-5 pt-5 pb-4">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Available Balance</p>
            <div className="flex items-baseline gap-1">
              <IndianRupee size={20} strokeWidth={2.5} className="text-foreground mb-0.5" />
              <span className="text-4xl font-black tabular-nums text-foreground leading-none">
                {balance.toFixed(2)}
              </span>
            </div>
          </div>

          <Separator />

          {/* Stats row */}
          <div className="grid grid-cols-2 divide-x divide-border">
            <StatCard
              icon={TrendingDown}
              label="Total Spent"
              value={totalSpent.toFixed(2)}
              iconClass="text-rose-500"
              valueClass="text-rose-500"
            />
            <StatCard
              icon={TrendingUp}
              label="Total Recharged"
              value={totalRecharge.toFixed(2)}
              iconClass="text-green-500"
              valueClass="text-green-500"
            />
          </div>
        </motion.div>

        {/* Manage */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-0.5 mb-2">
            Manage
          </p>
          <motion.div
            {...fadeUp(0.08)}
            className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border/60"
          >
            <ActionRow
              icon={IndianRupeeIcon}
              iconColor="text-green-600"
              iconBg="bg-green-500/10"
              title="Add Funds"
              subtitle="Google Pay, Paytm, PhonePe"
              delay={0.1}
              onClick={() => setDepositOpen(true)}
              superscript="INSTANT"
              superscriptClass="text-green-600 bg-green-500/10"
            />
            <ActionRow
              icon={Bitcoin}
              iconColor="text-muted-foreground"
              iconBg="bg-muted"
              title="Crypto"
              subtitle="Coming soon"
              delay={0.12}
              superscript="SOON"
              superscriptClass="text-muted-foreground bg-muted"
              disabled
            />
            <ActionRow
              icon={Gift}
              iconColor="text-violet-500"
              iconBg="bg-violet-500/10"
              title="Redeem Promo Code"
              subtitle="Enter code for bonus balance"
              delay={0.14}
              onClick={() => setPromoOpen(true)}
            />
            <ActionRow
              icon={History}
              iconColor="text-primary"
              iconBg="bg-primary/10"
              title="Transaction History"
              subtitle="View all past transactions"
              delay={0.16}
              onClick={() => handleNav("/history")}
            />
          </motion.div>
        </div>

        {/* Recent Transactions */}
        <motion.div {...fadeUp(0.18)}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-0.5 mb-2">
            Recent
          </p>
          <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border/60">
            {transactions.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2">
                <History size={20} className="text-muted-foreground/30" />
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
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", config.bg)}>
                      <Icon size={15} className={config.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground">{getTxTitle(tx.type)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {tx.type === "PROMO"
                          ? "Promo code applied"
                          : tx.description ||
                            formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <p className={cn("font-bold text-sm tabular-nums flex items-center shrink-0", isCredit ? "text-green-500" : "text-foreground")}>
                      {isCredit ? "+" : "-"}
                      <IndianRupee size={11} strokeWidth={2.5} />
                      {Math.abs(Number(tx.amount)).toFixed(2)}
                    </p>
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.div>

        {/* Coming soon */}
        <motion.div
          {...fadeUp(0.22)}
          className="flex items-center gap-3 px-4 py-3.5 bg-card border border-border rounded-xl"
        >
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
            <Sparkles size={14} className="text-amber-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">More features coming</p>
            <p className="text-xs text-muted-foreground">Auto top-up, spending limits & more</p>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            Soon
          </span>
        </motion.div>

        {/* Security Badges */}
        <motion.div
          {...fadeUp(0.26)}
          className="flex items-center justify-center gap-4 pt-2"
        >
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <ShieldCheck size={18} className="text-emerald-500" />
            </div>
            <span className="text-[9px] font-medium text-muted-foreground">256-bit SSL</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Lock size={18} className="text-blue-500" />
            </div>
            <span className="text-[9px] font-medium text-muted-foreground">Encrypted</span>
          </div>
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