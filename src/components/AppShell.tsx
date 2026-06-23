import { CryptoTicker } from "./CryptoTicker";
import { Sidebar } from "./Sidebar";
import type { NavGroup } from "@/lib/nav";

type AppShellProps = {
  nav: NavGroup[];
  badge?: string;
  children: React.ReactNode;
};

export function AppShell({ nav, badge, children }: AppShellProps) {
  return (
    <div className="min-h-screen p-3 bg-canvas">
      <div className="mb-3">
        <CryptoTicker />
      </div>
      <div className="flex gap-3">
        <Sidebar groups={nav} badge={badge} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
