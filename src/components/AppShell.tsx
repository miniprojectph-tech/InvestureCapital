"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, TrendingUp } from "lucide-react";
import { CryptoTicker } from "./CryptoTicker";
import { Sidebar } from "./Sidebar";
import type { NavGroup } from "@/lib/nav";

type AppShellProps = {
  nav: NavGroup[];
  badge?: string;
  children: React.ReactNode;
};

export function AppShell({ nav, badge, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Tongits runs full-screen with its own chrome (see TongitsShell) — no app
  // sidebar/ticker. Auth still applies (AuthGate wraps this in the layout).
  if (pathname.startsWith("/tongits")) {
    return (
      <div
        className="min-h-[100dvh]"
        style={{
          backgroundColor: "#0a1740",
          backgroundImage:
            "radial-gradient(100% 55% at 50% 0%, rgba(63,111,214,0.30), transparent 60%), linear-gradient(180deg, #0b1a44 0%, #071230 100%)",
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen p-2 sm:p-3 bg-canvas">
      <div className="mb-2 sm:mb-3">
        <CryptoTicker />
      </div>

      {/* Mobile top bar with hamburger + logo */}
      <div className="md:hidden flex items-center justify-between px-1 py-2 mb-2">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 text-text hover:bg-card-elev rounded-md"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-gold" strokeWidth={2.25} />
          <span className="font-medium text-[13px]">Investure</span>
          {badge && (
            <span className="text-[9px] font-medium bg-blue/15 text-blue px-1.5 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
        <div className="w-9" /> {/* spacer to balance the hamburger */}
      </div>

      <div className="flex gap-3">
        <Sidebar
          groups={nav}
          badge={badge}
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
        />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
