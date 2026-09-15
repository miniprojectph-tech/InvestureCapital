import { TopHeader } from "@/components/TopHeader";
import { PlacementCalculator } from "@/components/PlacementCalculator";
import { ActivePlacements } from "@/components/ActivePlacements";
import { PendingPlanRequests } from "@/components/PendingPlanRequests";

export default function PlansPage() {
  return (
    <div>
      <TopHeader title="Plans" subtitle="Place capital — get paid every 5 days, capital and bonus back at the end" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
        <PlacementCalculator />
        <div className="flex flex-col gap-3">
          <PendingPlanRequests />
          <ActivePlacements />
        </div>
      </div>
    </div>
  );
}
