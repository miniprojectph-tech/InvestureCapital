"use client";

import { Clock, CheckCircle2, XCircle } from "lucide-react";
import { usePlanRequests, type PlanRequestStatus } from "@/lib/planRequests";
import { formatPHP, cn } from "@/lib/utils";

const statusMeta: Record<
  PlanRequestStatus,
  { label: string; color: string; bg: string; icon: typeof Clock }
> = {
  pending: { label: "Pending", color: "text-vault", bg: "bg-vault/15", icon: Clock },
  approved: { label: "Approved", color: "text-green", bg: "bg-green/15", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "text-red", bg: "bg-red/15", icon: XCircle },
};

export function PendingPlanRequests() {
  const { rows, loading } = usePlanRequests("me");

  const recent = rows.slice(0, 5);
  if (loading || recent.length === 0) return null;

  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0">
          Your plan requests
        </p>
        {pendingCount > 0 && (
          <span className="text-[10px] font-medium bg-vault/15 text-vault px-2 py-0.5 rounded-full">
            {pendingCount} pending
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {recent.map((r) => {
          const meta = statusMeta[r.status];
          const Icon = meta.icon;
          return (
            <div
              key={r.id}
              className="flex items-center justify-between gap-2 px-2.5 py-2 bg-canvas border border-border rounded-md"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                    meta.bg
                  )}
                >
                  <Icon className={cn("w-2.5 h-2.5", meta.color)} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] m-0">
                    <span className="font-mono">{formatPHP(r.amount)}</span>
                    <span className="text-text-subtle"> · {r.planName}</span>
                  </p>
                  <p className="text-[9px] text-text-subtle m-0">
                    {r.methodLabel} · {new Date(r.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                  </p>
                </div>
              </div>
              <span className={cn("text-[9px] px-1.5 py-0.5 rounded-md shrink-0", meta.bg, meta.color)}>
                {meta.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
