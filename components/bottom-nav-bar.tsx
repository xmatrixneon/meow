"use client";
import { motion } from "framer-motion";
import { Home, Wallet, User, PhoneCallIcon, History } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Home",         icon: Home,          href: "/"             },
  { label: "Numbers",      icon: PhoneCallIcon, href: "/numbers"      },
  { label: "Wallet",       icon: Wallet,        href: "/wallet"       },
  { label: "History", icon: History,       href: "/history" },
  { label: "Profile",      icon: User,          href: "/profile"      },
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
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      role="navigation"
      aria-label="Bottom Navigation"
      className={cn(
        "bg-card dark:bg-card border border-border dark:border-sidebar-border rounded-2xl flex items-end px-2 py-1.5 shadow-xl",
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
            prefetch={true}
            className="focus:outline-none"
          >
            <motion.div
              whileTap={{ scale: 0.92 }}
              className={cn(
                "relative flex flex-col items-center justify-end gap-0.5 px-3 py-1.5 min-w-[56px] rounded-2xl transition-colors duration-200",
                isActive
                  ? "bg-primary/10 dark:bg-primary/15"
                  : "bg-transparent",
              )}
            >
              <Icon
                size={20}
                strokeWidth={isActive ? 2.5 : 2}
                aria-hidden
                className={cn(
                  "transition-all duration-200 shrink-0",
                  isActive
                    ? "text-primary dark:text-primary"
                    : "text-muted-foreground",
                )}
              />
              <span
                className={cn(
                  "text-[10px] font-medium whitespace-nowrap select-none leading-tight transition-colors duration-200",
                  isActive
                    ? "text-primary dark:text-primary"
                    : "text-muted-foreground",
                )}
              >
                {item.label}
              </span>
            </motion.div>
          </Link>
        );
      })}
    </motion.nav>
  );
}

export default BottomNavBar;