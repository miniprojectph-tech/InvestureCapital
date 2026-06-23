"use client";

import { ArrowUpRight, RefreshCw, ArrowDownRight } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer } from "recharts";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { formatPHP } from "@/lib/utils";
import { mockBalances, mockActivity, getTotalDailyIncome } from "@/lib/mock-data";

export default function WalletPage() {
  const daily = getTotalDailyIncome();

  const chartData = Array.from({ length: 30 }, (_, i) => ({
    day: i,
    value: 20 + i * 5 + Math.random() * 8,
    isToday: i >= 28,
  }));

  return (
    <div>
      <TopHeader
        title="Income wallet"
        subtitle="Daily plan payouts — withdrawable or reinvest into a new plan"
      />

      <div className="bg-card border border-border rounded-xl p-5 mb-3">
        <div className="flex justify-between items-end gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-text-subtle tracking-wider m-0 mb-1">AVAILABLE BALANCE</p>
            <p className="text-[32px] font-medium font-mono m-0 leading-none tracking-tight">
              {formatPHP(mockBalances.wallet)}
            </p>
            <div className="flex gap-3.5 mt-2 text-[11px]">
              <span className="text-green font-mono">+{formatPHP(daily)} today</span>
              <span className="text-text-subtle">Next payout in 12h 43m</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="px-3.5 py-2.5 bg-transparent border border-border-strong rounded-lg text-[11px] flex items-center gap-1.5 hover:bg-card-elev transition">
              <ArrowUpRight className="w-3 h-3" /> Withdraw
            </button>
            <button className="px-3.5 py-2.5 bg-gold text-gold-dark rounded-lg text-[11px] font-medium flex items-center gap-1.5 hover:brightness-110 transition">
              <RefreshCw className="w-3 h-3" /> Reinvest
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        {[
          ["Today", daily],
          ["This week", 875],
          ["This month", 3200],
          ["All-time", 8450],
        ].map(([label, value]) => (
          <div key={label as string} className="bg-card border border-border rounded-lg p-3">
            <p className="text-[9px] text-text-subtle tracking-wider m-0 mb-1">
              {(label as string).toUpperCase()}
            </p>
            <p className="text-[14px] font-medium font-mono m-0">{formatPHP(value as number)}</p>
          </div>
        ))}
      </div>

      <Card className="mb-3">
        <CardHeader
          title="Daily income"
          subtitle="Last 30 days · ₱3,200 total"
          right={
            <div className="flex gap-1">
              <span className="text-[10px] px-2 py-0.5 text-text-subtle">7D</span>
              <span className="text-[10px] px-2 py-0.5 bg-gold/15 text-gold rounded-full font-medium">30D</span>
              <span className="text-[10px] px-2 py-0.5 text-text-subtle">90D</span>
            </div>
          }
        />
        <div className="h-[110px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.isToday ? "#F5C66B" : "#22C55E"} fillOpacity={d.isToday ? 1 : 0.75} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Recent transactions"
          right={<span className="text-[10px] text-gold">View all</span>}
        />
        <div>
          {mockActivity.map((ev, i) => (
            <div
              key={ev.id}
              className={`flex items-center gap-2.5 py-1.5 ${
                i < mockActivity.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-green/15 flex items-center justify-center shrink-0">
                <ArrowDownRight className="w-3 h-3 text-green" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] m-0">{ev.title}</p>
                <p className="text-[10px] text-text-subtle mt-0.5 m-0">{ev.subtitle}</p>
              </div>
              {ev.amount !== undefined && (
                <span
                  className={`text-[12px] font-mono ${
                    ev.amountKind === "in" ? "text-green" : "text-text-muted"
                  }`}
                >
                  {ev.amountKind === "in" ? "+" : "−"}
                  {formatPHP(ev.amount)}
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
