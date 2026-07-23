"use client";

import { BET_MS, ROLL_MS, RESULT_MS, type RoundPhase } from "@/lib/colorgame";

type Props = {
  phase: RoundPhase;
  remaining: number;
};

const PHASE_COLORS: Record<RoundPhase, string> = {
  betting: "#22C55E",
  rolling: "#EAB308",
  result: "#EF4444",
  expired: "#6B7280",
};

const PHASE_LABELS: Record<RoundPhase, string> = {
  betting: "BET",
  rolling: "ROLL",
  result: "DONE",
  expired: "WAIT",
};

function phaseDuration(phase: RoundPhase): number {
  if (phase === "betting") return BET_MS;
  if (phase === "rolling") return ROLL_MS;
  return RESULT_MS;
}

export function ColorRoundTimer({ phase, remaining }: Props) {
  const total = phaseDuration(phase);
  const progress = 1 - remaining / total;
  const seconds = Math.ceil(remaining / 1000);
  const color = PHASE_COLORS[phase];

  const r = 18;
  const circ = 2 * Math.PI * r;
  const offset = circ * progress;

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative w-10 h-10">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
          <circle
            cx="22" cy="22" r={r}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="3"
          />
          <circle
            cx="22" cy="22" r={r}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.1s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-sm font-mono font-black"
            style={{ color, textShadow: `0 0 6px ${color}44` }}
          >
            {seconds}
          </span>
        </div>
      </div>
      <span
        className="text-[8px] font-bold tracking-wider"
        style={{ color }}
      >
        {PHASE_LABELS[phase]}
      </span>
    </div>
  );
}
