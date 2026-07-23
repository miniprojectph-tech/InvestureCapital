"use client";

import { ALL_COLORS, COLOR_HEX, COLOR_LABELS, type DieColor } from "@/lib/colorgame";

type Props = {
  selectedColor: DieColor | null;
  onSelect: (color: DieColor) => void;
  disabled: boolean;
  betAmounts: Record<string, number>;
  results?: [DieColor, DieColor, DieColor];
};

export function ColorBettingBoard({ selectedColor, onSelect, disabled, betAmounts, results }: Props) {
  const matchCounts = results
    ? ALL_COLORS.reduce((acc, c) => {
        acc[c] = results.filter((d) => d === c).length;
        return acc;
      }, {} as Record<string, number>)
    : null;

  return (
    <div className="relative">
      <img
        src="/colorgame/betting-board.png"
        alt="Betting Board"
        className="w-full h-auto"
        draggable={false}
      />
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 p-[8%] gap-[2%]">
        {ALL_COLORS.map((color) => {
          const isSelected = selectedColor === color;
          const isWinner = matchCounts ? matchCounts[color] > 0 : false;
          const matches = matchCounts?.[color] ?? 0;
          const bet = betAmounts[color] ?? 0;

          return (
            <button
              key={color}
              onClick={() => !disabled && onSelect(color)}
              disabled={disabled}
              className="relative rounded-lg transition-all duration-200 flex flex-col items-center justify-center overflow-hidden"
              style={{
                backgroundColor: `${COLOR_HEX[color]}22`,
                border: isSelected
                  ? `3px solid ${COLOR_HEX[color]}`
                  : "3px solid transparent",
                boxShadow: isSelected
                  ? `0 0 20px ${COLOR_HEX[color]}66, inset 0 0 15px ${COLOR_HEX[color]}33`
                  : isWinner
                  ? `0 0 25px ${COLOR_HEX[color]}88`
                  : "none",
                opacity: disabled && !isWinner && matchCounts ? 0.4 : 1,
                cursor: disabled ? "default" : "pointer",
              }}
            >
              <div
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-md mb-1"
                style={{ backgroundColor: COLOR_HEX[color] }}
              />
              <span className="text-[10px] sm:text-xs font-bold text-white/90 drop-shadow">
                {COLOR_LABELS[color]}
              </span>
              {bet > 0 && (
                <span className="absolute top-1 right-1 text-[9px] sm:text-[10px] bg-black/60 text-yellow-300 px-1.5 py-0.5 rounded-full font-mono font-bold">
                  {bet}
                </span>
              )}
              {isWinner && matches > 0 && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] sm:text-xs bg-yellow-400 text-black px-2 py-0.5 rounded-full font-bold animate-pulse">
                  {matches}x
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
