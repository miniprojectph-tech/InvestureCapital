"use client";

import { Lock, Loader2 } from "lucide-react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer } from "recharts";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { TickingBalance } from "@/components/TickingBalance";
import { formatPHP } from "@/lib/utils";
import { VAULT_DAILY_RATE, VAULT_365_MULTIPLIER } from "@/lib/mock-data";
import { useUserState } from "@/lib/useUserState";
import { computeVaultLockDay } from "@/lib/userState";

export default function VaultPage() {
  const { state, loading } = useUserState();

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
      </div>
    );
  }

  const balance = state.balances.vault;
  const lockDay = computeVaultLockDay(state.balances.vaultLockStartedAt);
  const lockTotal = 365;
  const lockProgress = (lockDay / lockTotal) * 100;
  const daysRemaining = lockTotal - lockDay;
  const todayCompound = balance - balance / (1 + VAULT_DAILY_RATE);
  const projected365 = balance * VAULT_365_MULTIPLIER;
  const deposited = 2050;
  const growth = balance - deposited;

  const data = Array.from({ length: 60 }, (_, i) => {
    const day = (i / 59) * 365;
    return { day, value: balance * Math.pow(1 + VAULT_DAILY_RATE, day) };
  });

  const sources = [
    { name: "15-day momentum", amount: 1350, date: "Apr 8 · ₱3,000 plan" },
    { name: "10-day boost", amount: 500, date: "Mar 25 · ₱2,000 plan" },
    { name: "5-day basic", amount: 100, date: "Mar 15 · ₱500 plan" },
  ];

  const compoundLog = [
    { when: "Today 00:00", on: 9351, gain: 93.52 },
    { when: "Yesterday 00:00", on: 9259, gain: 92.59 },
    { when: "2 days ago", on: 9168, gain: 91.68 },
    { when: "3 days ago", on: 9077, gain: 90.77 },
  ];

  return (
    <div>
      <TopHeader
        title="Future growth vault"
        subtitle="1% daily compounding · locked 365 days from first activation"
      />

      <div className="relative overflow-hidden bg-gradient-to-br from-card via-[#221F2E] to-[#1A1226] border border-border-gold rounded-2xl p-5 mb-3">
        <svg
          className="absolute -top-5 -right-5 w-40 h-32 opacity-10 pointer-events-none"
          viewBox="0 0 160 120"
          aria-hidden
        >
          <circle cx="120" cy="60" r="40" fill="none" stroke="#F5C66B" strokeWidth="1" />
          <circle cx="120" cy="60" r="55" fill="none" stroke="#F5C66B" strokeWidth="0.5" />
          <circle cx="120" cy="60" r="70" fill="none" stroke="#F5C66B" strokeWidth="0.3" />
        </svg>
        <div className="flex justify-between items-start relative">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-3 h-3 text-gold-muted" />
              <span className="text-[10px] text-gold-muted tracking-wider">VAULT BALANCE</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green ml-1" />
              <span className="text-[9px] text-green">Compounding live</span>
            </div>
            <p className="text-[36px] font-medium font-mono m-0 leading-none tracking-tight text-gold">
              <TickingBalance base={balance} decimals={4} />
            </p>
            <p className="text-[11px] text-gold-muted mt-2 m-0 font-mono">
              +{formatPHP(todayCompound)} today · +₱
              {(balance * (Math.pow(1 + VAULT_DAILY_RATE, 1 / 86400) - 1)).toFixed(4)} / sec
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gold-muted tracking-wider m-0 mb-1">UNLOCKS IN</p>
            <p className="text-[22px] font-medium font-mono m-0 leading-none">
              {daysRemaining} days
            </p>
            <p className="text-[9px] text-text-subtle mt-1 m-0">Jun 19, 2027</p>
          </div>
        </div>
        <div className="h-1 bg-black/30 rounded-full mt-4 relative">
          <div
            className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-gold to-[#E0A94B] rounded-full"
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
          <p className="text-[9px] text-text-subtle tracking-wider m-0 mb-1">DEPOSITED</p>
          <p className="text-[13px] font-medium font-mono m-0">{formatPHP(deposited, { short: true })}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[9px] text-text-subtle tracking-wider m-0 mb-1">GROWTH</p>
          <p className="text-[13px] font-medium font-mono text-gold m-0">+{formatPHP(growth, { short: true })}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[9px] text-text-subtle tracking-wider m-0 mb-1">PROJECTED 365D</p>
          <p className="text-[13px] font-medium font-mono text-gold m-0">{formatPHP(projected365, { short: true })}</p>
        </div>
      </div>

      <Card className="mb-3">
        <CardHeader title="Vault growth" subtitle="Projected to day 365" />
        <div className="h-[140px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="vaultFade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F5C66B" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#F5C66B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <ReferenceLine x={data[0].day} stroke="#4F8EF7" strokeDasharray="2 2" strokeWidth={0.5} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#F5C66B"
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
          {sources.map((s, i) => (
            <div
              key={i}
              className={`py-1.5 ${i < sources.length - 1 ? "border-b border-border" : ""}`}
            >
              <div className="flex justify-between mb-0.5">
                <span className="text-[11px]">{s.name}</span>
                <span className="text-[11px] font-mono text-gold font-medium">
                  {formatPHP(s.amount, { short: true })}
                </span>
              </div>
              <p className="text-[9px] text-text-subtle m-0">{s.date}</p>
            </div>
          ))}
          <div className="pt-2 mt-2 border-t border-border-strong">
            <div className="flex justify-between">
              <span className="text-[11px] text-gold-muted">Total deposited</span>
              <span className="text-[12px] font-mono text-gold font-medium">
                {formatPHP(deposited, { short: true })}
              </span>
            </div>
          </div>
        </Card>

        <Card>
          <p className="text-[12px] font-medium m-0 mb-2.5">Daily compound log</p>
          {compoundLog.map((c, i) => (
            <div
              key={i}
              className={`flex justify-between items-center py-1.5 ${
                i < compoundLog.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div>
                <p className="text-[11px] m-0">{c.when}</p>
                <p className="text-[9px] text-text-subtle m-0 mt-0.5">1% on {formatPHP(c.on, { short: true })}</p>
              </div>
              <span className="text-[11px] font-mono text-green">+{formatPHP(c.gain)}</span>
            </div>
          ))}
        </Card>
      </div>

      <div className="bg-gold/5 border border-border-gold rounded-xl p-3.5 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-gold/15 flex items-center justify-center">
            <Lock className="w-3.5 h-3.5 text-gold" />
          </div>
          <div>
            <p className="text-[11px] font-medium m-0">
              Vault is locked for {daysRemaining} more days
            </p>
            <p className="text-[10px] text-gold-muted mt-0.5 m-0">
              First withdrawal available Jun 19, 2027 · 1% daily compounding continues
            </p>
          </div>
        </div>
        <button className="px-3 py-1.5 bg-transparent border border-gold/30 text-gold rounded-md text-[10px]">
          View lock terms
        </button>
      </div>
    </div>
  );
}
