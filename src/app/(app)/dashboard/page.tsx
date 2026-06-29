"use client";

import { motion, type Variants } from "framer-motion";
import { Coins, ArrowDownRight, Wallet as WalletIcon, Clock, Loader2 } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { HeroBalance } from "@/components/HeroBalance";
import { KpiCard } from "@/components/KpiCard";
import { GrowthChart } from "@/components/GrowthChart";
import { ActivePlansList } from "@/components/ActivePlansList";
import { ActivityFeed } from "@/components/ActivityFeed";
import { PlanHistoryTable } from "@/components/PlanHistoryTable";
import { formatPHP } from "@/lib/utils";
import { mockPlans } from "@/lib/mock-data";
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
  const firstName = state.profile.name.split(" ")[0];
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <TopHeader
        title={`${greeting}, ${firstName}`}
        subtitle={`${state.activePlans.length} active plans · next payout in 12h 43m`}
      />

      <HeroBalance
        wallet={state.balances.wallet}
        deployed={deployed}
        vault={state.balances.vault}
      />

      <motion.div variants={stagger} initial="hidden" animate="show">
        <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
          <KpiCard
            label="Active plans"
            value={String(state.activePlans.length)}
            sub={`${formatPHP(deployed, { short: true })} deployed`}
            icon={Coins}
            iconTone="blue"
          />
          <KpiCard
            label="Daily income"
            value={formatPHP(dailyIncome)}
            sub="Across all plans"
            subTone="green"
            icon={ArrowDownRight}
            iconTone="green"
          />
          <KpiCard
            label="Vault pending"
            value={`+${formatPHP(pendingVault, { short: true })}`}
            sub="On plan completion"
            subTone="gold"
            icon={WalletIcon}
            iconTone="gold"
          />
          <KpiCard
            label="Next payout"
            value="12:43:08"
            sub={`${formatPHP(dailyIncome)} incoming`}
            icon={Clock}
            iconTone="red"
          />
        </motion.div>

        <motion.div
          variants={item}
          className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3 mb-5"
        >
          <GrowthChart startingVault={state.balances.vault} currentDay={4} />
          <ActivePlansList />
        </motion.div>

        <motion.div variants={item} className="mb-5">
          <ActivityFeed />
        </motion.div>

        <motion.div variants={item}>
          <PlanHistoryTable />
        </motion.div>
      </motion.div>
    </div>
  );
}
