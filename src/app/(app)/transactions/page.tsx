"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  Plus,
  CheckCircle2,
  RefreshCw,
  Search,
  Download,
  ArrowDownToLine,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card } from "@/components/Card";
import { cn, formatPHP } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useUserActivity } from "@/lib/userActivity";
import { mockActivity } from "@/lib/mock-data";

type TxRow = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  amount?: number;
  amountKind?: "in" | "out" | "neutral";
  at: number;
};

type Meta = { label: string; icon: LucideIcon; color: string; bg: string };

const typeMeta: Record<string, Meta> = {
  payout: { label: "Payout", icon: ArrowDownRight, color: "text-green", bg: "bg-green/15" },
  compound: { label: "Compound", icon: TrendingUp, color: "text-vault", bg: "bg-vault/15" },
  "vault-growth": { label: "Vault growth", icon: TrendingUp, color: "text-vault", bg: "bg-vault/15" },
  "plan-activate": { label: "Plan activated", icon: Plus, color: "text-text-muted", bg: "bg-white/5" },
  "plan-complete": { label: "Plan complete", icon: CheckCircle2, color: "text-blue", bg: "bg-blue/15" },
  withdrawal: { label: "Withdrawal", icon: ArrowUpRight, color: "text-text-muted", bg: "bg-white/5" },
  reinvest: { label: "Reinvest", icon: RefreshCw, color: "text-gold", bg: "bg-gold/15" },
  deposit: { label: "Top up", icon: ArrowDownToLine, color: "text-green", bg: "bg-green/15" },
};

const DEFAULT_META: Meta = {
  label: "Activity",
  icon: RefreshCw,
  color: "text-text-muted",
  bg: "bg-white/5",
};

// Event types that represent earnings (profit), not returned capital or deposits.
const INCOME_TYPES = new Set(["vault-growth", "compound", "payout", "plan-complete"]);

export default function TransactionsPage() {
  const { demoMode } = useAuth();
  const { rows: liveRows, loading } = useUserActivity();
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  // Real activity for signed-in users; mock keeps the demo preview populated.
  const source: TxRow[] = useMemo(
    () =>
      demoMode
        ? mockActivity.map((e) => ({
            id: e.id,
            type: e.type,
            title: e.title,
            subtitle: e.subtitle,
            amount: e.amount,
            amountKind: e.amountKind,
            at: e.at.getTime(),
          }))
        : liveRows,
    [demoMode, liveRows]
  );

  const rows = useMemo(() => {
    return source
      .filter((ev) => filter === "all" || ev.type === filter)
      .filter(
        (ev) =>
          !query ||
          ev.title.toLowerCase().includes(query.toLowerCase()) ||
          ev.subtitle.toLowerCase().includes(query.toLowerCase())
      );
  }, [source, filter, query]);

  const totals = useMemo(() => {
    const deposited = source
      .filter((e) => e.type === "deposit")
      .reduce((s, e) => s + (e.amount ?? 0), 0);
    const income = source
      .filter((e) => INCOME_TYPES.has(e.type))
      .reduce((s, e) => s + (e.amount ?? 0), 0);
    // Returned capital isn't a loss, so net income is simply earnings.
    return { deposited, income, netIncome: income };
  }, [source]);

  // Only show filter chips for event types that actually appear.
  const presentTypes = useMemo(() => {
    const set = new Set(source.map((e) => e.type));
    return (Object.keys(typeMeta) as string[]).filter((t) => set.has(t));
  }, [source]);

  return (
    <div>
      <TopHeader title="Transactions" subtitle="Deposits, investments, income and payouts" />

      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: "Total in", sub: "Deposited", value: formatPHP(totals.deposited), color: "text-green" },
          { label: "Total income", sub: "Earnings", value: formatPHP(totals.income), color: "text-green" },
          {
            label: "Net income",
            sub: "Your profit",
            value: `${totals.netIncome > 0 ? "+" : ""}${formatPHP(totals.netIncome)}`,
            color: "text-green",
          },
        ].map((s) => (
          <Card key={s.label} className="lift">
            <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0 mb-1">{s.label}</p>
            <p className={cn("text-[18px] font-medium font-mono m-0 tabular-nums", s.color)}>
              {s.value}
            </p>
            <p className="text-[9px] text-text-subtle m-0 mt-0.5">{s.sub}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setFilter("all")}
          className={cn(
            "text-[11px] px-3 py-1.5 rounded-full border transition",
            filter === "all"
              ? "bg-gold/15 border-border-gold text-gold font-medium"
              : "bg-card border-border text-text-muted hover:text-text"
          )}
        >
          All
        </button>
        {presentTypes.map((t) => {
          const meta = typeMeta[t] ?? DEFAULT_META;
          const Icon = meta.icon;
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                "text-[11px] px-3 py-1.5 rounded-full border transition flex items-center gap-1.5",
                filter === t
                  ? "bg-gold/15 border-border-gold text-gold font-medium"
                  : "bg-card border-border text-text-muted hover:text-text"
              )}
            >
              <Icon className="w-3 h-3" />
              {meta.label}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-full">
            <Search className="w-3 h-3 text-text-subtle" />
            <input
              type="text"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-transparent text-[11px] outline-none w-32 text-text placeholder:text-text-subtle"
            />
          </div>
          <button className="text-[11px] px-3 py-1.5 bg-card border border-border rounded-full text-text-muted hover:text-text flex items-center gap-1.5">
            <Download className="w-3 h-3" /> Export
          </button>
        </div>
      </div>

      <Card>
        <table className="w-full text-[11px] table-fixed">
          <colgroup>
            <col style={{ width: "36%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "20%" }} />
          </colgroup>
          <thead>
            <tr className="text-text-subtle text-left">
              <th className="font-normal py-2">Description</th>
              <th className="font-normal py-2">Type</th>
              <th className="font-normal py-2">Date</th>
              <th className="font-normal py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {loading && !demoMode && (
              <tr>
                <td colSpan={4} className="text-center py-8">
                  <Loader2 className="w-4 h-4 text-gold animate-spin inline" />
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-text-subtle py-8">
                  {source.length === 0
                    ? "No transactions yet. Top up your wallet and activate a plan to get started."
                    : "No transactions match this filter."}
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const meta = typeMeta[row.type] ?? DEFAULT_META;
              const Icon = meta.icon;
              const sign = row.amountKind === "in" ? "+" : row.amountKind === "out" ? "−" : "";
              return (
                <tr key={row.id} className="border-t border-border">
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "w-6 h-6 rounded-md flex items-center justify-center shrink-0",
                          meta.bg
                        )}
                      >
                        <Icon className={cn("w-3 h-3", meta.color)} />
                      </div>
                      <div className="min-w-0">
                        <p className="m-0 text-[11px] truncate">{row.title}</p>
                        <p className="m-0 text-[9px] text-text-subtle truncate">{row.subtitle}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 text-text-muted">{meta.label}</td>
                  <td className="py-2 text-text-muted">
                    {new Date(row.at).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td
                    className={cn(
                      "py-2 text-right font-mono",
                      row.amountKind === "in" ? "text-green" : "text-text-muted"
                    )}
                  >
                    {row.amount !== undefined ? `${sign}${formatPHP(row.amount)}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
