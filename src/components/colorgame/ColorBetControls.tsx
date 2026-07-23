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
    <div className="w-full h-full flex items-center justify-between">
      {PRESETS.map((p) => (
        <button
          key={p}
          onClick={() => !disabled && !placing && onBetChange(p)}
          disabled={disabled || placing}
          className="h-[80%] aspect-[1.3] rounded-full flex items-center justify-center transition-all"
          style={{
            background: betAmount === p ? "rgba(255,255,255,0.2)" : "transparent",
            boxShadow: betAmount === p
              ? "inset 0 0 20px rgba(255,255,255,0.35), 0 0 12px rgba(255,215,0,0.4)"
              : "none",
            border: betAmount === p ? "2px solid rgba(255,215,0,0.5)" : "2px solid transparent",
          }}
        >
          <span
            style={{
              fontSize: "clamp(10px, 1.2vw, 20px)",
              fontWeight: 900,
              color: "#fff",
              textShadow: "0 2px 6px rgba(0,0,0,0.7), 0 0 10px rgba(0,0,0,0.3)",
              letterSpacing: "0.5px",
            }}
          >
            {p >= 1000 ? `${p / 1000}K` : p}
          </span>
        </button>
      ))}
    </div>
  );
}
