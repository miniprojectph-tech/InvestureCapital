"use client";

import { useState } from "react";
import { Loader2, CalendarPlus, Check } from "lucide-react";
import { Modal } from "@/components/Modal";
import { cn } from "@/lib/utils";
import { adminChangePlacementTerm, placementPerCycle, peso, scheduledPayoutDate, useCompPlan, type Placement } from "@/lib/compplan";

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
const GOLD = "#F5C66B";

export type TermTarget = { userId: string; userName: string; hasSponsor: boolean; placement: Placement };

/**
 * Admin › Investors › Plans: move an active plan to a LONGER term. Amount, start
 * date and payout size stay; payouts, end date and Locked-In Bonus change.
 */
export function ChangeTermModal({ target, onClose, onDone }: { target: TermTarget | null; onClose: () => void; onDone: (message: string) => void }) {
  return (
    <Modal open={!!target} onClose={onClose} title={target ? `Change term · ${target.placement.id}` : "Change term"} maxWidth="max-w-md">
      {target && <TermForm key={target.placement.id} target={target} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function Row({ label, now, after, tone }: { label: string; now: string; after: string; tone?: "green" | "gold" }) {
  return (
    <div className="grid grid-cols-[1.4fr_1fr_1fr] px-3 py-2 border-t border-border text-[12px]">
      <span className="text-text-subtle">{label}</span>
      <span className="text-text-muted font-mono">{now}</span>
      <span className={cn("font-mono", now !== after && tone === "green" && "text-green")} style={now !== after && tone === "gold" ? { color: GOLD } : undefined}>{after}</span>
    </div>
  );
}

function TermForm({ target, onClose, onDone }: { target: TermTarget; onClose: () => void; onDone: (message: string) => void }) {
  const { cfg } = useCompPlan();
  const p = target.placement;
  const longer = cfg.terms.filter((t) => t.months > p.termMonths).sort((a, b) => a.months - b.months);
  const [months, setMonths] = useState<number | null>(longer[0]?.months ?? null);
  const [notify, setNotify] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const term = cfg.terms.find((t) => t.months === months);
  const cycles = term ? Math.max(1, Math.round((term.months * cfg.monthDays) / p.cycleDays)) : p.cycles;
  const lockedBonus = term ? p.units * term.lockedBonusPerUnit : p.lockedBonus;
  const lead = (lb: number) => Math.round(((lb * cfg.leadershipPct) / 100) * 100) / 100;
  const perCycle = placementPerCycle(p);

  async function submit() {
    if (!months) return;
    setBusy(true); setError(null);
    try {
      const r = await adminChangePlacementTerm({ userId: target.userId, placementId: p.id, termMonths: months, notify, note: note.trim() || undefined });
      onDone(`${p.id} is now a ${r.termMonths}-month plan: ${r.cycles} payouts until ${fmtDate(r.endsAt)}, Locked-In Bonus ${peso(r.lockedBonus)}.${notify ? ` ${target.userName} was notified.` : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not change the term.");
    } finally { setBusy(false); }
  }

  if (longer.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[12px] text-text-muted m-0">{p.id} is already on the longest term ({p.termMonths} months). There&apos;s no longer term to move it to.</p>
        <button type="button" onClick={onClose} className="py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted">Close</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-text-muted m-0">Amount stays {peso(p.capital)}. Start date stays {fmtDate(p.startedAt)}. Plans can only move to a longer term.</p>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">New term</span>
        <div className="flex gap-1.5">
          <div className="flex-1 text-center px-2 py-2 rounded-lg border border-border text-text-subtle text-[12px]">{p.termMonths} months<span className="block text-[9px]">current</span></div>
          {longer.map((t) => (
            <button key={t.months} type="button" onClick={() => setMonths(t.months)} aria-pressed={months === t.months}
              className={cn("flex-1 text-center px-2 py-2 rounded-lg border text-[12px] transition", months === t.months ? "border-green bg-green/10 text-green font-medium" : "border-border text-text-muted hover:text-text hover:bg-card-elev")}>
              {t.months} months
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1fr_1fr] px-3 py-1.5 bg-canvas text-[10px] text-text-subtle"><span /><span>Now</span><span>After</span></div>
        <Row label="Payouts" now={String(p.cycles)} after={String(cycles)} tone="green" />
        <Row label="Each payout" now={peso(perCycle)} after={peso(perCycle)} />
        <Row label="Ends" now={fmtDate(scheduledPayoutDate(p, p.cycles))} after={fmtDate(scheduledPayoutDate(p, cycles))} tone="green" />
        <Row label="Locked-In Bonus" now={peso(p.lockedBonus)} after={peso(lockedBonus)} tone="gold" />
        {target.hasSponsor && cfg.leadershipPct > 0 && <Row label="Sponsor's Leadership" now={peso(lead(p.lockedBonus))} after={peso(lead(lockedBonus))} tone="gold" />}
        <div className="grid grid-cols-[1.4fr_2fr] px-3 py-2 border-t border-border text-[12px]">
          <span className="text-text-subtle">Referral commissions</span>
          <span className="text-text-subtle">No change, already paid</span>
        </div>
      </div>

      <p className="text-[11px] text-text-muted m-0 flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-green" /> {p.cyclesPaid} payout{p.cyclesPaid === 1 ? "" : "s"} already paid stay as they are. Their history is updated to the new term.</p>

      <button type="button" onClick={() => setNotify((v) => !v)} aria-pressed={notify} className="flex items-center gap-2 text-[12px] text-text text-left">
        <span className={cn("w-3.5 h-3.5 rounded border-2 shrink-0 flex items-center justify-center", notify ? "border-green bg-green" : "border-border-strong")}>{notify && <Check className="w-2.5 h-2.5 text-canvas" />}</span>
        Tell the member (bell notice)
      </button>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">Note (only admins see it)</span>
        <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. member asked to switch to 6 months" className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-green/50" />
      </label>

      {error && <p className="text-[11px] text-red m-0">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} disabled={busy} className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted">Cancel</button>
        <button type="button" onClick={submit} disabled={busy || !months} className="flex-1 py-2.5 rounded-lg bg-green text-canvas text-[12px] font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarPlus className="w-3.5 h-3.5" />} Change to {months} months
        </button>
      </div>
      <p className="text-[10px] text-text-subtle m-0">Saved to the admin audit with your name and note.</p>
    </div>
  );
}
