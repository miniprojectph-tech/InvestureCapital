"use client";

import { useEffect, useRef, useState } from "react";
import { COLOR_HEX, type DieColor } from "@/lib/colorgame";

type Props = {
  amount: number;
  triggered?: boolean;
  lastDice?: [DieColor, DieColor, DieColor];
};

export function ColorJackpotDisplay({ amount, triggered, lastDice }: Props) {
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

  const digits = String(Math.max(0, display)).padStart(7, "0").split("");

  return (
    <div className={`relative flex flex-col items-center ${triggered ? "animate-pulse" : ""}`}>
      {/* JACKPOT title */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg sm:text-xl font-black tracking-wider" style={{
          background: "linear-gradient(180deg, #FF6B9D 0%, #FF1493 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          filter: "drop-shadow(0 2px 4px rgba(255,20,147,0.4))",
        }}>
          JACKPOT
        </span>
        <span className="text-white/50 text-sm">❓</span>
      </div>

      {/* Last dice results */}
      {lastDice && (
        <div className="flex gap-1 mb-1.5">
          {lastDice.map((c, i) => (
            <div
              key={i}
              className="w-4 h-4 sm:w-5 sm:h-5 rounded-sm"
              style={{ backgroundColor: COLOR_HEX[c], boxShadow: `0 0 6px ${COLOR_HEX[c]}88` }}
            />
          ))}
        </div>
      )}

      {/* Main display panel */}
      <div className="relative rounded-xl overflow-hidden" style={{
        background: "linear-gradient(180deg, #FF69B4 0%, #FF1493 30%, #C71585 100%)",
        padding: "3px",
        boxShadow: triggered
          ? "0 0 30px rgba(255,20,147,0.6), 0 0 60px rgba(255,215,0,0.3)"
          : "0 4px 15px rgba(0,0,0,0.4), 0 0 20px rgba(255,20,147,0.2)",
      }}>
        <div className="rounded-lg px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-center gap-[3px] sm:gap-1" style={{
          background: "linear-gradient(180deg, #1a0a20 0%, #2d1040 100%)",
        }}>
          {digits.map((d, i) => (
            <div
              key={i}
              className="w-5 h-7 sm:w-7 sm:h-9 rounded flex items-center justify-center"
              style={{
                background: "linear-gradient(180deg, #1a0520 0%, #0a0210 100%)",
                border: "1px solid rgba(255,105,180,0.3)",
              }}
            >
              <span
                className="text-base sm:text-xl font-mono font-black"
                style={{
                  color: "#00FF88",
                  textShadow: "0 0 8px #00FF88, 0 0 20px #00FF8844",
                }}
              >
                {d}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Crown decoration */}
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-yellow-400 text-xs" style={{
        filter: "drop-shadow(0 0 4px rgba(255,215,0,0.6))",
      }}>
        👑
      </div>
    </div>
  );
}
