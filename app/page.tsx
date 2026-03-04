"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { authClient } from "@/lib/auth-client";
import type { User } from "@/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  Zap,
  Hash,
  ShoppingCart,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  X,
  Server,
  Wallet,
  Star,
  Clock,
  IndianRupee,
  Phone,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";

// ─── animation helper ─────────────────────────────────────────────────────────
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring" as const, stiffness: 280, damping: 24, delay },
});

function getCountryFlagEmoji(isoCode: string): string {
  if (!isoCode || isoCode.length !== 2) return "🌍";
  const codePoints = isoCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// ─── types ────────────────────────────────────────────────────────────────────
interface Service {
  id: string;
  name: string;
  emoji: string;
  category: string;
}

interface ServerOption {
  id: string;
  name: string;
  price: number;
  stock: number;
  successRate: number;
  avgTime: string;
  countryCode: string;
  countryIso?: string | null;
  countryName?: string | null;
  flagUrl?: string | null;
  services?: Array<{
    id: string;
    code: string;
    name: string;
    basePrice: number;
    iconUrl: string | null;
  }>;
}

// ─── skeleton ─────────────────────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <div className="flex-1 px-4 pt-5 pb-28 max-w-md mx-auto w-full space-y-5">
      <div className="rounded-3xl border border-border px-5 py-5 flex items-center gap-3.5">
        <Skeleton className="w-14 h-14 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
      <Skeleton className="h-11 w-full rounded-2xl" />
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-2xl" />
          ))}
        </div>
      </div>
      <div className="border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-14" />
        </div>
        <div className="flex flex-col items-center py-5 gap-2">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
    </div>
  );
}

// ─── service card (horizontal pill) ──────────────────────────────────────────
function ServiceCard({
  service,
  onClick,
  delay,
}: {
  service: Service;
  onClick: () => void;
  delay: number;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring" as const, stiffness: 300, damping: 24, delay }}
      whileTap={{ scale: 0.97 }}
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2.5 w-full",
        "bg-card border border-border rounded-2xl",
        "hover:border-primary/40 hover:bg-primary/5",
        "transition-all duration-200 group text-left"
      )}
    >
      {/* Icon */}
      <div className="w-8 h-8 rounded-xl bg-primary/10 dark:bg-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors duration-200">
        <Phone
          size={14}
          strokeWidth={2.2}
          className="text-primary"
        />
      </div>

      {/* Name */}
      <p className="flex-1 text-xs font-semibold text-foreground truncate leading-none">
        {service.name}
      </p>

      {/* Price badge */}
      <div className="flex items-center gap-0.5 bg-primary/8 border border-primary/15 rounded-lg px-2 py-1 shrink-0">
        <IndianRupee size={10} className="text-primary" strokeWidth={2.5} />
        <span className="text-[11px] font-bold text-primary tabular-nums leading-none">
          {Number(service.emoji) || "—"}
        </span>
      </div>
    </motion.button>
  );
}

// ─── server card ──────────────────────────────────────────────────────────────
function ServerCard({
  server,
  selectedServiceName,
  onBuy,
}: {
  server: ServerOption;
  selectedServiceName?: string;
  onBuy: () => void;
}) {
  const outOfStock = server.stock === 0;
  const lowStock = server.stock > 0 && server.stock < 20;

  const selectedService = selectedServiceName
    ? server.services?.find(
        (s) =>
          s.name.toLowerCase() === selectedServiceName.toLowerCase() ||
          s.code.toLowerCase() === selectedServiceName.toLowerCase()
      )
    : server.services?.[0];
  const price = Number(selectedService?.basePrice ?? server.price ?? 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring" as const, stiffness: 280, damping: 24 }}
      className={cn(
        "bg-card border rounded-2xl p-4",
        outOfStock
          ? "border-border opacity-60"
          : "border-border hover:border-primary/30"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden",
              outOfStock ? "bg-muted" : "bg-primary/10 dark:bg-primary/15"
            )}
          >
            {server.flagUrl ? (
              <Image
                src={server.flagUrl}
                alt={server.countryName || server.countryCode}
                width={36}
                height={36}
                className="w-full h-full object-cover"
                unoptimized
              />
            ) : server.countryIso ? (
              <span className="text-lg">
                {getCountryFlagEmoji(server.countryIso)}
              </span>
            ) : (
              <Server
                size={16}
                strokeWidth={2}
                className={outOfStock ? "text-muted-foreground" : "text-primary"}
              />
            )}
          </div>
          <div>
            <p className="font-bold text-sm text-foreground">{server.name}</p>
            <div className="flex items-center gap-0.5">
              <IndianRupee size={12} className="text-primary" />
              <p className="text-xl font-bold text-primary tabular-nums">
                {price.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
        <Button
          size="sm"
          disabled={outOfStock}
          onClick={onBuy}
          className="rounded-xl h-9 px-4 text-xs font-bold shrink-0"
        >
          {outOfStock ? (
            "Sold out"
          ) : (
            <span className="flex items-center gap-1.5">
              <ShoppingCart size={13} />
              Buy
            </span>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center gap-0.5 bg-muted/40 rounded-xl py-2">
          <div className="flex items-center gap-1">
            {lowStock && <AlertCircle size={10} className="text-amber-500" />}
            <p
              className={cn(
                "text-sm font-bold tabular-nums",
                outOfStock
                  ? "text-muted-foreground"
                  : lowStock
                  ? "text-amber-500"
                  : "text-foreground"
              )}
            >
              {server.stock}
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground">In stock</p>
        </div>
        <div className="flex flex-col items-center gap-0.5 bg-muted/40 rounded-xl py-2">
          <div className="flex items-center gap-1">
            <CheckCircle2 size={10} className="text-green-500" />
            <p className="text-sm font-bold text-green-500 tabular-nums">
              {server.successRate}%
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground">Success</p>
        </div>
        <div className="flex flex-col items-center gap-0.5 bg-muted/40 rounded-xl py-2">
          <div className="flex items-center gap-1">
            <Clock size={10} className="text-sky-500" />
            <p className="text-sm font-bold text-sky-500">{server.avgTime}</p>
          </div>
          <p className="text-[10px] text-muted-foreground">Avg time</p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────
export default function MiniAppPage() {
  const { data: session, isPending } = authClient.useSession();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [serviceOffset, setServiceOffset] = useState(0);
  const [selected, setSelected] = useState<Service | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [bought, setBought] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setServiceOffset(0);
  }, [debouncedSearch]);

  const { data: servicesData, isLoading: isLoadingServices } =
    trpc.service.list.useQuery(
      { search: debouncedSearch, limit: 20, offset: serviceOffset },
      { staleTime: 5 * 60 * 1000 }
    );
  const { data: serversData } = trpc.service.servers.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const { data: walletData } = trpc.wallet.balance.useQuery();
  const { data: settingsData } = trpc.service.settings.useQuery();

  const utils = trpc.useUtils();

  const buyMutation = trpc.number.buy.useMutation({
    onSuccess: (data) => {
      if (data.success && data.number) {
        utils.number.getActive.invalidate();
        utils.number.getReceived.invalidate();
        utils.wallet.balance.invalidate();
        utils.wallet.transactions.invalidate();

        toast.success("Number assigned successfully!");
        setBought(selectedServerId);
        setTimeout(() => {
          setSheetOpen(false);
          router.push("/numbers");
        }, 1000);
      }
    },
    onError: (error) => {
      let errorMessage = error.message || "Failed to assign number";
      if (errorMessage.includes("balance") || errorMessage.includes("INSUFFICIENT")) {
        errorMessage = "Insufficient balance. Add funds to continue.";
      } else if (errorMessage.includes("service") || errorMessage.includes("AVAILABLE")) {
        errorMessage = "Service temporarily unavailable. Try another server.";
      } else if (errorMessage.includes("Network") || errorMessage.includes("connection")) {
        errorMessage = "Connection error. Check your internet and try again.";
      }
      toast.error(errorMessage);
      setBuying(null);
    },
  });

  const services: Service[] =
    servicesData?.services.map((s) => ({
      id: s.id,
      name: s.name,
      emoji: String(s.basePrice ?? ""),   // reuse emoji field to carry price for display
      category: "Service",
    })) || [];

  const servers: ServerOption[] =
    serversData?.servers.map((s: any) => ({
      id: s.id,
      name: s.name,
      price: s.services?.[0]?.basePrice || 5.0,
      stock: 100,
      successRate: 95,
      avgTime: "~30s",
      countryCode: s.countryCode || "IN",
      countryIso: s.countryIso || "IN",
      countryName: s.countryName || "India",
      flagUrl: s.flagUrl,
      services: s.services,
    })) || [];

  const user = session?.user as User | undefined;

  const displayName =
    user?.name ||
    user?.firstName ||
    user?.telegramUsername ||
    (user?.telegramId ? `User ${user.telegramId}` : null) ||
    "User";
  const initials = displayName.charAt(0).toUpperCase();
  const avatarUrl = user?.photoUrl ?? null;

  const handleSelectService = (service: Service) => {
    setSelected(service);
    setBought(null);
    setSheetOpen(true);
  };

  const handleBuy = async (serverId: string) => {
    if (!selected) return;
    setSelectedServerId(serverId);
    setBuying(serverId);

    const server = serversData?.servers.find((s: any) => s.id === serverId);
    const service = server?.services?.find(
      (s: any) =>
        s.name.toLowerCase() === selected.name.toLowerCase() ||
        s.code.toLowerCase() === selected.name.toLowerCase()
    );

    if (!service) {
      toast.error("Service not available on this server");
      setBuying(null);
      return;
    }

    buyMutation.mutate({
      serviceId: service.id,
      serverId: serverId,
    });
  };

  const handleLoadMore = useCallback(() => {
    if (servicesData?.hasMore) {
      setServiceOffset((prev) => prev + 20);
    }
  }, [servicesData?.hasMore]);

  if (isPending && !user) {
    return <PageSkeleton />;
  }

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-7rem)] flex flex-col items-center justify-center gap-5 p-6">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring" as const, stiffness: 300, damping: 22 }}
          className="w-full max-w-sm bg-card border border-border rounded-3xl p-8 flex flex-col items-center gap-4 shadow-xl text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <Zap size={24} className="text-destructive" />
          </div>
          <div>
            <p className="font-semibold text-foreground mb-1">Not available</p>
            <p className="text-sm text-muted-foreground">
              Open this app inside Telegram to continue.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-7rem)] flex flex-col">
      <div className="flex-1 px-4 pt-5 pb-28 max-w-md mx-auto w-full space-y-5">

        {/* Hero greeting */}
        <motion.div
          {...fadeUp(0)}
          className="relative overflow-hidden rounded-3xl bg-primary/10 dark:bg-primary/15 border border-primary/20 px-5 py-5"
        >
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
          <div className="relative flex items-center gap-3.5">
            <div className="relative shrink-0">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={displayName}
                  width={56}
                  height={56}
                  className="w-14 h-14 rounded-xl object-cover border-2 border-primary/30"
                  unoptimized
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold border-2 border-primary/30">
                  {initials}
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-card" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Welcome back</p>
              <h1 className="text-lg font-bold text-foreground truncate">
                {displayName} 👋
              </h1>
              {user.telegramUsername && (
                <p className="text-xs text-primary font-medium">
                  @{user.telegramUsername}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="flex items-center gap-1">
                <Wallet size={11} className="text-green-500" />
                <IndianRupee size={11} className="text-green-500" />
                <span className="text-xs font-bold text-green-500">
                  {Number(walletData?.balance ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Star size={11} className="text-amber-500" />
                <span className="text-xs font-bold text-amber-500">0 pts</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Search */}
        <motion.div {...fadeUp(0.06)} className="relative">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input
            placeholder="Search service (Telegram, Google…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9 rounded-2xl border-border bg-card h-11 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </motion.div>

        {/* Services section */}
        <motion.div {...fadeUp(0.1)}>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 px-1 mb-3">
            {debouncedSearch
              ? `Results for "${debouncedSearch}"`
              : "Choose a service"}
          </p>

          {/* ── Scrollable services box ── */}
          <ScrollArea className="h-[272px] w-full rounded-2xl border border-border">
            <div className="p-2.5">
              <AnimatePresence mode="popLayout">
                {services.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center py-10 gap-2"
                  >
                    <Hash size={28} className="text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      No services found
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="grid"
                    className="grid grid-cols-2 gap-2"
                  >
                    {services.map((service, i) => (
                      <ServiceCard
                        key={service.id}
                        service={service}
                        onClick={() => handleSelectService(service)}
                        delay={i * 0.03}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Load More */}
              {servicesData?.hasMore && (
                <div className="flex justify-center pt-4 pb-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadMore}
                    disabled={isLoadingServices}
                    className="text-xs"
                  >
                    {isLoadingServices ? "Loading..." : "Load More Services"}
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </motion.div>

        {/* Recent numbers */}
        <motion.div
          {...fadeUp(0.18)}
          className="bg-card border border-border rounded-2xl p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-foreground">
              Recent Numbers
            </p>
            <button
              type="button"
              onClick={() => router.push("/numbers")}
              className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
            >
              View all <ChevronRight size={12} />
            </button>
          </div>
          <div className="flex flex-col items-center py-5 gap-2">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <Hash size={18} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No numbers yet</p>
            <p className="text-xs text-muted-foreground/60">
              Pick a service above to get started
            </p>
          </div>
        </motion.div>
      </div>

      {/* Server selection sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl max-h-[82vh] flex flex-col px-0 pb-0"
        >
          <SheetHeader className="px-5 pt-2 pb-3 border-b border-border shrink-0">
            <SheetTitle className="flex items-center gap-2.5 text-left">
              {selected && (
                <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Phone size={16} strokeWidth={2.2} className="text-primary" />
                </span>
              )}
              <div>
                <p className="font-bold text-base text-foreground">
                  {selected?.name}
                </p>
                <p className="text-xs text-muted-foreground font-normal">
                  Choose a server to get a number
                </p>
              </div>
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {servers.map((server) => (
              <div key={server.id} className="relative">
                <ServerCard
                  server={server}
                  selectedServiceName={selected?.name}
                  onBuy={() => handleBuy(server.id)}
                />
                <AnimatePresence>
                  {buying === server.id && (
                    <motion.div
                      key={`buying-${server.id}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-card/80 backdrop-blur-sm rounded-2xl flex items-center justify-center gap-2"
                    >
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                        className="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary"
                      />
                      <span className="text-sm font-medium text-foreground">
                        Assigning number…
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
          <div className="h-6 shrink-0" />
        </SheetContent>
      </Sheet>
    </div>
  );
}