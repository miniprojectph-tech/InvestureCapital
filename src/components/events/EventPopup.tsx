"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X, Clock, Sparkles, ArrowRight, Users } from "lucide-react";
import { cn, formatPHP } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { useUserState } from "@/lib/useUserState";
import { useCompPlan } from "@/lib/compplan";
import { uploadReceipt } from "@/lib/storage";
import { PAYMENT_METHOD_LABELS, type PaymentMethodId } from "@/lib/settings";
import { ActivatePlanModal, type PaymentSubmission } from "@/components/ActivatePlanModal";
import {
  useLiveEvents,
  useMyEventSlots,
  eventIsLive,
  slotsFree,
  shouldShowPopup,
  markPopupSeen,
  countdown,
  formatEventDate,
  claimEventSlots,
  type InvestureEvent,
} from "@/lib/events";
import { EventSlotModal } from "./EventSlotModal";

/**
 * The "ad" members see after signing in while an event is live: banner,
 * mechanics, live counters and the call to action. One event per session
 * unless its frequency says otherwise; skipped inside the full-screen games.
 */
export function EventPopup() {
  const pathname = usePathname();
  const { events } = useLiveEvents();
  const [now, setNow] = useState(() => Date.now());
  const [current, setCurrent] = useState<InvestureEvent | null>(null);
  const shown = useRef(new Set<string>());
  const [slotOpen, setSlotOpen] = useState(false);
  const [pay, setPay] = useState<{ slots: number; termMonths: number; amount: number } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const live = useMemo(() => events.filter((e) => eventIsLive(e, now)), [events, now]);
  const inGame = pathname.startsWith("/tongits") || pathname.startsWith("/color-game") || pathname.startsWith("/play");

  // Pick the first live event this device hasn't seen (per its frequency).
  useEffect(() => {
    if (current || inGame) return;
    const next = live.find((e) => shouldShowPopup(e, shown.current));
    if (next) {
      shown.current.add(next.id);
      setCurrent(next);
    }
  }, [live, current, inGame]);

  function dismiss(forever = false) {
    if (current) markPopupSeen(current, forever);
    setCurrent(null);
  }

  return (
    <>
      <AnimatePresence>
        {current && !slotOpen && !pay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => dismiss()}
          >
            <motion.div
              initial={{ y: 24, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-3xl bg-card border shadow-2xl",
                current.kind === "slot" ? "border-gold/40" : "border-vault/40",
              )}
            >
              <EventBody
                event={current}
                now={now}
                onDismiss={dismiss}
                onGetSlots={() => setSlotOpen(true)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {current?.kind === "slot" && current.slot && (
        <SlotFlow
          event={current}
          slotOpen={slotOpen}
          onSlotClose={() => {
            setSlotOpen(false);
            dismiss();
          }}
          pay={pay}
          setPay={setPay}
          onAllDone={() => {
            setPay(null);
            setSlotOpen(false);
            dismiss();
          }}
        />
      )}
    </>
  );
}

/** The card itself — also used by the dashboard event card and the admin preview. */
export function EventBody({
  event,
  now,
  onDismiss,
  onGetSlots,
  compact,
}: {
  event: InvestureEvent;
  now: number;
  onDismiss?: (forever?: boolean) => void;
  onGetSlots?: () => void;
  compact?: boolean;
}) {
  const { cfg } = useCompPlan();
  const { state } = useUserState();
  const mine = useMyEventSlots(event.kind === "slot" ? event.id : null);
  const isSlot = event.kind === "slot" && !!event.slot;
  const s = event.slot;
  const accent = isSlot ? "#3DD598" : "#A78BFA";
  const free = isSlot ? slotsFree(event) : 0;
  const ends = event.endsAt ? countdown(event.endsAt, now) : null;
  const link = state?.referralCode ? `${typeof window !== "undefined" ? window.location.origin : ""}/register?ref=${state.referralCode}` : null;
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col">
      {/* banner */}
      <div className="relative h-40 sm:h-44 overflow-hidden rounded-t-3xl bg-canvas">
        {event.bannerUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={event.bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: `radial-gradient(120% 90% at 20% 10%, ${accent}66, transparent 60%), radial-gradient(90% 90% at 90% 90%, #4F8EF755, transparent 60%), #0E1A2C` }} />
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-card" />
        <span className="absolute top-3 left-3 text-[10px] font-bold tracking-[0.1em] uppercase px-2.5 py-1 rounded-full" style={{ background: accent, color: "#052418" }}>
          {isSlot ? "Limited event" : "Referral event"}
        </span>
        {ends && (
          <span className="absolute top-3 right-3 text-[10px] px-2.5 py-1 rounded-full bg-black/60 text-text flex items-center gap-1">
            <Clock className="w-3 h-3" /> Ends in {ends}
          </span>
        )}
        {onDismiss && (
          <button onClick={() => onDismiss()} aria-label="Close" className="absolute top-3 right-3 translate-y-8 w-7 h-7 rounded-full bg-black/60 text-text flex items-center justify-center hover:bg-black/80">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="px-5 pb-5 -mt-2 flex flex-col gap-3">
        <div>
          <h2 className="font-display text-[22px] leading-tight m-0 text-text">{event.name}</h2>
          {event.tagline && <p className="text-[12px] text-text-muted m-0 mt-1">{event.tagline}</p>}
        </div>

        {isSlot && s && (
          <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-xl bg-canvas border border-border">
            <div className="flex justify-between text-[11px]">
              <span className="text-text-muted">Slots left</span>
              <span className="font-mono"><span className="text-gold font-semibold">{free}</span> of {s.totalSlots}{s.reserved > 0 && <span className="text-text-subtle"> · {s.reserved} reserved</span>}</span>
            </div>
            <div className="h-1.5 rounded-full bg-border overflow-hidden flex">
              <span className="bg-gold" style={{ width: `${(s.taken / s.totalSlots) * 100}%` }} />
              <span className="bg-gold/40" style={{ width: `${(s.reserved / s.totalSlots) * 100}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-text-subtle">
              <span>{formatPHP(s.price, { short: true })} per slot · max {s.maxPerMember} per member</span>
              <span>You hold {mine.held} of {s.maxPerMember}</span>
            </div>
          </div>
        )}

        {!isSlot && event.referral && (
          <div className="grid grid-cols-6 gap-1.5">
            {event.referral.levelMultipliers.map((m, i) => {
              const base = cfg.referralLevels[i] ?? 0;
              const on = m > 1;
              return (
                <div key={i} className={cn("flex flex-col items-center gap-0.5 py-2 rounded-lg border", on ? "bg-vault/15 border-vault/40" : "bg-canvas border-border")}>
                  <span className="text-[9px] text-text-muted">L{i + 1}</span>
                  <span className={cn("font-mono text-[13px] font-bold", on ? "text-vault" : "text-text-muted")}>×{m}</span>
                  <span className="text-[9px] text-text-subtle">{Math.round(base * m * 100) / 100}%</span>
                </div>
              );
            })}
          </div>
        )}

        {event.mechanics.length > 0 && (
          <ul className="m-0 pl-4 text-[11.5px] text-text-muted leading-relaxed flex flex-col gap-0.5">
            {event.mechanics.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        )}
        {event.terms.length > 0 && (
          <p className="text-[10px] text-text-subtle m-0">Terms: {event.terms.map((t) => `${t} mo`).join(", ")}{event.endsAt ? ` · until ${formatEventDate(event.endsAt)}` : ""}</p>
        )}

        {isSlot && s ? (
          <button
            type="button"
            onClick={onGetSlots}
            disabled={free === 0 || mine.held >= s.maxPerMember}
            className="w-full py-3 rounded-xl text-[13px] font-bold bg-gold text-gold-dark hover:brightness-110 transition flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <Sparkles className="w-4 h-4" />
            {free === 0 ? "Sold out" : mine.held >= s.maxPerMember ? `You hold the max (${s.maxPerMember})` : mine.held > 0 ? "Get more slots" : "Get slots"}
            {free > 0 && mine.held < s.maxPerMember && <ArrowRight className="w-4 h-4" />}
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            {link && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-canvas border border-dashed border-border-strong">
                <span className="flex-1 font-mono text-[11px] text-text-muted truncate">{link}</span>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }); }}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-vault/15 text-vault"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
            <Link href="/referrals" onClick={() => onDismiss?.()} className="w-full py-3 rounded-xl text-[13px] font-bold bg-vault text-vault-dark hover:brightness-110 transition flex items-center justify-center gap-2">
              <Users className="w-4 h-4" /> Share my referral link
            </Link>
          </div>
        )}

        {onDismiss && !compact && (
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[10px] text-text-subtle">
              <input type="checkbox" onChange={(e) => { if (e.target.checked) onDismiss(true); }} /> Don&apos;t show again
            </label>
            <button type="button" onClick={() => onDismiss()} className="text-[11px] text-text-muted hover:text-text px-2 py-1">Maybe later</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Slot purchase: the picker, then either an instant wallet claim or the payment-proof modal. */
export function SlotFlow({
  event,
  slotOpen,
  onSlotClose,
  pay,
  setPay,
  onAllDone,
}: {
  event: InvestureEvent;
  slotOpen: boolean;
  onSlotClose: () => void;
  pay: { slots: number; termMonths: number; amount: number } | null;
  setPay: (p: { slots: number; termMonths: number; amount: number } | null) => void;
  onAllDone: () => void;
}) {
  const { user, demoMode } = useAuth();

  async function submitPayment(p: PaymentSubmission) {
    if (demoMode || !user || !pay) throw new Error("Sign in to join the event.");
    const { storage } = getFirebase();
    let receiptUrl: string | undefined;
    let receiptPath: string | undefined;
    if (p.receiptFile && storage) {
      const up = await uploadReceipt(storage, user.uid, p.receiptFile);
      receiptUrl = up.url;
      receiptPath = up.path;
    }
    await claimEventSlots({
      eventId: event.id,
      slots: pay.slots,
      termMonths: pay.termMonths,
      method: "request",
      paymentMethod: p.method,
      paymentMethodLabel: PAYMENT_METHOD_LABELS[p.method as PaymentMethodId],
      referenceNumber: p.referenceNumber,
      receiptUrl,
      receiptPath,
    });
  }

  return (
    <>
      <EventSlotModal
        event={event}
        open={slotOpen && !pay}
        onClose={onSlotClose}
        onSendPayment={(slots, termMonths, amount) => setPay({ slots, termMonths, amount })}
      />
      <ActivatePlanModal
        open={!!pay}
        onClose={onAllDone}
        title={`${event.name} — ${pay?.slots ?? 0} slot${pay?.slots === 1 ? "" : "s"}`}
        amount={pay?.amount ?? 0}
        summary={
          pay ? (
            <p className="text-[11px] text-text-muted m-0">
              {pay.slots} slot{pay.slots === 1 ? "" : "s"} · {pay.termMonths}-month term · ×{event.slot?.payoutMultiplier} payouts. Your slots are held for {event.slot?.holdHours} h while the admin verifies this payment.
            </p>
          ) : undefined
        }
        successText={`Your ${pay?.slots ?? 0} slot${pay?.slots === 1 ? " is" : "s are"} reserved. Once the admin verifies the payment, the placement starts with ×${event.slot?.payoutMultiplier} payouts.`}
        onSubmit={submitPayment}
      />
    </>
  );
}
