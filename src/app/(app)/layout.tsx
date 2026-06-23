import { AppShell } from "@/components/AppShell";
import { investorNav } from "@/lib/nav";

export default function InvestorAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell nav={investorNav}>{children}</AppShell>;
}
