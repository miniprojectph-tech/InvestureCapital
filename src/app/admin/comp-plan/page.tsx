"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, Loader2, Plus, X, Play, Zap, Search, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { useSettings, saveSettings } from "@/lib/settings";
import { listInvestors, type InvestorRow } from "@/lib/adminQueries";
import {
  DEFAULT_COMP_PLAN,
  mergeCompPlan,
  projectPlacement,
  cyclesForTerm,
  peso,
  activatePlacement,
  runPayoutsNow,
  useAllCommissions,
  type CompPlanConfig,
  type ActivatePlacementResult,
  type MaintenanceResult,
} from "@/lib/compplan";

export default function AdminCompPlanPage() {
  const { user, demoMode } = useAuth();
  const { settings, loading } = useSettings();
  const [cfg, setCfg] = useState<CompPlanConfig>(DEFAULT_COMP_PLAN);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Load once settings arrive; don't clobber unsaved edits on later snapshots.
  useEffect(() => {
    if (loading || dirty) return;
    setCfg(mergeCompPlan(settings.compPlan));
  }, [settings.compPlan, loading, dirty]);

  function patch(p: Partial<CompPlanConfig>) {
    setCfg((c) => ({ ...c, ...p }));
    setDirty(true);
  }

  async function save() {
    const { db } = getFirebase();
    if (!db) return;
    setSaving(true);
    setMsg(null);
    try {
      await saveSettings(db, { compPlan: cfg }, user?.uid);
      setDirty(false);
      setMsg({ ok: true, text: "Compensation plan saved. New placements use these numbers; existing placements keep their snapshot." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  const unit = cfg.increment;

  return (
    <div>
      <TopHeader title="Compensation plan" subtitle="Every number the payout engine uses — editable live" />

      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <p className="text-[11px] text-text-muted m-0">
          Changes apply to <span className="text-text">new</span> placements and to commissions / bonuses paid from now on.
          Active placements keep the rate, cycles and Locked-In Bonus they were activated with.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setCfg(DEFAULT_COMP_PLAN); setDirty(true); }}
            className="text-[11px] px-3 py-2 rounded-lg bg-card border border-border text-text-muted hover:text-text flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving || demoMode}
            className={cn(
              "text-[11px] px-4 py-2 rounded-lg flex items-center gap-1.5 font-medium transition",
              dirty && !saving ? "bg-gold text-gold-dark hover:brightness-110" : "bg-card-elev text-text-subtle cursor-not-allowed",
            )}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save changes
          </button>
        </div>
      </div>

      {msg && (
        <p className={cn("text-[11px] m-0 mb-3 flex items-center gap-1.5", msg.ok ? "text-green" : "text-red")}>
          {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />} {msg.text}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* ===== Income cycle ===== */}
        <Card>
          <CardHeader title="5 Days Income" subtitle="How often and how much each placement pays" />
          <div className="grid grid-cols-2 gap-2.5">
            <NumField label="Payout every (days)" value={cfg.cycleDays} onChange={(v) => patch({ cycleDays: v })} min={1} />
            <NumField label="Rate per payout (%)" value={cfg.cycleRate} onChange={(v) => patch({ cycleRate: v })} step={0.5} />
            <NumField label="Days in a month" value={cfg.monthDays} onChange={(v) => patch({ monthDays: v })} min={1} />
            <NumField label="Placement step / unit (₱)" value={cfg.increment} onChange={(v) => patch({ increment: v })} min={1} />
            <NumField label="Minimum placement (₱)" value={cfg.minPlacement} onChange={(v) => patch({ minPlacement: v })} min={1} />
          </div>
          <label className="flex items-center gap-2 mt-3 text-[11px] text-text cursor-pointer">
            <input type="checkbox" checked={cfg.dailyAccrualNotifications} onChange={(e) => patch({ dailyAccrualNotifications: e.target.checked })} className="accent-[#3DD598]" />
            Send a daily &ldquo;Earning +₱x today, IC-XXXXX&rdquo; notification between payouts
          </label>
        </Card>

        {/* ===== Terms + Locked-In ===== */}
        <Card>
          <CardHeader
            title="Terms & Locked-In Bonus"
            subtitle={`Bonus is per ₱${unit.toLocaleString()} unit, paid with the final payout`}
            right={
              <button onClick={() => patch({ terms: [...cfg.terms, { months: (cfg.terms.at(-1)?.months ?? 0) + 3, lockedBonusPerUnit: 0 }] })} className="text-[10px] text-gold flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add term
              </button>
            }
          />
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-[1fr_1fr_1fr_24px] gap-2 text-[9px] uppercase tracking-wider text-text-subtle px-1">
              <span>Months</span><span>Payouts</span><span>Bonus / unit (₱)</span><span />
            </div>
            {cfg.terms.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_24px] gap-2 items-center">
                <NumInput value={t.months} min={1} onChange={(v) => patch({ terms: cfg.terms.map((x, j) => (j === i ? { ...x, months: v } : x)) })} />
                <span className="text-[11px] text-text-muted px-1">{cyclesForTerm(cfg, t.months)}</span>
                <NumInput value={t.lockedBonusPerUnit} min={0} onChange={(v) => patch({ terms: cfg.terms.map((x, j) => (j === i ? { ...x, lockedBonusPerUnit: v } : x)) })} />
                <button onClick={() => patch({ terms: cfg.terms.filter((_, j) => j !== i) })} disabled={cfg.terms.length <= 1} className="text-text-subtle hover:text-red disabled:opacity-30" aria-label="Remove term">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </Card>

        {/* ===== Referral levels ===== */}
        <Card>
          <CardHeader
            title="Referral commission"
            subtitle={`Paid to wallet when a placement is approved · total ${cfg.referralLevels.reduce((s, v) => s + v, 0)}%`}
            right={
              <button onClick={() => patch({ referralLevels: [...cfg.referralLevels, 1] })} className="text-[10px] text-gold flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add level
              </button>
            }
          />
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {cfg.referralLevels.map((pct, i) => (
              <div key={i} className="relative">
                <NumField label={`Level ${i + 1} (%)`} value={pct} step={0.5} min={0} onChange={(v) => patch({ referralLevels: cfg.referralLevels.map((x, j) => (j === i ? v : x)) })} />
                {cfg.referralLevels.length > 1 && (
                  <button onClick={() => patch({ referralLevels: cfg.referralLevels.filter((_, j) => j !== i) })} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-card-elev text-text-subtle hover:text-red flex items-center justify-center" aria-label="Remove level">
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <NumField label="Upline must have active placement ≥ (₱, 0 = off)" value={cfg.uplineMinActive} min={0} onChange={(v) => patch({ uplineMinActive: v })} />
            <NumField label="Leadership Bonus (% of direct's Locked-In Bonus)" value={cfg.leadershipPct} min={0} step={5} onChange={(v) => patch({ leadershipPct: v })} />
          </div>
          <p className="text-[10px] text-text-subtle m-0 mt-2">
            Per ₱{unit.toLocaleString()} placement the levels pay {cfg.referralLevels.map((p) => peso((unit * p) / 100)).join(" / ")} = {peso(unit * cfg.referralLevels.reduce((s, v) => s + v, 0) / 100)}.
          </p>
        </Card>

        {/* ===== Fast-Start ===== */}
        <Card>
          <CardHeader
            title="Fast-Start Bonus"
            subtitle="One-time per tier, once enough direct referrals have placed the minimum"
            right={
              <button onClick={() => patch({ fastStartTiers: [...cfg.fastStartTiers, { minPlacement: 1000, bonus: 0 }] })} className="text-[10px] text-gold flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add tier
              </button>
            }
          />
          <NumField label="Direct referrals required" value={cfg.fastStartDirects} min={1} onChange={(v) => patch({ fastStartDirects: v })} />
          <div className="flex flex-col gap-1.5 mt-3">
            <div className="grid grid-cols-[1fr_1fr_24px] gap-2 text-[9px] uppercase tracking-wider text-text-subtle px-1">
              <span>Each direct placed ≥ (₱)</span><span>Bonus (₱)</span><span />
            </div>
            {cfg.fastStartTiers.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_24px] gap-2 items-center">
                <NumInput value={t.minPlacement} min={0} onChange={(v) => patch({ fastStartTiers: cfg.fastStartTiers.map((x, j) => (j === i ? { ...x, minPlacement: v } : x)) })} />
                <NumInput value={t.bonus} min={0} onChange={(v) => patch({ fastStartTiers: cfg.fastStartTiers.map((x, j) => (j === i ? { ...x, bonus: v } : x)) })} />
                <button onClick={() => patch({ fastStartTiers: cfg.fastStartTiers.filter((_, j) => j !== i) })} className="text-text-subtle hover:text-red" aria-label="Remove tier">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-text-subtle m-0 mt-2">A direct qualifies for a tier by their total active placements. The sponsor must also be active.</p>
        </Card>
      </div>

      {/* ===== Preview ===== */}
      <Card className="mt-3">
        <CardHeader title={`What a ₱${unit.toLocaleString()} placement pays`} subtitle="Live preview of the numbers above" />
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-wider text-text-subtle">
                <th className="text-left py-1.5 font-medium">Term</th>
                <th className="text-right py-1.5 font-medium">Payouts</th>
                <th className="text-right py-1.5 font-medium">Per payout</th>
                <th className="text-right py-1.5 font-medium">Daily accrual</th>
                <th className="text-right py-1.5 font-medium">Income</th>
                <th className="text-right py-1.5 font-medium">Locked-In</th>
                <th className="text-right py-1.5 font-medium">Capital back</th>
                <th className="text-right py-1.5 font-medium text-gold">Total</th>
                <th className="text-right py-1.5 font-medium">Sponsor L1 + Leadership</th>
              </tr>
            </thead>
            <tbody>
              {cfg.terms.map((t) => {
                const p = projectPlacement(cfg, unit, t.months);
                const l1 = (unit * (cfg.referralLevels[0] ?? 0)) / 100;
                const lead = (p.lockedBonus * cfg.leadershipPct) / 100;
                return (
                  <tr key={t.months} className="border-t border-border">
                    <td className="py-2 text-text">{t.months} month{t.months > 1 ? "s" : ""} <span className="text-text-subtle">({p.days} d)</span></td>
                    <td className="py-2 text-right tabular-nums">{p.cycles}</td>
                    <td className="py-2 text-right tabular-nums">{peso(p.perCycle)}</td>
                    <td className="py-2 text-right tabular-nums text-text-muted">{peso(p.dailyAccrual)}</td>
                    <td className="py-2 text-right tabular-nums">{peso(p.totalIncome)}</td>
                    <td className="py-2 text-right tabular-nums">{p.lockedBonus > 0 ? peso(p.lockedBonus) : <span className="text-text-subtle">—</span>}</td>
                    <td className="py-2 text-right tabular-nums">{peso(p.capitalReturn)}</td>
                    <td className="py-2 text-right tabular-nums text-gold font-medium">{peso(p.total)}</td>
                    <td className="py-2 text-right tabular-nums text-text-muted">{peso(l1)}{lead > 0 ? ` + ${peso(lead)}` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <TestTools cfg={mergeCompPlan(settings.compPlan)} demoMode={demoMode} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function TestTools({ cfg, demoMode }: { cfg: CompPlanConfig; demoMode: boolean }) {
  const [investors, setInvestors] = useState<InvestorRow[]>([]);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<InvestorRow | null>(null);
  const [amount, setAmount] = useState(cfg.minPlacement);
  const [months, setMonths] = useState(cfg.terms[0]?.months ?? 1);
  const [busy, setBusy] = useState<"grant" | "run" | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const commissions = useAllCommissions(15);

  useEffect(() => {
    const { db } = getFirebase();
    if (!db || demoMode) return;
    listInvestors(db, 500).then(setInvestors).catch(() => {});
  }, [demoMode]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2 || picked) return [];
    return investors.filter((i) => i.name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q)).slice(0, 6);
  }, [search, investors, picked]);

  async function grant() {
    if (!picked) return;
    setBusy("grant");
    setError(null);
    setResult(null);
    try {
      const r: ActivatePlacementResult = await activatePlacement({ userId: picked.uid, amount, termMonths: months });
      setResult(
        `Activated ${r.placementId} for ${picked.name}: ${r.cycles} payouts of ${peso(r.perCycle)}` +
          (r.lockedBonus > 0 ? `, Locked-In ${peso(r.lockedBonus)}` : "") +
          ` · uplines found ${r.uplinesFound}, commissions paid ${r.commissionsPaid}` +
          (r.fastStartPaid.length ? ` · Fast-Start paid: ${r.fastStartPaid.join(", ")}` : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Activation failed");
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    setBusy("run");
    setError(null);
    setResult(null);
    try {
      const r: MaintenanceResult = await runPayoutsNow();
      setResult(`Payout run: ${r.usersScanned} users scanned · ${r.usersUpdated} updated · ${r.payouts} payouts credited · ${r.plansCompleted} placements completed`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
      <Card>
        <CardHeader title="Test: grant a placement" subtitle="Activates instantly (no payment proof) and pays upline commissions — for testing" right={<Zap className="w-4 h-4 text-gold" />} />
        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 text-text-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={picked ? `${picked.name} · ${picked.email}` : search}
            onChange={(e) => { setPicked(null); setSearch(e.target.value); }}
            placeholder="Search member by name or email…"
            className="w-full bg-canvas border border-border rounded-lg pl-8 pr-8 py-2 text-[11px] text-text outline-none focus:border-gold/40 placeholder:text-text-subtle"
          />
          {picked && (
            <button onClick={() => { setPicked(null); setSearch(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text" aria-label="Clear">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {matches.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-card border border-border-strong rounded-lg shadow-xl shadow-black/50 overflow-hidden">
              {matches.map((m) => (
                <button key={m.uid} onClick={() => { setPicked(m); setSearch(""); }} className="w-full text-left px-3 py-2 hover:bg-card-elev">
                  <p className="text-[11px] text-text m-0">{m.name}</p>
                  <p className="text-[9px] text-text-subtle m-0">{m.email}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <NumField label={`Amount (₱, steps of ${cfg.increment.toLocaleString()})`} value={amount} min={cfg.minPlacement} step={cfg.increment} onChange={setAmount} />
          <div>
            <p className="text-[9px] uppercase tracking-wider text-text-subtle m-0 mb-1">Term</p>
            <div className="flex gap-1">
              {cfg.terms.map((t) => (
                <button key={t.months} onClick={() => setMonths(t.months)} className={cn("flex-1 py-2 rounded-lg text-[11px] border transition", months === t.months ? "bg-gold/15 border-gold/40 text-gold" : "bg-canvas border-border text-text-muted hover:text-text")}>
                  {t.months} mo
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={grant} disabled={!picked || busy !== null} className="flex-1 py-2.5 rounded-lg bg-gold text-gold-dark text-[12px] font-medium flex items-center justify-center gap-2 disabled:opacity-40">
            {busy === "grant" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Grant placement
          </button>
          <button onClick={run} disabled={busy !== null} className="flex-1 py-2.5 rounded-lg bg-card-elev border border-border text-text text-[12px] font-medium flex items-center justify-center gap-2 hover:bg-gold/10 disabled:opacity-40">
            {busy === "run" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run payouts now
          </button>
        </div>
        {result && <p className="text-[11px] text-green m-0 mt-2 flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {result}</p>}
        {error && <p className="text-[11px] text-red m-0 mt-2 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}</p>}
        <p className="text-[9px] text-text-subtle m-0 mt-3">
          Payouts credit automatically every hour. &ldquo;Run payouts now&rdquo; runs the same job immediately — a placement only pays when a full {cfg.cycleDays}-day cycle has elapsed.
        </p>
      </Card>

      <Card>
        <CardHeader title="Recent commissions & bonuses" subtitle="Newest first · skipped rows show why" />
        {commissions.length === 0 ? (
          <p className="text-[11px] text-text-subtle m-0">Nothing yet.</p>
        ) : (
          <div className="flex flex-col gap-1 max-h-[360px] overflow-y-auto">
            {commissions.map((c) => (
              <div key={c.id} className="flex items-center gap-2 bg-canvas border border-border rounded-lg px-3 py-2">
                <span className={cn("text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0", c.type === "level" ? "bg-blue/15 text-blue" : c.type === "fastStart" ? "bg-vault/15 text-vault" : "bg-gold/15 text-gold")}>
                  {c.type === "level" ? `L${c.level}` : c.type === "fastStart" ? "Fast-Start" : "Leadership"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-text m-0 truncate">{c.toUserName} <span className="text-text-subtle">← {c.fromUserName} · {c.placementId}</span></p>
                  {c.status === "skipped" && <p className="text-[9px] text-red m-0 truncate">Skipped: {c.reason}</p>}
                </div>
                <span className={cn("text-[11px] tabular-nums shrink-0", c.status === "paid" ? "text-green" : "text-text-subtle line-through")}>{peso(c.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function NumInput({ value, onChange, min, step }: { value: number; onChange: (v: number) => void; min?: number; step?: number }) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : ""}
      min={min}
      step={step}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40 tabular-nums"
    />
  );
}

function NumField({ label, value, onChange, min, step }: { label: string; value: number; onChange: (v: number) => void; min?: number; step?: number }) {
  return (
    <label className="block">
      <p className="text-[9px] uppercase tracking-wider text-text-subtle m-0 mb-1">{label}</p>
      <NumInput value={value} onChange={onChange} min={min} step={step} />
    </label>
  );
}
