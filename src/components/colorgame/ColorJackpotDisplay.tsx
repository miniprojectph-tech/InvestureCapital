"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  amount: number;
  triggered?: boolean;
};

export function ColorJackpotDisplay({ amount, triggered }: Props) {
  const [display, setDisplay] = useState(amount);
  const prevRef = useRef(amount);

  useEffect(() => {
    if (amount === prevRef.current) return;
    const start = prevRef.current;
    const diff = amount - start;
    const steps = 20;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setDisplay(Math.round(start + (diff * step) / steps));
      if (step >= steps) {
        clearInterval(interval);
        setDisplay(amount);
      }
    }, 30);
    prevRef.current = amount;
    return () => clearInterval(interval);
  }, [amount]);

  const digits = String(Math.max(0, display)).padStart(6, "0").split("");

  return (
    <div className="relative">
      <img
        src="/colorgame/jackpot-display.png"
        alt="Jackpot"
        className="w-full h-auto"
        draggable={false}
      />
      <div
        className={`absolute inset-0 flex items-center justify-center gap-0.5 sm:gap-1 px-[12%] ${
          triggered ? "animate-pulse" : ""
        }`}
      >
        {digits.map((d, i) => (
          <span
            key={i}
            className="text-yellow-300 font-mono font-black text-lg sm:text-2xl md:text-3xl drop-shadow-lg"
            style={{
              textShadow: triggered
                ? "0 0 20px #FFD700, 0 0 40px #FF6B00"
                : "0 0 8px rgba(255,200,0,0.5)",
            }}
          >
            {d}
          </span>
        ))}
      </div>
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] sm:text-[10px] text-yellow-300/80 font-bold tracking-widest uppercase">
        Jackpot
      </div>
    </div>
  );
}
