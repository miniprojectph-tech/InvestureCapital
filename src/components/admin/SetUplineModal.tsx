"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, AlertCircle, UserPlus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Switch } from "@/components/Switch";
import { cn, formatPHP } from "@/lib/utils";
import { adminSetUpline, type InvestorRow, type UplineResult } from "@/lib/adminQueries";

const input = "w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40";
const fmtDate = (ms: number) => (ms ? new Date(ms).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");

/**
 * Admin › Investors: attach (or change) a member's upline. Search the upline,
 * optionally back-pay the commissions their existing placements would have
 * paid (previewed line by line before confirming), give a reason, confirm.
 */
export function SetUplineModal({ member, investors, onClose, onDone }: {
  member: InvestorRow | null;
  investors: InvestorRow[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return <Modal open={!!member} onClose={onClose} title={member ? `Set upline for ${member.name}` : "Set upline"} maxWidth="max-w-lg">
    {/* keyed on the member so every opening starts fresh */}
    {member && <SetUplineForm key={member.uid} member={member} investors={investors} onClose={onClose} onDone={onDone} />}
  </Modal>;
}

function SetUplineForm({ member, investors, onClose, onDone }: { member: InvestorRow; investors: InvestorRow[]; onClose: () => void; onDone: (message: string) => void }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<InvestorRow | null>(null);
  const [backpay, setBackpay] = useState(false);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<UplineResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = member?.referredByUserId ? investors.find((r) => r.uid === member.referredByUserId) : null;
  const hasPlacements = !!member && member.activePlansCount + member.completedPlansCount > 0;
  const directsOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of investors) if (r.referredByUserId) m.set(r.referredByUserId, (m.get(r.referredByUserId) ?? 0) + 1);
    return m;
  }, [investors]);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!member || s.length < 2) return [];
    return investors.filter((r) => r.uid !== member.uid && (r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s))).slice(0, 8);
  }, [q, investors, member]);

  // preview the back-pay (and the loop check) whenever the choice changes
  const pickedUid = picked?.uid ?? null;
  useEffect(() => {
    if (!pickedUid) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setPreviewing(true);
      adminSetUpline({ uid: member.uid, uplineUid: pickedUid, backpay, dryRun: true })
        .then((r) => { if (!cancelled) { setPreview(r); setError(null); } })
        .catch((e) => { if (!cancelled) { setPreview(null); setError(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not check that upline."); } })
        .finally(() => { if (!cancelled) setPreviewing(false); });
    }, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [member.uid, pickedUid, backpay]);

  async function confirm() {
    if (!member || !picked || error) return;
    setBusy(true); setError(null);
    try {
      const r = await adminSetUpline({ uid: member.uid, uplineUid: picked.uid, backpay, reason });
      onDone(`${member.name}'s upline is now ${picked.name}.${r.total > 0 ? ` ${formatPHP(r.total)} in commissions credited.` : ""} Both have been told.`);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not set the upline.");
    } finally { setBusy(false); }
  }

  const byPlacement = useMemo(() => {
    const m = new Map<string, { capital: number; skipped?: string; rows: NonNullable<UplineResult["lines"]> }>();
    for (const l of preview?.lines ?? []) {
      const e = m.get(l.placementId) ?? { capital: l.capital, rows: [] };
      if (l.skipped) e.skipped = l.skipped; else e.rows.push(l);
      m.set(l.placementId, e);
    }
    return [...m.entries()];
  }, [preview]);

  return (
    <Modal open={!!member} onClose={() => !busy && onClose()} title={member ? `Set upline for ${member.name}` : "Set upline"} maxWidth="max-w-lg">
      {member && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] text-text-muted m-0">
            Current upline: {current ? <span className="text-text">{current.name}</span> : member.referredByUserId ? <span className="text-text font-mono">{member.referredByUserId.slice(0, 8)}…</span> : <span className="text-red">none</span>} · joined {fmtDate(member.joinedAt)} · {member.activePlansCount + member.completedPlansCount} placement{member.activePlansCount + member.completedPlansCount === 1 ? "" : "s"}{member.deployed > 0 ? ` (${formatPHP(member.deployed, { short: true })} active)` : ""}
          </p>

          {picked ? (
            <div className="flex items-center justify-between gap-2 bg-canvas border border-gold/40 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <p className="text-[12px] m-0 truncate"><UserPlus className="w-3.5 h-3.5 inline mr-1 text-gold" />{picked.name}</p>
                <p className="text-[10px] text-text-subtle m-0 truncate">{picked.email} · {directsOf.get(picked.uid) ?? 0} direct{(directsOf.get(picked.uid) ?? 0) === 1 ? "" : "s"}{preview?.chain && preview.chain.length > 1 ? ` · chain: ${preview.chain.map((c) => c.name).join(" › ")}` : ""}</p>
              </div>
              <button type="button" onClick={() => { setPicked(null); setPreview(null); setError(null); }} className="text-[10px] text-text-muted hover:text-text shrink-0">Change</button>
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the upline by name or email…" className={cn(input, "pl-8")} />
              </div>
              {q.trim().length >= 2 && (
                <div className="mt-1.5 bg-canvas border border-border rounded-lg overflow-hidden">
                  {matches.length === 0 && <p className="text-[11px] text-text-subtle m-0 px-3 py-2">No member matches that.</p>}
                  {matches.map((r) => (
                    <button key={r.uid} type="button" onClick={() => { setPicked(r); setQ(""); }} className="w-full text-left px-3 py-2 text-[12px] hover:bg-card-elev flex items-center justify-between gap-2 border-b border-border last:border-b-0">
                      <span className="truncate">{r.name} <span className="text-text-subtle">{r.email}</span></span>
                      <span className="text-[10px] text-text-subtle shrink-0">{r.isAdmin ? "Admin" : "Investor"} · {directsOf.get(r.uid) ?? 0} direct{(directsOf.get(r.uid) ?? 0) === 1 ? "" : "s"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {hasPlacements && (
            <div className="border border-border rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] m-0">Also pay the commissions their placements would have paid</p>
                  <p className="text-[10px] text-text-subtle m-0">Today&apos;s rates, no event multipliers, Fast-Start not re-checked. Placements that already paid commissions are left alone.</p>
                </div>
                <Switch checked={backpay} onChange={setBackpay} disabled={!picked || busy} label="Back-pay commissions" />
              </div>
              {picked && backpay && (
                <div className="mt-2 bg-canvas rounded-lg px-3 py-2 text-[11px]">
                  {previewing && <p className="m-0 text-text-subtle flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Working it out…</p>}
                  {!previewing && preview && byPlacement.length === 0 && <p className="m-0 text-text-subtle">Nothing to pay.</p>}
                  {!previewing && byPlacement.map(([pid, e]) => (
                    <div key={pid} className="mb-2 last:mb-0">
                      <p className="m-0 text-[10px] text-text-subtle">Placement {pid} · {formatPHP(e.capital)}{e.skipped ? ` · ${e.skipped}` : ""}</p>
                      {e.rows.map((l, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 py-0.5">
                          <span className="truncate">Level {l.level} · {l.toUserName}{!l.paid && l.reason ? <span className="text-text-subtle"> · {l.reason}</span> : null}</span>
                          <span className={cn("font-mono shrink-0", l.paid ? "text-green" : "text-text-subtle")}>{l.paid ? `+${formatPHP(l.amount ?? 0)}` : "skipped"}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {!previewing && preview && (
                    <p className="m-0 mt-1 pt-1 border-t border-border text-text-muted">Total to credit now: <span className="text-text font-mono">{formatPHP(preview.total)}</span></p>
                  )}
                </div>
              )}
            </div>
          )}

          <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. forgot the link, confirmed by the upline on chat" className={input} />

          {error && <p className="text-[11px] text-red m-0 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {error}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted">Cancel</button>
            <button type="button" onClick={confirm} disabled={!picked || busy || previewing || !!error} className="flex-1 py-2.5 rounded-lg bg-gold text-gold-dark text-[12px] font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {picked ? `Set ${picked.name.split(" ")[0]} as upline` : "Set upline"}
            </button>
          </div>
          <p className="text-[10px] text-text-subtle m-0">Written to the admin audit with who did it and the reason. The member and the new upline each get one notification. The member&apos;s own referral link and code are unchanged.</p>
        </div>
      )}
    </Modal>
  );
}
