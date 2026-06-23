import { TopHeader } from "@/components/TopHeader";
import { PlansCalculator } from "@/components/PlansCalculator";

export default function PlansPage() {
  return (
    <div>
      <TopHeader
        title="Plans"
        subtitle="Activate a short-term plan — earnings seed your vault automatically"
      />
      <PlansCalculator />
    </div>
  );
}
