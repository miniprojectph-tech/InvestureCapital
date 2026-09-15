"use client";

import { useState } from "react";
import { ArrowRight, Check, Minus, Plus, Sparkles, Loader2, Lock } from "lucide-react";
import { cn, formatPHP } from "@/lib/utils";
import { ActivatePlanModal, type PaymentSubmission } from "./ActivatePlanModal";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { requestPlacement } from "@/lib/planRequests";
import { uploadReceipt } from "@/lib/storage";
import { useCompPlan, projectPlacement, validatePlacementAmount, cyclesForTerm, peso } from "@/lib/compplan";

const QUICK = [1000, 5000, 10000, 50000, 100000];

/** Member entry point: choose a term, set an amount, see exactly what it pays, request activation. */
export function PlacementCalculator() {
  const { cfg, loading } = useCompPlan();
  const { user, demoMode } = useAuth();
  const [amount, setAmount] = useState(1000);
  const [months, setMonths] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
      </div>
    );
  }

  const bestTerm = cfg.terms.reduce((a, b) => (b.lockedBonusPerUnit > a.lockedBonusPerUnit ? b : a), cfg.terms[0]);
  const term = cfg.terms.find((t) => t.months === months) ?? cfg.terms[Math.min(1, cfg.terms.length - 1)];
  const amountError = validatePlacementAmount(cfg, amount);
  const proj = projectPlacement(cfg, amountError ? cfg.minPlacement : amount, term.months);
  const unit = cfg.increment;
  const unitPayout = (unit * cfg.cycleRate) / 100;

  function step(dir: 1 | -1) {
    setAmount((a) => Math.max(cfg.minPlacement, Math.round(a / cfg.increment) * cfg.increment + dir * cfg.increment));
  }

  async function handleSubmit(payment: PaymentSubmission) {
    if (demoMode || !user) return;
    const { db, storage } = getFirebase();
    if (!db) return;
    let receiptUrl: string | undefined;
    let receiptPath: string | undefined;
    if (payment.receiptFile && storage) {
      const uploaded = await uploadReceipt(storage, user.uid, payment.receiptFile);
      receiptUrl = uploaded.url;
      receiptPath = uploaded.path;
    }
    await requestPlacement(db, {
      userId: user.uid,
      userName: user.name,
      userEmail: user.email,
      amount,
      termMonths: term.months,
      method: payment.method,
      referenceNumber: payment.referenceNumber,
      receiptUrl,
      receiptPath,
    });
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
      {/* Term cards */}
      <div className="px-3 pt-3 pb-3 border-b border-border">
        <p className="text-[10px] uppercase tracking-[0.16em] text-text-subtle m-0 mb-2.5">Choose your term</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(cfg.terms.length, 3)}, minmax(0, 1fr))` }}>
          {cfg.terms.map((t) => {
            const active = t.months === term.months;
            const cycles = cyclesForTerm(cfg, t.months);
            return (
              <button
                key={t.months}
                onClick={() => setMonths(t.months)}
                className={cn(
                  "relative text-left rounded-xl border p-3 transition-all",
                  active ? "border-green bg-green/[0.07]" : "border-border bg-canvas hover:border-text-subtle/50 hover:bg-card-elev/40",
                )}
                style={active ? { boxShadow: "0 0 0 1px rgba(61,213,152,0.5), 0 6px 20px rgba(61,213,152,0.14)" } : undefined}
              >
                <div className="flex items-center justify-between h-4 mb-1">
                  {t.months === bestTerm.months && t.lockedBonusPerUnit > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-gold/15 text-gold">
                      <Sparkles className="w-2 h-2" /> Biggest bonus
                    </span>
                  ) : (
                    <span />
                  )}
                  {active && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green shrink-0">
                      <Check className="w-2.5 h-2.5 text-gold-dark" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <p className={cn("text-[11px] font-semibold m-0 mb-1.5", active ? "text-text" : "text-text-muted")}>
                  {t.months} month{t.months > 1 ? "s" : ""}
                </p>
                <div className="flex items-baseline gap-0.5">
                  <span className={active ? "text-green" : "text-text"} style={{ fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: 600, lineHeight: 1 }}>
                    {cycles}
                  </span>
                  <span className="text-[9px] text-text-subtle">payouts</span>
                </div>
                <div className="mt-2 flex flex-col gap-0.5">
                  <span className="text-[9px] text-text-muted">{peso(unitPayout)} / {cfg.cycleDays} days per ₱{unit.toLocaleString()}</span>
                  {t.lockedBonusPerUnit > 0 ? (
                    <span className="text-[9px] text-vault tabular-nums">+{peso(t.lockedBonusPerUnit)} Locked-In / ₱{unit.toLocaleString()}</span>
                  ) : (
                    <span className="text-[9px] text-text-subtle">No Locked-In Bonus</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Amount */}
      <div className="px-5 py-5 border-b border-border">
        <p className="text-[9px] text-text-subtle uppercase tracking-[0.18em] m-0 mb-1.5">Placement amount</p>
        <div className="flex items-center gap-2">
          <button onClick={() => step(-1)} disabled={amount <= cfg.minPlacement} className="w-9 h-9 rounded-lg bg-card-elev border border-border text-text-muted hover:text-text flex items-center justify-center disabled:opacity-30" aria-label="Decrease">
            <Minus className="w-4 h-4" />
          </button>
          <div className="flex-1 flex items-baseline gap-1 min-w-0">
            <span className="text-text-subtle leading-none" style={{ fontFamily: "var(--font-display)", fontSize: "24px", fontVariationSettings: '"opsz" 144, "SOFT" 30' }}>₱</span>
            <input
              type="number"
              value={amount || ""}
              step={cfg.increment}
              min={cfg.minPlacement}
              onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value) || 0))}
              onBlur={() => setAmount((a) => Math.max(cfg.minPlacement, Math.round(a / cfg.increment) * cfg.increment))}
              className="bg-transparent border-none outline-none w-full text-text font-medium tracking-tight tabular-nums"
              style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px, 4.5vw, 38px)", fontVariationSettings: '"opsz" 144, "SOFT" 30', letterSpacing: "-0.025em", lineHeight: "1" }}
              aria-label="Placement amount"
            />
          </div>
          <button onClick={() => step(1)} className="w-9 h-9 rounded-lg bg-card-elev border border-border text-text-muted hover:text-text flex items-center justify-center" aria-label="Increase">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
          <div className="flex gap-1 flex-wrap">
            {QUICK.filter((q) => q >= cfg.minPlacement).map((q) => (
              <button key={q} onClick={() => setAmount(q)} className={cn("text-[9px] px-2 py-0.5 rounded-full transition", amount === q ? "bg-gold/15 text-gold font-medium" : "bg-card-elev text-text-muted hover:text-text")}>
                ₱{q >= 1000 ? `${q / 1000}K` : q}
              </button>
            ))}
          </div>
          <span className={cn("text-[9px]", amountError ? "text-red" : "text-text-subtle")}>
            {amountError ?? `${proj.units} unit${proj.units > 1 ? "s" : ""} of ₱${unit.toLocaleString()}`}
          </span>
        </div>
      </div>

      {/* Breakdown */}
      <div className="flex flex-col flex-1">
        <SpecRow label="Payout" value={`${peso(proj.perCycle)} every ${cfg.cycleDays} days`} index={0} />
        <SpecRow label="Payouts" value={`${proj.cycles} over ${proj.days} days`} index={1} />
        <SpecRow label="Accrues daily" value={`${peso(proj.dailyAccrual)} / day`} index={2} />
        <SpecRow label="Rate" value={`${cfg.cycleRate}% per payout`} index={3} />

        <SectionHeader label={`For ${formatPHP(amountError ? cfg.minPlacement : amount)} · ${term.months}-month term`} />

        <SpecRow label="Total income" value={formatPHP(proj.totalIncome)} index={4} />
        <SpecRow label="Locked-In Bonus" hint="with final payout" value={proj.lockedBonus > 0 ? formatPHP(proj.lockedBonus) : "—"} index={5} vault />
        <SpecRow label="Capital return" hint="with final payout" value={formatPHP(proj.capitalReturn)} index={6} />
        <SpecRow label="Total return" value={formatPHP(proj.total, { short: true })} index={7} highlight bigValue />
      </div>

      {/* CTA */}
      <div className="p-4 border-t border-border">
        <p className="text-[11px] text-text-muted m-0 mb-3 leading-relaxed">
          Every {cfg.cycleDays} days {peso(proj.perCycle)} lands in your wallet. On payout {proj.cycles} you also receive your {formatPHP(proj.capitalReturn, { short: true })} capital back
          {proj.lockedBonus > 0 ? ` plus the ${formatPHP(proj.lockedBonus, { short: true })} Locked-In Bonus` : ""}.
        </p>
        <button
          onClick={() => setModalOpen(true)}
          disabled={!!amountError || demoMode}
          className={cn(
            "w-full py-3 rounded-xl text-[13px] font-medium flex items-center justify-center gap-2 transition",
            !amountError && !demoMode ? "bg-gold text-gold-dark hover:brightness-110" : "bg-card-elev text-text-subtle cursor-not-allowed",
          )}
        >
          {amountError ? amountError : (<>Place {formatPHP(amount, { short: true })} for {term.months} month{term.months > 1 ? "s" : ""} <ArrowRight className="w-4 h-4" /></>)}
        </button>
      </div>

      <ActivatePlanModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`Place ${formatPHP(amount)} · ${term.months}-month term`}
        amount={amount}
        successText={`${formatPHP(amount)} for a ${term.months}-month placement — admin will verify your payment and activate it. Your first payout lands ${cfg.cycleDays} days after activation.`}
        onSubmit={handleSubmit}
        summary={
          <div className="bg-canvas rounded-lg p-3 border border-border">
            <p className="text-[10px] text-text-muted uppercase tracking-wider m-0 mb-2">What you&apos;ll receive</p>
            <div className="flex flex-col gap-1.5 text-[11px]">
              <Line label={`${proj.cycles} payouts, every ${cfg.cycleDays} days`} value={peso(proj.perCycle)} />
              <Line label="Total income" value={formatPHP(proj.totalIncome)} />
              {proj.lockedBonus > 0 && <Line label="Locked-In Bonus (final payout)" value={formatPHP(proj.lockedBonus)} accent="vault" />}
              <Line label="Capital return (final payout)" value={formatPHP(proj.capitalReturn)} />
              <div className="border-t border-dashed border-gold/25 mt-1 pt-1.5">
                <Line label="Total return" value={formatPHP(proj.total)} accent="gold" />
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
}

function Line({ label, value, accent }: { label: string; value: string; accent?: "gold" | "vault" }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={accent === "gold" ? "text-gold-muted" : accent === "vault" ? "text-vault-muted" : "text-text-muted"}>{label}</span>
      <span className={cn("font-mono", accent === "gold" ? "text-gold font-medium" : accent === "vault" ? "text-vault" : "text-text")}>{value}</span>
    </div>
  );
}

function SpecRow({ label, hint, value, index, vault, highlight, bigValue }: { label: string; hint?: string; value: string; index: number; vault?: boolean; highlight?: boolean; bigValue?: boolean }) {
  const alt = index % 2 === 1;
  return (
    <div className={cn("flex items-center justify-between gap-3 px-5 py-2.5 transition", alt ? "bg-card-elev/40" : "bg-transparent", highlight && "bg-gold/5")}>
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", vault ? "bg-vault" : highlight ? "bg-gold" : "bg-green/70")} />
        <span className={cn("text-[11px] truncate", vault ? "text-vault-muted" : highlight ? "text-gold-muted" : "text-text-muted")}>
          {label}
          {hint && <span className="text-text-subtle"> · {hint}</span>}
        </span>
      </div>
      <span className={cn("font-mono tabular-nums shrink-0", bigValue ? "text-[14px] font-medium" : "text-[12px]", vault ? "text-vault" : highlight ? "text-gold" : "text-text")}>
        {value}
      </span>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-5 py-2 bg-card-elev/60 border-y border-border flex items-center gap-1.5">
      <Lock className="w-2.5 h-2.5 text-text-subtle" />
      <p className="text-[9px] uppercase tracking-[0.18em] text-text-subtle m-0">{label}</p>
    </div>
  );
}
