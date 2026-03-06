"use client";
import { motion } from "framer-motion";
import Image from "next/image";
import { Wallet, Loader2, Volume2, VolumeX, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import type { User } from "@/types";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useSoundEnabled } from "@/hooks/use-sound-enabled";

type NavbarProps = {
  className?: string;
};

export function Navbar({ className }: NavbarProps) {
  const { data: session } = authClient.useSession();
  const user = session?.user as User | undefined;
  const router = useRouter();
  const { enabled, toggle } = useSoundEnabled();

  const { data: balanceData, isLoading: balanceLoading } =
    trpc.wallet.balance.useQuery(undefined, {
      refetchInterval: 10000,
      enabled: !!user,
    });

  const walletBalance = balanceData?.balance ?? 0;

  const displayName =
    user?.firstName ||
    user?.name ||
    user?.telegramUsername ||
    `User ${user?.telegramId}` ||
    "User";

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const avatarUrl = user?.photoUrl ?? user?.image ?? null;

  const isLow = walletBalance < 10;

  const balanceColor = isLow
    ? "bg-red-500/10 dark:bg-red-500/15 text-red-600 dark:text-red-400"
    : "bg-green-500/10 dark:bg-green-500/15 text-green-600 dark:text-green-400";

  const dividerColor = isLow
    ? "bg-red-500/20 dark:bg-red-500/25"
    : "bg-green-500/20 dark:bg-green-500/25";

  const plusHoverColor = isLow
    ? "hover:bg-red-500/20 dark:hover:bg-red-500/25"
    : "hover:bg-green-500/20 dark:hover:bg-green-500/25";

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className={cn(
        "fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3",
        className,
      )}
    >
      <nav
        className={cn(
          "bg-card dark:bg-card border border-border dark:border-sidebar-border",
          "rounded-full flex items-center px-3 py-2 shadow-xl",
          "w-full max-w-[520px] h-[52px] gap-2",
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-1.5 flex-1">
          <div className="rounded-full overflow-hidden w-10 h-10 shrink-0">
            <Image
              src="/meow.png"
              alt="MeowSMS logo"
              width={40}
              height={40}
              className="object-contain"
            />
          </div>
        </div>

        {/* Wallet Balance pill with embedded Plus button */}
        <motion.div
          whileTap={{ scale: 0.97 }}
          className={cn(
            "flex items-center rounded-full overflow-hidden h-9 transition-colors duration-200",
            balanceColor,
          )}
        >
          {/* Balance section — clickable */}
          <button
            type="button"
            onClick={() => router.push("/wallet")}
            className="flex items-center gap-1.5 pl-3 pr-2.5 h-full"
          >
            {balanceLoading ? (
              <Loader2 size={14} strokeWidth={2} className="animate-spin" />
            ) : (
              <Wallet size={14} strokeWidth={2} />
            )}
            <span className="font-semibold text-xs whitespace-nowrap">
              ₹{walletBalance.toFixed(2)}
            </span>
          </button>

          {/* Divider */}
          <div className={cn("w-px h-4 shrink-0", dividerColor)} />

          {/* Plus button section */}
          <motion.button
            whileTap={{ scale: 0.85 }}
            type="button"
            onClick={() => router.push("/wallet")}
            aria-label="Add balance"
            className={cn(
              "flex items-center justify-center pl-2 pr-2.5 h-full transition-colors duration-200 rounded-r-full",
              plusHoverColor,
            )}
          >
            <Plus size={13} strokeWidth={2.8} />
          </motion.button>
        </motion.div>

        {/* Sound toggle */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          type="button"
          onClick={toggle}
          aria-label={enabled ? "Mute SMS notifications" : "Unmute SMS notifications"}
          className={cn(
            "relative flex items-center justify-center w-9 h-9 rounded-full transition-colors duration-200",
            enabled
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          <motion.div
            key={enabled ? "on" : "off"}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            {enabled ? <Volume2 size={17} strokeWidth={2} /> : <VolumeX size={17} strokeWidth={2} />}
          </motion.div>
        </motion.button>

        {/* Avatar */}
        {user ? (
          <motion.button
            whileTap={{ scale: 0.95 }}
            type="button"
            aria-label="Profile menu"
            onClick={() => router.push("/profile")}
            className={cn(
              "flex items-center gap-1 pl-1 pr-2 py-1 rounded-full",
              "hover:bg-muted dark:hover:bg-muted",
              "transition-colors duration-200 focus:outline-none h-9",
            )}
          >
            <div
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                "bg-primary text-primary-foreground shrink-0 overflow-hidden",
              )}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
          </motion.button>
        ) : (
          <div className="w-7 h-7 rounded-full bg-muted animate-pulse" />
        )}
      </nav>
    </motion.header>
  );
}

export default Navbar;