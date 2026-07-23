"use client";

import { ALL_COLORS, COLOR_HEX, COLOR_LABELS, type DieColor } from "@/lib/colorgame";

type Props = {
  selectedColor: DieColor | null;
  onSelect: (color: DieColor) => void;
  disabled: boolean;
  betAmounts: Record<string, number>;
  results?: [DieColor, DieColor, DieColor];
};

function fmtAmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

export function ColorBettingBoard({ selectedColor, onSelect, disabled, betAmounts, results }: Props) {
  const matchCounts = results
    ? ALL_COLORS.reduce((acc, c) => {
        acc[c] = results.filter((d) => d === c).length;
        return acc;
      }, {} as Record<string, number>)
    : null;

  return (
    <div className="relative rounded-xl overflow-hidden" style={{
      background: "linear-gradient(145deg, #8B4513 0%, #A0522D 50%, #8B4513 100%)",
      padding: "8px",
      boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)",
    }}>
      <div className="grid grid-cols-3 grid-rows-2 gap-[6px]">
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
              className="relative rounded-lg transition-all duration-200 flex flex-col items-center justify-center aspect-[4/3]"
              style={{
                background: `linear-gradient(180deg, ${COLOR_HEX[color]}dd 0%, ${COLOR_HEX[color]} 50%, ${COLOR_HEX[color]}cc 100%)`,
                border: isSelected
                  ? "3px solid #FFD700"
                  : "2px solid rgba(255,255,255,0.2)",
                boxShadow: isSelected
                  ? `0 0 20px ${COLOR_HEX[color]}88, 0 0 40px #FFD70044, inset 0 2px 0 rgba(255,255,255,0.3)`
                  : isWinner
                  ? `0 0 30px ${COLOR_HEX[color]}aa, inset 0 2px 0 rgba(255,255,255,0.3)`
                  : "inset 0 2px 0 rgba(255,255,255,0.2), inset 0 -2px 4px rgba(0,0,0,0.2)",
                opacity: disabled && !isWinner && matchCounts ? 0.5 : 1,
                cursor: disabled ? "default" : "pointer",
                transform: isSelected ? "scale(1.03)" : "scale(1)",
              }}
            >
              {bet > 0 && (
                <span className="text-sm sm:text-base font-black text-white drop-shadow-lg" style={{
                  textShadow: "0 2px 4px rgba(0,0,0,0.5), 0 0 10px rgba(255,255,255,0.3)",
                }}>
                  {fmtAmt(bet)}
                </span>
              )}
              {bet === 0 && (
                <span className="text-xs sm:text-sm font-bold text-white/90 drop-shadow" style={{
                  textShadow: "0 1px 3px rgba(0,0,0,0.4)",
                }}>
                  {COLOR_LABELS[color]}
                </span>
              )}
              {isWinner && matches > 0 && (
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center text-[10px] font-black text-black shadow-lg animate-bounce">
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
