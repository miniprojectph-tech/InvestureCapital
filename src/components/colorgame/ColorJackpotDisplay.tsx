"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  amount: number;
  triggered?: boolean;
};

// The banner art has 6 dark tiles; render one gold digit per tile.
const TILES = 6;

export function ColorJackpotDisplay({ amount, triggered }: Props) {
  const [display, setDisplay] = useState(amount);
  const prevRef = useRef(amount);

  useEffect(() => {
    if (amount === prevRef.current) return;
    const start = prevRef.current;
    const diff = amount - start;
    const steps = 25;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setDisplay(Math.round(start + (diff * step) / steps));
      if (step >= steps) { clearInterval(interval); setDisplay(amount); }
    }, 25);
    prevRef.current = amount;
    return () => clearInterval(interval);
  }, [amount]);

  // Pad to the tile count; if it ever overflows 6 digits, roll the lowest 6.
  const digits = String(Math.max(0, Math.floor(display))).padStart(TILES, "0").slice(-TILES).split("");

  return (
    <div
      className={`w-full h-full flex items-center justify-around ${triggered ? "animate-pulse" : ""}`}
      style={{ containerType: "size" }}
    >
      {digits.map((d, i) => (
        <div key={i} className="flex-1 flex items-center justify-center">
          <span
            style={{
              fontSize: "min(62cqh, 26cqw)",
              lineHeight: 1,
              fontWeight: 900,
              fontVariantNumeric: "tabular-nums",
              // Gradient-bevel gold (style B)
              background: "linear-gradient(180deg,#FFF6AE 0%,#FFD84A 44%,#F59B00 60%,#FFC93C 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              WebkitTextFillColor: "transparent",
              filter:
                "drop-shadow(0 2px 0 #7a3b00) drop-shadow(0 2px 2px rgba(0,0,0,.4)) drop-shadow(0 0 6px rgba(255,205,70,.5))",
            }}
          >
            {d}
          </span>
        </div>
      ))}
    </div>
  );
}
