"use client";

import { useMemo, useState } from "react";
import { Search, Users, Zap, Award, XCircle, Coins } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { formatPHP, cn } from "@/lib/utils";
import { useCompPlan, useAllCommissions, type Commission } from "@/lib/compplan";

type TypeFilter = "all" | Commission["type"];
type StatusFilter = "all" | "paid" | "skipped";

const TYPE_LABEL: Record<Commission["type"], string> = { level: "Level commission", fastStart: "Fast-Start", leadership: "Leadership" };
const TYPE_TONE: Record<Commission["type"], string> = { level: "bg-blue/15 text-blue", fastStart: "bg-vault/15 text-vault", leadership: "bg-gold/15 text-gold" };

export default function AdminReferralsPage() {
  const { cfg } = useCompPlan();
  const rows = useAllCommissions(500);
  const [type, setType] = useState<TypeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const totals = useMemo(() => {
    const paid = rows.filter((r) => r.status === "paid");
    const byLevel = new Map<number, number>();
    for (const r of paid) if (r.type === "level" && r.level) byLevel.set(r.level, (byLevel.get(r.level) ?? 0) + r.amount);
    return {
      level: paid.filter((r) => r.type === "level").reduce((s, r) => s + r.amount, 0),
      fastStart: paid.filter((r) => r.type === "fastStart").reduce((s, r) => s + r.amount, 0),
      leadership: paid.filter((r) => r.type === "leadership").reduce((s, r) => s + r.amount, 0),
      skipped: rows.filter((r) => r.status === "skipped").reduce((s, r) => s + r.amount, 0),
      skippedCount: rows.filter((r) => r.status === "skipped").length,
      byLevel,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (type === "all" || r.type === type) &&
        (status === "all" || r.status === status) &&
        (!q || r.toUserName.toLowerCase().includes(q) || r.fromUserName.toLowerCase().includes(q) || r.placementId.toLowerCase().includes(q)),
    );
  }, [rows, type, status, search]);

  return (
    <div>
      <TopHeader title="Referrals" subtitle={`Six-level commission ledger · ${cfg.referralLevels.join(" / ")}% · newest ${rows.length} records`} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Kpi icon={Coins} label="Commissions paid" value={formatPHP(totals.level)} tone="text-blue" sub={[...totals.byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([l, v]) => `L${l} ${formatPHP(v, { short: true })}`).join(" · ") || undefined} />
        <Kpi icon={Zap} label="Fast-Start paid" value={formatPHP(totals.fastStart)} tone="text-vault" />
        <Kpi icon={Award} label="Leadership paid" value={formatPHP(totals.leadership)} tone="text-gold" />
        <Kpi icon={XCircle} label="Skipped (not paid)" value={formatPHP(totals.skipped)} tone="text-red" sub={`${totals.skippedCount} record${totals.skippedCount === 1 ? "" : "s"} — upline inactive`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {(["all", "level", "fastStart", "leadership"] as TypeFilter[]).map((t) => (
          <button key={t} onClick={() => setType(t)} className={cn("text-[11px] px-3 py-1.5 rounded-full border transition", type === t ? "bg-gold/15 border-border-gold text-gold font-medium" : "bg-card border-border text-text-muted hover:text-text")}>
            {t === "all" ? "All types" : TYPE_LABEL[t]}
          </button>
        ))}
        <span className="w-px h-5 bg-border mx-1" />
        {(["all", "paid", "skipped"] as StatusFilter[]).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={cn("text-[11px] px-3 py-1.5 rounded-full border transition", status === s ? "bg-gold/15 border-border-gold text-gold font-medium" : "bg-card border-border text-text-muted hover:text-text")}>
            {s === "all" ? "Paid + skipped" : s === "paid" ? "Paid" : "Skipped"}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-full">
          <Search className="w-3 h-3 text-text-subtle" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or Plan ID…" className="bg-transparent text-[11px] outline-none w-36 text-text placeholder:text-text-subtle" />
        </div>
      </div>

      <Card>
        <CardHeader title="Ledger" subtitle="Every commission and bonus the engine evaluated — paid or skipped with the reason" right={<Users className="w-4 h-4 text-text-subtle" />} />
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[720px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-wider text-text-subtle text-left">
                <th className="font-medium py-2">Type</th>
                <th className="font-medium py-2">Paid to</th>
                <th className="font-medium py-2">From</th>
                <th className="font-medium py-2">Placement</th>
                <th className="font-medium py-2">Date</th>
                <th className="font-medium py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center text-text-subtle py-8">No records match.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-2">
                    <span className={cn("text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full", TYPE_TONE[r.type])}>
                      {r.type === "level" ? `Level ${r.level}` : TYPE_LABEL[r.type]}
                    </span>
                    {r.status === "skipped" && <p className="text-[9px] text-red m-0 mt-1">Skipped: {r.reason}</p>}
                  </td>
                  <td className="py-2 text-text">{r.toUserName}</td>
                  <td className="py-2 text-text-muted">{r.fromUserName}</td>
                  <td className="py-2 font-mono text-text-muted">
                    {r.placementId}
                    {r.placementAmount ? <span className="text-text-subtle font-sans"> · {formatPHP(r.placementAmount, { short: true })}{r.pct ? ` × ${r.pct}%` : ""}</span> : null}
                    {r.tier ? <span className="text-text-subtle font-sans"> · {formatPHP(r.tier, { short: true })} tier</span> : null}
                  </td>
                  <td className="py-2 text-text-muted whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className={cn("py-2 text-right font-mono", r.status === "paid" ? "text-green" : "text-text-subtle line-through")}>{formatPHP(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: typeof Coins; label: string; value: string; sub?: string; tone: string }) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("w-3.5 h-3.5", tone)} />
        <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0">{label}</p>
      </div>
      <p className={cn("text-[18px] font-mono font-medium m-0 tabular-nums", tone)}>{value}</p>
      {sub && <p className="text-[9px] text-text-subtle m-0 mt-0.5 truncate">{sub}</p>}
    </Card>
  );
}
