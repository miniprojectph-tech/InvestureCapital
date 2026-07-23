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
      const t = setTimeout(() => setShow(false), 300);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!show || !dice || !betColor) return null;

  const matches = dice.filter((d) => d === betColor).length;
  const isWin = payout > 0;
  const net = payout - betAmount;

  return (
    <div
      className={`absolute inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{ backgroundColor: isWin ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.7)" }}
    >
      <div
        className={`rounded-2xl px-8 py-6 text-center max-w-[320px] ${
          isWin
            ? "bg-gradient-to-b from-yellow-900/90 to-yellow-950/90 border-2 border-yellow-400/50"
            : "bg-gradient-to-b from-gray-800/90 to-gray-900/90 border border-white/10"
        }`}
        style={{
          animation: visible ? "resultPopIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
          boxShadow: isWin ? `0 0 60px ${COLOR_HEX[betColor]}44` : "none",
        }}
      >
        <style>{`
          @keyframes resultPopIn {
            0% { transform: scale(0.5); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>

        {jackpotTriggered && (
          <div className="text-yellow-300 font-black text-xl mb-2 animate-pulse tracking-wider">
            JACKPOT!
          </div>
        )}

        <div className={`text-2xl font-black mb-2 ${isWin ? "text-yellow-300" : "text-white/60"}`}>
          {isWin ? "YOU WIN!" : "Better luck next round"}
        </div>

        <div className="flex items-center justify-center gap-2 mb-3">
          <div
            className="w-5 h-5 rounded"
            style={{ backgroundColor: COLOR_HEX[betColor] }}
          />
          <span className="text-sm text-white/80">
            {COLOR_LABELS[betColor]} &middot; {matches} match{matches !== 1 ? "es" : ""}
          </span>
        </div>

        {isWin ? (
          <div className="space-y-1">
            <div className="text-3xl font-mono font-black text-yellow-300">
              +{payout} GP
            </div>
            {jackpotTriggered && jackpotAmount && jackpotAmount > 0 && (
              <div className="text-sm text-yellow-400/80">
                includes {jackpotAmount} GP jackpot
              </div>
            )}
            <div className="text-xs text-white/50">
              Net profit: +{net} GP
            </div>
          </div>
        ) : (
          <div className="text-lg font-mono text-red-400/80">
            -{betAmount} GP
          </div>
        )}
      </div>
    </div>
  );
}
