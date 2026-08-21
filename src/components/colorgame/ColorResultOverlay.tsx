"use client";

import { useEffect, useState } from "react";
import { COLOR_HEX, COLOR_LABELS, type DieColor } from "@/lib/colorgame";

type Props = {
  visible: boolean;
  betColor: DieColor | null;
  betAmount: number;
  dice: [DieColor, DieColor, DieColor] | undefined;
  payout: number;
  jackpotTriggered?: boolean;
  jackpotAmount?: number;
};

export function ColorResultOverlay({
  visible,
  betColor,
  betAmount,
  dice,
  payout,
  jackpotTriggered,
  jackpotAmount,
}: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) setShow(true);
    else {
      const t = setTimeout(() => setShow(false), 300);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!show || !dice || !betColor) return null;

  const matches = dice.filter((d) => d === betColor).length;
  const isWin = payout > 0;
  const mult = matches === 3 ? 4 : matches === 2 ? 3 : matches === 1 ? 2 : 0;

  const card: React.CSSProperties = isWin
    ? {
        background: "linear-gradient(160deg,#FFF3B0 0%,#FFD23E 46%,#F7A81B 100%)",
        border: "clamp(3px,0.55vmin,6px) solid #FFF7CF",
        boxShadow:
          "0 0 0 clamp(2px,0.4vmin,5px) #C6810E, 0 clamp(8px,2vmin,24px) clamp(20px,5vmin,56px) rgba(0,0,0,.45), 0 0 clamp(30px,7vmin,80px) rgba(255,200,40,.55)",
      }
    : {
        background: "linear-gradient(160deg,#3A2B52 0%,#241634 100%)",
        border: "clamp(3px,0.55vmin,6px) solid #6B5690",
        boxShadow:
          "0 0 0 clamp(2px,0.4vmin,5px) #1a0f2b, 0 clamp(8px,2vmin,24px) clamp(20px,5vmin,56px) rgba(0,0,0,.5)",
      };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ pointerEvents: "none", paddingBottom: "4%" }}
    >
      <style>{`
        @keyframes cgResPop { 0%{transform:scale(.55);opacity:0} 55%{transform:scale(1.06)} 100%{transform:scale(1);opacity:1} }
        @keyframes cgResOut { to { transform:scale(.92); opacity:0 } }
        @keyframes cgResPulse { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.12)} }
      `}</style>

      <div
        style={{
          textAlign: "center",
          borderRadius: "clamp(16px,2.6vmin,30px)",
          padding: "clamp(14px,3vmin,32px) clamp(26px,5.5vmin,64px)",
          minWidth: "clamp(220px,34vmin,420px)",
          animation: visible
            ? "cgResPop .42s cubic-bezier(.34,1.56,.64,1)"
            : "cgResOut .3s ease forwards",
          ...card,
        }}
      >
        {jackpotTriggered && (
          <div
            style={{
              fontWeight: 900,
              letterSpacing: ".08em",
              fontSize: "clamp(16px,3vmin,32px)",
              color: "#B4310A",
              textShadow: "0 2px 0 #FFF2B0",
              animation: "cgResPulse 0.9s ease-in-out infinite",
              marginBottom: ".15em",
            }}
          >
            ★ JACKPOT ★
          </div>
        )}

        {/* Headline */}
        <div
          style={{
            fontWeight: 900,
            letterSpacing: ".03em",
            fontSize: "clamp(24px,4.8vmin,56px)",
            lineHeight: 1,
            color: isWin ? "#7A3B00" : "#C9BEE4",
            textShadow: isWin ? "0 2px 0 #FFF3B0" : "0 2px 4px rgba(0,0,0,.4)",
          }}
        >
          {isWin ? "YOU WIN!" : "NO MATCH"}
        </div>

        {/* Amount */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "center",
            gap: ".18em",
            marginTop: ".12em",
          }}
        >
          <span
            style={{
              fontWeight: 900,
              fontVariantNumeric: "tabular-nums",
              fontSize: "clamp(40px,8.4vmin,96px)",
              lineHeight: 1,
              color: isWin ? "#B4310A" : "#FF8A8A",
              textShadow: isWin
                ? "0 2px 0 #FFE68A, 0 4px 6px rgba(120,50,0,.35)"
                : "0 2px 6px rgba(0,0,0,.4)",
            }}
          >
            {isWin ? `+${payout}` : `-${betAmount}`}
          </span>
          <span
            style={{
              fontWeight: 900,
              fontSize: "clamp(18px,3.4vmin,38px)",
              color: isWin ? "#7A3B00" : "#C9BEE4",
            }}
          >
            GP
          </span>
        </div>

        {jackpotTriggered && jackpotAmount && jackpotAmount > 0 && (
          <div
            style={{
              fontWeight: 800,
              fontSize: "clamp(13px,2.2vmin,22px)",
              color: "#8A4600",
              marginTop: ".1em",
            }}
          >
            includes +{jackpotAmount} jackpot
          </div>
        )}

        {/* Footer: color chip + matches */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: ".5em",
            marginTop: "clamp(8px,1.6vmin,18px)",
          }}
        >
          <span
            style={{
              width: "clamp(16px,2.8vmin,30px)",
              height: "clamp(16px,2.8vmin,30px)",
              borderRadius: "clamp(4px,0.9vmin,8px)",
              background: COLOR_HEX[betColor],
              border: "2px solid rgba(255,255,255,.85)",
              boxShadow: "0 2px 4px rgba(0,0,0,.3)",
            }}
          />
          <span
            style={{
              fontWeight: 800,
              fontSize: "clamp(14px,2.6vmin,28px)",
              color: isWin ? "#7A3B00" : "#B7AAD6",
            }}
          >
            {isWin
              ? `${COLOR_LABELS[betColor]} ×${mult}`
              : `${COLOR_LABELS[betColor]} — no hit`}
          </span>
        </div>
      </div>
    </div>
  );
}
