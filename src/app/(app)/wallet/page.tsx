"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, RefreshCw, ArrowDownRight, Loader2, Clock } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer } from "recharts";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { WithdrawModal } from "@/components/WithdrawModal";
import { ReinvestModal } from "@/components/ReinvestModal";
import { formatPHP, cn } from "@/lib/utils";
import { useUserState } from "@/lib/useUserState";
import { useUserActivity } from "@/lib/userActivity";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { requestWithdrawal } from "@/lib/withdrawals";
import { useNow, dailyAccrualTotal, nextPayout, formatCountdown, activatePlacement, peso } from "@/lib/compplan";

// Activity types that are income (not returned capital, deposits or reinvests).
const INCOME_TYPES = new Set(["payout", "locked-bonus", "referral-commission", "fast-start", "leadership", "plan-earning", "vault-growth"]);
const DAY_MS = 86_400_000;

export default function WalletPage() {
  const { state, loading } = useUserState();
  const { rows: activity } = useUserActivity();
  const { user, demoMode } = useAuth();
  const now = useNow(30_000);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [reinvestOpen, setReinvestOpen] = useState(false);

  const income = useMemo(() => activity.filter((e) => INCOME_TYPES.has(e.type) && e.amountKind === "in"), [activity]);

  // Money-in-wallet figures use the REAL credited time (history dates follow the
  // schedule and can be in the future for fast-forwarded placements).
  const totals = useMemo(() => {
    const week = now - 7 * DAY_MS;
    const month = now - 30 * DAY_MS;
    return {
      week: income.filter((e) => e.creditedAt >= week).reduce((s, e) => s + (e.amount ?? 0), 0),
      month: income.filter((e) => e.creditedAt >= month).reduce((s, e) => s + (e.amount ?? 0), 0),
      all: income.reduce((s, e) => s + (e.amount ?? 0), 0),
    };
  }, [income, now]);

  const chartData = useMemo(() => {
    const days = Array.from({ length: 30 }, (_, i) => ({ day: i, value: 0, isToday: i === 29 }));
    for (const e of income) {
      const idx = 29 - Math.floor((now - e.creditedAt) / DAY_MS);
      if (idx >= 0 && idx < 30) days[idx].value += e.amount ?? 0;
    }
    return days;
  }, [income, now]);

  async function handleReinvest(amount: number, termMonths: number) {
    if (demoMode || !user) return;
    await activatePlacement({ fromWallet: true, amount, termMonths });
  }

  async function handleWithdraw(amount: number) {
    if (demoMode || !user) return;
    const { db } = getFirebase();
    if (!db) return;
    await requestWithdrawal(db, { userId: user.uid, userName: user.name, userEmail: user.email, amount });
  }

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
      </div>
    );
  }

  const walletBalance = state.balances.wallet;
  const accrual = dailyAccrualTotal(state.placements);
  const next = nextPayout(state.placements, now);
  const recent = activity.slice(0, 8);

  return (
    <div>
      <TopHeader title="Income wallet" subtitle="Payouts every 5 days, commissions and bonuses — withdrawable or reinvestable" />

      <div className="mb-3">
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col">
          <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0 mb-1.5">Available balance</p>
          <p className="text-[32px] font-mono font-medium m-0 leading-none tracking-tight tabular-nums">{formatPHP(walletBalance)}</p>
          <div className="flex gap-3.5 mt-2.5 text-[11px] flex-wrap">
            <span className="text-green font-mono">+{peso(accrual)} accruing today</span>
            {next ? (
              <span className="text-text-subtle flex items-center gap-1">
                <Clock className="w-3 h-3" /> Next payout {peso(next.amount)} in {formatCountdown(next.msLeft)} · {next.placement.id}
              </span>
            ) : (
              <span className="text-text-subtle">No payouts scheduled — place capital to start</span>
            )}
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
              onClick={() => setReinvestOpen(true)}
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
          ["Accruing today", accrual],
          ["This week", totals.week],
          ["This month", totals.month],
          ["All-time income", totals.all],
        ].map(([label, value]) => (
          <div key={label as string} className="bg-card border border-border rounded-lg p-3">
            <p className="text-[9px] text-text-subtle tracking-wider m-0 mb-1">{(label as string).toUpperCase()}</p>
            <p className="text-[14px] font-medium font-mono m-0">{formatPHP(value as number)}</p>
          </div>
        ))}
      </div>

      <Card className="mb-3">
        <CardHeader title="Income credited" subtitle={`Last 30 days · ${formatPHP(totals.month)} total`} />
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
        {totals.month === 0 && <p className="text-[10px] text-text-subtle text-center m-0 mt-2">Payouts will appear here every 5 days once a placement is active.</p>}
      </Card>

      <Card>
        <CardHeader title="Recent transactions" right={<Link href="/transactions" className="text-[10px] text-gold hover:underline">View all</Link>} />
        <div>
          {recent.length === 0 && <p className="text-[11px] text-text-subtle py-2 m-0">No transactions yet.</p>}
          {recent.map((ev, i) => (
            <div key={ev.id} className={`flex items-center gap-2.5 py-1.5 ${i < recent.length - 1 ? "border-b border-border" : ""}`}>
              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0", ev.amountKind === "in" ? "bg-green/15" : "bg-white/5")}>
                {ev.amountKind === "in" ? <ArrowDownRight className="w-3 h-3 text-green" /> : <ArrowUpRight className="w-3 h-3 text-text-muted" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] m-0 truncate">{ev.title}</p>
                <p className="text-[10px] text-text-subtle mt-0.5 m-0 truncate">{ev.subtitle}</p>
              </div>
              {ev.amount !== undefined && (
                <span className={cn("text-[12px] font-mono shrink-0", ev.amountKind === "in" ? "text-green" : "text-text-muted")}>
                  {ev.amountKind === "in" ? "+" : ev.amountKind === "out" ? "−" : ""}
                  {formatPHP(ev.amount)}
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>

      <WithdrawModal open={withdrawOpen} onClose={() => setWithdrawOpen(false)} availableBalance={walletBalance} onSubmit={handleWithdraw} />
      <ReinvestModal open={reinvestOpen} onClose={() => setReinvestOpen(false)} availableBalance={walletBalance} onSubmit={handleReinvest} />
    </div>
  );
}
