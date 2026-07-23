"use client";

import type { ColorLeaderboardEntry } from "@/lib/colorgame";

type Props = {
  leaders: ColorLeaderboardEntry[];
};

function fmtAmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

const RANK_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32", "#94a3b8", "#94a3b8"];
const RANK_BADGES = ["🥇", "🥈", "🥉", "", ""];

export function ColorRankingBoard({ leaders }: Props) {
  const top = leaders.slice(0, 5);

  return (
    <div className="relative h-full flex flex-col">
      {/* Wooden frame background */}
      <div className="relative rounded-xl overflow-hidden flex-1 flex flex-col" style={{
        background: "linear-gradient(180deg, #D2A679 0%, #B8884E 20%, #A0722E 100%)",
        padding: "4px",
        boxShadow: "4px 4px 15px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
      }}>
        <div className="rounded-lg flex-1 flex flex-col p-2.5" style={{
          background: "linear-gradient(180deg, #F5E6D3 0%, #E8D5BC 100%)",
        }}>
          {/* Header */}
          <div className="text-center mb-2">
            <div className="text-[11px] sm:text-xs font-black text-amber-800 tracking-wide uppercase">
              Ranking
            </div>
            <div className="text-[9px] text-amber-700/70 font-medium">Total Win</div>
          </div>

          {/* Player list */}
          <div className="flex-1 flex flex-col gap-1">
            {top.map((l, i) => (
              <div
                key={l.uid}
                className="flex items-center gap-1.5 py-1 px-1.5 rounded-md"
                style={{
                  background: i === 0 ? "rgba(255,215,0,0.15)" : "rgba(0,0,0,0.04)",
                }}
              >
                <span className="text-[10px] w-4 text-center" style={{ color: RANK_COLORS[i] }}>
                  {RANK_BADGES[i] || `${i + 1}`}
                </span>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{
                  background: `linear-gradient(135deg, ${RANK_COLORS[i]}88, ${RANK_COLORS[i]})`,
                }}>
                  {(l.name?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-amber-900 font-semibold truncate m-0 leading-tight">
                    {l.name}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <span className="text-[8px]">🪙</span>
                  <span className="text-[10px] font-bold text-amber-800 font-mono">
                    {fmtAmt(l.totalWon)}
                  </span>
                </div>
              </div>
            ))}
            {top.length === 0 && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[10px] text-amber-700/50 italic">No players yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
