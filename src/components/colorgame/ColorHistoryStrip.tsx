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
    <div className="w-full h-full flex items-center justify-end gap-[2%] pr-[3%]">
      {recent.map((entry, i) => (
        <div key={entry.roundId} className="flex gap-[2px]" style={{ opacity: 1 - i * 0.08 }}>
          {entry.dice.map((color, di) => (
            <div
              key={di}
              className="rounded-[2px]"
              style={{
                width: "min(1vw, 1.5vh)",
                height: "min(1vw, 1.5vh)",
                backgroundColor: COLOR_HEX[color],
                boxShadow: `0 0 3px ${COLOR_HEX[color]}66`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
