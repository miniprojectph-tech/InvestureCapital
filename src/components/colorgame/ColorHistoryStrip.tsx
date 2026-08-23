"use client";

import { ChevronDown } from "lucide-react";
import { COLOR_HEX, type DieColor } from "@/lib/colorgame";

type HistoryEntry = {
  roundId: string;
  dice: [DieColor, DieColor, DieColor];
  at: number;
};

type Props = {
  history: HistoryEntry[];
  onExpand: () => void;
};

export function ColorHistoryStrip({ history, onExpand }: Props) {
  // Middle 3 slots show the latest rounds (newest on the left); the first and
  // last slots are "see all history" buttons.
  const recent = history.slice(0, 3);

  const ExpandBtn = () => (
    <button
      onClick={onExpand}
      aria-label="See all history"
      className="flex items-center justify-center w-full h-full"
    >
      <ChevronDown
        style={{ width: "min(1.5vw, 2.1vh)", height: "min(1.5vw, 2.1vh)", color: "rgba(255,244,220,0.9)" }}
        strokeWidth={3}
      />
    </button>
  );

  return (
    <div className="w-full h-full grid grid-cols-5 items-center">
      <ExpandBtn />
      {[0, 1, 2].map((i) => {
        const entry = recent[i];
        return (
          <div key={i} className="flex items-center justify-center gap-[2px]">
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
      <ExpandBtn />
    </div>
  );
}
