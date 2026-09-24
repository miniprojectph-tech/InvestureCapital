"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Clock, Loader2, AlertCircle, Wallet, Send } from "lucide-react";
import { Modal } from "@/components/Modal";
import { formatPHP, cn } from "@/lib/utils";
import { useUserState } from "@/lib/useUserState";
import { useCompPlan, cyclesForTerm } from "@/lib/compplan";
import { claimEventSlots, useMyEventSlots, slotsFree, eventAllowsTerm, type InvestureEvent } from "@/lib/events";

type Props = {
  event: InvestureEvent;
  open: boolean;
  onClose: () => void;
  /** Hand off to the payment-proof flow (ActivatePlanModal) with the chosen slots/term. */
  onSendPayment: (slots: number, termMonths: number, amount: number) => void;
};

type Stage = "form" | "processing" | "done" | "error";

/** Pick how many slots and which term, then pay from the wallet or send a payment. */
export function EventSlotModal({ event, open, onClose, onSendPayment }: Props) {
  const { state } = useUserState();
  const { cfg } = useCompPlan();
  const mine = useMyEventSlots(open ? event.id : null);
  const slot = event.slot!;
  const terms = cfg.terms.filter((t) => eventAllowsTerm(event, t.months));
  const [slots, setSlots] = useState(1);
  const [months, setMonths] = useState<number>(terms[0]?.months ?? cfg.terms[0]?.months ?? 1);
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ placementId: string } | null>(null);

  const free = slotsFree(event);
  const canTake = Math.max(0, Math.min(slot.maxPerMember - mine.held, free));
  const amount = slots * slot.price;
  const wallet = state?.balances.wallet ?? 0;
  const term = cfg.terms.find((t) => t.months === months) ?? cfg.terms[0];
  const cycles = term ? cyclesForTerm(cfg, term.months) : 0;
  const perCycle = Math.round((amount * cfg.cycleRate) / 100 * slot.payoutMultiplier * 100) / 100;
  const normalPerCycle = (amount * cfg.cycleRate) / 100;

  useEffect(() => {
    if (open) {
      setStage("form");
      setError(null);
      setResult(null);
    }
  }, [open]);
  useEffect(() => {
    if (canTake > 0 && slots > canTake) setSlots(canTake);
  }, [canTake, slots]);

  const options = useMemo(() => Array.from({ length: Math.max(1, slot.maxPerMember) }, (_, i) => i + 1), [slot.maxPerMember]);

  async function payFromWallet() {
    setStage("processing");
    setError(null);
    try {
      const r = await claimEventSlots({ eventId: event.id, slots, termMonths: months, method: "wallet" });
      if (r.status === "active") setResult({ placementId: r.placementId });
      setStage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not take the slots");
      setStage("error");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={event.name}>
      {stage === "form" && (
        <div className="flex flex-col gap-4">
          <p className="text-[12px] text-text-muted m-0">
            Every slot pays <span className="text-gold font-medium">×{slot.payoutMultiplier}</span> — {formatPHP(slot.price * cfg.cycleRate / 100 * slot.payoutMultiplier)} instead of{" "}
            {formatPHP(slot.price * cfg.cycleRate / 100)} every {cfg.cycleDays} days per {formatPHP(slot.price, { short: true })} slot, for the whole term.
          </p>

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="text-[10px] text-text-muted uppercase tracking-wider">How many slots</label>
              <span className="text-[10px] text-text-subtle">
                {free} left · you hold {mine.held} of {slot.maxPerMember}
              </span>
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 4)}, minmax(0, 1fr))` }}>
              {options.map((n) => {
                const ok = n <= canTake;
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={!ok}
                    onClick={() => setSlots(n)}
                    className={cn(
                      "flex flex-col items-center gap-0.5 py-2.5 rounded-xl border text-[11px] transition",
                      slots === n && ok ? "bg-gold/15 border-gold/50 text-gold" : "bg-canvas border-border text-text-muted",
                      !ok && "opacity-40 cursor-not-allowed",
                    )}
                  >
                    <span className="text-[16px] font-semibold">{n}</span>
                    <span className="text-[10px]">{formatPHP(n * slot.price, { short: true })}</span>
                  </button>
                );
              })}
            </div>
            {canTake === 0 && (
              <p className="text-[11px] text-red m-0 mt-1.5">
                {free === 0 ? "Sold out — no slots left." : `You already hold the maximum of ${slot.maxPerMember}.`}
              </p>
            )}
          </div>

          {terms.length > 1 && (
            <div>
              <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Term</label>
              <div className="flex gap-2">
                {terms.map((t) => (
                  <button
                    key={t.months}
                    type="button"
                    onClick={() => setMonths(t.months)}
                    className={cn(
                      "flex-1 py-2 rounded-lg border text-[11px] transition",
                      months === t.months ? "bg-gold/15 border-gold/50 text-gold font-medium" : "bg-canvas border-border text-text-muted",
                    )}
                  >
                    {t.months} mo{t.lockedBonusPerUnit > 0 ? " · bonus" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-canvas/60 rounded-lg p-3 border border-border text-[11px] flex flex-col gap-1">
            <div className="flex justify-between"><span className="text-text-muted">{slots} slot{slots === 1 ? "" : "s"} · {months}-month term</span><span className="font-mono">{formatPHP(amount)}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Every {cfg.cycleDays} days</span><span className="font-mono text-gold">{formatPHP(perCycle)} <span className="text-text-subtle line-through">{formatPHP(normalPerCycle)}</span></span></div>
            <div className="flex justify-between"><span className="text-text-muted">{cycles} payouts + capital back</span><span className="font-mono">{formatPHP(perCycle * cycles + amount)}</span></div>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={payFromWallet}
              disabled={canTake === 0 || wallet < amount}
              className="w-full py-2.5 rounded-lg text-[12px] font-semibold bg-gold text-gold-dark hover:brightness-110 transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Wallet className="w-4 h-4" /> Pay from wallet · {formatPHP(wallet, { short: true })} available
            </button>
            <button
              type="button"
              onClick={() => onSendPayment(slots, months, amount)}
              disabled={canTake === 0}
              className="w-full py-2.5 rounded-lg text-[12px] font-semibold border border-gold/50 text-gold bg-gold/10 hover:bg-gold/15 transition flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Send className="w-4 h-4" /> Send payment — slots held {slot.holdHours} h <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <p className="text-[10px] text-text-subtle m-0 text-center">
              Wallet is instant. A sent payment reserves your slots while the admin verifies it.
            </p>
          </div>
        </div>
      )}

      {stage === "processing" && (
        <div className="py-8 flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 text-gold animate-spin" />
          <p className="text-[12px] text-text-muted m-0">Taking your slots…</p>
        </div>
      )}

      {stage === "done" && (
        <div className="py-6 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green/15 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-green" />
          </div>
          <div>
            <p className="text-[14px] font-medium m-0">{slots} slot{slots === 1 ? "" : "s"} are yours</p>
            <p className="text-[11px] text-text-muted mt-1 m-0">
              {result?.placementId ? `${result.placementId} · ` : ""}{formatPHP(perCycle)} every {cfg.cycleDays} days for {cycles} payouts, then your {formatPHP(amount)} comes back.
            </p>
          </div>
          <button onClick={onClose} className="mt-2 px-5 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium">Done</button>
        </div>
      )}

      {stage === "error" && (
        <div className="py-6 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red/15 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red" />
          </div>
          <div>
            <p className="text-[14px] font-medium m-0">Couldn&apos;t take the slots</p>
            <p className="text-[11px] text-text-muted mt-1 m-0">{error}</p>
          </div>
          <button onClick={() => setStage("form")} className="mt-2 px-5 py-2 bg-card-elev border border-border-strong rounded-lg text-[12px]">Back</button>
        </div>
      )}

      {stage === "form" && mine.reserved > 0 && (
        <p className="text-[10px] text-text-subtle m-0 mt-3 flex items-center gap-1">
          <Clock className="w-3 h-3" /> {mine.reserved} slot{mine.reserved === 1 ? "" : "s"} reserved, waiting for your payment to be verified.
        </p>
      )}
    </Modal>
  );
}
