"use client";

import { cn } from "@/lib/utils";
import { TONGITS_ART } from "./AssetImage";

const SUIT: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const isRed = (c: string) => c[1] === "H" || c[1] === "D";
const rankLabel = (c: string) => (c[0] === "T" ? "10" : c[0]);

const SIZES = {
  sm: { w: 30, h: 42, corner: 8, pip: 15 },
  md: { w: 46, h: 64, corner: 11, pip: 26 },
  lg: { w: 58, h: 81, corner: 13, pip: 34 },
} as const;

export type CardSize = keyof typeof SIZES;

/**
 * A premium CSS-rendered playing card (no art assets needed). Face shows corner
 * rank+suit and a large center pip; face-down shows the emerald card back
 * (uses /tongits/card-back.webp as a background if present, else a CSS pattern).
 */
export function PlayingCard({
  card,
  size = "md",
  selected,
  onClick,
  faceDown,
  className,
}: {
  card?: string;
  size?: CardSize;
  selected?: boolean;
  onClick?: () => void;
  faceDown?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  const interactive = !!onClick;

  if (faceDown || !card) {
    return (
      <div
        onClick={onClick}
        style={{
          width: s.w,
          height: s.h,
          borderRadius: s.corner,
          backgroundImage: `url(${TONGITS_ART.cardBack})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        className={cn(
          "shrink-0 border border-[#0c1f38] shadow-md relative overflow-hidden",
          "bg-gradient-to-br from-[#0e2a4a] via-[#0b2038] to-[#0a1a2e]",
          interactive && "cursor-pointer",
          className
        )}
      >
        {/* CSS back pattern (shows when no card-back.webp is present) */}
        <div
          className="absolute inset-1 rounded-[6px] border border-[#3DD598]/30"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(61,213,152,0.14) 0 3px, transparent 3px 6px)",
          }}
        />
      </div>
    );
  }

  const red = isRed(card);
  const color = red ? "#dc2626" : "#0f172a";
  return (
    <button
      onClick={onClick}
      disabled={!interactive}
      style={{ width: s.w, height: s.h, borderRadius: s.corner }}
      className={cn(
        "shrink-0 bg-white relative shadow-md select-none transition-transform",
        "border",
        selected ? "border-[#3DD598] ring-2 ring-[#3DD598] -translate-y-2" : "border-neutral-300",
        interactive && "hover:-translate-y-1 cursor-pointer",
        className
      )}
    >
      {/* top-left */}
      <span
        className="absolute top-0.5 left-1 leading-none font-bold flex flex-col items-center"
        style={{ color, fontSize: size === "sm" ? 8 : 10 }}
      >
        {rankLabel(card)}
        <span style={{ fontSize: size === "sm" ? 8 : 10 }}>{SUIT[card[1]]}</span>
      </span>
      {/* center pip */}
      <span
        className="absolute inset-0 flex items-center justify-center font-bold"
        style={{ color, fontSize: s.pip }}
      >
        {SUIT[card[1]]}
      </span>
      {/* bottom-right (rotated) */}
      <span
        className="absolute bottom-0.5 right-1 leading-none font-bold flex flex-col items-center rotate-180"
        style={{ color, fontSize: size === "sm" ? 8 : 10 }}
      >
        {rankLabel(card)}
        <span style={{ fontSize: size === "sm" ? 8 : 10 }}>{SUIT[card[1]]}</span>
      </span>
    </button>
  );
}
