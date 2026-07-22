"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Lock, TrendingUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { formatPHP } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { listInvestors, type InvestorRow } from "@/lib/adminQueries";
import { useSettings } from "@/lib/settings";

const mock: InvestorRow[] = [
  { uid: "tw", name: "Theresa Webb", email: "theresa@mail.com", wallet: 250, vault: 9445, deployed: 5000, activePlansCount: 3, completedPlansCount: 1, totalEarned: 450, joinedAt: Date.now() - 50*86400000, vaultLockStartedAt: null, vaultLastCompoundedAt: null, isAdmin: false },
  { uid: "jb", name: "Jerome Bell", email: "jerome@mail.com", wallet: 890, vault: 24180, deployed: 15000, activePlansCount: 5, completedPlansCount: 3, totalEarned: 2400, joinedAt: Date.now() - 100*86400000, vaultLockStartedAt: null, vaultLastCompoundedAt: null, isAdmin: false },
  { uid: "am", name: "Arlene McCoy", email: "arlene@mail.com", wallet: 120, vault: 3200, deployed: 2000, activePlansCount: 2, completedPlansCount: 0, totalEarned: 0, joinedAt: Date.now() - 30*86400000, vaultLockStartedAt: null, vaultLastCompoundedAt: null, isAdmin: false },
];

export default function AdminVaultPage() {
  const { user, demoMode } = useAuth();
  const { settings } = useSettings();
  const [rows, setRows] = useState<InvestorRow[]>([]);
  const [loading, setLoading] = useState(true);

  const ratePct = settings.vaultDailyRate;
  const rate = ratePct / 100;
  const multiplier = Math.pow(1 + rate, settings.vaultLockDays);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (demoMode || !user) {
        if (!cancelled) { setRows(mock); setLoading(false); }
        return;
      }
      const { db } = getFirebase();
      if (!db) { setRows(mock); setLoading(false); return; }
      try {
        const list = await listInvestors(db, 500);
        if (!cancelled) { setRows(list); setLoading(false); }
      } catch {
        if (!cancelled) { setRows(mock); setLoading(false); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user, demoMode]);

  const stats = useMemo(() => {
    const withVault = rows.filter((r) => r.vault > 0);
    const total = withVault.reduce((s, r) => s + r.vault, 0);
    const avg = withVault.length ? total / withVault.length : 0;
    const dailyAccrual = total * rate;
    return { total, avg, count: withVault.length, dailyAccrual };
  }, [rows, rate]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-5 h-5 text-vault animate-spin" />
      </div>
    );
  }

  const data = Array.from({ length: 30 }, (_, i) => ({
    day: i,
    value: stats.total * Math.pow(1 + rate, i - 25),
  }));

  return (
    <div>
      <TopHeader title="Vault accounts" subtitle={`${stats.count} active vaults · compounding at ${ratePct}% daily`} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <KpiCard label="Vault total" value={formatPHP(stats.total, { short: true })} icon={Lock} iconTone="gold" />
        <KpiCard label="Active vaults" value={String(stats.count)} icon={TrendingUp} iconTone="blue" />
        <KpiCard label="Avg vault" value={formatPHP(stats.avg, { short: true })} icon={Lock} iconTone="green" />
        <KpiCard
          label="Compounded today"
          value={`+${formatPHP(stats.dailyAccrual, { short: true })}`}
          sub={`${ratePct}% daily on aggregate`}
          subTone="gold"
          icon={TrendingUp}
          iconTone="gold"
        />
      </div>

      <Card className="mb-3">
        <CardHeader title="Aggregate vault growth" subtitle="Total vault balance over time + projection" />
        <div className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="vaultAgg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#A78BFA" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="value" stroke="#A78BFA" strokeWidth={1.8} fill="url(#vaultAgg)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardHeader title="Top vaults" right={<span className="text-[10px] text-vault">View all</span>} />
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[11px] table-fixed min-w-[520px]">
            <colgroup>
              <col style={{ width: "36%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "22%" }} />
            </colgroup>
            <thead>
              <tr className="text-text-subtle text-left">
                <th className="font-normal py-2">Investor</th>
                <th className="font-normal py-2 text-right">Vault now</th>
                <th className="font-normal py-2 text-right">Projected 365d</th>
                <th className="font-normal py-2 text-right">Daily accrual</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].sort((a, b) => b.vault - a.vault).slice(0, 10).map((u) => (
                <tr key={u.uid} className="border-t border-border">
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue/15 text-blue text-[10px] font-medium flex items-center justify-center shrink-0">
                        {(u.name?.[0] ?? "?").toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="m-0 text-[11px] truncate">{u.name}</p>
                        <p className="m-0 text-[9px] text-text-subtle truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 text-right font-mono text-vault">{formatPHP(u.vault, { short: true })}</td>
                  <td className="py-2 text-right font-mono text-vault-muted">
                    {formatPHP(u.vault * multiplier, { short: true })}
                  </td>
                  <td className="py-2 text-right font-mono text-green">
                    +{formatPHP(u.vault * rate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
