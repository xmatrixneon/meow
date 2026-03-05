"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, ChevronDown, Wallet, Cat, Settings, LogOut, User as UserIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import type { User } from "@/types";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

type NavbarProps = {
  className?: string;
  notificationCount?: number;
};

export function Navbar({
  className,
  notificationCount = 3,
}: NavbarProps) {
  // Get current user from session
  const { data: session } = authClient.useSession();
  const user = session?.user as User | undefined;
  const [showDropdown, setShowDropdown] = useState(false);
  const router = useRouter();

  // Fetch real wallet balance from tRPC with auto-refresh every 10 seconds
  const { data: balanceData, isLoading: balanceLoading } = trpc.wallet.balance.useQuery(undefined, {
    refetchInterval: 10000, // Refresh every 10 seconds
    enabled: !!user, // Only fetch if user is authenticated
  });

  const walletBalance = balanceData?.balance ?? 0;

  // Display name fallback chain - handles users with no username/name
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

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className={cn(
        "fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3",
        className
      )}
    >
      <nav
        className={cn(
          "bg-card dark:bg-card border border-border dark:border-sidebar-border",
          "rounded-full flex items-center px-3 py-2 shadow-xl",
          "w-full max-w-[520px] h-[52px] gap-2"
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-1.5 flex-1">
          <div className="bg-primary/10 dark:bg-primary/15 rounded-full p-1.5">
            <Cat
              size={18}
              className="text-primary"
              strokeWidth={2}
              aria-hidden
            />
          </div>
          <span className="font-semibold text-sm tracking-tight text-foreground whitespace-nowrap">
            MeowSMS
          </span>
        </div>

        {/* Wallet Balance */}
        <motion.div
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push("/wallet")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer",
            "transition-colors duration-200 h-9",
            walletBalance < 10
              ? "bg-red-500/10 dark:bg-red-500/15 text-red-600 dark:text-red-400"
              : "bg-green-500/10 dark:bg-green-500/15 text-green-600 dark:text-green-400"
          )}
        >
          {balanceLoading ? (
            <Loader2 size={14} strokeWidth={2} className="animate-spin" aria-hidden />
          ) : (
            <Wallet size={15} strokeWidth={2} aria-hidden />
          )}
          <span className="font-semibold text-xs whitespace-nowrap">
            ₹{walletBalance.toFixed(2)}
          </span>
        </motion.div>

        {/* Notification Bell */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          type="button"
          aria-label={`Notifications${notificationCount > 0 ? `, ${notificationCount} unread` : ""}`}
          className={cn(
            "relative flex items-center justify-center",
            "w-9 h-9 rounded-full",
            "text-muted-foreground hover:bg-muted dark:hover:bg-muted",
            "transition-colors duration-200 focus:outline-none"
          )}
        >
          <Bell size={18} strokeWidth={2} aria-hidden />
          <AnimatePresence>
            {notificationCount > 0 && (
              <motion.span
                key="badge"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className={cn(
                  "absolute -top-0.5 -right-0.5",
                  "bg-primary text-primary-foreground",
                  "text-[9px] font-bold leading-none",
                  "min-w-[16px] h-4 px-1 rounded-full",
                  "flex items-center justify-center"
                )}
              >
                {notificationCount > 9 ? "9+" : notificationCount}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        {/* Avatar / Profile */}
        {user ? (
          <motion.button
            whileTap={{ scale: 0.95 }}
            type="button"
            aria-label="Profile menu"
            onClick={() => setShowDropdown((p) => !p)}
            className={cn(
              "flex items-center gap-1 pl-1 pr-2 py-1 rounded-full",
              "hover:bg-muted dark:hover:bg-muted",
              "transition-colors duration-200 focus:outline-none h-9"
            )}
          >
            {/* Avatar circle */}
            <div
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                "bg-primary text-primary-foreground shrink-0 overflow-hidden"
              )}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
         
          </motion.button>
        ) : (
          // Placeholder when no user
          <div className="w-7 h-7 rounded-full bg-muted animate-pulse" />
        )}
      </nav>

  
    </motion.header>
  );
}

export default Navbar;