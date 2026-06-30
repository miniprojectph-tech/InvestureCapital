"use client";

import Link from "next/link";
import { Coins, Plus, Loader2 } from "lucide-react";
import { formatPHP, cn } from "@/lib/utils";
import { usePlans } from "@/lib/plans";
import { useUserState } from "@/lib/useUserState";
import { getDayProgress } from "@/lib/userState";

export function ActivePlansDetailed() {
  const { state, loading: stateLoading } = useUserState();
  const { plans, loading: plansLoading } = usePlans();

  if (stateLoading || plansLoading || !state) {
    return (
      <div className="bg-card border border-border rounded-2xl flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
      </div>
    );
  }

  const activePlans = state.activePlans;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <p className="text-[13px] font-medium m-0 text-text">Your active plans</p>
          <p className="text-[10px] text-text-subtle mt-0.5 m-0">
            {activePlans.length === 0
              ? "Nothing running yet"
              : `${activePlans.length} ${activePlans.length === 1 ? "plan" : "plans"} accruing income`}
          </p>
        </div>
        <div className="w-9 h-9 rounded-lg bg-green/15 flex items-center justify-center">
          <Coins className="w-4 h-4 text-green" />
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {activePlans.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-card-elev flex items-center justify-center mb-3">
              <Coins className="w-6 h-6 text-text-subtle" />
            </div>
            <p className="text-[12px] font-medium m-0 mb-1">No active plans yet</p>
            <p className="text-[11px] text-text-subtle m-0 max-w-[260px]">
              Pick a plan on the left and click <span className="text-gold">Activate</span> to
              start earning daily income and seeding your vault.
            </p>
          </div>
        ) : (
          activePlans.map((ap, i) => {
            const plan = plans.find((p) => p.id === ap.planId);
            const name = plan?.name ?? ap.planId;
            const duration = plan?.durationDays ?? 0;
            const dailyRate = plan?.dailyRate ?? 0;
            const day = duration ? getDayProgress(ap, duration) : 1;
            const pct = duration ? (day / duration) * 100 : 0;
            const dailyIncome = ap.capital * (dailyRate / 100);
            const totalAtCompletion = dailyIncome * duration;
            const daysRemaining = Math.max(0, duration - day);

            return (
              <div
                key={ap.id}
                className={cn(
                  "px-5 py-4 transition",
                  i < activePlans.length - 1 && "border-b border-border",
                  i % 2 === 1 && "bg-card-elev/30"
                )}
              >
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-[12px] font-medium text-text truncate">{name}</span>
                  <span className="text-[10px] text-vault-muted font-mono shrink-0 ml-2">
                    → {formatPHP(totalAtCompletion, { short: true })} vault
                  </span>
                </div>

                <div className="flex gap-2.5 text-[10px] text-text-muted mb-2">
                  <span className="font-mono">{formatPHP(ap.capital, { short: true })}</span>
                  <span className="text-text-dim">·</span>
                  <span>{dailyRate}% / day</span>
                  <span className="text-text-dim">·</span>
                  <span className="font-mono text-green">+{formatPHP(dailyIncome)} / day</span>
                </div>

                <div className="h-[3px] bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green to-[#2EA776] rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex justify-between mt-1.5 text-[9px] text-text-subtle">
                  <span>
                    Day <span className="font-mono text-text-muted">{day}</span> of {duration}
                  </span>
                  <span>
                    {daysRemaining === 0
                      ? "Completes today"
                      : `${daysRemaining} ${daysRemaining === 1 ? "day" : "days"} left`}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="p-4 border-t border-border">
        <Link
          href="/wallet"
          className="w-full block text-center text-[11px] py-2.5 border border-border-strong rounded-lg text-text-muted hover:text-text hover:bg-card-elev transition"
        >
          <Plus className="w-3 h-3 inline-block mr-1 -translate-y-px" />
          Reinvest from wallet
        </Link>
      </div>
    </div>
  );
}
