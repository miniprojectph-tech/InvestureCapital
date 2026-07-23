"use client";

type Props = {
  betAmount: number;
  onBetChange: (amount: number) => void;
  onPlaceBet: () => void;
  disabled: boolean;
  balance: number;
  placing: boolean;
};

const PRESETS = [5, 10, 25, 50, 100, 250, 500];

export function ColorBetControls({ betAmount, onBetChange, onPlaceBet, disabled, balance, placing }: Props) {
  return (
    <div className="relative">
      <img
        src="/colorgame/bet-buttons.png"
        alt=""
        className="w-full h-auto opacity-80"
        draggable={false}
      />
      <div className="absolute inset-0 flex items-center justify-center gap-1.5 sm:gap-2 px-[4%]">
        <div className="flex items-center gap-1 flex-wrap justify-center">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => onBetChange(p)}
              disabled={disabled || p > balance}
              className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-bold transition-all ${
                betAmount === p
                  ? "bg-yellow-400 text-black shadow-lg shadow-yellow-400/30 scale-110"
                  : p > balance
                  ? "bg-white/10 text-white/30 cursor-not-allowed"
                  : "bg-white/20 text-white hover:bg-white/30"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <button
          onClick={onPlaceBet}
          disabled={disabled || placing || betAmount > balance}
          className={`ml-2 px-4 py-2 sm:px-6 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
            disabled || placing || betAmount > balance
              ? "bg-gray-600 text-gray-400 cursor-not-allowed"
              : "bg-gradient-to-b from-yellow-400 to-yellow-600 text-black hover:from-yellow-300 hover:to-yellow-500 shadow-lg shadow-yellow-500/30 active:scale-95"
          }`}
        >
          {placing ? "..." : "BET"}
        </button>
      </div>
    </div>
  );
}
