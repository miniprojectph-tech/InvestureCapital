"use client";

import { Lock, Loader2, TrendingUp } from "lucide-react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer } from "recharts";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { TickingBalance } from "@/components/TickingBalance";
import { formatPHP } from "@/lib/utils";
import { useUserState } from "@/lib/useUserState";
import { useSettings } from "@/lib/settings";
import { usePlans } from "@/lib/plans";
import { useUserActivity } from "@/lib/userActivity";

const DAY_MS = 86_400_000;

export default function VaultPage() {
  const { state, loading } = useUserState();
  const { settings, loading: settingsLoading } = useSettings();
  const { plans } = usePlans();
  const { rows: compoundLog } = useUserActivity("vault-growth");

  if (loading || settingsLoading || !state) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-vault animate-spin" />
      </div>
    );
  }

  const ratePct = settings.vaultDailyRate; // e.g. 1.0
  const rate = ratePct / 100; // e.g. 0.01
  const lockTotal = settings.vaultLockDays;

  const balance = state.balances.vault;
  const lockStarted = state.balances.vaultLockStartedAt;
  const elapsedDays = lockStarted
    ? Math.floor((Date.now() - lockStarted) / DAY_MS)
    : 0;
  const lockDay = Math.max(0, Math.min(lockTotal, elapsedDays));
  const lockProgress = lockTotal > 0 ? (lockDay / lockTotal) * 100 : 0;
  const daysRemaining = Math.max(0, lockTotal - lockDay);
  const unlockDate = lockStarted ? new Date(lockStarted + lockTotal * DAY_MS) : null;
  const unlockLabel = unlockDate
    ? unlockDate.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
    : "—";

  const completed = state.completedPlans ?? [];
  const deposited = completed.reduce((s, p) => s + (p.vaultCredited ?? 0), 0);
  const growth = Math.max(0, balance - deposited);
  const todayCompound = balance - balance / (1 + rate);
  const perSecond = balance * (Math.pow(1 + rate, 1 / 86400) - 1);
  const projectedLockEnd = balance * Math.pow(1 + rate, lockTotal);

  const sources = [...completed]
    .sort((a, b) => b.completedAt - a.completedAt)
    .map((p) => ({
      name: plans.find((t) => t.id === p.planId)?.name ?? p.planName ?? p.planId,
      amount: p.vaultCredited ?? 0,
      date: `${new Date(p.completedAt).toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
      })} · ${formatPHP(p.capital, { short: true })} plan`,
    }));

  const chartData = Array.from({ length: 60 }, (_, i) => {
    const day = (i / 59) * lockTotal;
    return { day, value: balance * Math.pow(1 + rate, day) };
  });

  const recentCompounds = compoundLog.slice(0, 4);

  return (
    <div>
      <TopHeader
        title="Future growth vault"
        subtitle={`${ratePct}% daily compounding · locked ${lockTotal} days from first activation`}
      />

      <div className="relative overflow-hidden bg-gradient-to-br from-card via-[#1F1B33] to-[#22193A] border border-border-vault rounded-2xl p-5 mb-3">
        <svg
          className="absolute -top-5 -right-5 w-40 h-32 opacity-10 pointer-events-none"
          viewBox="0 0 160 120"
          aria-hidden
        >
          <circle cx="120" cy="60" r="40" fill="none" stroke="#A78BFA" strokeWidth="1" />
          <circle cx="120" cy="60" r="55" fill="none" stroke="#A78BFA" strokeWidth="0.5" />
          <circle cx="120" cy="60" r="70" fill="none" stroke="#A78BFA" strokeWidth="0.3" />
        </svg>
        <div className="flex justify-between items-start relative">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-3 h-3 text-vault-muted" />
              <span className="text-[10px] text-vault-muted tracking-wider">VAULT BALANCE</span>
              {balance > 0 && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-green ml-1" />
                  <span className="text-[9px] text-green">Compounding live</span>
                </>
              )}
            </div>
            <p className="text-[36px] font-medium font-mono m-0 leading-none tracking-tight text-vault">
              <TickingBalance base={balance} decimals={4} />
            </p>
            {balance > 0 && (
              <p className="text-[11px] text-vault-muted mt-2 m-0 font-mono">
                +{formatPHP(todayCompound)} today · +₱{perSecond.toFixed(4)} / sec
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[10px] text-vault-muted tracking-wider m-0 mb-1">UNLOCKS IN</p>
            <p className="text-[22px] font-medium font-mono m-0 leading-none">
              {lockStarted ? `${daysRemaining} days` : "—"}
            </p>
            <p className="text-[9px] text-text-subtle mt-1 m-0">{unlockLabel}</p>
          </div>
        </div>
        <div className="h-1 bg-black/30 rounded-full mt-4 relative">
          <div
            className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-vault to-vault-muted rounded-full"
            style={{ width: `${lockProgress}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-text-subtle mt-1">
          <span>Day {lockDay} of {lockTotal} lock</span>
          <span>{lockProgress.toFixed(1)}% complete</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[9px] text-text-subtle tracking-wider m-0 mb-1">TODAY&apos;S COMPOUND</p>
          <p className="text-[13px] font-medium font-mono text-green m-0">+{formatPHP(todayCompound)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[9px] text-text-subtle tracking-wider m-0 mb-1">CREDITED IN</p>
          <p className="text-[13px] font-medium font-mono m-0">{formatPHP(deposited, { short: true })}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[9px] text-text-subtle tracking-wider m-0 mb-1">GROWTH</p>
          <p className="text-[13px] font-medium font-mono text-vault m-0">+{formatPHP(growth, { short: true })}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[9px] text-text-subtle tracking-wider m-0 mb-1">PROJECTED {lockTotal}D</p>
          <p className="text-[13px] font-medium font-mono text-vault m-0">{formatPHP(projectedLockEnd, { short: true })}</p>
        </div>
      </div>

      <Card className="mb-3">
        <CardHeader title="Vault growth" subtitle={`Projected to day ${lockTotal}`} />
        <div className="h-[140px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="vaultFade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#A78BFA" stopOpacity={0} />
                </linearGradient>
              </defs>
              <ReferenceLine x={chartData[0].day} stroke="#4F8EF7" strokeDasharray="2 2" strokeWidth={0.5} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#A78BFA"
                strokeWidth={1.8}
                fill="url(#vaultFade)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <Card>
          <p className="text-[12px] font-medium m-0 mb-2.5">Vault sources</p>
          {sources.length === 0 ? (
            <p className="text-[11px] text-text-subtle py-4 text-center m-0">
              No vault credits yet. Completing a plan credits its earnings here.
            </p>
          ) : (
            <>
              {sources.map((s, i) => (
                <div
                  key={i}
                  className={`py-1.5 ${i < sources.length - 1 ? "border-b border-border" : ""}`}
                >
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[11px]">{s.name}</span>
                    <span className="text-[11px] font-mono text-vault font-medium">
                      {formatPHP(s.amount, { short: true })}
                    </span>
                  </div>
                  <p className="text-[9px] text-text-subtle m-0">{s.date}</p>
                </div>
              ))}
              <div className="pt-2 mt-2 border-t border-border-strong">
                <div className="flex justify-between">
                  <span className="text-[11px] text-vault-muted">Total credited</span>
                  <span className="text-[12px] font-mono text-vault font-medium">
                    {formatPHP(deposited, { short: true })}
                  </span>
                </div>
              </div>
            </>
          )}
        </Card>

        <Card>
          <p className="text-[12px] font-medium m-0 mb-2.5">Daily compound log</p>
          {recentCompounds.length === 0 ? (
            <p className="text-[11px] text-text-subtle py-4 text-center m-0">
              No compounding yet. Your vault compounds {ratePct}% daily once funded.
            </p>
          ) : (
            recentCompounds.map((c, i) => (
              <div
                key={c.id}
                className={`flex justify-between items-center py-1.5 ${
                  i < recentCompounds.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <TrendingUp className="w-3 h-3 text-vault shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] m-0 truncate">
                      {new Date(c.at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                      {" · "}
                      {new Date(c.at).toLocaleTimeString("en-PH", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </p>
                    <p className="text-[9px] text-text-subtle m-0 mt-0.5 truncate">{c.subtitle}</p>
                  </div>
                </div>
                {c.amount !== undefined && (
                  <span className="text-[11px] font-mono text-green shrink-0">
                    +{formatPHP(c.amount)}
                  </span>
                )}
              </div>
            ))
          )}
        </Card>
      </div>

      <div className="bg-vault/5 border border-border-vault rounded-xl p-3.5 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-vault/15 flex items-center justify-center">
            <Lock className="w-3.5 h-3.5 text-vault" />
          </div>
          <div>
            <p className="text-[11px] font-medium m-0">
              {lockStarted
                ? `Vault is locked for ${daysRemaining} more days`
                : "Vault unlocks 365 days after your first plan activation"}
            </p>
            <p className="text-[10px] text-vault-muted mt-0.5 m-0">
              {lockStarted
                ? `First withdrawal available ${unlockLabel} · ${ratePct}% daily compounding continues`
                : `Activate a plan to start the ${lockTotal}-day lock`}
            </p>
          </div>
        </div>
        <button className="px-3 py-1.5 bg-transparent border border-vault/30 text-vault rounded-md text-[10px]">
          View lock terms
        </button>
      </div>
    </div>
  );
}
