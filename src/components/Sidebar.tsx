"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
};

type SidebarProps = {
  groups: NavGroup[];
  badge?: string;
};

export function Sidebar({ groups, badge }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-[180px] shrink-0 bg-card border border-border rounded-xl p-3 self-start sticky top-3">
      <div className="flex items-center gap-2 px-2 pb-3 mb-2 border-b border-border">
        <TrendingUp className="w-[18px] h-[18px] text-gold" strokeWidth={2.25} />
        <span className="font-medium text-[14px] text-text">Investure</span>
        {badge && (
          <span className="ml-auto text-[9px] font-medium bg-blue/15 text-blue px-1.5 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>

      {groups.map((group, gi) => (
        <div key={gi} className={gi > 0 ? "mt-3 pt-3 border-t border-border" : ""}>
          {group.label && (
            <p className="text-[9px] font-medium text-text-dim px-2 mb-1 uppercase tracking-wider">
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
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-1.5 text-[12px] rounded-md transition-colors",
                    active
                      ? "bg-gold/10 text-gold font-medium"
                      : "text-text-muted hover:bg-card-elev hover:text-text"
                  )}
                >
                  <Icon className="w-[14px] h-[14px] shrink-0" strokeWidth={2} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="text-[9px] font-medium bg-red/15 text-red px-1.5 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}
