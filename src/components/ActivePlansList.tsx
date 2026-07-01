"use client";

"use client";

import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { Card, CardHeader } from "./Card";
import { useUserState } from "@/lib/useUserState";
import { usePlans } from "@/lib/plans";
import { getDayProgress } from "@/lib/userState";

export function ActivePlansList() {
  const { state, loading } = useUserState();
  const { plans: templates } = usePlans();

  if (loading || !state) {
    return (
      <Card>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 text-gold animate-spin" />
        </div>
      </Card>
    );
  }

  const plans = state.activePlans;

  return (
    <Card>
      <CardHeader
        title="Active plans"
        right={
          <span className="text-[10px] text-text-subtle">
            {plans.length} active
          </span>
        }
      />
      <div>
        {plans.length === 0 && (
          <p className="text-[11px] text-text-subtle py-2 m-0">
            No active plans yet. Activate one to start earning.
          </p>
        )}
        {plans.map((ap, i) => {
          const tpl = templates.find((p) => p.id === ap.planId);
          const name = tpl?.name ?? ap.planName ?? ap.planId;
          const durationDays = ap.durationDays ?? tpl?.durationDays;
          if (durationDays == null) return null;
          const day = getDayProgress(ap, durationDays);
          const pct = (day / durationDays) * 100;
          return (
            <div
              key={ap.id}
              className={`py-2 ${i < plans.length - 1 ? "border-b border-border" : ""}`}
            >
              <div className="flex justify-between mb-1.5">
                <span className="text-[12px] font-medium text-text">{name}</span>
                <span className="text-[10px] font-mono text-text-subtle">
                  D{day}/{durationDays}
                </span>
              </div>
              <div className="h-[3px] bg-border rounded-full">
                <div
                  className="h-full bg-blue rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <Link
        href="/plans"
        className="mt-3 w-full flex items-center justify-center gap-1.5 text-[11px] py-2 border border-border-gold/40 text-gold rounded-md hover:bg-gold/5 transition-colors"
      >
        <Plus className="w-3 h-3" /> Activate new plan
      </Link>
    </Card>
  );
}
