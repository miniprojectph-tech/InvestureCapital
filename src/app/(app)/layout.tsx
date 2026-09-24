import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { EventPopup } from "@/components/events/EventPopup";
import { investorNav } from "@/lib/nav";

export default function InvestorAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <AppShell nav={investorNav}>{children}</AppShell>
      {/* Limited-event announcement after sign-in (skips itself inside the games). */}
      <EventPopup />
    </AuthGate>
  );
}
