import { Coins, ArrowDownRight, Wallet as WalletIcon, Clock } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { HeroBalance } from "@/components/HeroBalance";
import { KpiCard } from "@/components/KpiCard";
import { GrowthChart } from "@/components/GrowthChart";
import { ActivePlansList } from "@/components/ActivePlansList";
import { ActivityFeed } from "@/components/ActivityFeed";
import { PlanHistoryTable } from "@/components/PlanHistoryTable";
import { formatPHP } from "@/lib/utils";
import {
  mockUser,
  mockActivePlans,
  mockBalances,
  getTotalDailyIncome,
  getTotalDeployed,
  getPendingVaultCredits,
} from "@/lib/mock-data";

export default function DashboardPage() {
  const deployed = getTotalDeployed();
  const dailyIncome = getTotalDailyIncome();
  const pendingVault = getPendingVaultCredits();

  return (
    <div>
      <TopHeader
        title={`Good evening, ${mockUser.name.split(" ")[0]}`}
        subtitle={`${mockActivePlans.length} active plans · next payout in 12h 43m`}
      />

      <HeroBalance
        wallet={mockBalances.wallet}
        deployed={deployed}
        vault={mockBalances.vault}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <KpiCard
          label="Active plans"
          value={String(mockActivePlans.length)}
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
        <GrowthChart startingVault={mockBalances.vault} currentDay={mockBalances.vaultLockDay} />
        <ActivePlansList />
      </div>

      <div className="mb-4">
        <ActivityFeed />
      </div>

      <PlanHistoryTable />
    </div>
  );
}
