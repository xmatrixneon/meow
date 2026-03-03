"use client";

import { motion } from "framer-motion";
import { authClient } from "@/lib/auth-client";
import type { User } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  User as UserIcon, Mail, Wallet, HelpCircle, FileText,
  ChevronRight, Copy, CheckCheck, ExternalLink, Sparkles,
  IndianRupee, TrendingDown, TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring" as const, stiffness: 280, damping: 24, delay },
});

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 px-1 mb-2">
      {label}
    </p>
  );
}

function SettingsRow({
  icon: Icon, iconColor, label, value, onClick, danger, trailing,
}: {
  icon: React.ElementType;
  iconColor?: string;
  label: string;
  value?: string;
  onClick?: () => void;
  danger?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.988 }}
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3.5 px-4 py-3.5 text-left",
        "hover:bg-muted/50 transition-colors duration-150",
        danger && "hover:bg-destructive/5"
      )}
    >
      <div className={cn(
        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
        danger ? "bg-destructive/10" : "bg-primary/10 dark:bg-primary/15"
      )}>
        <Icon size={16} strokeWidth={2} className={danger ? "text-destructive" : (iconColor ?? "text-primary")} />
      </div>
      <span className={cn("flex-1 text-sm font-medium", danger ? "text-destructive" : "text-foreground")}>
        {label}
      </span>
      {value && <span className="text-xs text-muted-foreground mr-1">{value}</span>}
      {trailing ?? <ChevronRight size={15} strokeWidth={2.5} className="text-muted-foreground/50 shrink-0" />}
    </motion.button>
  );
}

function SettingsCard({ children, delay }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      {...fadeUp(delay ?? 0)}
      className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border/60"
    >
      {children}
    </motion.div>
  );
}

function StatPill({ value, label, accent }: { value: string; label: string; accent: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 flex-1">
      <p className={cn("text-lg font-bold tabular-nums", accent)}>{value}</p>
      <p className="text-[10px] text-muted-foreground text-center leading-tight">{label}</p>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex-1 px-4 pt-5 pb-28 max-w-md mx-auto w-full space-y-5">
      {/* Hero */}
      <div className="rounded-3xl border border-border px-5 py-6 space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="w-20 h-20 rounded-2xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div className="pt-4 border-t border-border flex items-center gap-2">
          <Skeleton className="h-8 flex-1 rounded-xl" />
          <Skeleton className="w-px h-8" />
          <Skeleton className="h-8 flex-1 rounded-xl" />
          <Skeleton className="w-px h-8" />
          <Skeleton className="h-8 flex-1 rounded-xl" />
          <Skeleton className="w-px h-8" />
          <Skeleton className="h-8 flex-1 rounded-xl" />
        </div>
      </div>
      {/* Account section */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border/60">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3.5 px-4 py-3.5">
              <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
      {/* Support section */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border/60">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3.5 px-4 py-3.5">
              <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  // ✅ single source of truth
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user as User | undefined;

  // Get wallet data with real statistics
  const { data: walletData } = trpc.wallet.balance.useQuery(undefined, {
    enabled: !!user,
  });

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.name ||
    user?.telegramUsername ||
    "User";

  const avatarUrl = user?.photoUrl ?? user?.image ?? null;
  const initials = displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const handleCopyId = () => {
    if (user?.telegramId) {
      navigator.clipboard.writeText(user.telegramId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Real statistics from wallet
  const totalSpent = walletData?.totalSpent || 0;
  const totalRecharge = walletData?.totalRecharge || 0;
  const balance = walletData?.balance || 0;

  // ── Skeleton
  if (isPending && !user) return <ProfileSkeleton />;

  // ── Not in Telegram
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
            <HelpCircle size={24} className="text-destructive" />
          </div>
          <p className="font-semibold text-foreground mb-1">Not available</p>
          <p className="text-sm text-muted-foreground">Open this app inside Telegram to continue.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-7rem)] flex flex-col">
      <div className="flex-1 px-4 pt-5 pb-28 max-w-md mx-auto w-full space-y-5">

        {/* Avatar Hero */}
        <motion.div
          {...fadeUp(0)}
          className="relative overflow-hidden rounded-3xl bg-primary/10 dark:bg-primary/15 border border-primary/20 px-5 py-6"
        >
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
          <div className="relative flex items-center gap-4">
            <div className="relative shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="w-20 h-20 rounded-2xl object-cover border-2 border-primary/30 shadow-lg" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold border-2 border-primary/30 shadow-lg">
                  {initials}
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-card shadow-sm" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-foreground truncate leading-tight">{displayName}</h1>
              {user.telegramUsername && (
                <p className="text-sm text-primary font-medium mt-0.5">@{user.telegramUsername}</p>
              )}
              {user.email && (
                <p className="text-xs text-muted-foreground mt-1 truncate">{user.email}</p>
              )}
              {user.isPremium && (
                <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-semibold text-amber-500">
                  <Sparkles size={9} />
                  Telegram Premium
                </span>
              )}
              {user.telegramId && (
                <button
                  type="button"
                  onClick={handleCopyId}
                  className={cn(
                    "mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full",
                    "bg-card/80 border border-border text-xs text-muted-foreground",
                    "hover:border-primary/40 transition-colors duration-150"
                  )}
                >
                  {copied ? <CheckCheck size={11} className="text-green-500" /> : <Copy size={11} />}
                  <span className="font-mono">ID: {user.telegramId}</span>
                </button>
              )}
            </div>
          </div>
          <div className="relative mt-5 pt-4 border-t border-primary/15 flex flex-wrap gap-4">
            <div className="flex items-center gap-2.5 min-w-[100px] flex-1">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
                <TrendingDown size={12} className="text-rose-500" />
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-[10px] text-muted-foreground">Total Spent</p>
                <p className="text-sm font-bold text-rose-500 tabular-nums flex items-center gap-0.5">
                  <IndianRupee size={10} strokeWidth={2.5} />
                  {totalSpent.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 min-w-[100px] flex-1">
              <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                <TrendingUp size={12} className="text-green-500" />
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-[10px] text-muted-foreground">Total Recharge</p>
                <p className="text-sm font-bold text-green-500 tabular-nums flex items-center gap-0.5">
                  <IndianRupee size={10} strokeWidth={2.5} />
                  {totalRecharge.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Support */}
        <div>
          <SectionLabel label="Support" />
          <SettingsCard delay={0.2}>
            <SettingsRow icon={HelpCircle} label="Help & FAQ" onClick={() => router.push("/help")} />
            <SettingsRow
              icon={FileText}
              label="Terms & Privacy"
              trailing={<ExternalLink size={14} className="text-muted-foreground/50 shrink-0" />}
              onClick={() => window.open("https://meowsms.com/legal", "_blank")}
            />
          </SettingsCard>
        </div>

        <motion.p
          {...fadeUp(0.16)}
          className="text-center text-[10px] text-muted-foreground/40 pb-2"
        >
          MeowSMS v1.0.0 · Built with 🐾
        </motion.p>
      </div>
    </div>
  );
}