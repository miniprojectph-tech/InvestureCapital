"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Card, CardHeader } from "./Card";
import { formatPHP } from "@/lib/utils";
import { useUserState } from "@/lib/useUserState";
import { usePlans } from "@/lib/plans";

type Row = {
  id: string;
  name: string;
  capital: number;
  earned: number;
  vaultCredit: number | null;
  status: "active" | "done";
  at: number;
};

export function PlanHistoryTable() {
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

  const nameOf = (planId: string, snapshot?: string) =>
    templates.find((t) => t.id === planId)?.name ?? snapshot ?? planId;

  const active: Row[] = state.activePlans.map((p) => {
    const tpl = templates.find((t) => t.id === p.planId);
    const rate = p.dailyRate ?? tpl?.dailyRate;
    const duration = p.durationDays ?? tpl?.durationDays;
    const projected =
      rate != null && duration != null ? p.capital * (rate / 100) * duration : 0;
    return {
      id: p.id,
      name: nameOf(p.planId, p.planName),
      capital: p.capital,
      earned: projected,
      vaultCredit: null,
      status: "active",
      at: p.startedAt,
    };
  });

  const done: Row[] = (state.completedPlans ?? []).map((p) => ({
    id: p.id,
    name: nameOf(p.planId, p.planName),
    capital: p.capital,
    earned: p.vaultCredited ?? 0,
    vaultCredit: p.vaultCredited ?? 0,
    status: "done",
    at: p.completedAt,
  }));

  // Active plans first, then most-recently completed.
  const rows = [
    ...active.sort((a, b) => b.at - a.at),
    ...done.sort((a, b) => b.at - a.at),
  ];
  const visible = rows.slice(0, 5);

  return (
    <Card>
      <CardHeader
        title="Plan history"
        right={
          <Link href="/plans" className="text-[10px] text-gold hover:underline">
            View all ({rows.length})
          </Link>
        }
      />
      <div>
        {visible.length === 0 && (
          <p className="text-[11px] text-text-subtle py-2 m-0">
            No plans yet. Activate a plan to start building your vault.
          </p>
        )}
        {visible.map((row, i) => (
          <div
            key={row.id}
            className={`py-2.5 ${i < visible.length - 1 ? "border-b border-border" : ""}`}
          >
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[12px] font-medium text-text truncate min-w-0">
                {row.name}
              </span>
              <span
                className={
                  row.status === "active"
                    ? "text-[9px] bg-green/15 text-green px-2 py-0.5 rounded-md shrink-0"
                    : "text-[9px] bg-blue/15 text-blue px-2 py-0.5 rounded-md shrink-0"
                }
              >
                {row.status === "active" ? "Active" : "Done"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div>
                <p className="m-0 text-text-subtle uppercase tracking-wider text-[9px]">Capital</p>
                <p className="m-0 font-mono text-text-muted mt-0.5">
                  {formatPHP(row.capital, { short: true })}
                </p>
              </div>
              <div>
                <p className="m-0 text-text-subtle uppercase tracking-wider text-[9px]">
                  {row.status === "active" ? "Projected" : "Earned"}
                </p>
                <p className="m-0 font-mono text-text-muted mt-0.5">
                  {formatPHP(row.earned, { short: true })}
                </p>
              </div>
              <div className="text-right">
                <p className="m-0 text-vault-muted uppercase tracking-wider text-[9px]">→ Vault</p>
                <p className="m-0 font-mono text-vault mt-0.5">
                  {row.vaultCredit !== null ? formatPHP(row.vaultCredit, { short: true }) : "—"}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
