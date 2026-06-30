"use client";

import { motion, type Variants } from "framer-motion";
import { ArrowDownRight, Lock, Loader2 } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { StatStrip } from "@/components/StatStrip";
import { PortfolioDonut } from "@/components/PortfolioDonut";
import { SummaryThemedCard } from "@/components/SummaryThemedCard";
import { TickingBalance } from "@/components/TickingBalance";
import { ActivePlansList } from "@/components/ActivePlansList";
import { ActivityFeed } from "@/components/ActivityFeed";
import { PlanHistoryTable } from "@/components/PlanHistoryTable";
import { formatPHP } from "@/lib/utils";
import { mockPlans, VAULT_DAILY_RATE } from "@/lib/mock-data";
import { useUserState } from "@/lib/useUserState";
import {
  computeDailyIncome,
  computeDeployed,
  computePendingVaultCredits,
} from "@/lib/userState";

const stagger: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export default function DashboardPage() {
  const { state, loading } = useUserState();

  if (loading || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
        <p className="text-[11px] text-text-subtle m-0">Loading your portfolio…</p>
      </div>
    );
  }

  const deployed = computeDeployed(state.activePlans);
  const dailyIncome = computeDailyIncome(state.activePlans, mockPlans);
  const pendingVault = computePendingVaultCredits(state.activePlans, mockPlans);
  const total = state.balances.wallet + deployed + state.balances.vault;
  const todayCompound =
    state.balances.vault - state.balances.vault / (1 + VAULT_DAILY_RATE);
  const totalEarned = state.balances.vault + state.balances.wallet;
  const totalInvested = deployed > 0 ? deployed : 1; // avoid divide-by-zero
  const roi = (totalEarned / totalInvested) * 100;

  const firstName = state.profile.name.split(" ")[0];
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Investment growth — accumulating curve from past data + projection
  const growthData = Array.from({ length: 30 }, (_, i) => ({
    day: i,
    value:
      state.balances.vault *
        Math.pow(1 + VAULT_DAILY_RATE, i - 25) +
      deployed * 0.5,
  }));

  return (
    <div>
      <TopHeader
        title={`${greeting}, ${firstName}`}
        subtitle={`${state.activePlans.length} active plans · next payout in 12h 43m`}
      />

      <motion.div variants={stagger} initial="hidden" animate="show">
        {/* Main row: big left card + stacked themed cards on the right */}
        <motion.div
          variants={item}
          className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3 mb-3"
        >
          {/* BIG LEFT CARD — stat strip on top, chart + donut below */}
          <Card className="!p-0">
            <StatStrip
              stats={[
                {
                  label: "Total portfolio",
                  caption: `${state.activePlans.length} plans`,
                  value: formatPHP(total, { short: true }),
                  trend: { delta: roi, suffix: "%" },
                  emphasis: true,
                },
                {
                  label: "Capital invested",
                  value: formatPHP(deployed, { short: true }),
                },
                {
                  label: "Current value",
                  value: formatPHP(state.balances.vault + state.balances.wallet, { short: true }),
                },
                {
                  label: "ROI",
                  value: `+${roi.toFixed(1)}%`,
                },
              ]}
            />

            <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-4 px-4 pb-4 pt-2 border-t border-border">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] font-medium m-0">Investment growth</p>
                  <div className="flex gap-1">
                    {["1W", "1M", "3M", "1Y"].map((k, i) => (
                      <span
                        key={k}
                        className={
                          i === 1
                            ? "text-[10px] px-2 py-0.5 bg-gold/15 text-gold rounded-full font-medium"
                            : "text-[10px] px-2 py-0.5 text-text-subtle"
                        }
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="h-[150px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={growthData} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="dashGold" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3DD598" stopOpacity={0.32} />
                          <stop offset="100%" stopColor="#3DD598" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#3DD598"
                        strokeWidth={1.8}
                        fill="url(#dashGold)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="md:border-l md:border-border md:pl-4">
                <p className="text-[12px] font-medium m-0 mb-3">Your portfolio</p>
                <PortfolioDonut
                  slices={[
                    { name: "Wallet", value: state.balances.wallet, color: "#4F8EF7" },
                    { name: "Deployed", value: deployed, color: "#3DD598" },
                    { name: "Vault", value: state.balances.vault, color: "#A78BFA" },
                  ]}
                />
              </div>
            </div>
          </Card>

          {/* RIGHT COLUMN — Daily Income + Vault themed cards */}
          <div className="flex flex-col gap-3">
            <SummaryThemedCard
              icon={ArrowDownRight}
              theme="emerald"
              title="Daily Income"
              subtitle={`${state.activePlans.length} active plans`}
              caption={{ label: "Today", value: formatPHP(dailyIncome, { short: true }) }}
              valueLabel="Wallet balance"
              value={formatPHP(state.balances.wallet, { short: true })}
              trend={{
                delta: deployed > 0 ? (dailyIncome / deployed) * 100 : 0,
                suffix: "% / day",
                label: "Avg rate",
              }}
              href="/wallet"
            />
            <SummaryThemedCard
              icon={Lock}
              theme="vault"
              title="Future Growth Vault"
              subtitle="Locked · compounding 1% daily"
              caption={{ label: "Pending", value: `+${formatPHP(pendingVault, { short: true })}` }}
              valueLabel="Vault balance"
              value={<TickingBalance base={state.balances.vault} decimals={2} />}
              trend={{
                delta: (todayCompound / state.balances.vault) * 100 || 0,
                suffix: "% today",
                label: `+${formatPHP(todayCompound)}`,
              }}
              href="/vault"
            />
          </div>
        </motion.div>

        {/* Active plans full width */}
        <motion.div variants={item} className="mb-3">
          <ActivePlansList />
        </motion.div>

        {/* Activity */}
        <motion.div variants={item} className="mb-3">
          <ActivityFeed />
        </motion.div>

        {/* Plan history */}
        <motion.div variants={item}>
          <PlanHistoryTable />
        </motion.div>
      </motion.div>
    </div>
  );
}
