"use client";

type Props = {
  betAmount: number;
  onBetChange: (amount: number) => void;
  onPlaceBet: () => void;
  disabled: boolean;
  balance: number;
  placing: boolean;
  hasSelectedColor: boolean;
};

const PRESETS = [5, 25, 50, 100];

export function ColorBetControls({ betAmount, onBetChange, onPlaceBet, disabled, balance, placing, hasSelectedColor }: Props) {
  return (
    <div className="flex items-center justify-center gap-1.5 sm:gap-2">
      <button
        disabled={disabled}
        className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg text-[10px] sm:text-xs font-bold bg-white/15 text-white/80 hover:bg-white/25 disabled:opacity-40 transition-all border border-white/10"
      >
        Auto
      </button>

      {PRESETS.map((p) => (
        <button
          key={p}
          onClick={() => onBetChange(p)}
          disabled={disabled || p > balance}
          className={`px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all border ${
            betAmount === p
              ? "bg-yellow-400 text-black border-yellow-300 shadow-lg shadow-yellow-400/30 scale-105"
              : p > balance
              ? "bg-white/5 text-white/20 border-white/5 cursor-not-allowed"
              : "bg-white/15 text-white border-white/10 hover:bg-white/25"
          }`}
        >
          {p}
        </button>
      ))}

      <button
        onClick={onPlaceBet}
        disabled={disabled || placing || betAmount > balance || !hasSelectedColor}
        className={`ml-1 px-4 py-1.5 sm:px-6 sm:py-2 rounded-lg text-xs sm:text-sm font-black transition-all ${
          disabled || placing || betAmount > balance || !hasSelectedColor
            ? "bg-gray-700/50 text-gray-500 cursor-not-allowed border border-gray-600/30"
            : "bg-gradient-to-b from-yellow-400 to-orange-500 text-black hover:from-yellow-300 hover:to-orange-400 shadow-lg shadow-orange-500/30 active:scale-95 border border-yellow-300/50"
        }`}
      >
        {placing ? "..." : "BET"}
      </button>
    </div>
  );
}
