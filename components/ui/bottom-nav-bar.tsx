"use client";

import { motion } from "framer-motion";
import { Home, Wallet, User, PhoneCallIcon, History } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Home", icon: Home, href: "/" },
  { label: "Numbers", icon: PhoneCallIcon, href: "/numbers" },
  { label: "Wallet", icon: Wallet, href: "/wallet" },
  { label: "Transactions", icon: History, href: "/transactions" },
  { label: "Profile", icon: User, href: "/profile" },
];

type BottomNavBarProps = {
  className?: string;
  stickyBottom?: boolean;
};

export function BottomNavBar({ className, stickyBottom = true }: BottomNavBarProps) {
  const pathname = usePathname();

  const activeIndex = (() => {
    const exact = navItems.findIndex((item) => item.href === pathname);
    if (exact !== -1) return exact;

    const prefix = navItems.findIndex(
      (item) => item.href !== "/" && pathname.startsWith(item.href)
    );

    return prefix !== -1 ? prefix : 0;
  })();

  return (
    <motion.nav
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      role="navigation"
      aria-label="Bottom Navigation"
      className={cn(
        "bg-card dark:bg-card border border-border dark:border-sidebar-border",
        "rounded-full flex items-center px-2 py-1 shadow-xl",
        "h-[52px] w-full max-w-[520px]",
        stickyBottom && "fixed inset-x-0 bottom-4 mx-auto z-20",
        className,
      )}
    >
      <div className="flex items-center justify-between w-full">
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          const isActive = activeIndex === idx;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              prefetch={true}
              className="flex-1 flex justify-center focus:outline-none"
            >
              <motion.div
                whileTap={{ scale: 0.9 }}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-full transition-colors duration-200",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.5 : 2}
                  className="transition-all duration-200 shrink-0"
                />

                <span
                  className={cn(
                    "text-[10px] font-medium whitespace-nowrap select-none leading-tight",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </span>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </motion.nav>
  );
}

export default BottomNavBar;