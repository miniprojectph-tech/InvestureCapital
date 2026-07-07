"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Trophy, History, HelpCircle, Gift, LogOut, Coins, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useGameState } from "@/lib/game";
import { rankTier } from "@/lib/tongits-social";
import { AssetImage } from "./AssetImage";
import { useTongitsAssets } from "@/lib/tongitsAssets";

// Blue/gold arcade palette (Tongits runs as its own themed world).
export const T = {
  gold: "#F5C66B",
  goldDeep: "#c9922f",
  blue: "#3f6fd6",
  panelFrom: "#1a2f66",
  panelTo: "#0e1c47",
  green: "#34d07a",
};

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return (p.length === 1 ? p[0].slice(0, 2) : (p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Gold-framed arcade panel. */
export function ArcadePanel({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div
      className={cn("rounded-2xl p-3 sm:p-4 relative", className)}
      style={{
        background: `linear-gradient(180deg, ${T.panelFrom}, ${T.panelTo})`,
        border: "1px solid rgba(245,198,107,0.35)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      {title && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider whitespace-nowrap"
          style={{
            background: `linear-gradient(180deg, ${T.blue}, #24479e)`,
            border: "1px solid rgba(245,198,107,0.5)",
            color: T.gold,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          {title}
        </div>
      )}
      {title && <div className="h-3" />}
      {children}
    </div>
  );
}

const NAV = [
  { href: "/tongits", label: "Lobby", icon: Home },
  { href: "/tongits/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/tongits/history", label: "Room History", icon: History },
  { href: "/tongits/how-to-play", label: "How to Play", icon: HelpCircle },
];

export function TongitsShell({
  children,
  showNav = true,
}: {
  children: React.ReactNode;
  showNav?: boolean;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { state } = useGameState();
  const assets = useTongitsAssets();
  const points = state?.points ?? 0;
  const rp = state?.rankingPoints ?? 0;
  const tier = rankTier(rp);

  return (
    <div
      className="relative min-h-[100dvh] text-white"
      style={{
        backgroundColor: "#0a1740",
        backgroundImage: `radial-gradient(100% 55% at 50% 0%, rgba(63,111,214,0.35), transparent 60%), linear-gradient(180deg, #0b1a44 0%, #071230 100%), url(${assets.lobbyBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
      }}
    >
      {/* Top bar */}
      <header className="relative z-10 flex items-center gap-3 px-3 sm:px-5 py-3">
        {/* Profile */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0"
            style={{ background: "#0d1a3d", border: `2px solid ${T.gold}`, color: T.gold }}
          >
            {initials(user?.name ?? "P")}
          </div>
          <div className="min-w-0 hidden sm:block">
            <p className="text-[13px] font-semibold m-0 truncate max-w-[140px]">{user?.name ?? "Player"}</p>
            <p className="text-[10px] m-0" style={{ color: T.gold }}>
              {tier.name}
            </p>
            <div className="w-24 h-1.5 rounded-full mt-1 bg-black/40 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${tier.progress * 100}%`, background: `linear-gradient(90deg, ${T.gold}, #ffdd8c)` }}
              />
            </div>
          </div>
        </div>

        {/* Logo */}
        <div className="flex-1 flex justify-center">
          <AssetImage
            src={assets.logo}
            alt="Community Tongits"
            className="h-12 sm:h-16 object-contain drop-shadow-lg"
            fallback={
              <div className="text-center leading-none">
                <p
                  className="m-0 font-extrabold tracking-wide"
                  style={{ fontSize: 24, color: T.gold, textShadow: "0 2px 0 rgba(0,0,0,0.4)" }}
                >
                  TONGITS
                </p>
                <p className="m-0 text-[9px] tracking-[0.25em] text-white/70">PLAY · COMPETE · WIN</p>
              </div>
            }
          />
        </div>

        {/* Stats + exit */}
        <div className="flex items-center gap-2 shrink-0">
          <StatPill icon={Coins} value={points.toLocaleString()} />
          <StatPill icon={Trophy} value={rp.toLocaleString()} />
          <Link
            href="/rewards"
            className="hidden sm:flex flex-col items-center justify-center w-11 h-11 rounded-xl"
            style={{ background: "linear-gradient(180deg,#7c5cff,#5a3fd6)", border: "1px solid rgba(245,198,107,0.4)" }}
            aria-label="Rewards"
          >
            <Gift className="w-5 h-5" style={{ color: T.gold }} />
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center justify-center w-11 h-11 rounded-xl bg-black/30 border border-white/15 hover:bg-black/50 transition"
            aria-label="Exit to app"
          >
            <LogOut className="w-5 h-5 text-white/80" />
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 px-3 sm:px-5 pb-28 max-w-6xl mx-auto w-full">{children}</main>

      {/* Bottom nav */}
      {showNav && (
        <nav
          className="fixed bottom-0 inset-x-0 z-20 flex items-center justify-around px-2 py-2 backdrop-blur-md"
          style={{ background: "linear-gradient(180deg, rgba(10,23,64,0.4), rgba(7,18,48,0.95))", borderTop: "1px solid rgba(245,198,107,0.25)" }}
        >
          {NAV.map((n) => {
            const active = pathname === n.href;
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition",
                  active ? "text-white" : "text-white/50 hover:text-white/80"
                )}
              >
                <Icon className="w-5 h-5" style={active ? { color: T.gold } : undefined} />
                <span className="text-[9px] font-medium">{n.label}</span>
              </Link>
            );
          })}
          <Link
            href="/tongits"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-[12px] text-[#0a1740]"
            style={{ background: `linear-gradient(180deg, ${T.gold}, ${T.goldDeep})`, boxShadow: "0 4px 12px rgba(245,198,107,0.4)" }}
          >
            <Play className="w-4 h-4" /> Play
          </Link>
        </nav>
      )}
    </div>
  );
}

function StatPill({ icon: Icon, value }: { icon: typeof Coins; value: string }) {
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
      style={{ background: "#0d1a3d", border: `1px solid ${T.gold}55` }}
    >
      <Icon className="w-3.5 h-3.5" style={{ color: T.gold }} />
      <span className="text-[12px] font-mono font-semibold tabular-nums">{value}</span>
    </div>
  );
}
