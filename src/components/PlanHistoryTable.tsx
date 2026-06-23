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
      <table className="w-full text-[11px] table-fixed">
        <colgroup>
          <col style={{ width: "35%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "11%" }} />
        </colgroup>
        <thead>
          <tr className="text-text-subtle text-left">
            <th className="font-normal py-1">Plan</th>
            <th className="font-normal py-1 text-right">Capital</th>
            <th className="font-normal py-1 text-right">Earned</th>
            <th className="font-normal py-1 text-right">Vault</th>
            <th className="font-normal py-1 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {mockPlanHistory.map((row) => (
            <tr key={row.id} className="border-t border-border">
              <td className="py-1.5">{row.name}</td>
              <td className="py-1.5 text-right font-mono">{formatPHP(row.capital, { short: true })}</td>
              <td className="py-1.5 text-right font-mono">{formatPHP(row.earned, { short: true })}</td>
              <td className="py-1.5 text-right font-mono">
                {row.vaultCredit !== null ? formatPHP(row.vaultCredit, { short: true }) : "—"}
              </td>
              <td className="py-1.5 text-right">
                <span
                  className={
                    row.status === "active"
                      ? "text-[9px] bg-green/15 text-green px-1.5 py-0.5 rounded-md"
                      : "text-[9px] bg-blue/15 text-blue px-1.5 py-0.5 rounded-md"
                  }
                >
                  {row.status === "active" ? "Active" : "Done"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
