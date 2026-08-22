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
  // One recent round per slot (5 slots on the wooden board), newest on the left.
  const recent = history.slice(0, 5);

  return (
    <div className="w-full h-full grid grid-cols-5 items-center">
      {Array.from({ length: 5 }).map((_, slot) => {
        const entry = recent[slot];
        return (
          <div key={slot} className="flex items-center justify-center gap-[2px]">
            {entry?.dice.map((color, di) => (
              <div
                key={di}
                className="rounded-[2px]"
                style={{
                  width: "min(0.8vw, 1.1vh)",
                  height: "min(0.8vw, 1.1vh)",
                  backgroundColor: COLOR_HEX[color],
                  border: "1px solid rgba(0,0,0,0.15)",
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
