"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Lock, Zap, Award, Loader2, ArrowRight, Clock, CheckCircle2 } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { formatPHP, cn } from "@/lib/utils";
import { useUserState } from "@/lib/useUserState";
import { useCompPlan, useMyCommissions, useNow, formatCountdown, upcomingBonuses, peso, type Placement } from "@/lib/compplan";

const DAY_MS = 86_400_000;

function finalPayoutAt(p: Placement): number {
  return p.startedAt + p.cycles * p.cycleDays * DAY_MS;
}

/** Every bonus in one place: Locked-In (per placement), Fast-Start and Leadership (from referrals). */
export default function BonusesPage() {
  const { cfg } = useCompPlan();
  const { state, loading } = useUserState();
  const commissions = useMyCommissions(200);
  const now = useNow(60_000);

  const paid = useMemo(() => commissions.filter((c) => c.status === "paid"), [commissions]);
  const fastStartTotal = paid.filter((c) => c.type === "fastStart").reduce((s, c) => s + c.amount, 0);
  const leadershipTotal = paid.filter((c) => c.type === "leadership").reduce((s, c) => s + c.amount, 0);

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
      </div>
    );
  }

  const active = [...(state.placements ?? [])].filter((p) => p.lockedBonus > 0).sort((a, b) => finalPayoutAt(a) - finalPayoutAt(b));
  const completed = (state.completedPlacements ?? []).filter((p) => p.lockedBonusPaid > 0).sort((a, b) => b.completedAt - a.completedAt);
  const due = upcomingBonuses(state.placements);
  const lockedPaid = completed.reduce((s, p) => s + p.lockedBonusPaid, 0);
  const bonusTerms = cfg.terms.filter((t) => t.lockedBonusPerUnit > 0);

  return (
    <div>
      <TopHeader title="Bonuses" subtitle="Locked-In, Fast-Start and Leadership — all paid straight to your wallet" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Tile icon={Lock} label="Locked-In due" value={formatPHP(due)} tone="vault" sub={`${active.length} placement${active.length === 1 ? "" : "s"}`} />
        <Tile icon={CheckCircle2} label="Locked-In paid" value={formatPHP(lockedPaid)} tone="green" />
        <Tile icon={Zap} label="Fast-Start paid" value={formatPHP(fastStartTotal)} tone="vault" />
        <Tile icon={Award} label="Leadership paid" value={formatPHP(leadershipTotal)} tone="gold" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3">
        {/* Locked-In */}
        <Card>
          <CardHeader
            title="Locked-In Bonus"
            subtitle={bonusTerms.map((t) => `${t.months} mo → ${formatPHP(t.lockedBonusPerUnit, { short: true })} per ₱${cfg.increment.toLocaleString()}`).join(" · ")}
            right={<Lock className="w-4 h-4 text-vault" />}
          />
          {active.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-[11px] text-text-muted m-0 mb-2">No Locked-In Bonus scheduled. Choose a {bonusTerms.map((t) => `${t.months}-month`).join(" or ")} term to earn one.</p>
              <Link href="/plans" className="inline-flex items-center gap-1 text-[11px] text-gold hover:underline">Place capital <ArrowRight className="w-3 h-3" /></Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {active.map((p) => {
                const at = finalPayoutAt(p);
                const pct = (p.cyclesPaid / p.cycles) * 100;
                return (
                  <div key={p.id} className="bg-canvas border border-border rounded-lg px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[12px] font-mono text-text">{p.id} <span className="text-text-subtle font-sans">· {p.termMonths} mo · {formatPHP(p.capital, { short: true })}</span></span>
                      <span className="text-[13px] font-mono text-vault font-medium shrink-0">{formatPHP(p.lockedBonus)}</span>
                    </div>
                    <div className="h-[4px] bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-vault rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[9px] text-text-subtle">
                      <span>{p.cyclesPaid} of {p.cycles} payouts done</span>
                      <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> with final payout in {formatCountdown(at - (p.clockAdvanceMs ?? 0) - now)} · {new Date(at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {completed.length > 0 && (
            <div className="mt-4">
              <p className="text-[9px] uppercase tracking-wider text-text-subtle m-0 mb-1.5">Paid</p>
              <div className="flex flex-col gap-1">
                {completed.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-[11px] px-3 py-2 bg-canvas border border-border rounded-lg">
                    <span className="font-mono text-text">{p.id} <span className="text-text-subtle font-sans">· {p.termMonths} mo · {new Date(p.completedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</span></span>
                    <span className="font-mono text-green">+{formatPHP(p.lockedBonusPaid)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Referral bonuses */}
        <div className="flex flex-col gap-3">
          <Card>
            <CardHeader title="Fast-Start Bonus" subtitle={`${cfg.fastStartDirects} direct referrals with the tier minimum placed`} right={<Zap className="w-4 h-4 text-vault" />} />
            <div className="flex flex-col gap-1.5">
              {cfg.fastStartTiers.map((t) => {
                const paidAt = state.fastStart?.paidTiers?.[String(t.minPlacement)];
                return (
                  <div key={t.minPlacement} className="flex items-center justify-between text-[11px] px-3 py-2 bg-canvas border border-border rounded-lg">
                    <span className="text-text-muted">{cfg.fastStartDirects} × {formatPHP(t.minPlacement, { short: true })}+</span>
                    <span className={cn("font-mono", paidAt ? "text-green" : "text-vault")}>{paidAt ? "Paid " : "+"}{formatPHP(t.bonus)}</span>
                  </div>
                );
              })}
            </div>
            <Link href="/referrals" className="mt-3 inline-flex items-center gap-1 text-[11px] text-gold hover:underline">See your progress <ArrowRight className="w-3 h-3" /></Link>
          </Card>

          <Card>
            <CardHeader title="Leadership Bonus" subtitle={`${cfg.leadershipPct}% of each direct referral's Locked-In Bonus, paid when their term completes`} right={<Award className="w-4 h-4 text-gold" />} />
            <div className="flex flex-col gap-1.5">
              {bonusTerms.map((t) => (
                <div key={t.months} className="flex items-center justify-between text-[11px] px-3 py-2 bg-canvas border border-border rounded-lg">
                  <span className="text-text-muted">Direct completes {t.months} mo per ₱{cfg.increment.toLocaleString()}</span>
                  <span className="font-mono text-gold">+{formatPHP((t.lockedBonusPerUnit * cfg.leadershipPct) / 100)}</span>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-text-subtle m-0 mt-2">Funded separately — never deducted from your referral&apos;s bonus.</p>
            <Link href="/referrals" className="mt-2 inline-flex items-center gap-1 text-[11px] text-gold hover:underline">View your directs <ArrowRight className="w-3 h-3" /></Link>
          </Card>
        </div>
      </div>

      <p className="text-[9px] text-text-subtle mt-3 m-0">
        A placement pays {peso((cfg.increment * cfg.cycleRate) / 100)} every {cfg.cycleDays} days per ₱{cfg.increment.toLocaleString()}; capital and the Locked-In Bonus are added to the final payout.
      </p>
    </div>
  );
}

function Tile({ icon: Icon, label, value, sub, tone }: { icon: typeof Lock; label: string; value: string; sub?: string; tone: "green" | "gold" | "vault" }) {
  const color = tone === "green" ? "text-green" : tone === "gold" ? "text-gold" : "text-vault";
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("w-3.5 h-3.5", color)} />
        <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0">{label}</p>
      </div>
      <p className={cn("text-[18px] font-mono font-medium m-0 tabular-nums", color)}>{value}</p>
      {sub && <p className="text-[9px] text-text-subtle m-0 mt-0.5">{sub}</p>}
    </Card>
  );
}
