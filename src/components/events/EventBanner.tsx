"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Users, Clock, ArrowRight, Dices } from "lucide-react";
import { cn, formatPHP } from "@/lib/utils";
import { useLiveEvents, eventIsLive, slotsFree, countdown, type InvestureEvent } from "@/lib/events";
import { EventBody, SlotFlow } from "./EventPopup";

/** Compact strip for the dashboard / games hub: one row per live event, opens the full card. */
export function EventBanner({ className }: { className?: string }) {
  const { events } = useLiveEvents();
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState<InvestureEvent | null>(null);
  const [slotOpen, setSlotOpen] = useState(false);
  const [pay, setPay] = useState<{ slots: number; termMonths: number; amount: number } | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const live = useMemo(() => events.filter((e) => eventIsLive(e, now)), [events, now]);
  // Keep showing the latest doc for the open event (counters move while it's open).
  const current = open ? live.find((e) => e.id === open.id) ?? open : null;
  if (live.length === 0) return null;

  return (
    <>
      <div className={cn("flex flex-col gap-2", className)}>
        {live.map((e) => {
          const isSlot = e.kind === "slot" && !!e.slot;
          const isSpin = e.kind === "spin" && !!e.spin;
          const Icon = isSlot ? Sparkles : isSpin ? Dices : Users;
          const free = isSlot ? slotsFree(e) : 0;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setOpen(e)}
              className={cn(
                "relative overflow-hidden text-left flex items-center gap-3 px-4 py-3 rounded-2xl border transition hover:brightness-110",
                isSlot ? "border-gold/40 bg-gradient-to-r from-gold/15 via-card to-card" : isSpin ? "border-[#F5C66B]/40 bg-gradient-to-r from-[#F5C66B]/15 via-card to-card" : "border-vault/40 bg-gradient-to-r from-vault/15 via-card to-card",
              )}
            >
              {e.bannerUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={e.bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
              )}
              <span className={cn("relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0", isSlot ? "bg-gold/20 text-gold" : isSpin ? "bg-[#F5C66B]/20 text-[#F5C66B]" : "bg-vault/20 text-vault")}>
                <Icon className="w-5 h-5" />
              </span>
              <span className="relative flex-1 min-w-0">
                <span className="block text-[13px] font-medium text-text truncate">{e.name}</span>
                <span className="block text-[11px] text-text-muted truncate">
                  {isSlot && e.slot
                    ? `×${e.slot.payoutMultiplier} payouts · ${formatPHP(e.slot.price, { short: true })} per slot · ${free === 0 ? "sold out" : `${free} left`}`
                    : isSpin && e.spin
                      ? `Spin the wheel · ${e.spin.freeSpinsPerDay} free spin${e.spin.freeSpinsPerDay === 1 ? "" : "s"} a day · win up to ${Math.max(...e.spin.wedges.map((w) => w.points))} GP`
                      : e.tagline || "Referral commissions boosted"}
                </span>
              </span>
              <span className="relative flex flex-col items-end gap-1 shrink-0">
                {e.endsAt && <span className="text-[10px] text-text-subtle flex items-center gap-1"><Clock className="w-3 h-3" /> {countdown(e.endsAt, now)}</span>}
                <span className={cn("text-[11px] font-semibold flex items-center gap-1", isSlot ? "text-gold" : isSpin ? "text-[#F5C66B]" : "text-vault")}>{isSpin ? "Spin" : "View"} <ArrowRight className="w-3 h-3" /></span>
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {current && !slotOpen && !pay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setOpen(null)}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              onClick={(ev) => ev.stopPropagation()}
              className={cn("w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-3xl bg-card border shadow-2xl", current.kind === "slot" ? "border-gold/40" : current.kind === "spin" ? "border-[#F5C66B]/40" : "border-vault/40")}
            >
              <EventBody event={current} now={now} onDismiss={() => setOpen(null)} onGetSlots={() => setSlotOpen(true)} compact />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {current?.kind === "slot" && current.slot && (
        <SlotFlow
          event={current}
          slotOpen={slotOpen}
          onSlotClose={() => { setSlotOpen(false); setOpen(null); }}
          pay={pay}
          setPay={setPay}
          onAllDone={() => { setPay(null); setSlotOpen(false); setOpen(null); }}
        />
      )}
    </>
  );
}
