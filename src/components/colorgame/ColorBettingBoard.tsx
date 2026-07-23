"use client";

import type { DieColor } from "@/lib/colorgame";

type Props = {
  selectedColor: DieColor | null;
  onSelect: (color: DieColor) => void;
  disabled: boolean;
  betAmounts: Record<string, number>;
  results?: [DieColor, DieColor, DieColor];
};

const TILE_ORDER: DieColor[] = ["yellow", "white", "pink", "blue", "red", "green"];

function fmtAmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

export function ColorBettingBoard({ selectedColor, onSelect, disabled, betAmounts, results }: Props) {
  const matchCounts = results
    ? TILE_ORDER.reduce((acc, c) => {
        acc[c] = results.filter((d) => d === c).length;
        return acc;
      }, {} as Record<string, number>)
    : null;

  return (
    <div className="w-full h-full grid grid-cols-3 grid-rows-2 gap-[3%] p-[3%]">
      {TILE_ORDER.map((color) => {
        const isSelected = selectedColor === color;
        const isWinner = matchCounts ? matchCounts[color] > 0 : false;
        const matches = matchCounts?.[color] ?? 0;
        const bet = betAmounts[color] ?? 0;

        return (
          <button
            key={color}
            onClick={() => !disabled && onSelect(color)}
            disabled={disabled}
            className="relative rounded-lg transition-all duration-200 flex items-center justify-center"
            style={{
              background: "transparent",
              cursor: disabled ? "default" : "pointer",
              boxShadow: isSelected
                ? "inset 0 0 20px rgba(255,215,0,0.5), 0 0 15px rgba(255,215,0,0.4)"
                : isWinner
                ? "inset 0 0 25px rgba(255,255,255,0.4), 0 0 20px rgba(255,255,255,0.3)"
                : "none",
              border: isSelected
                ? "3px solid rgba(255,215,0,0.8)"
                : "3px solid transparent",
              opacity: disabled && !isWinner && matchCounts ? 0.6 : 1,
            }}
          >
            {bet > 0 && (
              <span
                className="font-black text-white drop-shadow-lg"
                style={{
                  fontSize: "min(1.4vw, 2.2vh)",
                  textShadow: "0 2px 6px rgba(0,0,0,0.6), 0 0 12px rgba(255,255,255,0.2)",
                }}
              >
                {fmtAmt(bet)}
              </span>
            )}
            {isWinner && matches > 0 && (
              <div
                className="absolute -top-1 -right-1 rounded-full flex items-center justify-center font-black text-black bg-yellow-400 shadow-lg animate-bounce"
                style={{
                  width: "min(2vw, 3vh)",
                  height: "min(2vw, 3vh)",
                  fontSize: "min(0.8vw, 1.2vh)",
                }}
              >
                {matches}x
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
