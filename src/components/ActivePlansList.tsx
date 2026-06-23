import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, CardHeader } from "./Card";
import { mockActivePlans, mockPlans } from "@/lib/mock-data";

export function ActivePlansList() {
  return (
    <Card>
      <CardHeader
        title="Active plans"
        right={
          <span className="text-[10px] text-text-subtle">
            {mockActivePlans.length} of {mockActivePlans.length}
          </span>
        }
      />
      <div>
        {mockActivePlans.map((ap, i) => {
          const plan = mockPlans.find((p) => p.id === ap.planId);
          if (!plan) return null;
          const pct = (ap.dayProgress / plan.durationDays) * 100;
          return (
            <div
              key={i}
              className={`py-2 ${i < mockActivePlans.length - 1 ? "border-b border-border" : ""}`}
            >
              <div className="flex justify-between mb-1.5">
                <span className="text-[12px] font-medium text-text">{plan.name}</span>
                <span className="text-[10px] font-mono text-text-subtle">
                  D{ap.dayProgress}/{plan.durationDays}
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
