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
  // Middle 3 slots show the LATEST round — one die per slot (die1, die2, die3).
  // The first and last slots are "see all history" buttons.
  const latest = history[0];

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
        const color = latest?.dice[i];
        return (
          <div key={i} className="flex items-center justify-center w-full h-full">
            {color && (
              <div
                style={{
                  height: "78%",
                  aspectRatio: "1",
                  borderRadius: "22%",
                  backgroundColor: COLOR_HEX[color],
                  border: "1px solid rgba(0,0,0,0.2)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
                }}
              />
            )}
          </div>
        );
      })}
      <ExpandBtn />
    </div>
  );
}
