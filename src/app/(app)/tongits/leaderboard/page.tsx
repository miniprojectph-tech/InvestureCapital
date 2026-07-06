"use client";

import { useState } from "react";
import { Trophy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useTongitsLeaderboard, rowPoints, type LbPeriod } from "@/lib/tongits-social";
import { TongitsShell, ArcadePanel, T } from "@/components/TongitsShell";

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
    <TongitsShell>
      <div className="flex items-center justify-center gap-3 mb-3">
        <Trophy className="w-5 h-5" style={{ color: T.gold }} />
        <h2 className="text-[15px] font-bold uppercase tracking-widest m-0">Leaderboard</h2>
      </div>

      <div className="flex justify-center mb-3">
        <div className="flex items-center gap-1 rounded-full p-1" style={{ background: "#0d1a3d", border: `1px solid ${T.gold}44` }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setPeriod(t.id)}
              className="px-3.5 py-1.5 rounded-full text-[11px] font-medium transition"
              style={period === t.id ? { background: T.gold, color: "#0a1740" } : { color: "rgba(255,255,255,0.6)" }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <ArcadePanel className="max-w-2xl mx-auto">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: T.gold }} />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-[12px] text-white/60 text-center py-12 m-0">
            No ranked players yet for this period. Win some matches to appear here!
          </p>
        ) : (
          <div className="flex flex-col">
            {rows.map((r, i) => {
              const mine = r.uid === user?.uid;
              const winRate = r.games > 0 ? Math.round((r.wins / r.games) * 100) : 0;
              return (
                <div
                  key={r.uid}
                  className={cn("flex items-center gap-3 px-1 py-2.5 border-b border-white/10 last:border-b-0")}
                  style={mine ? { background: "rgba(245,198,107,0.08)" } : undefined}
                >
                  <span
                    className="w-6 text-center text-[14px] font-bold shrink-0"
                    style={{ color: i === 0 ? T.gold : i === 1 ? "#cbd5e1" : i === 2 ? "#e0a94a" : "#fff" }}
                  >
                    {i + 1}
                  </span>
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0"
                    style={{ background: "#0d1a3d", border: `2px solid ${T.gold}`, color: T.gold }}
                  >
                    {initials(r.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] m-0 truncate font-medium">
                      {r.name}
                      {mine && <span style={{ color: T.gold }}> · you</span>}
                    </p>
                    <p className="text-[10px] text-white/50 m-0">
                      {r.wins}W · {r.games} games · {winRate}% win
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[14px] font-mono font-bold m-0 inline-flex items-center gap-1" style={{ color: T.gold }}>
                      <Trophy className="w-3.5 h-3.5" /> {rowPoints(r, period).toLocaleString()}
                    </p>
                    <p className="text-[9px] text-white/40 m-0">RP</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ArcadePanel>
    </TongitsShell>
  );
}
