"use client";

import { useEffect, useState } from "react";
import { Loader2, Ban, AlertTriangle, Check } from "lucide-react";
import { Modal } from "@/components/Modal";
import { cn } from "@/lib/utils";
import { adminCancelPlacement, peso, type CancelPlacementLine, type CancelPlacementOptions, type CancelPlacementResult, type Placement } from "@/lib/compplan";

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
const WARN = "text-[#F5A524]";
/** "−₱250", not "₱-250". */
const money = (n: number) => (n < 0 ? `−${peso(-n)}` : peso(n));

export type CancelTarget = { userId: string; userName: string; placement: Placement; similarTo?: string };

/**
 * Admin › Investors › Plans: cancel one ACTIVE placement (e.g. the same payment
 * approved twice) and take back everything it paid. The amounts come from a
 * server preview that runs the same code as the cancellation itself.
 */
export function CancelPlacementModal({ target, onClose, onDone }: { target: CancelTarget | null; onClose: () => void; onDone: (message: string) => void }) {
  return (
    <Modal open={!!target} onClose={onClose} title={target ? `Cancel placement ${target.placement.id}` : "Cancel placement"} maxWidth="max-w-lg">
      {target && <CancelForm key={target.placement.id} target={target} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

/** Mirrors the server: with "available", a debit stops at what is in the wallet. */
function applyShortfall(l: CancelPlacementLine, shortfall: CancelPlacementOptions["shortfall"]) {
  const change = l.due >= 0 || shortfall === "full" ? l.due : -Math.min(-l.due, Math.max(0, l.wallet));
  return { change, writtenOff: change - l.due };
}

/** The form. `call` is the server action; replaceable only so the layout can be checked with sample numbers. */
export function CancelForm({ target, onClose, onDone, call = adminCancelPlacement }: { target: CancelTarget; onClose: () => void; onDone: (message: string) => void; call?: typeof adminCancelPlacement }) {
  const p = target.placement;
  const [preview, setPreview] = useState<CancelPlacementResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [opts, setOpts] = useState<CancelPlacementOptions>({ history: "remove", shortfall: "full", notifyMember: true, notifyUplines: false });
  const [reason, setReason] = useState(target.similarTo ? `Approved twice, same payment as ${target.similarTo}` : "");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    call({ userId: target.userId, placementId: p.id })
      .then((r) => { if (!cancelled) setPreview(r); })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not work out the amounts."); });
    return () => { cancelled = true; };
  }, [target.userId, p.id, call]);

  const lines = (preview?.lines ?? []).map((l) => ({ ...l, ...applyShortfall(l, opts.shortfall) }));
  const takenBack = lines.reduce((s, l) => s + Math.min(0, l.change), 0);
  const returned = lines.reduce((s, l) => s + Math.max(0, l.change), 0);
  const writtenOff = lines.reduce((s, l) => s + l.writtenOff, 0);
  const uplines = lines.filter((l) => l.role !== "member").length;
  const ready = !!preview && reason.trim().length >= 3 && typed.trim().toUpperCase() === p.id;

  async function submit() {
    if (!ready) return;
    setBusy(true); setError(null);
    try {
      const r = await call({ userId: target.userId, placementId: p.id, confirm: true, confirmId: typed.trim().toUpperCase(), reason: reason.trim(), ...opts });
      const people = r.lines.filter((l) => l.change < 0).length;
      onDone(
        `${p.id} cancelled for ${target.userName}. ${r.takenBack < 0 ? `${peso(-r.takenBack)} taken back from ${people} ${people === 1 ? "person" : "people"}` : "Nothing had been paid yet"}` +
          `${r.returned > 0 ? `, ${peso(r.returned)} returned to the wallet` : ""}${r.writtenOff > 0 ? `, ${peso(r.writtenOff)} written off` : ""}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not cancel the placement.");
    } finally { setBusy(false); }
  }

  const req = preview?.request;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-text-muted m-0">
        {target.userName} · {peso(p.capital)} · {p.termMonths} months · started {fmtDate(p.startedAt)} · {p.cyclesPaid} of {p.cycles} payouts
        {req ? <> · request of {fmtDate(req.createdAt)}{req.method ? ` (${req.method}${req.reference ? ` ref ${req.reference}` : ""})` : ""}</> : p.source === "wallet" ? " · reinvested from the wallet" : " · activated by hand"}
      </p>
      {target.similarTo && (
        <p className={cn("text-[11px] m-0 flex items-start gap-1.5", WARN)}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Same amount and start day as {target.similarTo}. Check that this is the extra one before you continue.
        </p>
      )}

      {loadError ? (
        <p className="text-[12px] text-red m-0">{loadError}</p>
      ) : !preview ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 text-gold animate-spin" /></div>
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-canvas text-[12px]">
              <span className="text-text">Taken back</span>
              <span className="font-mono text-red">{takenBack < 0 ? `−${peso(-takenBack)}` : peso(0)}</span>
            </div>
            {lines.map((l) => (
              <div key={l.uid} className="flex items-center justify-between gap-3 px-3 py-2 border-t border-border text-[12px]">
                <div className="min-w-0">
                  <p className="m-0 truncate">{l.role === "member" ? target.userName : l.name} <span className="text-text-subtle text-[10px]">· {l.role === "member" ? (p.source === "wallet" ? "capital back, payouts taken back" : `${p.cyclesPaid} payout${p.cyclesPaid === 1 ? "" : "s"} already credited`) : l.role}</span></p>
                  {l.due < 0 && l.wallet < -l.due && (
                    <p className={cn("text-[10px] m-0", WARN)}>
                      Wallet {money(l.wallet)}.{" "}
                      {opts.shortfall === "full" ? `It goes to ${money(l.wallet + l.change)} until new earnings cover it.` : `${peso(l.writtenOff)} will be written off.`}
                    </p>
                  )}
                </div>
                <span className={cn("font-mono shrink-0", l.change < 0 ? "text-red" : l.change > 0 ? "text-green" : "text-text-subtle")}>
                  {l.change < 0 ? `−${peso(-l.change)}` : l.change > 0 ? `+${peso(l.change)}` : peso(0)}
                </span>
              </div>
            ))}
            {uplines === 0 && <p className="px-3 py-2 border-t border-border text-[11px] text-text-subtle m-0">No commissions or Fast-Start Bonus were paid from this plan.</p>}
          </div>
          {(returned > 0 || writtenOff > 0) && (
            <p className="text-[11px] text-text-muted m-0">
              {returned > 0 && <>The {peso(returned)} it took from the wallet goes back. </>}
              {writtenOff > 0 && <>{peso(writtenOff)} is written off and noted in the admin log.</>}
            </p>
          )}
          <p className="text-[11px] text-text-subtle m-0">
            Also: the plan is removed and stops paying, with no capital, Locked-In Bonus or Leadership Bonus at the end.{req ? " The request is marked Cancelled." : ""} The Masterlist updates{p.event ? ` and the ${p.event.name} slots are returned` : ""}.
            {!req && p.source !== "wallet" ? " If the member paid you for it, refund them outside the app." : ""}
          </p>

          <Choice
            label="Member's history"
            value={opts.history}
            onChange={(history) => setOpts({ ...opts, history })}
            options={[
              ["remove", "Remove it, as if it never happened", `The plan, its payouts and the commissions disappear from everyone's history (${preview.historyRows} line${preview.historyRows === 1 ? "" : "s"}). Balances change by the amounts above.`],
              ["reverse", "Keep it and show a \"Placement reversed\" line", "Old lines stay. Each person gets one \"Placement reversed\" line, like a wallet adjustment."],
            ]}
          />
          {lines.some((l) => l.due < 0 && l.wallet < -l.due) && (
            <Choice
              label="Not enough in a wallet"
              value={opts.shortfall}
              onChange={(shortfall) => setOpts({ ...opts, shortfall })}
              options={[
                ["full", "Take the full amount, the balance may go below zero", "A negative balance can't be withdrawn and is paid back from new earnings first."],
                ["available", "Take only what is there", "The rest is written off."],
              ]}
            />
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-text-muted">Tell them</span>
            <Tick on={opts.notifyMember} onToggle={() => setOpts({ ...opts, notifyMember: !opts.notifyMember })}>Bell notice to {target.userName}</Tick>
            {uplines > 0 && <Tick on={opts.notifyUplines} onToggle={() => setOpts({ ...opts, notifyUplines: !opts.notifyUplines })}>Bell notice to the {uplines} upline{uplines === 1 ? "" : "s"}</Tick>}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-text-muted">Reason (only admins see it)</span>
            <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Approved twice, same payment as IC-…" className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-red/50" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-text-muted">Type <span className="font-mono text-text">{p.id}</span> to confirm. This can&apos;t be undone.</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} placeholder={p.id} className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] font-mono text-text outline-none focus:border-red/50" />
          </label>
        </>
      )}

      {error && <p className="text-[11px] text-red m-0">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} disabled={busy} className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted">Keep plan</button>
        <button type="button" onClick={submit} disabled={busy || !ready} className="flex-1 py-2.5 rounded-lg bg-red/15 border border-red/40 text-red text-[12px] font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />} Cancel placement
        </button>
      </div>
      <p className="text-[10px] text-text-subtle m-0">Saved to the admin audit with your name, the amounts and the reason.</p>
    </div>
  );
}

function Choice<V extends string>({ label, value, onChange, options }: { label: string; value: V; onChange: (v: V) => void; options: [V, string, string][] }) {
  return (
    <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={label}>
      <span className="text-[11px] text-text-muted">{label}</span>
      {options.map(([v, title, sub]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cn("text-left flex items-start gap-2 px-3 py-2 rounded-lg border transition", value === v ? "border-green bg-green/5" : "border-border hover:bg-card-elev")}>
          <span className={cn("w-3.5 h-3.5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center", value === v ? "border-green" : "border-border-strong")}>
            {value === v && <span className="w-1.5 h-1.5 rounded-full bg-green" />}
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] text-text">{title}</span>
            <span className="block text-[10px] text-text-subtle">{sub}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function Tick({ on, onToggle, children }: { on: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={on} className="flex items-center gap-2 text-[12px] text-text text-left">
      <span className={cn("w-3.5 h-3.5 rounded border-2 shrink-0 flex items-center justify-center", on ? "border-green bg-green" : "border-border-strong")}>{on && <Check className="w-2.5 h-2.5 text-canvas" />}</span>
      {children}
    </button>
  );
}
