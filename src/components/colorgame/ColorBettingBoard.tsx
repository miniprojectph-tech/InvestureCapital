"use client";

import type { DieColor, LiveBet } from "@/lib/colorgame";

type Props = {
  selectedColor: DieColor | null;
  onSelect: (color: DieColor) => void;
  disabled: boolean;
  betAmounts: Record<string, number>;
  results?: [DieColor, DieColor, DieColor];
  /** Everyone's bets this round — drawn as player chips on each tile. */
  bets?: LiveBet[];
  meUid?: string;
};

const TILE_ORDER: DieColor[] = ["yellow", "white", "pink", "blue", "red", "green"];
const CHIP_BG = ["#2DD4BF", "#A78BFA", "#4F8EF7", "#F472B6", "#FBBF24", "#34D399"];

function fmtAmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function chipColor(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return CHIP_BG[h % CHIP_BG.length];
}

export function ColorBettingBoard({ selectedColor, onSelect, disabled, betAmounts, results, bets = [], meUid }: Props) {
  const matchCounts = results
    ? TILE_ORDER.reduce((acc, c) => {
        acc[c] = results.filter((d) => d === c).length;
        return acc;
      }, {} as Record<string, number>)
    : null;

  return (
    <div
      className="w-full h-full grid grid-cols-3 grid-rows-2"
      style={{ columnGap: "4.15%", rowGap: "11.4%" }}
    >
      {TILE_ORDER.map((color) => {
        const isSelected = selectedColor === color;
        const isWinner = matchCounts ? matchCounts[color] > 0 : false;
        const bet = betAmounts[color] ?? 0;
        // Your own chip first, then the biggest stakes.
        const here = bets
          .filter((b) => b.color === color)
          .sort((a, b) => (a.uid === meUid ? -1 : b.uid === meUid ? 1 : b.amount - a.amount));
        const shown = here.slice(0, 3);

        return (
          <button
            key={color}
            onClick={() => !disabled && onSelect(color)}
            disabled={disabled}
            className="relative rounded-lg transition-all duration-200 flex flex-col items-center justify-center"
            style={{
              background: "transparent",
              cursor: disabled ? "default" : "pointer",
              gap: "min(0.4vw, 0.7vh)",
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
            {shown.length > 0 && (
              <span className="flex items-center justify-center" style={{ fontSize: "min(0.85vw, 1.5vh)" }}>
                {shown.map((b, i) => (
                  <span
                    key={b.key}
                    title={`${b.uid === meUid ? "You" : b.name} · ${b.amount.toLocaleString()} GP`}
                    className="rounded-full flex items-center justify-center font-black"
                    style={{
                      width: "2.2em",
                      height: "2.2em",
                      marginLeft: i === 0 ? 0 : "-0.5em",
                      background: b.uid === meUid ? "#FFD700" : chipColor(b.uid),
                      color: "#1a0a2e",
                      border: "2px solid rgba(255,255,255,0.95)",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.45)",
                      zIndex: 3 - i,
                    }}
                  >
                    {b.uid === meUid ? "Me" : initials(b.name)}
                  </span>
                ))}
                {here.length > shown.length && (
                  <span
                    className="rounded-full flex items-center justify-center font-black text-white"
                    style={{ height: "2.2em", padding: "0 0.5em", marginLeft: "-0.4em", background: "rgba(20,6,40,0.8)", border: "2px solid rgba(255,255,255,0.8)" }}
                  >
                    +{here.length - shown.length}
                  </span>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
