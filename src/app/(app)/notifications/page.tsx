"use client";

import { useMemo, useState } from "react";
import { CheckCheck, Loader2, Bell } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card } from "@/components/Card";
import { NotificationRow } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useNotifications, markNotificationsRead } from "@/lib/compplan";

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "payout", label: "Payouts" },
  { key: "accrual", label: "Daily earnings" },
  { key: "commission", label: "Commissions" },
  { key: "fastStart", label: "Fast-Start" },
  { key: "leadership", label: "Leadership" },
  { key: "placement", label: "Placements" },
];

export default function NotificationsPage() {
  const { user } = useAuth();
  const { items, unread, loading } = useNotifications(200);
  const [filter, setFilter] = useState("all");

  const rows = useMemo(() => (filter === "all" ? items : items.filter((n) => n.type === filter)), [items, filter]);
  const present = useMemo(() => new Set(items.map((n) => n.type)), [items]);

  return (
    <div>
      <TopHeader title="Notifications" subtitle={unread > 0 ? `${unread} unread` : "You're all caught up"} />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {FILTERS.filter((f) => f.key === "all" || present.has(f.key)).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn("text-[11px] px-3 py-1.5 rounded-full border transition", filter === f.key ? "bg-gold/15 border-border-gold text-gold font-medium" : "bg-card border-border text-text-muted hover:text-text")}
          >
            {f.label}
          </button>
        ))}
        {unread > 0 && user && (
          <button
            onClick={() => markNotificationsRead(user.uid, items.filter((n) => !n.read).map((n) => n.id))}
            className="ml-auto text-[11px] px-3 py-1.5 rounded-full border border-border bg-card text-text-muted hover:text-text flex items-center gap-1.5"
          >
            <CheckCheck className="w-3 h-3" /> Mark all read
          </button>
        )}
      </div>

      <Card className="!p-0 overflow-hidden">
        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 text-gold animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center px-6">
            <Bell className="w-8 h-8 text-text-subtle mx-auto mb-2" />
            <p className="text-[12px] text-text-muted m-0">
              {items.length === 0 ? "Nothing yet. Once a placement is active you'll get a daily earnings notice and a payout every 5 days." : "No notifications of this type."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((n) => <NotificationRow key={n.id} n={n} />)}
          </div>
        )}
      </Card>
    </div>
  );
}
