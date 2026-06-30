"use client";

import { useEffect, useState } from "react";
import { Users, ArrowDownRight, Coins, Clock, Loader2, ShieldCheck } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { formatPHP } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import {
  listInvestors,
  computeAggregate,
  type InvestorRow,
  type AdminAggregate,
} from "@/lib/adminQueries";

const flowData = Array.from({ length: 30 }, (_, i) => ({
  day: i,
  in: 120 + i * 8 + Math.random() * 30,
  out: 60 + i * 3 + Math.random() * 18,
}));

const mockPendingWithdrawals = [
  { name: "Theresa Webb", initials: "TW", amount: 2450, type: "Short-term", time: "12 min ago" },
  { name: "Jerome Bell", initials: "JB", amount: 18400, type: "Long-term", time: "38 min ago · day 412" },
  { name: "Arlene McCoy", initials: "AM", amount: 680, type: "Short-term", time: "1h ago" },
];

const mockInvestors: InvestorRow[] = [
  { uid: "tw", name: "Theresa Webb", email: "theresa@mail.com", wallet: 250, vault: 9445, activePlansCount: 3, joinedAt: Date.now(), isAdmin: false },
  { uid: "am", name: "Arlene McCoy", email: "arlene@mail.com", wallet: 120, vault: 3200, activePlansCount: 2, joinedAt: Date.now(), isAdmin: false },
  { uid: "jb", name: "Jerome Bell", email: "jerome@mail.com", wallet: 890, vault: 24180, activePlansCount: 5, joinedAt: Date.now(), isAdmin: false },
  { uid: "re", name: "Ralph Edwards", email: "ralph@mail.com", wallet: 0, vault: 0, activePlansCount: 0, joinedAt: Date.now(), isAdmin: false },
];

export default function AdminDashboard() {
  const { user, demoMode } = useAuth();
  const [rows, setRows] = useState<InvestorRow[] | null>(null);
  const [agg, setAgg] = useState<AdminAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (demoMode || !user) {
        if (!cancelled) {
          setRows(mockInvestors);
          setAgg(computeAggregate(mockInvestors));
          setLoading(false);
        }
        return;
      }
      const { db } = getFirebase();
      if (!db) {
        if (!cancelled) {
          setRows(mockInvestors);
          setAgg(computeAggregate(mockInvestors));
          setLoading(false);
        }
        return;
      }
      try {
        const list = await listInvestors(db, 200);
        if (cancelled) return;
        setRows(list);
        setAgg(computeAggregate(list));
        setLoading(false);
      } catch (err) {
        console.error("admin listInvestors failed", err);
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load investor data — check Firestore rules."
        );
        setRows(mockInvestors);
        setAgg(computeAggregate(mockInvestors));
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, demoMode]);

  if (loading || !agg) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-5 h-5 text-vault animate-spin" />
        <p className="text-[11px] text-text-subtle m-0">Loading platform data…</p>
      </div>
    );
  }

  const isUsingMock = demoMode || !user || (rows && rows.length === 0);

  return (
    <div>
      <TopHeader
        title="Admin overview"
        subtitle={
          isUsingMock
            ? "Demo data shown (no real investors yet, or Firestore unavailable)"
            : `${agg.totalInvestors} investors · live from Firestore`
        }
      />

      {error && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <KpiCard
          label="Total investors"
          value={String(agg.totalInvestors)}
          sub={`${agg.totalActivePlans} active plans`}
          icon={Users}
          iconTone="blue"
        />
        <KpiCard
          label="Capital deployed"
          value={formatPHP(agg.totalDeployed, { short: true })}
          icon={ArrowDownRight}
          iconTone="green"
        />
        <KpiCard
          label="Vault total"
          value={formatPHP(agg.totalVault, { short: true })}
          icon={Coins}
          iconTone="gold"
        />
        <KpiCard
          label="Pending withdrawals"
          value={String(mockPendingWithdrawals.length)}
          sub={formatPHP(mockPendingWithdrawals.reduce((s, w) => s + w.amount, 0), { short: true })}
          icon={Clock}
          iconTone="red"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3 mb-3">
        <Card>
          <CardHeader
            title="Capital flow"
            right={
              <div className="flex gap-1">
                <span className="text-[10px] px-2 py-0.5 bg-gold/15 text-gold rounded-full font-medium">1M</span>
                <span className="text-[10px] px-2 py-0.5 text-text-subtle">6M</span>
                <span className="text-[10px] px-2 py-0.5 text-text-subtle">1Y</span>
              </div>
            }
          />
          <div className="flex gap-3 text-[10px] mb-2">
            <span className="text-text-subtle">
              <span className="inline-block w-2 h-0.5 bg-green mr-1 align-middle" />In
            </span>
            <span className="text-text-subtle">
              <span className="inline-block w-2 h-0.5 bg-red mr-1 align-middle" />Out
            </span>
          </div>
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={flowData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <Area type="monotone" dataKey="in" stroke="#3DD598" strokeWidth={1.5} fill="#3DD598" fillOpacity={0.12} />
                <Area type="monotone" dataKey="out" stroke="#F87171" strokeWidth={1.5} fill="#F87171" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <p className="text-[12px] font-medium m-0 mb-1">Snapshot</p>
          <p className="text-[10px] text-green m-0 mb-3">Live from Firestore</p>
          <div className="flex flex-col gap-2">
            <Stat label="Wallet total" value={formatPHP(agg.totalWallet, { short: true })} />
            <Stat label="Vault total" value={formatPHP(agg.totalVault, { short: true })} />
            <Stat label="Deployed" value={formatPHP(agg.totalDeployed, { short: true })} />
            <Stat label="Active plans" value={String(agg.totalActivePlans)} />
          </div>
        </Card>
      </div>

      <Card className="mb-3">
        <CardHeader
          title={`Needs attention — pending withdrawals (${mockPendingWithdrawals.length})`}
          right={<span className="text-[10px] text-vault">View all</span>}
        />
        {mockPendingWithdrawals.map((w, i) => (
          <div
            key={i}
            className={`flex flex-wrap items-center gap-2 py-2 ${i < mockPendingWithdrawals.length - 1 ? "border-b border-border" : ""}`}
          >
            <div className="w-[22px] h-[22px] rounded-full bg-card-elev text-[9px] font-medium flex items-center justify-center shrink-0">
              {w.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] m-0">{w.name}</p>
              <p className="text-[9px] text-text-subtle mt-0.5 m-0">{w.type} · {w.time}</p>
            </div>
            <span className="text-[11px] font-medium font-mono">{formatPHP(w.amount, { short: true })}</span>
            <div className="flex gap-1.5 ml-auto sm:ml-0">
              <button className="text-[10px] px-2.5 py-1 bg-green/15 text-green rounded-md">Approve</button>
              <button className="text-[10px] px-2.5 py-1 text-text-muted hover:bg-card-elev rounded-md">Reject</button>
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <CardHeader
          title={isUsingMock ? "Latest investors (demo)" : `All investors (${rows?.length ?? 0})`}
          right={<span className="text-[10px] text-vault">Export</span>}
        />
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[11px] table-fixed min-w-[520px]">
            <thead>
              <tr className="text-text-subtle text-left">
                <th className="font-normal py-1" style={{ width: "34%" }}>Investor</th>
                <th className="font-normal py-1 text-right" style={{ width: "10%" }}>Plans</th>
                <th className="font-normal py-1 text-right" style={{ width: "16%" }}>Wallet</th>
                <th className="font-normal py-1 text-right" style={{ width: "18%" }}>Vault</th>
                <th className="font-normal py-1 text-right" style={{ width: "14%" }}>Role</th>
                <th className="font-normal py-1" style={{ width: "8%" }}></th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((u) => (
                <tr key={u.uid} className="border-t border-border">
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-[22px] h-[22px] rounded-full bg-blue/15 text-blue text-[9px] font-medium flex items-center justify-center shrink-0">
                        {(u.name?.[0] ?? "?").toUpperCase()}
                        {(u.name?.split(" ")?.[1]?.[0] ?? "").toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="m-0 text-[11px] truncate">{u.name}</p>
                        <p className="m-0 text-[9px] text-text-subtle truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 text-right font-mono">{u.activePlansCount}</td>
                  <td className="py-2 text-right font-mono">{formatPHP(u.wallet, { short: true })}</td>
                  <td className="py-2 text-right font-mono text-vault">{formatPHP(u.vault, { short: true })}</td>
                  <td className="py-2 text-right">
                    {u.isAdmin ? (
                      <span className="text-[9px] bg-vault/15 text-vault px-1.5 py-0.5 rounded-md">Admin</span>
                    ) : (
                      <span className="text-[9px] bg-green/15 text-green px-1.5 py-0.5 rounded-md">Investor</span>
                    )}
                  </td>
                  <td className="py-2 text-center text-text-subtle">⋮</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] text-text-subtle">{label}</span>
      <span className="text-[12px] font-mono font-medium">{value}</span>
    </div>
  );
}
