"use client";

import { useEffect, useState, type FormEvent } from "react";
import { httpsCallable } from "firebase/functions";
import { X, Loader2, AlertCircle, AlertTriangle, Trash2 } from "lucide-react";
import { formatPHP } from "@/lib/utils";
import { getFirebase } from "@/lib/firebase";

type Outstanding = {
  wallet: number;
  activePlacements: number;
  activeCapital: number;
  referralEarnings: number;
  pendingWithdrawals: number;
  pendingWithdrawalAmount: number;
  pendingPlacementRequests: number;
};
type Result = { ok: boolean; deleted: boolean; member: { uid: string; name: string; email: string }; outstanding: Outstanding; hasOutstanding: boolean };
type Args = { uid: string; check?: boolean; confirm?: string; force?: boolean };

function call(args: Args): Promise<Result> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not available right now.");
  return httpsCallable<Args, Result>(functions, "adminDeleteMember")(args).then((r) => r.data);
}

const clean = (e: unknown) => (e instanceof Error ? e.message.replace(/^[A-Z_]+:\s*/, "") : "Something went wrong.");

/** Admin › Investors: delete one member, after showing what they still have. */
export function DeleteMemberModal({ member, onClose, onDeleted }: { member: { uid: string; name: string; email: string } | null; onClose: () => void; onDeleted: (name: string) => void }) {
  const [info, setInfo] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [typed, setTyped] = useState("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!member) return;
    let cancelled = false;
    setInfo(null); setTyped(""); setForce(false); setError(null); setLoading(true);
    call({ uid: member.uid, check: true })
      .then((r) => { if (!cancelled) setInfo(r); })
      .catch((e) => { if (!cancelled) setError(clean(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [member]);

  if (!member) return null;
  const o = info?.outstanding;
  const items = o
    ? [
        o.wallet >= 0.01 && `${formatPHP(o.wallet)} in the wallet`,
        o.activePlacements > 0 && `${o.activePlacements} active placement${o.activePlacements === 1 ? "" : "s"} (${formatPHP(o.activeCapital, { short: true })} capital)`,
        o.referralEarnings >= 0.01 && `${formatPHP(o.referralEarnings)} in referral earnings`,
        o.pendingWithdrawals > 0 && `${o.pendingWithdrawals} pending withdrawal${o.pendingWithdrawals === 1 ? "" : "s"} (${formatPHP(o.pendingWithdrawalAmount)}), will be closed as rejected`,
        o.pendingPlacementRequests > 0 && `${o.pendingPlacementRequests} pending placement request${o.pendingPlacementRequests === 1 ? "" : "s"}, will be closed as rejected`,
      ].filter((x): x is string => !!x)
    : [];
  const canSubmit = !!info && typed.trim().toUpperCase() === "DELETE" && (!info.hasOutstanding || force) && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !member) return;
    setBusy(true);
    setError(null);
    try {
      await call({ uid: member.uid, confirm: "DELETE", force });
      onDeleted(member.name);
    } catch (err) {
      setError(clean(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-label="Delete member">
      <form onSubmit={submit} className="w-full max-w-[440px] bg-card border border-border-strong rounded-2xl p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red/15 flex items-center justify-center"><Trash2 className="w-4 h-4 text-red" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-medium m-0 truncate">Delete {member.name}</p>
            <p className="text-[10px] text-text-subtle m-0 truncate">{member.email}</p>
          </div>
          <button type="button" onClick={onClose} className="text-text-subtle hover:text-text" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-4 h-4 text-gold animate-spin" /></div>
        ) : info ? (
          <>
            {info.hasOutstanding ? (
              <div className="rounded-xl border border-[#F5C66B]/40 bg-[#F5C66B]/10 p-3">
                <p className="text-[12px] font-medium text-[#F5C66B] m-0 mb-1.5 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> This member still has</p>
                <ul className="m-0 pl-4 text-[11px] text-text flex flex-col gap-1 list-disc">
                  {items.map((t) => <li key={t}>{t}</li>)}
                </ul>
                <label className="flex items-start gap-2 mt-2.5 text-[11px] text-text cursor-pointer">
                  <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="mt-0.5 accent-[#F87171]" />
                  I understand these will be lost. Delete anyway.
                </label>
              </div>
            ) : (
              <p className="text-[12px] text-green m-0">Nothing outstanding: no wallet balance, placements or pending requests.</p>
            )}
            <p className="text-[11px] text-text-muted m-0 leading-relaxed">
              Removes the profile, history, notifications, game progress, ranking rows and sign-in. Processed withdrawals and commissions already paid stay in your records. This cannot be undone.
            </p>
            <label className="text-[11px] font-medium text-text block">
              Type DELETE to confirm
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="mt-1 w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[13px] font-mono text-text outline-none focus:border-red/50" />
            </label>
          </>
        ) : null}

        {error && <p className="text-[11px] text-red m-0 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text hover:bg-card-elev disabled:opacity-60">Cancel</button>
          <button type="submit" disabled={!canSubmit} className="flex-1 py-2.5 bg-red/15 border border-red/40 text-red rounded-lg text-[12px] font-medium hover:bg-red/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Delete member
          </button>
        </div>
      </form>
    </div>
  );
}
