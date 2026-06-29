"use client";

import { useState, useMemo } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  Plus,
  CheckCircle2,
  RefreshCw,
  Search,
  type LucideIcon,
} from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card } from "@/components/Card";
import { cn, formatPHP } from "@/lib/utils";
import { mockActivity, type ActivityType, type ActivityEvent } from "@/lib/mock-data";

const typeMeta: Record<ActivityType, { label: string; icon: LucideIcon; bg: string; color: string }> = {
  payout: { label: "Payouts", icon: ArrowDownRight, bg: "bg-green/15", color: "text-green" },
  compound: { label: "Compounds", icon: TrendingUp, bg: "bg-blue/15", color: "text-blue" },
  "plan-activate": { label: "Activations", icon: Plus, bg: "bg-white/5", color: "text-text-muted" },
  "plan-complete": { label: "Completions", icon: CheckCircle2, bg: "bg-blue/15", color: "text-blue" },
  withdrawal: { label: "Withdrawals", icon: ArrowUpRight, bg: "bg-white/5", color: "text-text-muted" },
  reinvest: { label: "Reinvests", icon: RefreshCw, bg: "bg-gold/15", color: "text-gold" },
};

// Extend mock data with more rows for the full page
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = Date.now();
const extendedActivity: ActivityEvent[] = [
  ...mockActivity,
  {
    id: "x1",
    type: "compound",
    title: "Vault compounded",
    subtitle: "1.0% daily on ₱9,259",
    amount: 92.59,
    amountKind: "in",
    at: new Date(now - 2 * DAY),
  },
  {
    id: "x2",
    type: "payout",
    title: "Daily payout received",
    subtitle: "2 active plans",
    amount: 35,
    amountKind: "in",
    at: new Date(now - 2 * DAY - HOUR),
  },
  {
    id: "x3",
    type: "compound",
    title: "Vault compounded",
    subtitle: "1.0% daily on ₱9,168",
    amount: 91.68,
    amountKind: "in",
    at: new Date(now - 3 * DAY),
  },
  {
    id: "x4",
    type: "reinvest",
    title: "Reinvest → 5-day starter",
    subtitle: "From wallet",
    amount: 500,
    amountKind: "out",
    at: new Date(now - 4 * DAY),
  },
  {
    id: "x5",
    type: "plan-complete",
    title: "Plan completed — 15-day momentum",
    subtitle: "Credited ₱1,350 to vault",
    amount: 1350,
    amountKind: "neutral",
    at: new Date(now - 7 * DAY),
  },
  {
    id: "x6",
    type: "plan-activate",
    title: "Plan activated — 15-day momentum",
    subtitle: "Capital ₱3,000",
    amount: 3000,
    amountKind: "out",
    at: new Date(now - 22 * DAY),
  },
];

function groupByDay(events: ActivityEvent[]) {
  const groups: Record<string, ActivityEvent[]> = {};
  for (const ev of events) {
    const d = ev.at;
    const today = new Date(now);
    const yesterday = new Date(now - DAY);
    let label: string;
    if (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    ) label = "Today";
    else if (
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear()
    ) label = "Yesterday";
    else label = d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
    if (!groups[label]) groups[label] = [];
    groups[label].push(ev);
  }
  return Object.entries(groups);
}

function timeOf(d: Date) {
  return d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function amountStr(ev: ActivityEvent) {
  if (ev.amount === undefined) return "";
  const sign = ev.amountKind === "in" ? "+" : ev.amountKind === "out" ? "−" : "";
  return `${sign}${formatPHP(ev.amount)}`;
}

function amountColor(ev: ActivityEvent) {
  if (ev.amountKind === "in") return "text-green";
  if (ev.amountKind === "out") return "text-text-muted";
  return "text-text";
}

export default function ActivityPage() {
  const [filter, setFilter] = useState<ActivityType | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return extendedActivity
      .filter((ev) => filter === "all" || ev.type === filter)
      .filter(
        (ev) =>
          !query ||
          ev.title.toLowerCase().includes(query.toLowerCase()) ||
          ev.subtitle.toLowerCase().includes(query.toLowerCase())
      );
  }, [filter, query]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <div>
      <TopHeader title="Activity log" subtitle="All events across your account" />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setFilter("all")}
          className={cn(
            "text-[11px] px-3 py-1.5 rounded-full border transition",
            filter === "all"
              ? "bg-gold/15 border-border-gold text-gold font-medium"
              : "bg-card border-border text-text-muted hover:text-text"
          )}
        >
          All
        </button>
        {(Object.keys(typeMeta) as ActivityType[]).map((t) => {
          const meta = typeMeta[t];
          const Icon = meta.icon;
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                "text-[11px] px-3 py-1.5 rounded-full border transition flex items-center gap-1.5",
                filter === t
                  ? "bg-gold/15 border-border-gold text-gold font-medium"
                  : "bg-card border-border text-text-muted hover:text-text"
              )}
            >
              <Icon className="w-3 h-3" />
              {meta.label}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-full">
          <Search className="w-3 h-3 text-text-subtle" />
          <input
            type="text"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-transparent text-[11px] outline-none w-32 text-text placeholder:text-text-subtle"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {grouped.length === 0 && (
          <Card className="text-center py-10 text-text-subtle text-[13px]">
            No activity matches your filter.
          </Card>
        )}
        {grouped.map(([day, events]) => (
          <Card key={day}>
            <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0 mb-2">
              {day}
            </p>
            <div>
              {events.map((ev, i) => {
                const meta = typeMeta[ev.type];
                const Icon = meta.icon;
                return (
                  <div
                    key={ev.id}
                    className={cn(
                      "flex items-center gap-3 py-2",
                      i < events.length - 1 && "border-b border-border"
                    )}
                  >
                    <div
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                        meta.bg
                      )}
                    >
                      <Icon className={cn("w-3.5 h-3.5", meta.color)} strokeWidth={2.25} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] m-0">{ev.title}</p>
                      <p className="text-[10px] text-text-subtle mt-0.5 m-0">
                        {ev.subtitle} · {timeOf(ev.at)}
                      </p>
                    </div>
                    {ev.amount !== undefined && (
                      <span className={cn("text-[12px] font-mono shrink-0", amountColor(ev))}>
                        {amountStr(ev)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
