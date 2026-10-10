"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Gift, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { slotDayStart, type DayState } from "@/lib/slot";

/**
 * Games Central: today's Dragon Spire free spins, shown each time the member
 * opens the hub until the day is claimed (opening the game also claims it).
 * Claiming asks the server to start the day, then hands off to the game.
 */
export function DailySpinsPopup({
  spins,
  capital,
  text,
  open,
  onClose,
  onClaimed,
}: {
  spins: number;
  capital: number;
  text: string;
  open: boolean;
  onClose: () => void;
  onClaimed: (day: DayState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const day = await slotDayStart();
      onClaimed(day);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not start your spins right now. Please try again.");
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
          aria-label="Daily free spins"
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
              <p className="text-[10px] uppercase tracking-wider text-text-subtle m-0">Daily free spins</p>
              <p className="m-0 leading-none">
                <span className="text-[32px] font-bold text-gold font-mono tabular-nums">{spins}</span>
                <span className="text-[12px] text-text ml-2">free spin{spins === 1 ? "" : "s"} today</span>
              </p>
              <p className="text-[12px] leading-relaxed text-text-muted m-0">
                {text} You have <span className="text-text font-medium">₱{capital.toLocaleString()}</span> active today.
              </p>
              {error && <p className="text-[11px] text-red m-0">{error}</p>}
              <button
                type="button"
                onClick={claim}
                disabled={busy}
                className={cn("w-full py-3 rounded-xl text-[13px] font-bold transition flex items-center justify-center gap-2 bg-gold text-gold-dark hover:brightness-110 disabled:opacity-60")}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {busy ? "Starting your spins…" : <>Claim {spins} free spin{spins === 1 ? "" : "s"} <ArrowRight className="w-4 h-4" /></>}
              </button>
              <button type="button" onClick={onClose} disabled={busy} className="self-center text-[11px] text-text-muted hover:text-text px-2 py-1">
                Not now
              </button>
              <p className="text-[10px] text-text-subtle m-0 text-center">Resets at midnight · unused spins don&apos;t carry over</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
