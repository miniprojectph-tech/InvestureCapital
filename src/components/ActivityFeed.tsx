"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  Plus,
  CheckCircle2,
  RefreshCw,
  ArrowDownToLine,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Card, CardHeader } from "./Card";
import { Gamepad2 } from "lucide-react";
import { useUserActivity, activityValue, ACTIVITY_TONE } from "@/lib/userActivity";

const typeIcon: Record<string, { icon: LucideIcon; bg: string; color: string }> = {
  payout: { icon: ArrowDownRight, bg: "bg-green/15", color: "text-green" },
  compound: { icon: TrendingUp, bg: "bg-vault/15", color: "text-vault" },
  "vault-growth": { icon: TrendingUp, bg: "bg-vault/15", color: "text-vault" },
  "plan-activate": { icon: Plus, bg: "bg-white/5", color: "text-text-muted" },
  "plan-complete": { icon: CheckCircle2, bg: "bg-blue/15", color: "text-blue" },
  withdrawal: { icon: ArrowUpRight, bg: "bg-white/5", color: "text-text-muted" },
  reinvest: { icon: RefreshCw, bg: "bg-gold/15", color: "text-gold" },
  deposit: { icon: ArrowDownToLine, bg: "bg-green/15", color: "text-green" },
  "game-points": { icon: Gamepad2, bg: "bg-gold/15", color: "text-gold" },
};

const DEFAULT_ICON = { icon: RefreshCw, bg: "bg-white/5", color: "text-text-muted" };


export function ActivityFeed() {
  const { rows, loading } = useUserActivity();
  const visible = rows.slice(0, 6);

  return (
    <Card>
      <CardHeader
        title="Daily activity"
        right={
          <Link href="/activity" className="text-[10px] text-gold hover:underline">
            View all
          </Link>
        }
      />
      <div>
        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 text-gold animate-spin" />
          </div>
        )}
        {!loading && visible.length === 0 && (
          <p className="text-[11px] text-text-subtle py-2 m-0">
            No activity yet. Top up and activate a plan to get started.
          </p>
        )}
        {visible.map((ev, i) => {
          const t = typeIcon[ev.type] ?? DEFAULT_ICON;
          const Icon = t.icon;
          return (
            <div
              key={ev.id}
              className={`flex items-center gap-2.5 py-1.5 ${
                i < visible.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div className={`w-[22px] h-[22px] rounded-full ${t.bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-3 h-3 ${t.color}`} strokeWidth={2.25} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-text m-0 truncate">{ev.title}</p>
                <p className="text-[10px] text-text-subtle mt-0.5 m-0 truncate">{ev.subtitle}</p>
              </div>
              {(() => {
                const v = activityValue(ev, { short: ev.amount !== undefined && ev.amount % 1 === 0 });
                return v.text ? <span className={`text-[11px] font-mono ${ACTIVITY_TONE[v.tone]}`}>{v.text}</span> : null;
              })()}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
