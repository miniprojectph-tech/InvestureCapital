"use client";

import Link from "next/link";
import { Loader2, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useGameState } from "@/lib/game";
import { useSlotSettings, useSlotPots, useSlotPlayerState, slotOpenFor, DEFAULT_BETS } from "@/lib/slot";
import { DragonSpireGame } from "@/components/slot/DragonSpireGame";

export default function DragonSpirePage() {
  const { user } = useAuth();
  const { slot, loading } = useSlotSettings();
  const pots = useSlotPots();
  const { state: player, loading: playerLoading } = useSlotPlayerState();
  const { state: gameState, loading: stateLoading } = useGameState();

  if (!user || loading || playerLoading || stateLoading) {
    return <div className="min-h-[100dvh] bg-[#070C19] flex items-center justify-center"><Loader2 className="w-6 h-6 text-[#F5C66B] animate-spin" /></div>;
  }
  if (!slotOpenFor(slot, user.uid, user.isAdmin)) {
    return (
      <div className="min-h-[100dvh] bg-[#070C19] text-white flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-[#F5C66B]/10 flex items-center justify-center mb-4"><Lock className="w-6 h-6 text-[#F5C66B]" /></div>
          <p className="text-[16px] font-semibold m-0">Dragon Spire isn&apos;t open yet</p>
          <p className="text-[12px] text-white/60 mt-2 mb-5">{slot.status === "testers" ? "It is being tested by a few members first. Watch Games Central for the launch." : "Check back soon."}</p>
          <Link href="/games" className="inline-block px-5 py-2.5 rounded-lg bg-[#F5C66B] text-[#1a1200] text-[13px] font-semibold">Back to Games</Link>
        </div>
      </div>
    );
  }
  return (
    <DragonSpireGame
      uid={user.uid}
      points={gameState?.points ?? 0}
      bets={slot.engine?.bets?.length ? slot.engine.bets : DEFAULT_BETS}
      pots={pots.pots}
      freeSpinsLeft={player.freeSpinsLeft}
      freeTotal={player.freeTotal ?? 0}
      testing={slot.testing}
      initialBet={player.lastBet}
    />
  );
}
