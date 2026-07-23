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

const RANK_BADGES = ["🥇", "🥈", "🥉"];

export function ColorRankingBoard({ leaders }: Props) {
  const top = leaders.slice(0, 7);

  return (
    <div className="w-full h-full flex flex-col gap-[2%] py-[2%] px-[6%]">
      {top.map((l, i) => (
        <div
          key={l.uid}
          className="flex items-center gap-[4%] h-[12%] rounded-lg px-[4%]"
        >
          <span className="text-[0.7vw] w-[12%] text-center shrink-0">
            {i < 3 ? RANK_BADGES[i] : <span className="text-amber-800/60 font-bold">{i + 1}</span>}
          </span>
          <div className="w-[1.2vw] h-[1.2vw] rounded-full flex items-center justify-center text-[0.5vw] font-bold text-white shrink-0" style={{
            background: i === 0 ? "linear-gradient(135deg, #FFD700, #FFA500)" : i === 1 ? "linear-gradient(135deg, #C0C0C0, #A0A0A0)" : i === 2 ? "linear-gradient(135deg, #CD7F32, #A0622E)" : "linear-gradient(135deg, #94a3b8, #64748b)",
          }}>
            {(l.name?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[0.6vw] text-amber-900 font-semibold truncate m-0 leading-tight">
              {l.name}
            </p>
          </div>
          <div className="flex items-center gap-[2%] shrink-0">
            <span className="text-[0.5vw]">🪙</span>
            <span className="text-[0.6vw] font-bold text-amber-800 font-mono">
              {fmtAmt(l.totalWon)}
            </span>
          </div>
        </div>
      ))}
      {top.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[0.6vw] text-amber-700/40 italic">No players yet</p>
        </div>
      )}
    </div>
  );
}
