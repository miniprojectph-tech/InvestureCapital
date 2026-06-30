"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  Plus,
  CheckCircle2,
  RefreshCw,
  Search,
  Loader2,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  type LucideIcon,
} from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { cn, formatPHP } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import {
  fetchAllActivity,
  listInvestors,
  type AdminActivityRow,
  type InvestorRow,
} from "@/lib/adminQueries";

const PAGE_SIZE = 20;
const FETCH_CAP = 500;

type SortKey = "newest" | "oldest" | "amount-desc" | "amount-asc";

const typeMeta: Record<
  string,
  { label: string; icon: LucideIcon; color: string; bg: string }
> = {
  payout: { label: "Payout", icon: ArrowDownRight, color: "text-green", bg: "bg-green/15" },
  compound: { label: "Compound", icon: TrendingUp, color: "text-vault", bg: "bg-vault/15" },
  "plan-activate": { label: "Plan activated", icon: Plus, color: "text-text-muted", bg: "bg-white/5" },
  "plan-complete": { label: "Plan complete", icon: CheckCircle2, color: "text-blue", bg: "bg-blue/15" },
  withdrawal: { label: "Withdrawal", icon: ArrowUpRight, color: "text-text-muted", bg: "bg-white/5" },
  reinvest: { label: "Reinvest", icon: RefreshCw, color: "text-gold", bg: "bg-gold/15" },
  deposit: { label: "Top up", icon: ChevronRight, color: "text-green", bg: "bg-green/15" },
};

function metaFor(type: string) {
  return (
    typeMeta[type] ?? {
      label: type,
      icon: ChevronRight as unknown as LucideIcon,
      color: "text-text-muted",
      bg: "bg-card-elev",
    }
  );
}

export default function AdminTransactionsPage() {
  const { user, demoMode } = useAuth();
  const [investors, setInvestors] = useState<InvestorRow[]>([]);
  const [allRows, setAllRows] = useState<AdminActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [typeFilter, setTypeFilter] = useState<string | "all">("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (demoMode || !user) {
        if (!cancelled) {
          setAllRows([]);
          setLoading(false);
        }
        return;
      }
      const { db } = getFirebase();
      if (!db) {
        setLoading(false);
        return;
      }
      try {
        // Load investors + activity in parallel
        const [people, rows] = await Promise.all([
          listInvestors(db, 500).catch(() => [] as InvestorRow[]),
          fetchAllActivity(db, FETCH_CAP),
        ]);
        if (!cancelled) {
          setInvestors(people);
          setAllRows(rows);
          setLoading(false);
        }
      } catch (err) {
        console.error("activity fetch failed", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load activity");
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, demoMode]);

  async function refresh() {
    const { db } = getFirebase();
    if (!db) return;
    setRefreshing(true);
    setError(null);
    try {
      const rows = await fetchAllActivity(db, FETCH_CAP);
      setAllRows(rows);
      setPage(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  const userNameById = useMemo(() => {
    const m = new Map<string, { name: string; email: string }>();
    for (const i of investors) m.set(i.uid, { name: i.name, email: i.email });
    return m;
  }, [investors]);

  // Apply filter + search + sort to ALL rows, then paginate
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    let list = allRows.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (!q) return true;
      const u = userNameById.get(r.userId);
      return (
        r.title.toLowerCase().includes(q) ||
        r.subtitle.toLowerCase().includes(q) ||
        u?.name.toLowerCase().includes(q) ||
        u?.email.toLowerCase().includes(q) ||
        r.userId.toLowerCase().includes(q)
      );
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.at - b.at;
        case "amount-desc":
          return (b.amount ?? 0) - (a.amount ?? 0);
        case "amount-asc":
          return (a.amount ?? 0) - (b.amount ?? 0);
        case "newest":
        default:
          return b.at - a.at;
      }
    });
    return list;
  }, [allRows, query, sort, typeFilter, userNameById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  // Reset to page 0 when filters change
  useEffect(() => {
    setPage(0);
  }, [query, sort, typeFilter]);

  return (
    <div>
      <TopHeader
        title="Platform transactions"
        subtitle={`${filtered.length} of ${allRows.length} loaded · page ${safePage + 1} of ${totalPages}`}
      />

      {error && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red whitespace-pre-wrap">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setTypeFilter("all")}
          className={cn(
            "text-[11px] px-3 py-1.5 rounded-full border transition",
            typeFilter === "all"
              ? "bg-gold/15 border-border-gold text-gold font-medium"
              : "bg-card border-border text-text-muted hover:text-text"
          )}
        >
          All
        </button>
        {Object.keys(typeMeta).map((t) => {
          const meta = typeMeta[t];
          const Icon = meta.icon;
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                "text-[11px] px-3 py-1.5 rounded-full border transition flex items-center gap-1.5",
                typeFilter === t
                  ? "bg-gold/15 border-border-gold text-gold font-medium"
                  : "bg-card border-border text-text-muted hover:text-text"
              )}
            >
              <Icon className="w-3 h-3" />
              {meta.label}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-full">
            <Search className="w-3 h-3 text-text-subtle" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search investor / description…"
              className="bg-transparent text-[11px] outline-none w-48 text-text placeholder:text-text-subtle"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="text-[11px] px-3 py-1.5 bg-card border border-border rounded-full text-text-muted outline-none cursor-pointer"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="amount-desc">Amount (high → low)</option>
            <option value="amount-asc">Amount (low → high)</option>
          </select>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="text-[11px] px-3 py-1.5 bg-card border border-border rounded-full text-text-muted hover:text-text flex items-center gap-1.5 disabled:opacity-60"
          >
            {refreshing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Refresh
          </button>
        </div>
      </div>

      <Card>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-5 h-5 text-vault animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <p className="text-[11px] text-text-subtle text-center py-12 m-0">
            {allRows.length === 0
              ? "No transactions in Firestore yet. Activity is logged when investors get payouts, withdraw, or activate plans."
              : "No transactions match the current filter."}
          </p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[11px] table-fixed min-w-[700px]">
              <colgroup>
                <col style={{ width: "26%" }} />
                <col style={{ width: "34%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "12%" }} />
              </colgroup>
              <thead>
                <tr className="text-text-subtle text-left">
                  <th className="font-normal py-2">Investor</th>
                  <th className="font-normal py-2">Description</th>
                  <th className="font-normal py-2">Type</th>
                  <th className="font-normal py-2">Date</th>
                  <th className="font-normal py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const meta = metaFor(row.type);
                  const Icon = meta.icon;
                  const u = userNameById.get(row.userId);
                  const sign =
                    row.amountKind === "in" ? "+" : row.amountKind === "out" ? "−" : "";
                  return (
                    <tr key={row.path} className="border-t border-border">
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue/15 text-blue text-[9px] font-medium flex items-center justify-center shrink-0">
                            {(u?.name?.[0] ?? "?").toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="m-0 text-[11px] truncate">{u?.name ?? row.userId.slice(0, 8)}</p>
                            <p className="m-0 text-[9px] text-text-subtle truncate">{u?.email ?? ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-6 h-6 rounded-md flex items-center justify-center shrink-0", meta.bg)}>
                            <Icon className={cn("w-3 h-3", meta.color)} />
                          </div>
                          <div className="min-w-0">
                            <p className="m-0 text-[11px] truncate">{row.title}</p>
                            <p className="m-0 text-[9px] text-text-subtle truncate">{row.subtitle}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 text-text-muted">{meta.label}</td>
                      <td className="py-2 text-text-muted text-[10px]">
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
                          row.amountKind === "in"
                            ? "text-green"
                            : row.amountKind === "out"
                            ? "text-text-muted"
                            : "text-text"
                        )}
                      >
                        {row.amount !== undefined ? `${sign}${formatPHP(row.amount)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between mt-3">
        <p className="text-[10px] text-text-subtle m-0">
          Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}
          {allRows.length === FETCH_CAP && (
            <span className="ml-2 text-text-dim">(capped at {FETCH_CAP})</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="text-[11px] px-3 py-1.5 bg-card border border-border-strong rounded-md text-text-muted hover:text-text disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <ChevronLeft className="w-3 h-3" /> Previous
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            className="text-[11px] px-3 py-1.5 bg-gold text-gold-dark rounded-md font-medium hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            Next <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
