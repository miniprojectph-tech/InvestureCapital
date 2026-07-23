"use client";

import { COLOR_HEX, type DieColor } from "@/lib/colorgame";

type HistoryEntry = {
  roundId: string;
  dice: [DieColor, DieColor, DieColor];
  at: number;
};

type Props = {
  history: HistoryEntry[];
};

export function ColorHistoryStrip({ history }: Props) {
  const recent = history.slice(0, 7);

  return (
    <div className="relative">
      <img
        src="/colorgame/history-strip.png"
        alt="History"
        className="w-full h-auto"
        draggable={false}
      />
      <div className="absolute inset-0 flex items-center justify-center gap-1 sm:gap-1.5 px-[3%]">
        {recent.map((entry, i) => (
          <div key={entry.roundId} className="flex gap-0.5">
            {entry.dice.map((color, di) => (
              <div
                key={di}
                className="w-3 h-3 sm:w-4 sm:h-4 rounded-sm"
                style={{
                  backgroundColor: COLOR_HEX[color],
                  opacity: 1 - i * 0.08,
                  boxShadow: `0 0 4px ${COLOR_HEX[color]}88`,
                }}
              />
            ))}
            {i < recent.length - 1 && (
              <div className="w-px h-3 sm:h-4 bg-white/20 mx-0.5" />
            )}
          </div>
        ))}
        {recent.length === 0 && (
          <span className="text-[10px] text-white/40 italic">No rounds yet</span>
        )}
      </div>
    </div>
  );
}
