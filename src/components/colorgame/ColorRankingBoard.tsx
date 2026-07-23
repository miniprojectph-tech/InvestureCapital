"use client";

import type { ColorLeaderboardEntry } from "@/lib/colorgame";

type Props = {
  visible: boolean;
  onClose: () => void;
  leaders: ColorLeaderboardEntry[];
};

export function ColorRankingBoard({ visible, onClose, leaders }: Props) {
  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-end pr-4">
      <div className="relative w-[280px] max-h-[90%] flex flex-col">
        <img
          src="/colorgame/ranking-board.png"
          alt="Rankings"
          className="absolute inset-0 w-full h-full object-fill"
          draggable={false}
        />
        <div className="relative z-10 p-6 pt-10 overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-yellow-300 drop-shadow">Top Winners</h3>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white text-lg font-bold w-6 h-6 flex items-center justify-center"
            >
              &times;
            </button>
          </div>
          <div className="space-y-1.5">
            {leaders.map((l, i) => (
              <div
                key={l.uid}
                className="flex items-center gap-2 py-1 px-2 rounded-md bg-black/30"
              >
                <span className={`text-[11px] font-bold w-5 text-center ${
                  i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-orange-400" : "text-white/60"
                }`}>
                  {i + 1}
                </span>
                <div className="w-6 h-6 rounded-full bg-white/20 text-[10px] font-bold flex items-center justify-center text-white shrink-0">
                  {(l.name?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-white truncate m-0">{l.name}</p>
                </div>
                <span className="text-[11px] font-mono font-bold text-yellow-300">
                  {l.totalWon >= 1000 ? `${(l.totalWon / 1000).toFixed(1)}k` : l.totalWon}
                </span>
              </div>
            ))}
            {leaders.length === 0 && (
              <p className="text-[11px] text-white/40 text-center py-4">No players yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
