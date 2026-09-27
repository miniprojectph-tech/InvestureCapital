"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { COLOR_HEX, COLOR_LABELS, type DieColor, type LiveBet } from "@/lib/colorgame";

type Props = {
  bets: LiveBet[];
  meUid: string;
  /** Set once the dice have landed — winning rows light up with their multiplier. */
  dice?: [DieColor, DieColor, DieColor];
  players: number;
};

const ORDER: DieColor[] = ["yellow", "white", "pink", "blue", "red", "green"];

function multiplier(dice: Props["dice"], color: DieColor): number {
  if (!dice) return 0;
  const m = dice.filter((d) => d === color).length;
  return m > 0 ? m + 1 : 0;
}

function Row({ b, meUid, dice, big }: { b: LiveBet; meUid: string; dice: Props["dice"]; big?: boolean }) {
  const mine = b.uid === meUid;
  const mult = multiplier(dice, b.color);
  const lost = !!dice && mult === 0;
  return (
    <div
      className="flex items-center rounded-full"
      style={{
        gap: big ? 8 : "0.35em",
        padding: big ? "5px 10px" : "0.18em 0.6em 0.18em 0.3em",
        background: mult > 0 ? "rgba(255,215,0,0.22)" : "rgba(20,6,40,0.62)",
        border: `1.5px solid ${mult > 0 ? "rgba(255,215,0,0.85)" : mine ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.14)"}`,
        opacity: lost ? 0.5 : 1,
        animation: big ? undefined : "colorBetIn 0.35s ease-out",
      }}
    >
      <span className="shrink-0 rounded-full" style={{ width: big ? 14 : "1em", height: big ? 14 : "1em", background: COLOR_HEX[b.color], border: "1.5px solid rgba(255,255,255,0.8)" }} aria-label={COLOR_LABELS[b.color]} />
      <span className="truncate font-semibold text-white" style={{ maxWidth: big ? 150 : "7.5em" }}>{mine ? "You" : b.name}</span>
      <span className="ml-auto font-mono font-black text-yellow-300 whitespace-nowrap">{b.amount.toLocaleString()}</span>
      {mult > 0 && <span className="font-black text-white whitespace-nowrap" style={{ fontSize: "0.85em" }}>×{mult}</span>}
    </div>
  );
}

/** Live bet board: the latest bets float under the ranking easel; tap to see everyone. */
export function ColorLiveBets({ bets, meUid, dice, players }: Props) {
  const [open, setOpen] = useState(false);
  const latest = bets.slice(0, 3);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full h-full flex flex-col text-left"
        style={{ fontSize: "min(1.05vw, 2.1vh)", gap: "0.3em", lineHeight: 1.15 }}
        aria-label="Show all bets this round"
      >
        <span className="flex items-center font-black uppercase text-white" style={{ gap: "0.4em", fontSize: "0.82em", letterSpacing: "0.08em", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
          <span className="rounded-full" style={{ width: "0.6em", height: "0.6em", background: "#22C55E", boxShadow: "0 0 6px #22C55E" }} />
          Live bets
          <span className="font-semibold normal-case text-white/70" style={{ letterSpacing: 0 }}>· {players} playing</span>
        </span>
        {latest.length === 0 ? (
          <span className="text-white/70 font-semibold" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>Be the first to bet this round</span>
        ) : (
          latest.map((b) => <Row key={`${b.key}-${b.amount}`} b={b} meUid={meUid} dice={dice} />)
        )}
        {bets.length > latest.length && <span className="text-white/80 font-semibold underline" style={{ fontSize: "0.85em", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>+{bets.length - latest.length} more bets</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={() => setOpen(false)} role="dialog" aria-label="Bets this round">
          <div className="w-full max-w-[560px] max-h-[86dvh] overflow-y-auto rounded-2xl border border-yellow-400/40 p-4" style={{ background: "#2A1045" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="m-0 text-white font-black text-[15px]">Bets this round <span className="text-white/60 font-semibold text-[12px]">· {players} playing</span></p>
              <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white" aria-label="Close"><X className="w-5 h-5" /></button>
            </div>
            {bets.length === 0 ? (
              <p className="text-white/70 text-[13px] m-0 py-6 text-center">No bets yet. Tap a colour to start the round.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
                {ORDER.filter((c) => bets.some((b) => b.color === c)).map((c) => {
                  const list = bets.filter((b) => b.color === c).sort((x, y) => y.amount - x.amount);
                  const total = list.reduce((s, b) => s + b.amount, 0);
                  return (
                    <div key={c} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 text-white font-bold">
                        <span className="w-3.5 h-3.5 rounded-sm" style={{ background: COLOR_HEX[c], border: "1.5px solid rgba(255,255,255,0.8)" }} />
                        {COLOR_LABELS[c]}
                        <span className="ml-auto font-mono text-yellow-300">{total.toLocaleString()} GP</span>
                      </div>
                      {list.map((b) => <Row key={b.key} b={b} meUid={meUid} dice={dice} big />)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes colorBetIn { from { opacity: 0; transform: translateY(40%) scale(0.96); } to { opacity: 1; transform: none; } }`}</style>
    </>
  );
}
