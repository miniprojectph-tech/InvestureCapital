"use client";

import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { Card, CardHeader } from "./Card";
import { useUserState } from "@/lib/useUserState";
import { useNow, nextPayoutAt, formatCountdown, placementPerCycle, peso } from "@/lib/compplan";

/** Dashboard tile: compact list of running placements. */
export function ActivePlansList() {
  const { state, loading } = useUserState();
  const now = useNow(30_000);

  if (loading || !state) {
    return (
      <Card>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 text-gold animate-spin" />
        </div>
      </Card>
    );
  }

  const placements = [...(state.placements ?? [])].sort((a, b) => nextPayoutAt(a) - nextPayoutAt(b));

  return (
    <Card>
      <CardHeader title="Active placements" right={<span className="text-[10px] text-text-subtle">{placements.length} active</span>} />
      <div>
        {placements.length === 0 && (
          <p className="text-[11px] text-text-subtle py-2 m-0">No placements yet. Place capital to start receiving payouts every 5 days.</p>
        )}
        {placements.map((p, i) => {
          const pct = (p.cyclesPaid / p.cycles) * 100;
          return (
            <div key={p.id} className={`py-2 ${i < placements.length - 1 ? "border-b border-border" : ""}`}>
              <div className="flex justify-between mb-1.5 gap-2">
                <span className="text-[12px] font-medium text-text font-mono">{p.id}</span>
                <span className="text-[10px] font-mono text-text-subtle">
                  {p.cyclesPaid}/{p.cycles} · +{peso(placementPerCycle(p))} in {formatCountdown(nextPayoutAt(p) - now)}
                </span>
              </div>
              <div className="h-[3px] bg-border rounded-full">
                <div className="h-full bg-green rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <Link href="/plans" className="mt-3 w-full flex items-center justify-center gap-1.5 text-[11px] py-2 border border-border-gold/40 text-gold rounded-md hover:bg-gold/5 transition-colors">
        <Plus className="w-3 h-3" /> Place capital
      </Link>
    </Card>
  );
}
