"use client";

import { History, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMyMatchHistory } from "@/lib/tongits-social";
import { TongitsShell, ArcadePanel, T } from "@/components/TongitsShell";

export default function TongitsHistoryPage() {
  const { rows, loading } = useMyMatchHistory(50);

  return (
    <TongitsShell>
      <div className="flex items-center justify-center gap-3 mb-3">
        <History className="w-5 h-5" style={{ color: T.gold }} />
        <h2 className="text-[15px] font-bold uppercase tracking-widest m-0">Room History</h2>
      </div>

      <ArcadePanel className="max-w-2xl mx-auto">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: T.gold }} />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-[12px] text-white/60 text-center py-12 m-0">
            No matches yet. Play your first game from the lobby!
          </p>
        ) : (
          <div className="flex flex-col">
            {rows.map((h) => {
              const won = h.pointsEarned > 0;
              return (
                <div
                  key={h.id}
                  className="flex items-center justify-between gap-3 py-2.5 border-b border-white/10 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] m-0 font-medium">
                      <span style={{ color: won ? T.green : "#f87171" }}>{won ? "Won" : "Lost"}</span>
                      <span className="text-white/50"> · final hand {h.finalHandValue} · +{h.rankingPointsEarned} RP</span>
                    </p>
                    <p className="text-[10px] text-white/40 m-0">{new Date(h.createdAt).toLocaleString()}</p>
                  </div>
                  <span
                    className={cn("text-[14px] font-mono font-bold shrink-0")}
                    style={{ color: won ? T.green : "#f87171" }}
                  >
                    {won ? `+${h.pointsEarned.toLocaleString()}` : `−${h.pointsLost.toLocaleString()}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </ArcadePanel>
    </TongitsShell>
  );
}
