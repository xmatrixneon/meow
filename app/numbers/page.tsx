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
import { playNotificationSound, preloadNotificationSound } from "@/lib/sound";
import { toast } from "sonner";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type TabValue = "waiting" | "received" | "cancelled";

interface SmsEntry { content: string; receivedAt: string; }

interface TempNumber {
  id: string; orderId: string; number: string; country: string;
  countryCode: string; countryIso?: string | null; countryFlag?: string | null;
  service: string; serviceId?: string; serverId?: string; status: TabValue;
  smsReceived: boolean; expiresAt: Date; sms?: string; smsList?: SmsEntry[];
  code?: string; buyTime: Date;
}

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
  return String.fromCodePoint(...iso.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)));
}

function parseSmsContent(raw: unknown): { smsList?: SmsEntry[]; displaySms?: string } {
  if (!raw) return {};
  if (Array.isArray(raw) && raw.length > 0) {
    const smsList = raw as SmsEntry[];
    return { smsList, displaySms: smsList[smsList.length - 1]?.content };
  }
  if (typeof raw === "string") return { displaySms: raw };
  return {};
}

function getLast10Digits(number: string): string {
  const digits = number.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function OtpDisplay({ code, onCopy }: { code: string; onCopy: () => void }) {
  const [copied, setCopied] = useState(false);
  const handle = () => { onCopy(); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="flex items-center justify-between px-3 py-2.5 bg-green-500/5 border border-green-500/15 rounded-xl">
      <div>
        <p className="text-[10px] text-muted-foreground mb-0.5">OTP Code</p>
        <p className="text-2xl font-black font-mono tracking-[0.25em] text-green-500 leading-none">{code}</p>
      </div>
      <motion.button
        whileTap={{ scale: 0.95 }}
        type="button"
        onClick={handle}
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
          copied ? "bg-green-500 text-white" : "bg-green-500/10 text-green-500 hover:bg-green-500/20",
        )}
      >
        {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
        {copied ? "Copied!" : "Copy"}
      </motion.button>
    </div>
  );
}

function SmsBlock({ sms, isLatest }: { sms: SmsEntry; isLatest: boolean }) {
  return (
    <div className={cn("rounded-lg p-2.5 border", isLatest ? "bg-green-500/5 border-green-500/15" : "bg-muted/40 border-border/50")}>
      <p className="text-xs leading-relaxed text-foreground">{sms.content}</p>
      <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
        <Clock size={9} />{formatTimeAgo(sms.receivedAt)}
      </p>
    </div>
  );
}

function SmsList({ smsList, singleSms, code }: { smsList?: SmsEntry[]; singleSms?: string; code?: string }) {
  const [showAll, setShowAll] = useState(false);
  const smsArray: SmsEntry[] = smsList ?? (singleSms ? [{ content: singleSms, receivedAt: new Date().toISOString() }] : []);
  const handleCopyCode = () => { if (code) { navigator.clipboard.writeText(code); toast.success("OTP copied!"); } };

  if (!smsList || smsList.length <= 1) {
    return (
      <div className="mx-4 mb-3 space-y-2">
        {smsArray[0] && <SmsBlock sms={smsArray[0]} isLatest />}
        {code && <OtpDisplay code={code} onCopy={handleCopyCode} />}
      </div>
    );
  }

  return (
    <div className="mx-4 mb-3 space-y-2">
      <button
        type="button"
        onClick={() => setShowAll(!showAll)}
        className="w-full flex items-center justify-between px-3 py-2 bg-green-500/5 border border-green-500/15 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={12} className="text-green-500" />
          <span className="text-xs font-semibold">{smsList.length} SMS received</span>
        </div>
        <motion.div animate={{ rotate: showAll ? 90 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronRight size={13} className="text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence>
        {showAll && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden space-y-1.5"
          >
            {[...smsArray].reverse().map((sms, i) => (
              <SmsBlock key={sms.receivedAt} sms={sms} isLatest={i === 0} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      {code && <OtpDisplay code={code} onCopy={handleCopyCode} />}
    </div>
  );
}

function NumberCard({ item, delay, onCancel, minCancelMs, onNextNumber, buyingNextNumberId, cancellingId }: {
  item: TempNumber; delay: number; onCancel?: (orderId: string) => void; minCancelMs: number;
  onNextNumber?: (serviceId: string, serverId: string, orderId: string) => void;
  buyingNextNumberId?: string | null; cancellingId?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [expiresIn, setExpiresIn] = useState(() => formatTimeRemaining(item.expiresAt));
  const [cancelRemainingMs, setCancelRemainingMs] = useState(() =>
    Math.max(0, minCancelMs - (Date.now() - item.buyTime.getTime())),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setExpiresIn(formatTimeRemaining(item.expiresAt));
      setCancelRemainingMs(Math.max(0, minCancelMs - (Date.now() - item.buyTime.getTime())));
    }, 1000);
    return () => clearInterval(interval);
  }, [item.expiresAt, item.buyTime, minCancelMs]);

  const hasSms = !!(item.sms || item.smsList);
  const isCancelled = item.status === "cancelled";
  const canCancel = cancelRemainingMs === 0;
  const isCancelling = cancellingId === item.orderId;
  const displayStatus: TabValue = hasSms ? "received" : isCancelled ? "cancelled" : "waiting";

  const statusMap = {
    received: { label: "Received", badgeClass: "border-green-500/30 text-green-500 bg-green-500/5" },
    cancelled: { label: "Cancelled", badgeClass: "border-destructive/30 text-destructive bg-destructive/5" },
    waiting: { label: "Waiting", badgeClass: "border-amber-500/30 text-amber-500 bg-amber-500/5" },
  }[displayStatus];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ type: "spring", stiffness: 280, damping: 26, delay }}
      className="bg-card border border-border rounded-xl overflow-hidden"
    >
      <div className="px-4 pt-3.5 pb-3 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0 overflow-hidden border border-border/50">
          {item.countryFlag ? (
            <Image src={item.countryFlag} alt={item.country} width={40} height={40} className="w-full h-full object-cover" unoptimized />
          ) : item.countryIso ? (
            <span className="text-xl">{getFlagEmoji(item.countryIso)}</span>
          ) : (
            <Globe className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm font-mono">{item.number}</span>
            <Badge variant="outline" className={cn("text-[9px] font-semibold px-1.5 py-0 h-4 rounded-full", statusMap.badgeClass)}>
              {statusMap.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <MessageSquare size={10} />
            {item.service}
            {item.country && item.country !== "Unknown" && (
              <><span className="opacity-40">·</span>{item.country}</>
            )}
          </p>
        </div>
        {!isCancelled && (
          <div className="flex items-center gap-1 shrink-0">
            <Timer size={11} className={hasSms ? "text-green-500" : "text-amber-500"} />
            <span className={cn("text-xs font-mono font-bold tabular-nums", hasSms ? "text-green-500" : "text-amber-500")}>
              {expiresIn}
            </span>
          </div>
        )}
      </div>

      {hasSms && <SmsList smsList={item.smsList} singleSms={item.sms} code={item.code} />}

      {!hasSms && !isCancelled && (
        <div className="mx-4 mb-3 flex items-center gap-2 px-3 py-2 bg-muted/40 border border-border/50 rounded-lg">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
          </span>
          <p className="text-xs text-muted-foreground">
            Waiting for SMS from <span className="font-medium text-foreground">{item.service}</span>…
          </p>
        </div>
      )}

      <div className="px-4 pb-3.5 flex items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={() => { navigator.clipboard.writeText(getLast10Digits(item.number)); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors",
            copied ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-foreground",
          )}
        >
          {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
          {copied ? "Copied!" : "Copy Number"}
        </motion.button>

        {onNextNumber && item.serviceId && item.serverId && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={() => onNextNumber(item.serviceId!, item.serverId!, item.orderId)}
            disabled={buyingNextNumberId !== null}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground transition-colors disabled:opacity-50"
          >
            {buyingNextNumberId === item.orderId ? (
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                className="w-3 h-3 rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
            ) : (
              <><RotateCcw size={13} />Next</>
            )}
          </motion.button>
        )}

        {displayStatus === "waiting" && !hasSms && onCancel && (
          canCancel ? (
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={() => !isCancelling && onCancel(item.orderId)}
              disabled={isCancelling}
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/15 transition-colors disabled:opacity-60"
            >
              {isCancelling ? (
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                  className="w-3.5 h-3.5 rounded-full border-2 border-destructive/30 border-t-destructive" />
              ) : <Trash2 size={14} />}
            </motion.button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted text-muted-foreground cursor-not-allowed opacity-50">
                    <Trash2 size={14} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex items-center gap-1.5">
                    <AlertCircle size={12} />
                    <span>Cancel in {formatCancelCountdown(cancelRemainingMs)}</span>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        )}
      </div>
    </motion.div>
  );
}

const TABS: { label: string; value: TabValue; icon: React.ElementType }[] = [
  { label: "Waiting", value: "waiting", icon: Clock },
  { label: "Received", value: "received", icon: CheckCheck },
  { label: "Cancelled", value: "cancelled", icon: Trash2 },
];

export default function NumbersPage() {
  const [activeTab, setActiveTab] = useState<TabValue>("waiting");
  const [buyingNextNumberId, setBuyingNextNumberId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();
  const initializedRef = useRef(false);
  const prevSmsCountRef = useRef(0);
  const prevActiveIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => { preloadNotificationSound(); }, []);

  const { data: activeData } = trpc.number.getActive.useQuery(undefined, { refetchInterval: 3000, staleTime: 0, gcTime: 30000 });
  const { data: receivedData, fetchNextPage: fetchNextReceived, hasNextPage: hasMoreReceived, isFetchingNextPage: isFetchingNextReceived } =
    trpc.number.getReceivedInfinite.useInfiniteQuery({ limit: 20 }, { getNextPageParam: (p: any) => p.nextCursor, staleTime: 60_000 });
  const { data: cancelledData, fetchNextPage: fetchNextCancelled, hasNextPage: hasMoreCancelled, isFetchingNextPage: isFetchingNextCancelled } =
    trpc.number.getCancelledInfinite.useInfiniteQuery({ limit: 20 }, { getNextPageParam: (p: any) => p.nextCursor, staleTime: 60_000 });
  const { data: settingsData } = trpc.service.settings.useQuery();
  const minCancelMs = (settingsData?.minCancelMinutes ?? 2) * 60 * 1000;

  const cancelMutation = trpc.number.cancel.useMutation({
    onSuccess: (data) => {
      setCancellingId(null);
      utils.number.getActive.invalidate(); utils.number.getCancelledInfinite.invalidate();
      utils.wallet.balance.invalidate(); utils.wallet.transactions.invalidate();
      toast.success(`Refunded ₹${Number(data.refundedAmount ?? 0).toFixed(2)}`);
    },
    onError: (err) => { setCancellingId(null); toast.error(err.message || "Failed to cancel"); },
  });

  const buyNextMutation = trpc.number.buy.useMutation({
    onSuccess: (data) => {
      if (data.success) { utils.number.getActive.invalidate(); utils.wallet.balance.invalidate(); toast.success("New number assigned!"); }
      setBuyingNextNumberId(null);
    },
    onError: (err) => { toast.error(err.message?.includes("balance") ? "Insufficient balance." : err.message || "Failed"); setBuyingNextNumberId(null); },
  });

  useEffect(() => {
    const currentIds = new Set(activeData?.numbers.map((n) => n.id) ?? []);
    if ([...prevActiveIdsRef.current].some((id) => !currentIds.has(id))) {
      utils.number.getReceivedInfinite.invalidate(); utils.number.getCancelledInfinite.invalidate(); utils.wallet.balance.invalidate();
    }
    prevActiveIdsRef.current = currentIds;
  }, [activeData, utils]);

  const numbers: TempNumber[] = useMemo(() => activeData?.numbers.map((n) => {
    const server = n.service?.server;
    const { smsList, displaySms } = parseSmsContent(n.smsContent);
    return {
      id: n.id, orderId: n.orderId, number: n.phoneNumber,
      country: server?.countryName ?? "Unknown", countryCode: server?.countryCode ?? "",
      countryIso: server?.countryIso ?? "", countryFlag: server?.flagUrl,
      service: n.service?.name ?? "Unknown", serviceId: n.serviceId, serverId: n.serverId,
      status: "waiting" as TabValue, smsReceived: (n.status as string) === "COMPLETED",
      expiresAt: new Date(n.expiresAt), sms: displaySms, smsList,
      code: extractOTP(displaySms ?? smsList), buyTime: new Date(n.createdAt),
    };
  }) ?? [], [activeData]);

  const receivedNumbers: TempNumber[] = useMemo(() => receivedData?.pages.flatMap((p: any) => p.numbers).map((n: any) => {
    const server = n.service?.server;
    const { smsList, displaySms } = parseSmsContent(n.smsContent);
    return {
      id: n.id, orderId: n.orderId, number: n.phoneNumber,
      country: server?.countryName ?? "Unknown", countryCode: server?.countryCode ?? "",
      countryIso: server?.countryIso ?? "", countryFlag: server?.flagUrl,
      service: n.service?.name ?? "Unknown", serviceId: n.serviceId, serverId: n.serverId,
      status: "received" as TabValue, smsReceived: true, expiresAt: new Date(),
      sms: displaySms, smsList, code: extractOTP(displaySms ?? smsList), buyTime: new Date(n.createdAt),
    };
  }) ?? [], [receivedData]);

  const cancelledNumbers: TempNumber[] = useMemo(() => cancelledData?.pages.flatMap((p: any) => p.numbers).map((n: any) => {
    const server = n.service?.server;
    return {
      id: n.id, orderId: n.orderId, number: n.phoneNumber,
      country: server?.countryName ?? "Unknown", countryCode: server?.countryCode ?? "",
      countryIso: server?.countryIso ?? "", countryFlag: server?.flagUrl,
      service: n.service?.name ?? "Unknown", serviceId: n.serviceId, serverId: n.serverId,
      status: "cancelled" as TabValue, smsReceived: false, expiresAt: new Date(),
      sms: undefined, smsList: undefined, code: undefined, buyTime: new Date(n.createdAt),
    };
  }) ?? [], [cancelledData]);

  useEffect(() => {
    if (!activeData) return;
    const totalSmsCount = numbers.reduce((acc, n) => {
      if (n.smsList && n.smsList.length > 0) return acc + n.smsList.length;
      if (n.sms) return acc + 1;
      return acc;
    }, 0);
    if (!initializedRef.current) { prevSmsCountRef.current = totalSmsCount; initializedRef.current = true; return; }
    if (totalSmsCount > prevSmsCountRef.current) { toast.success("🎉 SMS received!"); playNotificationSound(); }
    prevSmsCountRef.current = totalSmsCount;
  }, [numbers, activeData]);

  const handleCancel = useCallback((orderId: string) => { setCancellingId(orderId); cancelMutation.mutate({ orderId }); }, [cancelMutation]);
  const handleNextNumber = useCallback((serviceId: string, serverId: string, orderId: string) => {
    setBuyingNextNumberId(orderId); buyNextMutation.mutate({ serviceId, serverId });
  }, [buyNextMutation]);

  const hasMore = activeTab === "received" ? hasMoreReceived : activeTab === "cancelled" ? hasMoreCancelled : false;
  const isFetchingNextPage = activeTab === "received" ? isFetchingNextReceived : isFetchingNextCancelled;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetchingNextPage) {
          if (activeTab === "received") fetchNextReceived();
          if (activeTab === "cancelled") fetchNextCancelled();
        }
      },
      { threshold: 0.1, rootMargin: "100px" },
    );
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, isFetchingNextPage, activeTab, fetchNextReceived, fetchNextCancelled]);

  const counts = { waiting: numbers.length, received: receivedNumbers.length, cancelled: cancelledNumbers.length };
  const filtered = activeTab === "waiting" ? numbers : activeTab === "received" ? receivedNumbers : cancelledNumbers;

  return (
    <div className="min-h-[calc(100vh-7rem)] flex flex-col">
      <div className="flex-1 px-4 pt-4 pb-28 max-w-md mx-auto w-full space-y-4">

        {/* Tabs with horizontal scroll */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 26, delay: 0.04 }}
          className="flex gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.value;
            const count = counts[tab.value];
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
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

        {/* Get new number */}
        <Link
          href="/"
          className="flex items-center gap-3 px-4 py-3 bg-card border border-dashed border-primary/30 rounded-xl hover:border-primary/60 hover:bg-accent transition-colors group"
        >
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Plus size={16} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold leading-tight">Get New Number</p>
            <p className="text-xs text-muted-foreground">Browse available services</p>
          </div>
          <ChevronRight size={14} className="text-muted-foreground/40 group-hover:text-primary/60 transition-colors shrink-0" />
        </Link>

        {/* List */}
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16 gap-3"
            >
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <Inbox size={22} className="text-muted-foreground/60" />
              </div>
              <p className="text-sm text-muted-foreground">No numbers found</p>
              <p className="text-xs text-muted-foreground/60 text-center max-w-[200px]">
                {activeTab === "waiting"
                  ? "Get a new number above to start receiving OTPs."
                  : activeTab === "received"
                    ? "Successfully received SMS will appear here."
                    : "Cancelled orders will appear here."}
              </p>
            </motion.div>
          ) : (
            <div className="space-y-2.5">
              {filtered.map((item, i) => (
                <NumberCard
                  key={item.id} item={item} delay={i * 0.03} minCancelMs={minCancelMs}
                  onCancel={activeTab === "waiting" ? handleCancel : undefined}
                  onNextNumber={handleNextNumber} buyingNextNumberId={buyingNextNumberId} cancellingId={cancellingId}
                />
              ))}
              {hasMore && (
                <div ref={loadMoreRef} className="flex justify-center py-4">
                  {isFetchingNextPage && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                        className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary" />
                      <span className="text-xs">Loading more…</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}