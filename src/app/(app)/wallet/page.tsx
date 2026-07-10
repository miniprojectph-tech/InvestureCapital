"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, RefreshCw, ArrowDownRight, Loader2 } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer } from "recharts";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { WithdrawModal } from "@/components/WithdrawModal";
import { formatPHP, cn } from "@/lib/utils";
import { mockActivity, mockPlans } from "@/lib/mock-data";
import { useUserState } from "@/lib/useUserState";
import { computeDailyIncome } from "@/lib/userState";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { requestWithdrawal } from "@/lib/withdrawals";

export default function WalletPage() {
  const router = useRouter();
  const { state, loading } = useUserState();
  const { user, demoMode } = useAuth();
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  async function handleWithdraw(amount: number) {
    if (demoMode || !user) return;
    const { db } = getFirebase();
    if (!db) return;
    await requestWithdrawal(db, {
      userId: user.uid,
      userName: user.name,
      userEmail: user.email,
      amount,
    });
  }

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
      </div>
    );
  }

  const daily = computeDailyIncome(state.activePlans, mockPlans);
  const walletBalance = state.balances.wallet;

  const chartData = Array.from({ length: 30 }, (_, i) => ({
    day: i,
    value: 20 + i * 5 + Math.random() * 8,
    isToday: i >= 28,
  }));

  return (
    <div>
      <TopHeader
        title="Income wallet"
        subtitle="Daily plan payouts — withdrawable or reinvestable into new plans"
      />

      {/* Available balance + actions */}
      <div className="mb-3">
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col">
          <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0 mb-1.5">
            Available balance
          </p>
          <p className="text-[32px] font-mono font-medium m-0 leading-none tracking-tight tabular-nums">
            {formatPHP(walletBalance)}
          </p>
          <div className="flex gap-3.5 mt-2.5 text-[11px] flex-wrap">
            <span className="text-green font-mono">+{formatPHP(daily)} today</span>
            <span className="text-text-subtle">Next payout in 12h 43m</span>
          </div>
          <div className="flex gap-2 mt-4 max-w-md">
            <button
              onClick={() => setWithdrawOpen(true)}
              disabled={walletBalance <= 0}
              className="flex-1 px-3.5 py-2.5 bg-transparent border border-border-strong rounded-lg text-[12px] flex items-center justify-center gap-1.5 hover:bg-card-elev transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowUpRight className="w-3.5 h-3.5" /> Withdraw
            </button>
            <button
              onClick={() => router.push(`/plans?prefill=${walletBalance}`)}
              disabled={walletBalance <= 0}
              className="flex-1 px-3.5 py-2.5 bg-gold text-gold-dark rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reinvest
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
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
                  <Cell key={i} fill={d.isToday ? "#F5C66B" : "#3DD598"} fillOpacity={d.isToday ? 1 : 0.75} />
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
                  className={cn(
                    "text-[12px] font-mono",
                    ev.amountKind === "in" ? "text-green" : "text-text-muted"
                  )}
                >
                  {ev.amountKind === "in" ? "+" : "−"}
                  {formatPHP(ev.amount)}
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>

      <WithdrawModal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        availableBalance={walletBalance}
        onSubmit={handleWithdraw}
      />
    </div>
  );
}
