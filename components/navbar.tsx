"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { Wallet, Loader2, Volume2, VolumeX, Plus, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import type { User } from "@/types";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useSoundEnabled } from "@/hooks/use-sound-enabled";
import { useTheme } from "next-themes";
import * as React from "react";

type NavbarProps = { className?: string };

export function Navbar({ className }: NavbarProps) {
  const { data: session } = authClient.useSession();
  const user = session?.user as User | undefined;
  const router = useRouter();
  const { enabled, toggle } = useSoundEnabled();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = theme === "dark";
  const toggleTheme = () => setTheme(isDark ? "light" : "dark");

  const { data: balanceData, isLoading: balanceLoading } = trpc.wallet.balance.useQuery(
    undefined,
    { refetchInterval: 10000, enabled: !!user },
  );

  const walletBalance = balanceData?.balance ?? 0;
  const isLow = walletBalance < 10;

  const displayName =
    user?.firstName || user?.name || user?.telegramUsername ||
    (user?.telegramId ? `User ${user.telegramId}` : "User");

  const initials = displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const avatarUrl = user?.photoUrl ?? user?.image ?? null;

  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className={cn("fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3", className)}
    >
      <nav className="bg-card border border-border rounded-2xl flex items-center px-2 py-2 shadow-sm w-full max-w-[520px] h-[52px] gap-1.5">

        {/* Brand */}
        <div className="flex items-center flex-1">
          <div className="w-8 h-8 rounded-xl overflow-hidden shrink-0">
            <Image src="/meow.png" alt="MeowSMS" width={32} height={32} className="object-contain w-full h-full" />
          </div>
        </div>

        {/* Balance pill */}
        <div
          className={cn(
            "flex items-center h-9 rounded-xl border overflow-hidden transition-colors duration-200",
            isLow
              ? "bg-destructive/10 border-destructive/20 text-destructive"
              : "bg-muted border-border text-foreground",
          )}
        >
          {/* Balance */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={() => router.push("/wallet")}
            className="flex items-center gap-1.5 pl-3 pr-2 h-full"
          >
            {balanceLoading ? (
              <Loader2 size={13} strokeWidth={2} className="animate-spin shrink-0 text-muted-foreground" />
            ) : (
              <Wallet size={13} strokeWidth={2} className="shrink-0" />
            )}
            <span className="text-xs font-bold tabular-nums whitespace-nowrap">
              ₹{walletBalance.toFixed(2)}
            </span>
          </motion.button>

          {/* Divider */}
          <div className={cn("w-px h-4 shrink-0", isLow ? "bg-destructive/20" : "bg-border")} />

          {/* Add funds */}
          <motion.button
            whileTap={{ scale: 0.88 }}
            type="button"
            onClick={() => router.push("/wallet")}
            aria-label="Add balance"
            className="flex items-center justify-center px-2.5 h-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors rounded-r-xl"
          >
            <Plus size={13} strokeWidth={2.8} />
          </motion.button>
        </div>

        {/* Sound toggle */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          type="button"
          onClick={toggle}
          aria-label={enabled ? "Mute notifications" : "Unmute notifications"}
          className={cn(
            "flex items-center justify-center w-9 h-9 rounded-xl transition-colors duration-200",
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
            {enabled
              ? <Volume2 size={16} strokeWidth={2} />
              : <VolumeX size={16} strokeWidth={2} />
            }
          </motion.div>
        </motion.button>

        {/* Theme toggle */}
        {mounted && (
          <motion.button
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className={cn(
              "flex items-center justify-center w-9 h-9 rounded-xl transition-colors duration-200",
              isDark
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            <motion.div
              key={isDark ? "dark" : "light"}
              initial={{ scale: 0.7, opacity: 0, rotate: -90 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              {isDark
                ? <Moon size={16} strokeWidth={2} />
                : <Sun size={16} strokeWidth={2} />
              }
            </motion.div>
          </motion.button>
        )}

        {/* Avatar */}
        {user ? (
          <motion.button
            whileTap={{ scale: 0.95 }}
            type="button"
            aria-label="Profile"
            onClick={() => router.push("/profile")}
            className="flex items-center justify-center w-9 h-9 rounded-xl hover:bg-muted transition-colors duration-200"
          >
            <div className="w-7 h-7 rounded-lg overflow-hidden bg-primary flex items-center justify-center text-[11px] font-bold text-primary-foreground shrink-0">
              {avatarUrl
                ? <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                : initials
              }
            </div>
          </motion.button>
        ) : (
          <div className="w-9 h-9 rounded-xl bg-muted animate-pulse" />
        )}
      </nav>
    </motion.header>
  );
}

export default Navbar;