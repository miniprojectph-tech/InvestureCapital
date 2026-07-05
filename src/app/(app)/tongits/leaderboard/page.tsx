"use client";

import { useState } from "react";
import Link from "next/link";
import { Trophy, Loader2, ArrowLeft } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card } from "@/components/Card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useTongitsLeaderboard, rowPoints, type LbPeriod } from "@/lib/tongits-social";

const TABS: { id: LbPeriod; label: string }[] = [
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
  { id: "all", label: "All-time" },
];

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return (p.length === 1 ? p[0].slice(0, 2) : (p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function TongitsLeaderboardPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<LbPeriod>("week");
  const { rows, loading } = useTongitsLeaderboard(period);

  return (
    <div>
      <TopHeader title="Tongits leaderboard" subtitle="Climb the ranks — ranking points from every match" />

      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-card border border-border rounded-full p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setPeriod(t.id)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[11px] transition",
                period === t.id ? "bg-gold text-gold-dark font-medium" : "text-text-muted hover:text-text"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Link
          href="/tongits"
          className="text-[11px] text-text-muted hover:text-text inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Tongits
        </Link>
      </div>

      <Card className="p-0">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-5 h-5 text-gold animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-[12px] text-text-muted text-center py-12 m-0">
            No ranked players yet for this period. Win some matches to appear here!
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {rows.map((r, i) => {
              const mine = r.uid === user?.uid;
              const winRate = r.games > 0 ? Math.round((r.wins / r.games) * 100) : 0;
              return (
                <div
                  key={r.uid}
                  className={cn("flex items-center gap-3 px-4 py-2.5", mine && "bg-gold/5")}
                >
                  <span
                    className={cn(
                      "w-6 text-center text-[13px] font-mono font-semibold shrink-0",
                      i === 0 ? "text-gold" : i === 1 ? "text-text" : i === 2 ? "text-vault" : "text-text-subtle"
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-gold/15 flex items-center justify-center text-[11px] font-medium text-gold shrink-0">
                    {initials(r.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] m-0 truncate">
                      {r.name}
                      {mine && <span className="text-gold"> · you</span>}
                    </p>
                    <p className="text-[10px] text-text-subtle m-0">
                      {r.wins}W · {r.games} games · {winRate}% win
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[13px] font-mono font-medium text-gold m-0 inline-flex items-center gap-1">
                      <Trophy className="w-3 h-3" /> {rowPoints(r, period).toLocaleString()}
                    </p>
                    <p className="text-[9px] text-text-subtle m-0">RP</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
