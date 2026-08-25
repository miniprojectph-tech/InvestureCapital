"use client";

import type { ColorLeaderboardEntry } from "@/lib/colorgame";

type Props = {
  leaders: ColorLeaderboardEntry[];
};

function fmtAmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

// Medal look per top-3 rank; everyone else gets the muted wood medal.
const MEDALS = [
  { bg: "linear-gradient(145deg,#FFF3AE 0%,#FFD23E 45%,#F5A200 100%)", ring: "#C6810E", fg: "#7A3B00", glow: true },
  { bg: "linear-gradient(145deg,#FBFBFB 0%,#DADDE3 45%,#AEB2BB 100%)", ring: "#8A8D95", fg: "#494D56", glow: false },
  { bg: "linear-gradient(145deg,#F6C88F 0%,#D98A44 45%,#A85E1E 100%)", ring: "#8A4E17", fg: "#4A250A", glow: false },
];
const MEDAL_DEFAULT = { bg: "linear-gradient(145deg,#DAC59C,#AC8E60)", ring: "#7C6039", fg: "#4A3A1E", glow: false };

export function ColorRankingBoard({ leaders }: Props) {
  const rows = Array.from({ length: 6 }, (_, i) => leaders[i]);

  return (
    <div className="w-full h-full grid grid-rows-6">
      {rows.map((l, i) => {
        const m = MEDALS[i] ?? MEDAL_DEFAULT;
        return (
          <div
            key={l?.uid ?? i}
            className="flex items-center"
            style={{ paddingLeft: "3.5%", paddingRight: "8%", gap: "5%" }}
          >
            {/* Rank medal — sits in the slot's circular avatar spot */}
            <div
              style={{
                height: "66%",
                aspectRatio: "1",
                borderRadius: "50%",
                background: m.bg,
                border: "max(1px,0.13vw) solid " + m.ring,
                boxShadow: m.glow
                  ? "0 1px 3px rgba(0,0,0,.35), 0 0 7px rgba(255,200,40,.55), inset 0 1px 1px rgba(255,255,255,.6)"
                  : "0 1px 3px rgba(0,0,0,.3), inset 0 1px 1px rgba(255,255,255,.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ fontWeight: 900, fontSize: "min(1vw,2.1vh)", color: m.fg, lineHeight: 1 }}>
                {i + 1}
              </span>
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              {l ? (
                <p
                  className="truncate"
                  style={{ margin: 0, fontWeight: 700, fontSize: "min(1.05vw,2.2vh)", color: "#6B3410", lineHeight: 1.1 }}
                >
                  {l.name}
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: "min(0.9vw,1.9vh)", color: "rgba(120,80,30,0.32)" }}>—</p>
              )}
            </div>

            {/* Score */}
            {l && (
              <div className="flex items-center" style={{ gap: "min(0.3vw,0.6vh)", flexShrink: 0 }}>
                <span
                  style={{
                    width: "min(1vw,2vh)",
                    height: "min(1vw,2vh)",
                    borderRadius: "50%",
                    background: "radial-gradient(circle at 35% 30%,#FFE888,#E8930C)",
                    border: "1px solid #B4700A",
                    boxShadow: "inset 0 1px 1px rgba(255,255,255,.6)",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{ fontWeight: 800, fontSize: "min(1.05vw,2.2vh)", color: "#B26A00", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}
                >
                  {fmtAmt(l.totalWon)}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
