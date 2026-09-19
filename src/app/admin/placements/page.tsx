"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Play, FastForward, RefreshCw, Search, AlertTriangle, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { formatPHP, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { listAllPlacements, type PlacementRow } from "@/lib/adminQueries";
import {
  useCompPlan,
  useNow,
  nextPayoutAt,
  placementPerCycle,
  formatCountdown,
  runPayoutsNow,
  adminAdvancePlacement,
  adminResetEconomy,
  peso,
} from "@/lib/compplan";

export default function AdminPlacementsPage() {
  const { user, demoMode } = useAuth();
  const { cfg } = useCompPlan();
  const now = useNow(30_000);
  const [rows, setRows] = useState<PlacementRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"active" | "completed">("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [advanceDays, setAdvanceDays] = useState(cfg.cycleDays);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { db } = getFirebase();
    if (!db || demoMode) { setRows([]); return; }
    try {
      setRows(await listAllPlacements(db));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed to load placements" });
      setRows([]);
    }
  }, [demoMode]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => r.status === tab && (!q || r.userName.toLowerCase().includes(q) || r.userEmail.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)));
  }, [rows, tab, search]);

  const active = (rows ?? []).filter((r) => r.status === "active");
  const totals = {
    placed: active.reduce((s, r) => s + r.capital, 0),
    perCycle: active.reduce((s, r) => s + placementPerCycle(r), 0),
    bonusesDue: active.reduce((s, r) => s + r.lockedBonus, 0),
  };

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setMsg(null);
    try {
      const text = await fn();
      setMsg({ ok: true, text });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Action failed" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <TopHeader title="Active placements" subtitle={`${active.length} active · ${formatPHP(totals.placed, { short: true })} placed · ${formatPHP(totals.perCycle, { short: true })} paid every ${cfg.cycleDays} days`} />

      {msg && (
        <p className={cn("text-[11px] m-0 mb-3 flex items-start gap-1.5", msg.ok ? "text-green" : "text-red")}>
          {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />} {msg.text}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <Kpi label="Capital placed" value={formatPHP(totals.placed, { short: true })} />
        <Kpi label={`Per ${cfg.cycleDays}-day cycle`} value={formatPHP(totals.perCycle, { short: true })} tone="text-green" />
        <Kpi label="Locked-In due" value={formatPHP(totals.bonusesDue, { short: true })} tone="text-vault" />
        <Kpi label="Completed" value={String((rows ?? []).filter((r) => r.status === "completed").length)} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {(["active", "completed"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("text-[11px] px-3 py-1.5 rounded-full border transition capitalize", tab === t ? "bg-gold/15 border-border-gold text-gold font-medium" : "bg-card border-border text-text-muted hover:text-text")}>
            {t}
          </button>
        ))}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-full">
          <Search className="w-3 h-3 text-text-subtle" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Member or Plan ID…" className="bg-transparent text-[11px] outline-none w-36 text-text placeholder:text-text-subtle" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] text-text-subtle">
            Fast-forward by
            <input type="number" min={1} max={400} value={advanceDays} onChange={(e) => setAdvanceDays(Math.max(1, parseInt(e.target.value) || 1))} className="w-14 bg-canvas border border-border rounded-md px-2 py-1 text-[11px] text-text outline-none focus:border-gold/40 tabular-nums" />
            days
          </label>
          <button onClick={load} className="p-1.5 text-text-subtle hover:text-text" aria-label="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
          <button
            onClick={() => run("run", async () => { const r = await runPayoutsNow(); return `Payout run: ${r.usersScanned} scanned · ${r.payouts} payouts credited · ${r.plansCompleted} completed`; })}
            disabled={busy !== null}
            className="text-[11px] px-3 py-1.5 rounded-lg bg-gold text-gold-dark font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy === "run" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run payouts now
          </button>
        </div>
      </div>

      <Card className="mb-3">
        <CardHeader title={tab === "active" ? "Running placements" : "Completed placements"} subtitle={tab === "active" ? `Fast-forward pushes a placement's clock ahead and runs its payouts immediately — its start date (and history dates) are untouched. More tools in Investors › Plans.` : "Capital and any Locked-In Bonus were paid with the final payout"} />
        {rows === null ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 text-gold animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-[11px] text-text-subtle text-center py-8 m-0">Nothing here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] min-w-[760px]">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider text-text-subtle text-left">
                  <th className="font-medium py-2">Member</th>
                  <th className="font-medium py-2">Plan ID</th>
                  <th className="font-medium py-2 text-right">Capital</th>
                  <th className="font-medium py-2">Term</th>
                  <th className="font-medium py-2">Payouts</th>
                  <th className="font-medium py-2">{tab === "active" ? "Next payout" : "Completed"}</th>
                  <th className="font-medium py-2 text-right">Locked-In</th>
                  {tab === "active" && <th className="font-medium py-2 text-right">Test</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isFinalNext = r.cyclesPaid + 1 === r.cycles;
                  return (
                    <tr key={`${r.userId}-${r.id}`} className="border-t border-border">
                      <td className="py-2">
                        <p className="m-0 text-text">{r.userName}</p>
                        <p className="m-0 text-[9px] text-text-subtle">{r.userEmail}</p>
                      </td>
                      <td className="py-2 font-mono text-text">{r.id}{r.source === "wallet" && <span className="text-[8px] text-text-subtle font-sans ml-1">reinvest</span>}</td>
                      <td className="py-2 text-right font-mono">{formatPHP(r.capital, { short: true })}</td>
                      <td className="py-2 text-text-muted">{r.termMonths} mo · {r.cycleRate}%</td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-[3px] bg-border rounded-full overflow-hidden"><div className="h-full bg-green" style={{ width: `${(r.cyclesPaid / r.cycles) * 100}%` }} /></div>
                          <span className="font-mono text-text-muted">{r.cyclesPaid}/{r.cycles}</span>
                        </div>
                        <p className="m-0 text-[9px] text-text-subtle">{peso(placementPerCycle(r))} each · paid {formatPHP(r.totalPaid ?? 0, { short: true })}</p>
                      </td>
                      <td className="py-2 text-text-muted whitespace-nowrap">
                        {r.status === "active" ? (
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {isFinalNext ? "final" : `#${r.cyclesPaid + 1}`} in {formatCountdown(nextPayoutAt(r) - now)}</span>
                        ) : r.completedAt ? new Date(r.completedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—"}
                      </td>
                      <td className="py-2 text-right font-mono text-vault">{(r.status === "active" ? r.lockedBonus : r.lockedBonusPaid ?? 0) > 0 ? formatPHP(r.status === "active" ? r.lockedBonus : r.lockedBonusPaid ?? 0, { short: true }) : "—"}</td>
                      {tab === "active" && (
                        <td className="py-2 text-right">
                          <button
                            onClick={() => run(r.id, async () => { const res = await adminAdvancePlacement({ userId: r.userId, placementId: r.id, days: advanceDays }); return `${r.id}: moved ${advanceDays} day${advanceDays === 1 ? "" : "s"} · ${res.payouts} payout${res.payouts === 1 ? "" : "s"} credited${res.completed ? " · completed" : ""}`; })}
                            disabled={busy !== null || !user?.isAdmin}
                            className="text-[10px] px-2 py-1 rounded-md bg-card-elev border border-border text-text-muted hover:text-gold hover:border-gold/40 inline-flex items-center gap-1 disabled:opacity-50"
                            title={`Rewind ${advanceDays} days and run payouts`}
                          >
                            {busy === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FastForward className="w-3 h-3" />} +{advanceDays}d
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <DangerZone onDone={load} disabled={demoMode || !user?.isAdmin} />
    </div>
  );
}

function DangerZone({ onDone, disabled }: { onDone: () => void; disabled: boolean }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function reset() {
    setBusy(true);
    setResult(null);
    try {
      const r = await adminResetEconomy(confirm);
      setResult({ ok: true, text: `Reset complete — ${r.users} member${r.users === 1 ? "" : "s"} zeroed, ledgers cleared (${r.collections.join(", ")}).` });
      setConfirm("");
      onDone();
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "Reset failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-red/30">
      <CardHeader title="Reset test economy" subtitle="Zeroes every member's wallet, placements, old plans/vault, activity and notifications; deletes placement requests, commissions, withdrawals and top-ups. Accounts, referral links and game points are kept." right={<AlertTriangle className="w-4 h-4 text-red" />} />
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder='Type RESET to confirm'
          disabled={disabled || busy}
          className="flex-1 bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-red/50 placeholder:text-text-subtle font-mono"
        />
        <button
          onClick={reset}
          disabled={disabled || busy || confirm !== "RESET"}
          className="px-4 py-2 rounded-lg bg-red/15 text-red border border-red/30 text-[12px] font-medium hover:bg-red/25 disabled:opacity-40 flex items-center justify-center gap-1.5"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />} Reset everything
        </button>
      </div>
      {result && <p className={cn("text-[11px] m-0 mt-2", result.ok ? "text-green" : "text-red")}>{result.text}</p>}
      <p className="text-[9px] text-text-subtle m-0 mt-2">This cannot be undone. Use it once before going live with the new plan so old daily-income data doesn&apos;t mix with placements.</p>
    </Card>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <p className="text-[9px] text-text-subtle tracking-wider uppercase m-0 mb-1">{label}</p>
      <p className={cn("text-[14px] font-medium font-mono m-0", tone)}>{value}</p>
    </div>
  );
}
