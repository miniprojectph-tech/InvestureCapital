"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Gift, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { claimDailyGameBonus, type DailyBonusConfig } from "@/lib/game";

/**
 * Games Central: today's placement bonus, shown each time the member opens the
 * hub until they claim it (a missed day is lost). The server recomputes the
 * amount on claim; the number here is only a preview from the same rule.
 */
export function DailyBonusPopup({
  cfg,
  points,
  capital,
  open,
  onClose,
  onClaimed,
}: {
  cfg: DailyBonusConfig;
  points: number;
  capital: number;
  open: boolean;
  onClose: () => void;
  onClaimed: (r: { points: number; capital: number; day: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [won, setWon] = useState<number | null>(null);

  async function claim() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await claimDailyGameBonus();
      setWon(r.points);
      onClaimed(r);
      setTimeout(onClose, 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not claim right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[61] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Daily game bonus"
          onClick={() => !busy && onClose()}
        >
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full max-w-sm rounded-3xl bg-card border border-gold/40 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-24 flex items-center justify-center" style={{ background: "radial-gradient(120% 90% at 30% 10%, #F5C66B55, transparent 60%), radial-gradient(90% 90% at 90% 90%, #3DD59855, transparent 60%), #0E1A2C" }}>
              <Gift className="w-10 h-10 text-gold" />
            </div>
            <div className="px-5 pb-5 pt-4 flex flex-col gap-3">
              <p className="text-[10px] uppercase tracking-wider text-text-subtle m-0">Daily game bonus</p>
              <p className="m-0 leading-none">
                <span className="text-[32px] font-bold text-gold font-mono tabular-nums">{won !== null ? `+${won.toLocaleString()}` : `+${points.toLocaleString()}`}</span>
                <span className="text-[12px] text-text ml-2">Game Points</span>
              </p>
              <p className="text-[12px] leading-relaxed text-text-muted m-0">
                {cfg.text} You have <span className="text-text font-medium">₱{capital.toLocaleString()}</span> active today.
              </p>
              {error && <p className="text-[11px] text-red m-0">{error}</p>}
              <button
                type="button"
                onClick={claim}
                disabled={busy || won !== null}
                className={cn("w-full py-3 rounded-xl text-[13px] font-bold transition flex items-center justify-center gap-2", won !== null ? "bg-green/20 text-green" : "bg-gold text-gold-dark hover:brightness-110 disabled:opacity-60")}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {won !== null ? "Added to your Game Points" : busy ? "Claiming…" : `Claim ${points.toLocaleString()} points`}
              </button>
              {won === null && (
                <button type="button" onClick={onClose} disabled={busy} className="self-center text-[11px] text-text-muted hover:text-text px-2 py-1">
                  Not now
                </button>
              )}
              <p className="text-[10px] text-text-subtle m-0 text-center">Resets at midnight · unclaimed points don&apos;t carry over</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
