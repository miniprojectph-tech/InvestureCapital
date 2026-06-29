"use client";

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

export default function DashboardPage() {
  const { state, loading } = useUserState();

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
      </div>
    );
  }

  const deployed = computeDeployed(state.activePlans);
  const dailyIncome = computeDailyIncome(state.activePlans, mockPlans);
  const pendingVault = computePendingVaultCredits(state.activePlans, mockPlans);
  const firstName = state.profile.name.split(" ")[0];

  return (
    <div>
      <TopHeader
        title={`Good evening, ${firstName}`}
        subtitle={`${state.activePlans.length} active plans · next payout in 12h 43m`}
      />

      <HeroBalance
        wallet={state.balances.wallet}
        deployed={deployed}
        vault={state.balances.vault}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3 mb-4">
        <GrowthChart startingVault={state.balances.vault} currentDay={4} />
        <ActivePlansList />
      </div>

      <div className="mb-4">
        <ActivityFeed />
      </div>

      <PlanHistoryTable />
    </div>
  );
}
