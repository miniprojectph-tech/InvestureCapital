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
    if (visible) {
      setShow(true);
    } else {
      const t = setTimeout(() => setShow(false), 400);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!show || !dice || !betColor) return null;

  const matches = dice.filter((d) => d === betColor).length;
  const isWin = payout > 0;

  return (
    <div
      className={`absolute bottom-4 left-4 z-50 transition-all duration-400 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      <div
        className={`rounded-xl px-4 py-3 min-w-[180px] backdrop-blur-md ${
          isWin
            ? "bg-gradient-to-r from-yellow-900/90 to-amber-800/90 border border-yellow-400/50"
            : "bg-gradient-to-r from-gray-900/90 to-gray-800/90 border border-white/10"
        }`}
        style={{
          animation: visible ? "bannerSlideIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
          boxShadow: isWin
            ? `0 4px 24px ${COLOR_HEX[betColor]}44, 0 0 40px rgba(255,215,0,0.15)`
            : "0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        <style>{`
          @keyframes bannerSlideIn {
            0% { transform: translateX(-30px) scale(0.9); opacity: 0; }
            100% { transform: translateX(0) scale(1); opacity: 1; }
          }
        `}</style>

        {jackpotTriggered && (
          <div className="text-yellow-300 font-black text-sm mb-1 animate-pulse tracking-wider">
            JACKPOT!
          </div>
        )}

        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="w-4 h-4 rounded"
            style={{ backgroundColor: COLOR_HEX[betColor] }}
          />
          <span className={`text-sm font-black ${isWin ? "text-yellow-300" : "text-white/60"}`}>
            {isWin ? "WIN!" : "No match"}
          </span>
          <span className="text-[10px] text-white/50">
            {matches}x {COLOR_LABELS[betColor]}
          </span>
        </div>

        {isWin ? (
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-mono font-black text-yellow-300">
              +{payout} GP
            </span>
            {jackpotTriggered && jackpotAmount && jackpotAmount > 0 && (
              <span className="text-[10px] text-yellow-400/70">+{jackpotAmount} jackpot</span>
            )}
          </div>
        ) : (
          <div className="text-sm font-mono text-red-400/80">
            -{betAmount} GP
          </div>
        )}
      </div>
    </div>
  );
}
