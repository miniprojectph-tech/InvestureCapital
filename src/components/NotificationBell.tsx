"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ArrowDownRight, TrendingUp, Users, Zap, Award, Coins, CheckCheck, type LucideIcon } from "lucide-react";
import { cn, formatPHP } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useNotifications, markNotificationsRead, formatRelativeShort, type AppNotification } from "@/lib/compplan";

export const NOTIF_META: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  payout: { icon: ArrowDownRight, color: "text-green", bg: "bg-green/15" },
  accrual: { icon: TrendingUp, color: "text-green", bg: "bg-green/10" },
  commission: { icon: Users, color: "text-blue", bg: "bg-blue/15" },
  fastStart: { icon: Zap, color: "text-vault", bg: "bg-vault/15" },
  leadership: { icon: Award, color: "text-gold", bg: "bg-gold/15" },
  placement: { icon: Coins, color: "text-text-muted", bg: "bg-white/5" },
};
const DEFAULT_META = { icon: Bell, color: "text-text-muted", bg: "bg-white/5" };

export function NotificationRow({ n, compact }: { n: AppNotification; compact?: boolean }) {
  const meta = NOTIF_META[n.type] ?? DEFAULT_META;
  const Icon = meta.icon;
  return (
    <div className={cn("flex items-start gap-2.5", compact ? "px-3 py-2.5" : "px-4 py-3", !n.read && "bg-gold/[0.04]")}>
      <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5", meta.bg)}>
        <Icon className={cn("w-3.5 h-3.5", meta.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-[11.5px] m-0 leading-snug", n.read ? "text-text-muted" : "text-text font-medium")}>{n.title}</p>
        {n.body && !compact && <p className="text-[10px] text-text-subtle m-0 mt-0.5 leading-relaxed">{n.body}</p>}
        <p className="text-[9px] text-text-subtle m-0 mt-0.5">{formatRelativeShort(n.at)}</p>
      </div>
      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-gold shrink-0 mt-2" />}
    </div>
  );
}

/** Header bell: unread badge + dropdown of the latest notifications. */
export function NotificationBell() {
  const { user } = useAuth();
  const { items, unread } = useNotifications(15);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Opening the tray marks what's visible as read.
  useEffect(() => {
    if (!open || !user) return;
    const ids = items.filter((n) => !n.read).map((n) => n.id);
    if (ids.length === 0) return;
    const t = setTimeout(() => markNotificationsRead(user.uid, ids).catch(() => {}), 800);
    return () => clearTimeout(t);
  }, [open, items, user]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative p-1 -m-1" aria-label={unread ? `${unread} unread notifications` : "Notifications"}>
        <Bell className={cn("w-4 h-4", unread ? "text-text" : "text-text-muted")} strokeWidth={2} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 bg-red rounded-full text-[8px] text-white flex items-center justify-center font-semibold ring-2 ring-canvas">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[320px] max-w-[calc(100vw-24px)] bg-card border border-border rounded-xl shadow-xl shadow-black/50 z-40 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <p className="text-[12px] font-medium m-0">Notifications</p>
            {unread > 0 && (
              <button onClick={() => user && markNotificationsRead(user.uid, items.filter((n) => !n.read).map((n) => n.id))} className="text-[10px] text-text-subtle hover:text-text flex items-center gap-1">
                <CheckCheck className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-[11px] text-text-subtle text-center py-8 m-0 px-4">No notifications yet. Payouts, commissions and bonuses will show up here.</p>
            ) : (
              items.map((n) => <NotificationRow key={n.id} n={n} compact />)
            )}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block text-center text-[11px] text-gold py-2.5 border-t border-border hover:bg-card-elev transition">
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
