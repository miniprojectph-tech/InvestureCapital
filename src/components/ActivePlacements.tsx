"use client";

import Link from "next/link";
import { Coins, Plus, Loader2, Clock, CheckCircle2 } from "lucide-react";
import { formatPHP, cn } from "@/lib/utils";
import { useUserState } from "@/lib/useUserState";
import {
  useNow,
  nextPayoutAt,
  placementPerCycle,
  placementDailyAccrual,
  placementFinalExtra,
  formatCountdown,
  peso,
} from "@/lib/compplan";

/** The member's running placements with payout progress and countdowns. */
export function ActivePlacements() {
  const { state, loading } = useUserState();
  const now = useNow(30_000);

  if (loading || !state) {
    return (
      <div className="bg-card border border-border rounded-2xl flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
      </div>
    );
  }

  const placements = [...(state.placements ?? [])].sort((a, b) => nextPayoutAt(a) - nextPayoutAt(b));
  const completed = state.completedPlacements ?? [];

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <p className="text-[13px] font-medium m-0 text-text">Your placements</p>
          <p className="text-[10px] text-text-subtle mt-0.5 m-0">
            {placements.length === 0 ? "Nothing running yet" : `${placements.length} active · ${peso(placements.reduce((s, p) => s + placementDailyAccrual(p), 0))} accruing per day`}
          </p>
        </div>
        <div className="w-9 h-9 rounded-lg bg-green/15 flex items-center justify-center">
          <Coins className="w-4 h-4 text-green" />
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {placements.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-card-elev flex items-center justify-center mb-3">
              <Coins className="w-6 h-6 text-text-subtle" />
            </div>
            <p className="text-[12px] font-medium m-0 mb-1">No placements yet</p>
            <p className="text-[11px] text-text-subtle m-0 max-w-[260px]">
              Choose a term and amount, then tap <span className="text-gold">Place</span> to start receiving a payout every 5 days.
            </p>
          </div>
        ) : (
          placements.map((p, i) => {
            const perCycle = placementPerCycle(p);
            const pct = (p.cyclesPaid / p.cycles) * 100;
            const nextAt = nextPayoutAt(p);
            const isFinalNext = p.cyclesPaid + 1 === p.cycles;
            const nextAmount = perCycle + (isFinalNext ? placementFinalExtra(p) : 0);
            return (
              <div key={p.id} className={cn("px-5 py-4", i < placements.length - 1 && "border-b border-border", i % 2 === 1 && "bg-card-elev/30")}>
                <div className="flex justify-between items-baseline mb-1 gap-2">
                  <span className="text-[12px] font-medium text-text font-mono">{p.id}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-card-elev text-text-muted shrink-0">
                    {p.termMonths}-month
                  </span>
                </div>

                <div className="flex gap-2.5 text-[10px] text-text-muted mb-2 flex-wrap">
                  <span className="font-mono">{formatPHP(p.capital, { short: true })}</span>
                  <span className="text-text-dim">·</span>
                  <span className="font-mono text-green">+{peso(perCycle)} / {p.cycleDays} days</span>
                  <span className="text-text-dim">·</span>
                  <span>{peso(placementDailyAccrual(p))} / day</span>
                </div>

                <div className="h-[3px] bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-green to-[#2EA776] rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>

                <div className="flex justify-between mt-1.5 text-[9px] text-text-subtle gap-2">
                  <span>
                    <span className="font-mono text-text-muted">{p.cyclesPaid}</span> of {p.cycles} payouts credited
                  </span>
                  <span className="flex items-center gap-1 text-right">
                    <Clock className="w-2.5 h-2.5" />
                    {isFinalNext ? "Final payout" : `Payout ${p.cyclesPaid + 1}`} {peso(nextAmount)} in {formatCountdown(nextAt - now)}
                  </span>
                </div>

                {p.lockedBonus > 0 && (
                  <p className="text-[9px] text-vault-muted m-0 mt-1.5">
                    Final payout includes {formatPHP(p.capital, { short: true })} capital + <span className="text-vault">{formatPHP(p.lockedBonus, { short: true })}</span> Locked-In Bonus
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {completed.length > 0 && (
        <div className="px-5 py-2.5 border-t border-border flex items-center gap-2 text-[10px] text-text-subtle">
          <CheckCircle2 className="w-3 h-3 text-blue" />
          {completed.length} completed · {formatPHP(completed.reduce((s, p) => s + p.totalPaid + p.lockedBonusPaid, 0), { short: true })} earned
        </div>
      )}

      <div className="p-4 border-t border-border">
        <Link href="/wallet" className="w-full block text-center text-[11px] py-2.5 border border-border-strong rounded-lg text-text-muted hover:text-text hover:bg-card-elev transition">
          <Plus className="w-3 h-3 inline-block mr-1 -translate-y-px" />
          Reinvest from wallet
        </Link>
      </div>
    </div>
  );
}
