"use client";

import Link from "next/link";
import { Loader2, Power } from "lucide-react";
import { useSlotSettings, type HubGames } from "@/lib/slot";

/**
 * Admin can switch a game off from Game Settings › "Games on the hub". The
 * hub hides its card; this gate also blocks the game's own address so a saved
 * link doesn't work. Game Points and rewards are untouched.
 */
export function GameSwitchGate({ game, children }: { game: keyof HubGames; children: React.ReactNode }) {
  const { hub, loading } = useSlotSettings();
  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-6 h-6 animate-spin text-gold" /></div>;
  }
  if (!hub[game]) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-gold/10 flex items-center justify-center"><Power className="w-6 h-6 text-gold" /></div>
          <h2 className="text-lg font-semibold text-text">This game is switched off for now</h2>
          <p className="text-[13px] text-text-muted leading-relaxed">Your Game Points are safe. Check Games Central for what&apos;s open to play.</p>
          <Link href="/games" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-gold-dark text-[13px] font-semibold">Back to Games</Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
