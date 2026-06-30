import Link from "next/link";
import { Card, CardHeader } from "./Card";
import { formatPHP } from "@/lib/utils";
import { mockPlanHistory } from "@/lib/mock-data";

export function PlanHistoryTable() {
  return (
    <Card>
      <CardHeader
        title="Plan history"
        right={
          <Link href="/plans" className="text-[10px] text-gold hover:underline">
            View all ({mockPlanHistory.length})
          </Link>
        }
      />
      <div>
        {mockPlanHistory.map((row, i) => (
          <div
            key={row.id}
            className={`py-2.5 ${i < mockPlanHistory.length - 1 ? "border-b border-border" : ""}`}
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
                <p className="m-0 text-text-subtle uppercase tracking-wider text-[9px]">Earned</p>
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
