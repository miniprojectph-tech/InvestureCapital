"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useGameState } from "@/lib/game";
import { useSlotSettings, slotOpenFor, slotDayStart, type DayState } from "@/lib/slot";
import { DragonSpireGame } from "@/components/slot/DragonSpireGame";

export default function DragonSpirePage() {
  const { user } = useAuth();
  const { slot, loading } = useSlotSettings();
  const { state: gameState, loading: stateLoading } = useGameState();
  const open = !!user && slotOpenFor(slot, user.uid, user.isAdmin);
  const [day, setDay] = useState<DayState | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);

  // Ask the server for today's spins (it makes the day's plan the first time).
  useEffect(() => {
    if (loading || !open) return;
    let cancelled = false;
    slotDayStart().then((d) => { if (!cancelled) setDay(d); }).catch((e) => { if (!cancelled) setDayError(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not start today's spins."); });
    return () => { cancelled = true; };
  }, [loading, open]);

  if (!user || loading || stateLoading || (open && !day && !dayError)) {
    return <div className="min-h-[100dvh] bg-[#070C19] flex items-center justify-center"><Loader2 className="w-6 h-6 text-[#F5C66B] animate-spin" /></div>;
  }
  if (!open || dayError) {
    return (
      <div className="min-h-[100dvh] bg-[#070C19] text-white flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-[#F5C66B]/10 flex items-center justify-center mb-4"><Lock className="w-6 h-6 text-[#F5C66B]" /></div>
          <p className="text-[16px] font-semibold m-0">{dayError ? "Dragon Spire couldn't open" : "Dragon Spire isn't open yet"}</p>
          <p className="text-[12px] text-white/60 mt-2 mb-5">{dayError ?? (slot.status === "testers" ? "It is being tested by a few members first. Watch Games Central for the launch." : "Check back soon.")}</p>
          <Link href="/games" className="inline-block px-5 py-2.5 rounded-lg bg-[#F5C66B] text-[#1a1200] text-[13px] font-semibold">Back to Games</Link>
        </div>
      </div>
    );
  }
  return (
    <DragonSpireGame
      points={gameState?.points ?? 0}
      pots={{ mini: slot.pots.mini.amount, minor: slot.pots.minor.amount, major: slot.pots.major.amount, grand: slot.grand.amount }}
      day={day!}
      spinValue={slot.daily.spinValue}
      testing={slot.testing}
    />
  );
}
