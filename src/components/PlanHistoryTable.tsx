"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Card, CardHeader } from "./Card";
import { formatPHP } from "@/lib/utils";
import { useUserState } from "@/lib/useUserState";

type Row = {
  id: string;
  term: number;
  capital: number;
  paid: number;
  bonus: number;
  status: "active" | "done";
  at: number;
};

/** Dashboard tile: running and completed placements, newest first. */
export function PlanHistoryTable() {
  const { state, loading } = useUserState();

  if (loading || !state) {
    return (
      <Card>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 text-gold animate-spin" />
        </div>
      </Card>
    );
  }

  const active: Row[] = (state.placements ?? []).map((p) => ({
    id: p.id,
    term: p.termMonths,
    capital: p.capital,
    paid: p.totalPaid ?? 0,
    bonus: p.lockedBonus,
    status: "active",
    at: p.startedAt,
  }));
  const done: Row[] = (state.completedPlacements ?? []).map((p) => ({
    id: p.id,
    term: p.termMonths,
    capital: p.capital,
    paid: p.totalPaid ?? 0,
    bonus: p.lockedBonusPaid ?? 0,
    status: "done",
    at: p.completedAt,
  }));

  const rows = [...active.sort((a, b) => b.at - a.at), ...done.sort((a, b) => b.at - a.at)];
  const visible = rows.slice(0, 5);

  return (
    <Card>
      <CardHeader
        title="Placement history"
        right={
          <Link href="/plans" className="text-[10px] text-gold hover:underline">
            View all ({rows.length})
          </Link>
        }
      />
      <div>
        {visible.length === 0 && <p className="text-[11px] text-text-subtle py-2 m-0">No placements yet.</p>}
        {visible.map((row, i) => (
          <div key={row.id} className={`py-2.5 ${i < visible.length - 1 ? "border-b border-border" : ""}`}>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[12px] font-medium text-text font-mono truncate min-w-0">
                {row.id} <span className="text-text-subtle font-sans font-normal">· {row.term} mo</span>
              </span>
              <span className={row.status === "active" ? "text-[9px] bg-green/15 text-green px-2 py-0.5 rounded-md shrink-0" : "text-[9px] bg-blue/15 text-blue px-2 py-0.5 rounded-md shrink-0"}>
                {row.status === "active" ? "Active" : "Done"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div>
                <p className="m-0 text-text-subtle uppercase tracking-wider text-[9px]">Capital</p>
                <p className="m-0 font-mono text-text-muted mt-0.5">{formatPHP(row.capital, { short: true })}</p>
              </div>
              <div>
                <p className="m-0 text-text-subtle uppercase tracking-wider text-[9px]">{row.status === "active" ? "Paid so far" : "Income"}</p>
                <p className="m-0 font-mono text-green mt-0.5">{formatPHP(row.paid, { short: true })}</p>
              </div>
              <div className="text-right">
                <p className="m-0 text-vault-muted uppercase tracking-wider text-[9px]">{row.status === "active" ? "Bonus due" : "Bonus"}</p>
                <p className="m-0 font-mono text-vault mt-0.5">{row.bonus > 0 ? formatPHP(row.bonus, { short: true }) : "—"}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
