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
  const recent = history.slice(0, 10);

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-black/40 backdrop-blur-sm border border-white/10 overflow-x-auto">
      <span className="text-[8px] text-white/40 font-bold uppercase tracking-wider shrink-0 mr-1">History</span>
      {recent.map((entry, i) => (
        <div key={entry.roundId} className="flex gap-[2px] shrink-0" style={{ opacity: 1 - i * 0.07 }}>
          {entry.dice.map((color, di) => (
            <div
              key={di}
              className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-[2px]"
              style={{
                backgroundColor: COLOR_HEX[color],
                boxShadow: `0 0 3px ${COLOR_HEX[color]}66`,
              }}
            />
          ))}
        </div>
      ))}
      {recent.length === 0 && (
        <span className="text-[8px] text-white/30 italic">No rounds yet</span>
      )}
    </div>
  );
}
