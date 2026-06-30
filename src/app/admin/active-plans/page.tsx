"use client";

import { useEffect, useMemo, useState } from "react";
import { FastForward, Loader2, Timer, CheckCircle2, AlertCircle, Search } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { formatPHP, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import {
  listAllActivePlans,
  listAllCompletedPlans,
  type ActivePlanRow,
  type CompletedPlanRow,
} from "@/lib/adminQueries";
import { completePlanForUser } from "@/lib/userState";
import { usePlans } from "@/lib/plans";

type Tab = "active" | "expired";

export default function AdminActivePlansPage() {
  const { user, demoMode } = useAuth();
  const { plans: planTemplates } = usePlans();
  const [tab, setTab] = useState<Tab>("active");
  const [active, setActive] = useState<ActivePlanRow[]>([]);
  const [expired, setExpired] = useState<CompletedPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (demoMode || !user) {
        if (!cancelled) {
          setActive([]);
          setExpired([]);
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
        const [a, c] = await Promise.all([
          listAllActivePlans(db),
          listAllCompletedPlans(db),
        ]);
        if (!cancelled) {
          setActive(a);
          setExpired(c);
          setLoading(false);
        }
      } catch (err) {
        console.error("active plans fetch failed", err);
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load — check Firestore rules"
          );
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, demoMode, refreshKey]);

  async function pushToComplete(row: ActivePlanRow) {
    const { db } = getFirebase();
    if (!db || !user?.isAdmin) {
      setError("Admin role required.");
      return;
    }
    const tpl = planTemplates.find((t) => t.id === row.planId);
    if (!tpl) {
      setError(`Plan template ${row.planId} not found.`);
      return;
    }
    setBusy(row.id);
    setError(null);
    try {
      await completePlanForUser(db, row.userId, row.id, tpl.dailyRate, tpl.durationDays, tpl.name);
      // Refresh
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Push failed");
    } finally {
      setBusy(null);
    }
  }

  const filteredActive = useMemo(() => {
    const q = query.toLowerCase();
    return active.filter(
      (r) =>
        !q ||
        r.userName.toLowerCase().includes(q) ||
        r.userEmail.toLowerCase().includes(q) ||
        r.planId.toLowerCase().includes(q)
    );
  }, [active, query]);

  const filteredExpired = useMemo(() => {
    const q = query.toLowerCase();
    return expired.filter(
      (r) =>
        !q ||
        r.userName.toLowerCase().includes(q) ||
        r.userEmail.toLowerCase().includes(q) ||
        r.planId.toLowerCase().includes(q)
    );
  }, [expired, query]);

  return (
    <div>
      <TopHeader
        title="Active plans"
        subtitle={`${active.length} active · ${expired.length} expired · live from Firestore`}
      />

      {error && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setTab("active")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[12px] transition",
            tab === "active"
              ? "bg-green/15 border-green/30 text-green font-medium"
              : "bg-card border-border text-text-muted hover:text-text"
          )}
        >
          <Timer className="w-3.5 h-3.5" /> Currently active
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-md font-mono",
              tab === "active" ? "bg-green/20" : "bg-card-elev"
            )}
          >
            {active.length}
          </span>
        </button>
        <button
          onClick={() => setTab("expired")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[12px] transition",
            tab === "expired"
              ? "bg-vault/15 border-border-vault text-vault font-medium"
              : "bg-card border-border text-text-muted hover:text-text"
          )}
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Expired plans
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-md font-mono",
              tab === "expired" ? "bg-vault/20" : "bg-card-elev"
            )}
          >
            {expired.length}
          </span>
        </button>
        <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-full">
          <Search className="w-3 h-3 text-text-subtle" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search investor / plan…"
            className="bg-transparent text-[11px] outline-none w-44 text-text placeholder:text-text-subtle"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-5 h-5 text-vault animate-spin" />
        </div>
      ) : tab === "active" ? (
        <Card>
          <CardHeader
            title={`Currently active (${filteredActive.length})`}
            subtitle="Click 'Push to complete' to fast-forward any plan for testing — credits vault, returns capital"
          />
          {filteredActive.length === 0 ? (
            <p className="text-[11px] text-text-subtle text-center py-8 m-0">
              No active plans across investors right now.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[11px] table-fixed min-w-[720px]">
                <colgroup>
                  <col style={{ width: "26%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "18%" }} />
                </colgroup>
                <thead>
                  <tr className="text-text-subtle text-left">
                    <th className="font-normal py-2">Investor</th>
                    <th className="font-normal py-2">Plan</th>
                    <th className="font-normal py-2 text-right">Capital</th>
                    <th className="font-normal py-2 text-right">Daily income</th>
                    <th className="font-normal py-2">Started</th>
                    <th className="font-normal py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActive.map((r) => {
                    const tpl = planTemplates.find((t) => t.id === r.planId);
                    const daily = tpl ? r.capital * (tpl.dailyRate / 100) : 0;
                    const isBusy = busy === r.id;
                    return (
                      <tr key={`${r.userId}-${r.id}`} className="border-t border-border">
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue/15 text-blue text-[9px] font-medium flex items-center justify-center shrink-0">
                              {(r.userName?.[0] ?? "?").toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="m-0 text-[11px] truncate">{r.userName}</p>
                              <p className="m-0 text-[9px] text-text-subtle truncate">{r.userEmail}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2">
                          <p className="m-0 text-[11px]">{tpl?.name ?? r.planId}</p>
                          <p className="m-0 text-[9px] text-text-subtle">
                            {tpl ? `${tpl.dailyRate}% · ${tpl.durationDays}d` : "—"}
                          </p>
                        </td>
                        <td className="py-2 text-right font-mono">
                          {formatPHP(r.capital, { short: true })}
                        </td>
                        <td className="py-2 text-right font-mono text-green">
                          +{formatPHP(daily)}
                        </td>
                        <td className="py-2 text-text-muted text-[10px]">
                          {new Date(r.startedAt).toLocaleDateString("en-PH", {
                            month: "short",
                            day: "numeric",
                            year: "2-digit",
                          })}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => pushToComplete(r)}
                            disabled={isBusy}
                            className="text-[10px] px-2.5 py-1.5 bg-vault/15 text-vault rounded-md hover:bg-vault/25 transition flex items-center gap-1.5 ml-auto disabled:opacity-60"
                            title="Fast-forward this plan to completion — credits vault and returns capital"
                          >
                            {isBusy ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <FastForward className="w-3 h-3" />
                            )}
                            Push to complete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader title={`Expired plans (${filteredExpired.length})`} />
          {filteredExpired.length === 0 ? (
            <p className="text-[11px] text-text-subtle text-center py-8 m-0">
              No completed plans yet. Use &quot;Push to complete&quot; in the Active tab to expire one.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[11px] table-fixed min-w-[640px]">
                <colgroup>
                  <col style={{ width: "26%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "14%" }} />
                </colgroup>
                <thead>
                  <tr className="text-text-subtle text-left">
                    <th className="font-normal py-2">Investor</th>
                    <th className="font-normal py-2">Plan</th>
                    <th className="font-normal py-2 text-right">Capital back</th>
                    <th className="font-normal py-2 text-right">Vault credited</th>
                    <th className="font-normal py-2">Started</th>
                    <th className="font-normal py-2">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpired.map((r) => {
                    const tpl = planTemplates.find((t) => t.id === r.planId);
                    return (
                      <tr key={`${r.userId}-${r.id}`} className="border-t border-border">
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue/15 text-blue text-[9px] font-medium flex items-center justify-center shrink-0">
                              {(r.userName?.[0] ?? "?").toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="m-0 text-[11px] truncate">{r.userName}</p>
                              <p className="m-0 text-[9px] text-text-subtle truncate">{r.userEmail}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2">
                          <p className="m-0 text-[11px]">{tpl?.name ?? r.planId}</p>
                          <p className="m-0 text-[9px] text-text-subtle">
                            {tpl ? `${tpl.dailyRate}% · ${tpl.durationDays}d` : "—"}
                          </p>
                        </td>
                        <td className="py-2 text-right font-mono">
                          {formatPHP(r.capitalReturned, { short: true })}
                        </td>
                        <td className="py-2 text-right font-mono text-vault">
                          +{formatPHP(r.vaultCredited, { short: true })}
                        </td>
                        <td className="py-2 text-text-muted text-[10px]">
                          {new Date(r.startedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                        </td>
                        <td className="py-2 text-text-muted text-[10px]">
                          {new Date(r.completedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
