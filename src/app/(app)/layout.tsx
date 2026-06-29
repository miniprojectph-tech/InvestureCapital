import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { investorNav } from "@/lib/nav";

export default function InvestorAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <AppShell nav={investorNav}>{children}</AppShell>
    </AuthGate>
  );
}
