"use client";

import { motion } from "framer-motion";
import { authClient } from "@/lib/auth-client";
import type { User } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  HelpCircle,
  FileText,
  ChevronRight,
  Copy,
  CheckCheck,
  ExternalLink,
  Sparkles,
  IndianRupee,
  TrendingDown,
  TrendingUp,
  BadgeCheck,
  RefreshCw,
  Clock,
  BookOpen,
  MessageCircle,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { ApiDocsDialog } from "@/components/api-docs-dialog";
import { SupportDialog } from "@/components/support-dialog";
import { LegalDialog } from "@/components/legal-dialog";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring" as const, stiffness: 280, damping: 26, delay },
});

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-0.5 mb-2">
      {label}
    </p>
  );
}

function SettingsRow({
  icon: Icon,
  iconColor,
  label,
  value,
  onClick,
  danger,
  trailing,
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
      whileTap={{ scale: 0.99 }}
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-150",
        danger ? "hover:bg-destructive/5" : "hover:bg-accent",
      )}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
          danger ? "bg-destructive/10" : "bg-muted",
        )}
      >
        <Icon
          size={15}
          strokeWidth={2}
          className={danger ? "text-destructive" : (iconColor ?? "text-foreground")}
        />
      </div>
      <span className={cn("flex-1 text-sm font-medium", danger ? "text-destructive" : "text-foreground")}>
        {label}
      </span>
      {value && <span className="text-xs text-muted-foreground mr-1">{value}</span>}
      {trailing ?? (
        <ChevronRight size={14} strokeWidth={2.5} className="text-muted-foreground/40 shrink-0" />
      )}
    </motion.button>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex-1 px-4 pt-4 pb-28 max-w-md mx-auto w-full space-y-4">
      <div className="rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="w-16 h-16 rounded-2xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>
      {[...Array(2)].map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <div className="border border-border rounded-xl overflow-hidden">
            {[...Array(2)].map((_, j) => (
              <div key={j} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [apiDocsOpen, setApiDocsOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);

  const { data: session, isPending } = authClient.useSession();
  const user = session?.user as User | undefined;

  const { data: settings } = trpc.service.protectedSettings.useQuery();
  const { data: walletData } = trpc.wallet.balance.useQuery(undefined, { enabled: !!user });
  const { data: apiKeyData, refetch: refetchApiKey } = trpc.apiKey.get.useQuery(undefined, { enabled: !!user });

  const refreshApiKeyMutation = trpc.apiKey.refresh.useMutation({
    onSuccess: () => {
      refetchApiKey();
      setApiKeyCopied(false);
      setRefreshError(null);
    },
    onError: (error) => setRefreshError(error.message),
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

  const handleCopyApiKey = () => {
    if (apiKeyData?.apiKey) {
      navigator.clipboard.writeText(apiKeyData.apiKey);
      setApiKeyCopied(true);
      setTimeout(() => setApiKeyCopied(false), 2000);
    }
  };

  const balance = Number(walletData?.balance ?? 0);
  const totalSpent = Number(walletData?.totalSpent ?? 0);
  const totalRecharge = Number(walletData?.totalRecharge ?? 0);

  if (isPending && !user) return <ProfileSkeleton />;

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-7rem)] flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-card border border-border rounded-2xl p-8 text-center max-w-sm w-full"
        >
          <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <HelpCircle size={22} className="text-destructive" />
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

        {/* Profile hero */}
        <motion.div
          {...fadeUp(0)}
          className="bg-card border border-border rounded-xl p-5"
        >
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-16 h-16 rounded-2xl object-cover border border-border"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-xl font-bold border border-border">
                  {initials}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-card" />
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-foreground truncate flex items-center gap-1.5">
                {displayName}
                <BadgeCheck size={15} className="text-blue-500 shrink-0" />
              </h1>
              {user.telegramUsername && (
                <p className="text-sm text-muted-foreground">@{user.telegramUsername}</p>
              )}
              {user.isPremium && (
                <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-semibold text-amber-500">
                  <Sparkles size={9} />
                  Premium
                </span>
              )}
              {user.telegramId && (
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied ? <CheckCheck size={11} className="text-green-500" /> : <Copy size={11} />}
                  <span className="font-mono">ID: {user.telegramId}</span>
                </button>
              )}
            </div>
          </div>

          <Separator className="my-4" />

          {/* Wallet stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Balance", value: balance.toFixed(2), icon: Wallet, color: "text-primary" },
              { label: "Spent", value: totalSpent.toFixed(2), icon: TrendingDown, color: "text-rose-500" },
              { label: "Recharged", value: totalRecharge.toFixed(2), icon: TrendingUp, color: "text-green-500" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="flex flex-col items-center gap-1 bg-muted/50 rounded-lg py-2.5">
                <Icon size={13} className={color} />
                <p className={cn("text-sm font-bold tabular-nums", color)}>
                  ₹{value}
                </p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* API Access */}
        <motion.div {...fadeUp(0.08)} className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              API Access
            </p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setApiDocsOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted hover:bg-muted/80 text-xs font-medium transition-colors"
            >
              <BookOpen size={11} />
              Docs
            </motion.button>
          </div>

          <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Use this key to resell SMS services programmatically.
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-muted rounded-lg px-3 py-2 overflow-hidden border border-border/50">
                <code className="text-xs font-mono text-foreground truncate block">
                  {apiKeyData?.apiKey ?? "Loading…"}
                </code>
              </div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleCopyApiKey}
                disabled={!apiKeyData?.apiKey}
                className="p-2 rounded-lg bg-muted border border-border/50 hover:bg-accent transition-colors disabled:opacity-50"
              >
                <Copy size={14} className={apiKeyCopied ? "text-green-500" : "text-muted-foreground"} />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (!refreshApiKeyMutation.isPending && apiKeyData?.canRefresh) {
                    setRefreshError(null);
                    refreshApiKeyMutation.mutate();
                  }
                }}
                disabled={refreshApiKeyMutation.isPending || !apiKeyData?.canRefresh}
                className="relative p-2 rounded-lg bg-muted border border-border/50 hover:bg-accent transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  size={14}
                  className={cn(
                    refreshApiKeyMutation.isPending ? "animate-spin text-primary" : "text-muted-foreground",
                  )}
                />
                {!apiKeyData?.canRefresh && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 rounded-full flex items-center justify-center">
                    <Clock size={7} className="text-white" />
                  </span>
                )}
              </motion.button>
            </div>

            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>
                Created: {apiKeyData?.createdAt ? new Date(apiKeyData.createdAt).toLocaleDateString() : "—"}
              </span>
              <span className="w-px h-3 bg-border" />
              <span>
                Refreshes: {(apiKeyData?.limits?.weeklyLimit ?? 10) - (apiKeyData?.weeklyRemaining ?? 0)}/{apiKeyData?.limits?.weeklyLimit ?? 10} used
              </span>
            </div>

            {apiKeyData?.cooldownRemaining && apiKeyData.cooldownRemaining > 0 && (
              <p className="text-[11px] text-amber-500 flex items-center gap-1.5">
                <Clock size={10} />
                Cooldown: {apiKeyData.cooldownRemaining} min remaining
              </p>
            )}

            {refreshError && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"
              >
                {refreshError}
              </motion.p>
            )}
          </div>
        </motion.div>

        {/* Support */}
        <div>
          <SectionLabel label="Support" />
          <motion.div
            {...fadeUp(0.14)}
            className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border/60"
          >
            <SettingsRow icon={HelpCircle} label="Help & FAQ" onClick={() => setSupportOpen(true)} />
            {settings?.telegramSupportUsername && (
              <a
                href={`https://t.me/${settings.telegramSupportUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <SettingsRow
                  icon={MessageCircle}
                  iconColor="text-blue-500"
                  label="Telegram Support"
                  onClick={() => {}}
                  trailing={<ExternalLink size={13} className="text-muted-foreground/40 shrink-0" />}
                />
              </a>
            )}
            <SettingsRow icon={FileText} label="Terms & Privacy" onClick={() => setLegalOpen(true)} />
          </motion.div>
        </div>

        <motion.p
          {...fadeUp(0.18)}
          className="text-center text-[10px] text-muted-foreground/40 pb-2"
        >
          MeowSMS v1.0.0 · Built with 🇷🇺
        </motion.p>
      </div>

      <ApiDocsDialog
        open={apiDocsOpen}
        onOpenChange={setApiDocsOpen}
        apiKey={apiKeyData?.apiKey ?? ""}
        baseUrl={settings?.apiDocsBaseUrl ?? undefined}
      />
      <SupportDialog open={supportOpen} onOpenChange={setSupportOpen} telegramHelpUrl={settings?.telegramHelpUrl} />
      <LegalDialog open={legalOpen} onOpenChange={setLegalOpen} />
    </div>
  );
}