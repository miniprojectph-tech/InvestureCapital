import { TopHeader } from "@/components/TopHeader";
import { PlansCalculator } from "@/components/PlansCalculator";
import { ActivePlansDetailed } from "@/components/ActivePlansDetailed";
import { PendingPlanRequests } from "@/components/PendingPlanRequests";

export default function PlansPage() {
  return (
    <div>
      <TopHeader
        title="Plans"
        subtitle="Activate a short-term plan — earnings seed your vault automatically"
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
        <PlansCalculator />
        <div className="flex flex-col gap-3">
          <PendingPlanRequests />
          <ActivePlansDetailed />
        </div>
      </div>
    </div>
  );
}
