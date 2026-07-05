"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  TrendingUp,
  LayoutDashboard,
  Coins,
  Wallet,
  Lock,
  Activity,
  ArrowDownRight,
  Receipt,
  User,
  LifeBuoy,
  Users,
  ChartBar,
  Settings,
  Timer,
  Bot,
  Gamepad2,
  Gift,
  Fish,
  Share2,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavGroup, IconName } from "@/lib/nav";

const iconMap: Record<IconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  coins: Coins,
  wallet: Wallet,
  lock: Lock,
  activity: Activity,
  withdraw: ArrowDownRight,
  receipt: Receipt,
  user: User,
  support: LifeBuoy,
  users: Users,
  chart: ChartBar,
  settings: Settings,
  timer: Timer,
  bot: Bot,
  play: Gamepad2,
  gift: Gift,
  fish: Fish,
  share: Share2,
};

type SidebarProps = {
  groups: NavGroup[];
  badge?: string;
  mobileOpen: boolean;
  onClose: () => void;
};

function NavContent({
  groups,
  badge,
  pathname,
  onItemClick,
}: {
  groups: NavGroup[];
  badge?: string;
  pathname: string;
  onItemClick?: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5 px-2.5 pb-4 mb-3 border-b border-border">
        <TrendingUp className="w-[20px] h-[20px] text-gold" strokeWidth={2.25} />
        <span className="font-medium text-[15px] text-text">Investure</span>
        {badge && (
          <span className="ml-auto text-[10px] font-medium bg-blue/15 text-blue px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>

      {groups.map((group, gi) => (
        <div key={gi} className={gi > 0 ? "mt-4 pt-4 border-t border-border" : ""}>
          {group.label && (
            <p className="text-[10px] font-medium text-text-dim px-3 mb-1.5 uppercase tracking-[0.12em]">
              {group.label}
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" &&
                  item.href !== "/admin" &&
                  pathname.startsWith(item.href));
              const Icon = iconMap[item.icon];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onItemClick}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 text-[13px] rounded-lg transition-colors",
                    active
                      ? "bg-gold/10 text-gold font-medium"
                      : "text-text-muted hover:bg-card-elev hover:text-text"
                  )}
                >
                  <Icon className="w-[16px] h-[16px] shrink-0" strokeWidth={2} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="text-[10px] font-medium bg-red/15 text-red px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

export function Sidebar({ groups, badge, mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  useEffect(() => {
    if (mobileOpen) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = orig;
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-[210px] shrink-0 bg-card border border-border rounded-xl p-3.5 self-start sticky top-3">
        <NavContent groups={groups} badge={badge} pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 md:hidden bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          >
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="absolute left-0 top-0 bottom-0 w-[260px] bg-card border-r border-border p-3.5 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-end mb-1">
                <button
                  onClick={onClose}
                  className="p-1 text-text-muted hover:text-text"
                  aria-label="Close menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <NavContent groups={groups} badge={badge} pathname={pathname} onItemClick={onClose} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
