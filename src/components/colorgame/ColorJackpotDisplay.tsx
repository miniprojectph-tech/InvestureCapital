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
    <div className={`w-full h-full flex items-center justify-center gap-[3%] ${triggered ? "animate-pulse" : ""}`}>
      {digits.map((d, i) => (
        <div
          key={i}
          className="flex items-center justify-center"
          style={{ width: "11%", height: "70%" }}
        >
          <span
            className="font-mono font-black"
            style={{
              fontSize: "min(2vw, 2.5vh)",
              color: "#00FF88",
              textShadow: "0 0 8px #00FF88, 0 0 20px #00FF8844",
            }}
          >
            {d}
          </span>
        </div>
      ))}
    </div>
  );
}
