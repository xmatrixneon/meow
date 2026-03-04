"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Inbox,
  Copy,
  CheckCheck,
  Globe,
  Trash2,
  MessageSquare,
  Plus,
  ChevronRight,
  Timer,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Types ────────────────────────────────────────────────────────────────────

type TabValue = "waiting" | "received" | "cancelled";

interface SmsEntry {
  content: string;
  receivedAt: string;
}

interface TempNumber {
  id: string;
  orderId: string;
  number: string;
  country: string;
  countryCode: string;
  countryIso?: string | null;
  countryFlag?: string | null;
  service: string;
  serviceId?: string;
  serverId?: string;
  status: TabValue;
  smsReceived: boolean;
  expiresAt: Date;
  sms?: string;
  smsList?: SmsEntry[];
  code?: string;
  buyTime: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeRemaining(expiresAt: Date): string {
  const diff = expiresAt.getTime() - Date.now();
  if (diff <= 0) return "0:00";
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function formatCancelCountdown(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function extractOTP(sms?: string | null | SmsEntry[]): string | undefined {
  if (!sms) return undefined;
  if (Array.isArray(sms)) {
    const last = sms[sms.length - 1];
    if (!last) return undefined;
    return last.content.match(/\b\d{4,8}\b/)?.[0];
  }
  return String(sms).match(/\b\d{4,8}\b/)?.[0];
}

function getFlagEmoji(iso: string): string {
  if (!iso || iso.length !== 2) return "🌍";
  return String.fromCodePoint(
    ...iso
      .toUpperCase()
      .split("")
      .map((c) => 127397 + c.charCodeAt(0)),
  );
}

function parseSmsContent(raw: unknown): {
  smsList?: SmsEntry[];
  displaySms?: string;
} {
  if (!raw) return {};
  if (Array.isArray(raw) && raw.length > 0) {
    const smsList = raw as SmsEntry[];
    return { smsList, displaySms: smsList[smsList.length - 1]?.content };
  }
  if (typeof raw === "string") {
    return { displaySms: raw };
  }
  return {};
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CountBadge({ count, active }: { count: number; active: boolean }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
        active
          ? "bg-primary-foreground/20 text-primary-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      {count}
    </span>
  );
}

function SmsItem({ sms, index }: { sms: SmsEntry; index: number }) {
  const [copied, setCopied] = useState(false);
  const otp = sms.content.match(/\b\d{4,8}\b/)?.[0];

  const handleCopy = () => {
    if (!otp) return;
    navigator.clipboard.writeText(otp);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "rounded-xl p-3 border",
        index === 0
          ? "bg-green-500/10 border-green-500/30"
          : "bg-muted/30 border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs leading-relaxed text-foreground break-words">
            {sms.content}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1.5">
            <Clock size={9} />
            {formatTimeAgo(sms.receivedAt)}
          </p>
        </div>
        {otp && (
          <motion.button
            whileTap={{ scale: 0.93 }}
            type="button"
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-colors shrink-0",
              copied
                ? "bg-green-500 text-white"
                : "bg-green-500/15 text-green-500 hover:bg-green-500/25",
            )}
          >
            {copied ? <CheckCheck size={11} /> : <Copy size={11} />}
            {copied ? "Copied!" : "Copy"}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

function SmsList({
  smsList,
  singleSms,
  code,
}: {
  smsList?: SmsEntry[];
  singleSms?: string;
  code?: string;
}) {
  const smsCount = smsList?.length ?? (singleSms ? 1 : 0);

  const [showAll, setShowAll] = useState(false);
  const prevCountRef = useRef(smsCount);
  useEffect(() => {
    if (smsCount > prevCountRef.current) {
      setShowAll(true);
    }
    prevCountRef.current = smsCount;
  }, [smsCount]);

  const [codeCopied, setCodeCopied] = useState(false);

  const hasMultiple = smsList && smsList.length > 1;
  const smsArray: SmsEntry[] =
    smsList ??
    (singleSms
      ? [{ content: singleSms, receivedAt: new Date().toISOString() }]
      : []);

  const handleCopyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    toast.success("OTP copied!");
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  if (!hasMultiple) {
    const latestContent = smsArray[smsArray.length - 1]?.content ?? singleSms;
    return (
      <div className="mx-4 mb-3 p-3 bg-green-500/5 border border-green-500/15 rounded-xl">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {latestContent}
        </p>
        {code && (
          <div className="mt-2 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground mb-0.5">
                OTP Code
              </p>
              <p className="text-xl font-bold font-mono tracking-[0.2em] text-green-500">
                {code}
              </p>
            </div>
            <motion.button
              whileTap={{ scale: 0.93 }}
              type="button"
              onClick={handleCopyCode}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors",
                codeCopied
                  ? "bg-green-500 text-white"
                  : "bg-green-500/15 text-green-500 hover:bg-green-500/25",
              )}
            >
              {codeCopied ? <CheckCheck size={13} /> : <Copy size={13} />}
              {codeCopied ? "Copied!" : "Copy OTP"}
            </motion.button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-4 mb-3 space-y-2">
      <button
        type="button"
        onClick={() => setShowAll(!showAll)}
        className="w-full flex items-center justify-between px-3 py-2 bg-green-500/5 border border-green-500/15 rounded-xl hover:bg-green-500/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={12} className="text-green-500" />
          <span className="text-xs font-semibold">
            {smsList.length} SMS received
          </span>
        </div>
        <motion.div
          animate={{ rotate: showAll ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronRight size={14} className="text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {showAll && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden space-y-2"
          >
            {[...smsArray].reverse().map((sms, i) => (
              <SmsItem key={sms.receivedAt} sms={sms} index={i} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {code && (
        <div className="flex items-center justify-between px-3 py-2 bg-green-500/5 border border-green-500/15 rounded-xl">
          <div>
            <p className="text-[10px] text-muted-foreground">Latest OTP</p>
            <p className="text-lg font-bold font-mono tracking-[0.2em] text-green-500">
              {code}
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.93 }}
            type="button"
            onClick={handleCopyCode}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors",
              codeCopied
                ? "bg-green-500 text-white"
                : "bg-green-500/15 text-green-500 hover:bg-green-500/25",
            )}
          >
            {codeCopied ? <CheckCheck size={13} /> : <Copy size={13} />}
            {codeCopied ? "Copied!" : "Copy"}
          </motion.button>
        </div>
      )}
    </div>
  );
}

function NumberCard({
  item,
  delay,
  onCancel,
  minCancelMs,
  onNextNumber,
  buyingNextNumberId,
}: {
  item: TempNumber;
  delay: number;
  onCancel?: (orderId: string) => void;
  minCancelMs: number;
  onNextNumber?: (serviceId: string, serverId: string, orderId: string) => void;
  buyingNextNumberId?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [expiresIn, setExpiresIn] = useState(() =>
    formatTimeRemaining(item.expiresAt),
  );
  const [cancelRemainingMs, setCancelRemainingMs] = useState(() =>
    Math.max(0, minCancelMs - (Date.now() - item.buyTime.getTime())),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setExpiresIn(formatTimeRemaining(item.expiresAt));
      setCancelRemainingMs(
        Math.max(0, minCancelMs - (Date.now() - item.buyTime.getTime())),
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [item.expiresAt, item.buyTime, minCancelMs]);

  const hasSms = !!(item.sms || item.smsList);
  const isReceived = item.smsReceived || hasSms;
  const isCancelled = item.status === "cancelled";
  const canCancel = cancelRemainingMs === 0;

  const displayStatus: TabValue = isReceived
    ? "received"
    : isCancelled
      ? "cancelled"
      : "waiting";

  const statusColors = {
    received: {
      border: "border-green-500/30",
      dot: "bg-green-500",
      badge: "bg-green-500/10 border-green-500/30 text-green-500",
      timer: "text-green-500",
      timerIcon: "text-green-500",
    },
    cancelled: {
      border: "border-red-500/30",
      dot: "bg-red-500",
      badge: "bg-red-500/10 border-red-500/30 text-red-500",
      timer: "",
      timerIcon: "",
    },
    waiting: {
      border: "border-border",
      dot: "bg-amber-400",
      badge: "bg-amber-400/10 border-amber-400/30 text-amber-500",
      timer: "text-amber-400",
      timerIcon: "text-amber-400",
    },
  }[displayStatus];

  const statusLabel = {
    received: "Received",
    cancelled: "Cancelled",
    waiting: "Waiting",
  }[displayStatus];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ type: "spring", stiffness: 280, damping: 24, delay }}
      className={cn(
        "bg-card border rounded-2xl overflow-hidden",
        statusColors.border,
      )}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start gap-3">
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden">
            {item.countryFlag ? (
              <Image
                src={item.countryFlag}
                alt={item.country}
                width={40}
                height={40}
                className="w-full h-full object-cover"
                unoptimized
              />
            ) : item.countryIso ? (
              <span className="text-xl">{getFlagEmoji(item.countryIso)}</span>
            ) : (
              <Globe className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card",
              statusColors.dot,
            )}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm font-mono tracking-tight">
              {item.number}
            </span>
            <span
              className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                statusColors.badge,
              )}
            >
              {statusLabel}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <MessageSquare
              size={10}
              className="text-muted-foreground shrink-0"
            />
            <span className="text-xs text-muted-foreground">
              {item.service}
            </span>
            {item.country && item.country !== "Unknown" && (
              <>
                <span className="text-muted-foreground/40">•</span>
                <span className="text-xs text-muted-foreground">
                  {item.country}
                </span>
              </>
            )}
          </div>
        </div>

        {!isCancelled && (
          <div className="flex items-center gap-1 shrink-0">
            <Timer size={12} className={statusColors.timerIcon} />
            <span
              className={cn(
                "text-xs font-mono font-bold tabular-nums",
                statusColors.timer,
              )}
            >
              {expiresIn}
            </span>
          </div>
        )}
      </div>

      {/* SMS content */}
      {hasSms && (
        <SmsList smsList={item.smsList} singleSms={item.sms} code={item.code} />
      )}

      {/* Waiting pulse */}
      {!hasSms && !isCancelled && (
        <div className="mx-4 mb-3 flex items-center gap-2 px-3 py-2 bg-amber-400/5 border border-amber-400/15 rounded-xl">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
          </span>
          <p className="text-xs text-muted-foreground">
            Waiting for SMS from{" "}
            <span className="font-medium text-foreground">{item.service}</span>…
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 pb-4 flex items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.96 }}
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(item.number);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors",
            copied
              ? "bg-primary text-primary-foreground"
              : "bg-primary/10 text-primary hover:bg-primary/20",
          )}
        >
          {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
          {copied ? "Copied!" : "Copy Number"}
        </motion.button>

        {onNextNumber && item.serviceId && item.serverId && (
          <motion.button
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={() =>
              onNextNumber(item.serviceId!, item.serverId!, item.orderId)
            }
            disabled={buyingNextNumberId !== null}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {buyingNextNumberId === item.orderId ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                className="w-3 h-3 rounded-full border-2 border-primary/30 border-t-primary"
              />
            ) : (
              <>
                <RotateCcw size={13} />
                Next
              </>
            )}
          </motion.button>
        )}

        {displayStatus === "waiting" &&
          !isReceived &&
          onCancel &&
          (canCancel ? (
            <motion.button
              whileTap={{ scale: 0.96 }}
              type="button"
              onClick={() => onCancel(item.orderId)}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors shrink-0"
            >
              <Trash2 size={14} />
            </motion.button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-muted text-muted-foreground shrink-0 cursor-not-allowed opacity-60">
                    <Trash2 size={14} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex items-center gap-1.5">
                    <AlertCircle size={12} />
                    <span>
                      Cancel in {formatCancelCountdown(cancelRemainingMs)}
                    </span>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: { label: string; value: TabValue; icon: React.ElementType }[] = [
  { label: "Waiting", value: "waiting", icon: Clock },
  { label: "Received", value: "received", icon: CheckCheck },
  { label: "Cancelled", value: "cancelled", icon: Trash2 },
];

export default function NumbersPage() {
  const [activeTab, setActiveTab] = useState<TabValue>("waiting");
  const [buyingNextNumberId, setBuyingNextNumberId] = useState<string | null>(
    null,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [prevSmsCount, setPrevSmsCount] = useState(0);

  const utils = trpc.useUtils();

  // ── Queries ────────────────────────────────────────────────────────────────

  /**
   * getActive is now a pure DB read — fetch.mjs handles all provider polling.
   * We just refetch every 3s to pick up changes the poller wrote to the DB.
   */
  const { data: activeData } = trpc.number.getActive.useQuery(undefined, {
    refetchInterval: 3000,
    staleTime: 0,
    gcTime: 30000,
  });

  const {
    data: receivedData,
    fetchNextPage: fetchNextReceived,
    hasNextPage: hasMoreReceived,
  } = trpc.number.getReceivedInfinite.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (p: any) => p.nextCursor, staleTime: 60_000 },
  );

  const {
    data: cancelledData,
    fetchNextPage: fetchNextCancelled,
    hasNextPage: hasMoreCancelled,
  } = trpc.number.getCancelledInfinite.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (p: any) => p.nextCursor, staleTime: 60_000 },
  );

  const { data: settingsData } = trpc.service.settings.useQuery();
  const minCancelMs = (settingsData?.minCancelMinutes ?? 2) * 60 * 1000;

  // ── Mutations ──────────────────────────────────────────────────────────────

  const cancelMutation = trpc.number.cancel.useMutation({
    onSuccess: (data) => {
      utils.number.getActive.invalidate();
      utils.number.getCancelledInfinite.invalidate();
      utils.wallet.balance.invalidate();
      utils.wallet.transactions.invalidate();
      toast.success(`Refunded ₹${Number(data.refundedAmount ?? 0).toFixed(2)}`);
    },
    onError: (err) => {
      const msg = err.message || "Failed to cancel";
      if (msg.includes("wait") || msg.includes("seconds")) {
        toast.error(msg);
      } else if (msg.includes("SMS") || msg.includes("received")) {
        toast.error("Cannot cancel — SMS already received.");
      } else {
        toast.error(msg);
      }
    },
  });

  const buyNextMutation = trpc.number.buy.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        utils.number.getActive.invalidate();
        utils.wallet.balance.invalidate();
        toast.success("New number assigned!");
      }
      setBuyingNextNumberId(null);
    },
    onError: (err) => {
      const msg = err.message || "Failed to get next number";
      toast.error(msg.includes("balance") ? "Insufficient balance." : msg);
      setBuyingNextNumberId(null);
    },
  });

  // ── Invalidate received/cancelled when active tab changes ─────────────────
  // When fetch.mjs closes a number (expired/cancelled), getActive will stop
  // returning it. We then need received/cancelled lists to be up to date.

  const prevActiveIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(activeData?.numbers.map((n) => n.id) ?? []);
    const prevIds = prevActiveIdsRef.current;

    // Some numbers disappeared from active — they moved to received/cancelled
    const removed = [...prevIds].filter((id) => !currentIds.has(id));
    if (removed.length > 0) {
      utils.number.getReceivedInfinite.invalidate();
      utils.number.getCancelledInfinite.invalidate();
      utils.wallet.balance.invalidate();
    }

    prevActiveIdsRef.current = currentIds;
  }, [activeData, utils]);

  // ── Data transformation ────────────────────────────────────────────────────

  const numbers: TempNumber[] = useMemo(() => {
    return (
      activeData?.numbers.map((n) => {
        const server = n.service?.server;
        const { smsList, displaySms } = parseSmsContent(n.smsContent);

        return {
          id: n.id,
          orderId: n.orderId,
          number: n.phoneNumber,
          country: server?.countryName ?? "Unknown",
          countryCode: server?.countryCode ?? "",
          countryIso: server?.countryIso ?? "",
          countryFlag: server?.flagUrl,
          service: n.service?.name ?? "Unknown",
          serviceId: n.serviceId,
          serverId: n.serverId,
          status: "waiting" as TabValue,
          smsReceived: (n.status as string) === "COMPLETED",
          expiresAt: new Date(n.expiresAt),
          sms: displaySms,
          smsList,
          code: extractOTP(displaySms ?? smsList),
          buyTime: new Date(n.createdAt),
        };
      }) ?? []
    );
  }, [activeData]);

  const receivedNumbers: TempNumber[] = useMemo(() => {
    return (
      receivedData?.pages
        .flatMap((p: any) => p.numbers)
        .map((n: any) => {
          const server = n.service?.server;
          const { smsList, displaySms } = parseSmsContent(n.smsContent);

          return {
            id: n.id,
            orderId: n.orderId,
            number: n.phoneNumber,
            country: server?.countryName ?? "Unknown",
            countryCode: server?.countryCode ?? "",
            countryIso: server?.countryIso ?? "",
            countryFlag: server?.flagUrl,
            service: n.service?.name ?? "Unknown",
            serviceId: n.serviceId,
            serverId: n.serverId,
            status: "received" as TabValue,
            smsReceived: true,
            expiresAt: new Date(),
            sms: displaySms,
            smsList,
            code: extractOTP(displaySms ?? smsList),
            buyTime: new Date(n.createdAt),
          };
        }) ?? []
    );
  }, [receivedData]);

  const cancelledNumbers: TempNumber[] = useMemo(() => {
    return (
      cancelledData?.pages
        .flatMap((p: any) => p.numbers)
        .map((n: any) => {
          const server = n.service?.server;

          return {
            id: n.id,
            orderId: n.orderId,
            number: n.phoneNumber,
            country: server?.countryName ?? "Unknown",
            countryCode: server?.countryCode ?? "",
            countryIso: server?.countryIso ?? "",
            countryFlag: server?.flagUrl,
            service: n.service?.name ?? "Unknown",
            serviceId: n.serviceId,
            serverId: n.serverId,
            status: "cancelled" as TabValue,
            smsReceived: false,
            expiresAt: new Date(),
            sms: undefined,
            smsList: undefined,
            code: undefined,
            buyTime: new Date(n.createdAt),
          };
        }) ?? []
    );
  }, [cancelledData]);

  // ── SMS arrival notification ───────────────────────────────────────────────

  useEffect(() => {
    const smsCount = numbers.filter((n) => n.sms || n.smsList).length;
    if (smsCount > prevSmsCount && prevSmsCount >= 0) {
      if (smsCount > 0) toast.success("🎉 SMS received!");
    }
    const id = setTimeout(() => setPrevSmsCount(smsCount), 0);
    return () => clearTimeout(id);
  }, [numbers, prevSmsCount]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCancel = useCallback(
    (orderId: string) => cancelMutation.mutate({ orderId }),
    [cancelMutation],
  );

  const handleNextNumber = useCallback(
    (serviceId: string, serverId: string, orderId: string) => {
      setBuyingNextNumberId(orderId);
      buyNextMutation.mutate({ serviceId, serverId });
    },
    [buyNextMutation],
  );

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      if (activeTab === "received") await fetchNextReceived();
      if (activeTab === "cancelled") await fetchNextCancelled();
    } finally {
      setLoadingMore(false);
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────────

  const counts = {
    waiting: numbers.length,
    received: receivedNumbers.length,
    cancelled: cancelledNumbers.length,
  };

  const filtered =
    activeTab === "waiting"
      ? numbers
      : activeTab === "received"
        ? receivedNumbers
        : cancelledNumbers;

  const hasMore =
    activeTab === "received"
      ? hasMoreReceived
      : activeTab === "cancelled"
        ? hasMoreCancelled
        : false;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[calc(100vh-7rem)] flex flex-col">
      <div className="flex-1 px-4 pt-5 pb-28 max-w-md mx-auto w-full space-y-5">
        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 24 }}
          className="relative overflow-hidden rounded-3xl bg-primary/10 dark:bg-primary/15 border border-primary/20 px-5 py-5"
        >
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
          <p className="relative text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 mb-4">
            Temp Numbers
          </p>
          <div className="relative grid grid-cols-3 gap-2">
            {[
              {
                icon: Clock,
                color: "text-amber-400",
                bg: "bg-amber-400/10",
                value: counts.waiting,
                label: "Waiting",
              },
              {
                icon: CheckCheck,
                color: "text-green-500",
                bg: "bg-green-500/10",
                value: counts.received,
                label: "Received",
              },
              {
                icon: Trash2,
                color: "text-destructive",
                bg: "bg-destructive/10",
                value: counts.cancelled,
                label: "Cancelled",
              },
            ].map(({ icon: Icon, color, bg, value, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                    bg,
                  )}
                >
                  <Icon size={15} className={color} />
                </div>
                <p className="text-[10px] text-muted-foreground text-center leading-tight">
                  {label}
                </p>
                <p className={cn("text-sm font-bold tabular-nums", color)}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: "spring",
            stiffness: 280,
            damping: 24,
            delay: 0.06,
          }}
          className="bg-card border border-border rounded-2xl p-1.5 flex gap-1"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "relative flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-semibold transition-colors duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="tab-bg"
                    className="absolute inset-0 bg-primary rounded-xl"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative flex items-center gap-1">
                  <Icon size={13} strokeWidth={2.5} />
                  {tab.label}
                  <CountBadge count={counts[tab.value]} active={isActive} />
                </span>
              </button>
            );
          })}
        </motion.div>

        {/* Get new number CTA */}
        <Link
          href="/"
          className="w-full flex items-center gap-3 px-4 py-3.5 bg-card border border-dashed border-primary/40 rounded-2xl hover:border-primary/70 hover:bg-primary/5 transition-colors group"
        >
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Plus size={18} className="text-primary" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold">Get New Number</p>
            <p className="text-xs text-muted-foreground">
              Browse available numbers by country
            </p>
          </div>
          <ChevronRight
            size={15}
            className="text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0"
          />
        </Link>

        {/* Number list */}
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 24 }}
              className="flex flex-col items-center justify-center py-16 gap-3"
            >
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <Inbox size={22} className="text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No numbers found</p>
              <p className="text-xs text-muted-foreground/60 text-center max-w-[240px]">
                {activeTab === "waiting"
                  ? "No numbers waiting. Get a new number to start receiving OTP codes."
                  : activeTab === "received"
                    ? "No received numbers yet. Successfully received SMS will appear here."
                    : "No cancelled numbers yet. Cancelled orders and refunds will appear here."}
              </p>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {filtered.map((item, i) => (
                <NumberCard
                  key={item.id}
                  item={item}
                  delay={i * 0.04}
                  minCancelMs={minCancelMs}
                  onCancel={activeTab === "waiting" ? handleCancel : undefined}
                  onNextNumber={handleNextNumber}
                  buyingNextNumberId={buyingNextNumberId}
                />
              ))}

              {hasMore && (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="w-full py-3 bg-card border border-border rounded-2xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-60"
                >
                  {loadingMore ? (
                    <div className="flex items-center justify-center gap-2">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                        className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary"
                      />
                      Loading…
                    </div>
                  ) : (
                    "Load More"
                  )}
                </motion.button>
              )}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
