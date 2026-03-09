"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { authClient } from "@/lib/auth-client";
import type { User } from "@/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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
  Clock,
  IndianRupee,
  Phone,
  Globe,
  ArrowRight,
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

function getCountryFlagEmoji(isoCode: string): string {
  if (!isoCode || isoCode.length !== 2) return "🌍";
  const codePoints = isoCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

interface Service {
  id: string;
  name: string;
  emoji: string;
  category: string;
  iconUrl?: string | null;
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

function PageSkeleton() {
  return (
    <div className="flex-1 px-4 pt-4 pb-28 max-w-md mx-auto w-full space-y-4">
      <Skeleton className="h-11 w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-[260px] w-full rounded-xl" />
      </div>
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-12" />
        </div>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function ServiceCard({
  service,
  onClick,
  delay,
}: {
  service: Service;
  onClick: () => void;
  delay: number;
}) {
  const price = Number(service.emoji);
  const priceStr =
    price > 0 ? (price % 1 === 0 ? String(price) : price.toFixed(2)) : null;

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 28, delay }}
      whileTap={{ scale: 0.97 }}
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2.5 w-full bg-background border border-border rounded-xl hover:border-primary/60 hover:bg-accent transition-all duration-150 group text-left"
    >
      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors overflow-hidden">
        {service.iconUrl ? (
          <Image
            src={service.iconUrl}
            alt={service.name}
            width={28}
            height={28}
            className="w-full h-full object-contain p-0.5"
          />
        ) : (
          <Phone size={13} strokeWidth={2.2} className="text-primary" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground truncate leading-tight">
          {service.name}
        </p>
        {priceStr && (
          <p className="text-[11px] font-bold text-primary tabular-nums">
            ₹{priceStr}
          </p>
        )}
      </div>
      <ChevronRight
        size={12}
        className="text-muted-foreground/40 shrink-0 group-hover:text-primary/50 transition-colors"
      />
    </motion.button>
  );
}

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
          s.code.toLowerCase() === selectedServiceName.toLowerCase(),
      )
    : server.services?.[0];
  const price = Number(selectedService?.basePrice ?? server.price ?? 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      className={cn(
        "bg-card border rounded-xl",
        outOfStock ? "border-border/50 opacity-60" : "border-border",
      )}
    >
      <div className="p-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0 overflow-hidden border border-border/50">
              {server.flagUrl ? (
                <Image
                  src={server.flagUrl}
                  alt={server.countryName || server.countryCode}
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                />
              ) : server.countryIso ? (
                <span className="text-xl">
                  {getCountryFlagEmoji(server.countryIso)}
                </span>
              ) : (
                <Server
                  size={16}
                  strokeWidth={2}
                  className="text-muted-foreground"
                />
              )}
            </div>
            <div>
              <p className="font-bold text-sm text-foreground leading-tight">
                {server.name}
              </p>
              <div className="flex items-baseline gap-0.5 mt-0.5">
                <IndianRupee
                  size={12}
                  strokeWidth={2.5}
                  className="text-primary mb-px"
                />
                <span className="text-xl font-black text-primary tabular-nums leading-none">
                  {price.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <Button
            size="sm"
            disabled={outOfStock}
            onClick={onBuy}
            className="rounded-lg h-9 px-4 text-xs font-semibold shrink-0"
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
          <div className="flex flex-col items-center gap-0.5 bg-muted/50 rounded-lg py-2">
            <div className="flex items-center gap-1">
              {lowStock && (
                <AlertCircle size={10} className="text-amber-500" />
              )}
              <span
                className={cn(
                  "text-sm font-bold tabular-nums",
                  outOfStock
                    ? "text-muted-foreground"
                    : lowStock
                      ? "text-amber-500"
                      : "text-foreground",
                )}
              >
                {server.stock}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">Stock</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 bg-muted/50 rounded-lg py-2">
            <div className="flex items-center gap-1">
              <CheckCircle2 size={10} className="text-green-500" />
              <span className="text-sm font-bold text-green-500 tabular-nums">
                {server.successRate}%
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">Success</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 bg-muted/50 rounded-lg py-2">
            <div className="flex items-center gap-1">
              <Clock size={10} className="text-sky-500" />
              <span className="text-sm font-bold text-sky-500">
                {server.avgTime}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">Avg time</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function MiniAppPage() {
  const { data: session, isPending } = authClient.useSession();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [serviceOffset, setServiceOffset] = useState(0);
  const [accumulatedServices, setAccumulatedServices] = useState<Service[]>([]);
  const [selected, setSelected] = useState<Service | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [bought, setBought] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    setServiceOffset(0);
    setAccumulatedServices([]);
  }, [debouncedSearch]);

  const { data: servicesData, isFetching } = trpc.service.list.useQuery(
    { search: debouncedSearch, limit: 20, offset: serviceOffset },
    { staleTime: 5 * 60 * 1000 },
  );

  useEffect(() => {
    if (servicesData?.services) {
      const newServices = servicesData.services.map((s) => ({
        id: s.id,
        name: s.name,
        emoji: String(s.basePrice ?? ""),
        category: "Service",
        iconUrl: s.iconUrl,
      }));
      if (serviceOffset === 0) {
        setAccumulatedServices(newServices);
      } else {
        setAccumulatedServices((prev) => {
          const existingIds = new Set(prev.map((s) => s.id));
          return [
            ...prev,
            ...newServices.filter((s) => !existingIds.has(s.id)),
          ];
        });
      }
    }
  }, [servicesData?.services, serviceOffset]);

  useEffect(() => {
    if (!servicesData?.hasMore || isFetching) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && servicesData?.hasMore && !isFetching) {
          setServiceOffset((prev) => prev + 20);
        }
      },
      { threshold: 0.1, rootMargin: "100px" },
    );
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [servicesData?.hasMore, isFetching]);

  const { data: serversData } = trpc.service.servers.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const { data: recentNumbersData } = trpc.number.getRecent.useQuery(
    undefined,
    { staleTime: 60 * 1000 },
  );
  const utils = trpc.useUtils();

  const buyMutation = trpc.number.buy.useMutation({
    onSuccess: (data) => {
      if (data.success && data.number) {
        utils.number.getActive.invalidate();
        utils.number.getReceivedInfinite.invalidate();
        utils.wallet.balance.invalidate();
        utils.wallet.transactions.invalidate();
        toast.success("Number assigned!");
        setBought(selectedServerId);
        setTimeout(() => {
          setSheetOpen(false);
          router.push("/numbers");
        }, 800);
      }
    },
    onError: (error) => {
      let msg = error.message || "Failed to assign number";
      if (msg.includes("balance") || msg.includes("INSUFFICIENT"))
        msg = "Insufficient balance.";
      else if (msg.includes("service") || msg.includes("AVAILABLE"))
        msg = "Service temporarily unavailable.";
      toast.error(msg);
      setBuying(null);
    },
  });

  const services = accumulatedServices;
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
        s.code.toLowerCase() === selected.name.toLowerCase(),
    );
    if (!service) {
      toast.error("Service not available on this server");
      setBuying(null);
      return;
    }
    buyMutation.mutate({ serviceId: service.id, serverId });
  };

  if (isPending && !user) return <PageSkeleton />;

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-7rem)] flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 flex flex-col items-center gap-4 text-center"
        >
          <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
            <Zap size={22} className="text-destructive" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Not available</p>
            <p className="text-sm text-muted-foreground mt-1">
              Open this app inside Telegram to continue.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-7rem)] flex flex-col">
      <div className="flex-1 px-4 pt-4 pb-28 max-w-md mx-auto w-full space-y-4">

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="relative"
        >
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input
            placeholder="Search service — Telegram, Google…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9 rounded-xl border-border bg-background h-11 text-sm focus-visible:ring-1"
          />
          <AnimatePresence>
            {search && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={14} />
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Services */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.06 }}
        >
          <div className="flex items-center justify-between mb-2.5 px-0.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {debouncedSearch ? `"${debouncedSearch}"` : "Choose a service"}
            </p>
            {isFetching && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-3 h-3 rounded-full border-2 border-primary/30 border-t-primary"
              />
            )}
          </div>

          <ScrollArea className="h-[260px] w-full rounded-xl border border-border bg-card">
            <div className="p-2.5">
              <AnimatePresence mode="popLayout">
                {services.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center py-12 gap-2"
                  >
                    <Hash size={24} className="text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      {debouncedSearch
                        ? "No services found"
                        : "Loading services…"}
                    </p>
                  </motion.div>
                ) : (
                  <motion.div key="grid" className="grid grid-cols-2 gap-1.5">
                    {services.map((service, i) => (
                      <ServiceCard
                        key={service.id}
                        service={service}
                        onClick={() => handleSelectService(service)}
                        delay={Math.min(i * 0.025, 0.3)}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {servicesData?.hasMore && (
                <div ref={loadMoreRef} className="flex justify-center py-3">
                  {isFetching && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary"
                    />
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </motion.div>

        {/* Recent Numbers */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.12 }}
          className="bg-card border border-border rounded-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 pt-2">
            <p className="text-sm font-semibold text-foreground">
              Recent Numbers
            </p>
            <button
              type="button"
              onClick={() => router.push("/numbers")}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View all <ArrowRight size={11} />
            </button>
          </div>

          <div className="px-3 pb-3 space-y-1.5">
            {recentNumbersData?.numbers &&
            recentNumbersData.numbers.length > 0 ? (
              recentNumbersData.numbers.map((num, i) => {
                const server = num.service?.server;
                const isCompleted = num.status === "COMPLETED";
                const isCancelled = num.status === "CANCELLED";
                const statusLabel = isCompleted
                  ? "Received"
                  : isCancelled
                    ? "Cancelled"
                    : "Waiting";

                return (
                  <motion.div
                    key={num.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => router.push("/numbers")}
                    className="flex items-center gap-2.5 px-3 py-2.5 bg-background border border-border/60 rounded-lg hover:border-border hover:bg-accent transition-all duration-150 cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                      {server?.flagUrl ? (
                        <Image
                          src={server.flagUrl}
                          alt={server.countryName || ""}
                          width={28}
                          height={28}
                          className="w-full h-full object-cover"
                        />
                      ) : server?.countryIso ? (
                        <span className="text-sm">
                          {getCountryFlagEmoji(server.countryIso)}
                        </span>
                      ) : (
                        <Globe size={13} className="text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-xs font-mono font-semibold flex-1 truncate">
                      {num.phoneNumber}
                    </p>
                    <p className="text-[10px] text-muted-foreground shrink-0 max-w-[60px] truncate">
                      {num.service?.name || "Unknown"}
                    </p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] font-semibold px-1.5 py-0 h-4 rounded-full shrink-0",
                        isCompleted
                          ? "border-green-500/40 text-green-500 bg-green-500/5"
                          : isCancelled
                            ? "border-destructive/40 text-destructive bg-destructive/5"
                            : "border-amber-500/40 text-amber-500 bg-amber-500/5",
                      )}
                    >
                      {statusLabel}
                    </Badge>
                  </motion.div>
                );
              })
            ) : (
              <div className="flex flex-col items-center py-8 gap-2">
                <Hash size={22} className="text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No numbers yet</p>
                <p className="text-xs text-muted-foreground/60">
                  Pick a service above to get started
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Server selection sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl max-h-[80vh] flex flex-col px-0 pb-0"
        >
          <SheetHeader className="px-5 pt-4 pb-3 border-b border-border shrink-0">
            <SheetTitle className="flex items-center gap-3 text-left">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                {selected?.iconUrl ? (
                  <Image
                    src={selected.iconUrl}
                    alt={selected.name}
                    width={36}
                    height={36}
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <Phone
                    size={15}
                    strokeWidth={2.2}
                    className="text-primary"
                  />
                )}
              </div>
              <div>
                <p className="font-bold text-base leading-tight">
                  {selected?.name}
                </p>
                <p className="text-xs text-muted-foreground font-normal mt-0.5">
                  Choose a server below
                </p>
              </div>
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
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
                      className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-xl flex items-center justify-center gap-2.5"
                    >
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                        className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary"
                      />
                      <span className="text-sm font-medium">
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