"use client";

import { X } from "lucide-react";
import { COLOR_HEX, COLOR_LABELS, type DieColor } from "@/lib/colorgame";

type HistoryEntry = {
  roundId: string;
  dice: [DieColor, DieColor, DieColor];
  at: number;
};

type Props = {
  history: HistoryEntry[];
  onClose: () => void;
};

function fmtTime(at: number): string {
  if (!at) return "—";
  try {
    return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function ColorHistoryModal({ history, onClose }: Props) {
  const rows = history.slice(0, 10);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(92vw, 420px)",
          maxHeight: "80vh",
          overflowY: "auto",
          background: "linear-gradient(160deg,#2A1B44 0%,#1B1030 100%)",
          border: "2px solid #6B5690",
          borderRadius: 18,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          padding: "18px 20px",
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0, color: "#FFE68A", fontWeight: 900, fontSize: 20 }}>Recent results</h3>
          <button onClick={onClose} aria-label="Close" style={{ color: "#C9BEE4", background: "none", border: "none", cursor: "pointer" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {rows.length === 0 ? (
          <p style={{ color: "#9a8fc0", textAlign: "center", padding: "24px 0", margin: 0 }}>No rounds yet.</p>
        ) : (
          <div className="flex flex-col" style={{ gap: 6 }}>
            {rows.map((r, i) => (
              <div
                key={r.roundId}
                className="flex items-center justify-between"
                style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "8px 12px" }}
              >
                <span style={{ color: "#8A7EB0", fontSize: 12, width: 34 }}>{i === 0 ? "Now" : `#${i + 1}`}</span>
                <div className="flex items-center" style={{ gap: 6 }}>
                  {r.dice.map((c, di) => (
                    <span
                      key={di}
                      title={COLOR_LABELS[c]}
                      style={{ width: 22, height: 22, borderRadius: 5, background: COLOR_HEX[c], border: "1.5px solid rgba(255,255,255,0.6)" }}
                    />
                  ))}
                </div>
                <span style={{ color: "#8A7EB0", fontSize: 12, minWidth: 64, textAlign: "right" }}>{fmtTime(r.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
