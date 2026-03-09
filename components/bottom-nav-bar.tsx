"use client";

import { motion } from "framer-motion";
import { Home, Wallet, User, PhoneCallIcon, History } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Home",    icon: Home,          href: "/"        },
  { label: "Numbers", icon: PhoneCallIcon, href: "/numbers" },
  { label: "Wallet",  icon: Wallet,        href: "/wallet"  },
  { label: "History", icon: History,       href: "/history" },
  { label: "Profile", icon: User,          href: "/profile" },
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
      (item) => item.href !== "/" && pathname.startsWith(item.href),
    );
    return prefix !== -1 ? prefix : 0;
  })();

  return (
    <motion.nav
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26, delay: 0.05 }}
      role="navigation"
      aria-label="Bottom Navigation"
      className={cn(
        "bg-card border border-border rounded-2xl flex items-center px-1.5 py-1.5 shadow-sm",
        stickyBottom && "fixed inset-x-0 bottom-4 mx-auto z-20 w-fit max-w-[520px]",
        className,
      )}
    >
      {navItems.map((item, idx) => {
        const Icon = item.icon;
        const isActive = activeIndex === idx;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            prefetch
            className="focus:outline-none"
          >
            <motion.div
              whileTap={{ scale: 0.9 }}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 px-3.5 py-2 min-w-[58px] rounded-xl transition-colors duration-200",
                isActive ? "bg-primary/10" : "hover:bg-muted",
              )}
            >
              <Icon
                size={19}
                strokeWidth={isActive ? 2.5 : 1.8}
                aria-hidden
                className={cn(
                  "transition-all duration-200 shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span
                className={cn(
                  "text-[10px] font-semibold whitespace-nowrap select-none leading-none transition-colors duration-200",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                {item.label}
              </span>

              {/* Active dot indicator */}
              {isActive && (
                <motion.div
                  layoutId="nav-dot"
                  className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </motion.div>
          </Link>
        );
      })}
    </motion.nav>
  );
}

export default BottomNavBar;