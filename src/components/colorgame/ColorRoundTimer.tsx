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

  const r = 16;
  const circ = 2 * Math.PI * r;
  const offset = circ * progress;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: "min(6vw, 8.5vh)", height: "min(6vw, 8.5vh)" }}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r={r} fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.18)" strokeWidth="4" />
          <circle
            cx="20" cy="20" r={r}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.1s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono font-black" style={{ fontSize: "min(2.4vw, 3.4vh)", color, textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>
            {seconds}
          </span>
        </div>
      </div>
      <span className="font-black tracking-wider" style={{ fontSize: "min(0.95vw, 1.35vh)", color, textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
        {PHASE_LABELS[phase]}
      </span>
    </div>
  );
}
