"use client";

type Props = {
  betAmount: number;
  onBetChange: (amount: number) => void;
  onPlaceBet: (amount: number) => void;
  disabled: boolean;
  balance: number;
  placing: boolean;
  selectedColor: boolean;
};

const PRESETS = [50, 100, 1000];

export function ColorBetControls({ betAmount, onBetChange, disabled, placing }: Props) {
  return (
    <div className="w-full h-full flex items-center gap-[3%]">
      {/* AUTO button zone - overlays the brown toggle */}
      <button
        disabled={disabled}
        className="h-[70%] flex-[1.2] rounded-full flex items-center justify-center transition-opacity opacity-0 hover:opacity-20 bg-white"
      />

      {/* 3 bet amount buttons - overlay the gold circles */}
      {PRESETS.map((p) => (
        <button
          key={p}
          onClick={() => !disabled && !placing && onBetChange(p)}
          disabled={disabled || placing}
          className="h-[70%] flex-1 rounded-full flex items-center justify-center transition-all relative"
          style={{
            background: betAmount === p ? "rgba(255,255,255,0.25)" : "transparent",
            boxShadow: betAmount === p ? "inset 0 0 15px rgba(255,255,255,0.3), 0 0 10px rgba(255,215,0,0.3)" : "none",
          }}
        >
          <span
            className="font-black text-white drop-shadow-lg"
            style={{
              fontSize: "min(1.1vw, 1.8vh)",
              textShadow: "0 2px 4px rgba(0,0,0,0.5)",
            }}
          >
            {p >= 1000 ? `${p / 1000}K` : p}
          </span>
        </button>
      ))}
    </div>
  );
}
