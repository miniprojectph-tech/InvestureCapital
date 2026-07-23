"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useGameState } from "@/lib/game";
import {
  useCurrentRound,
  useColorGameState,
  useColorLeaderboard,
  placeColorBet,
  resolveColorRound,
  type DieColor,
} from "@/lib/colorgame";
import { ColorDice } from "@/components/colorgame/ColorDice";
import { ColorBettingBoard } from "@/components/colorgame/ColorBettingBoard";
import { ColorBetControls } from "@/components/colorgame/ColorBetControls";
import { ColorJackpotDisplay } from "@/components/colorgame/ColorJackpotDisplay";
import { ColorHistoryStrip } from "@/components/colorgame/ColorHistoryStrip";
import { ColorRankingBoard } from "@/components/colorgame/ColorRankingBoard";
import { ColorRoundTimer } from "@/components/colorgame/ColorRoundTimer";
import { ColorCoinParticles } from "@/components/colorgame/ColorCoinParticles";
import { ColorResultOverlay } from "@/components/colorgame/ColorResultOverlay";

export default function ColorGamePage() {
  const router = useRouter();
  const { user } = useAuth();
  const gameState = useGameState();

  const { round, loading, roundId, timer } = useCurrentRound();
  const gs = useColorGameState();
  const leaders = useColorLeaderboard(10);

  const [selectedColor, setSelectedColor] = useState<DieColor | null>(null);
  const [betAmount, setBetAmount] = useState(5);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [lastPayout, setLastPayout] = useState(0);
  const [showCoins, setShowCoins] = useState(false);

  const resolvedRef = useRef<string>("");
  const myBetRef = useRef<{ color: DieColor; amount: number } | null>(null);

  const balance = gameState.state?.points ?? 0;
  const phase = timer.phase;
  const bettingOpen = phase === "betting";

  const myBet = round?.bets?.[user?.uid ?? ""] ?? null;
  const hasBet = !!myBet;
  const dice = round?.dice;

  useEffect(() => {
    if (phase !== "rolling" && phase !== "result") return;
    if (resolvedRef.current === roundId) return;
    if (round?.dice) {
      resolvedRef.current = roundId;
      return;
    }
    const timeout = setTimeout(() => {
      if (resolvedRef.current === roundId) return;
      resolvedRef.current = roundId;
      resolveColorRound(roundId).catch(() => {});
    }, 500);
    return () => clearTimeout(timeout);
  }, [phase, roundId, round?.dice]);

  useEffect(() => {
    if (myBet) {
      myBetRef.current = { color: myBet.color, amount: myBet.amount };
    }
  }, [myBet]);

  useEffect(() => {
    if (!dice || !myBetRef.current) return;
    const matches = dice.filter((d) => d === myBetRef.current!.color).length;
    let payout = 0;
    if (matches === 1) payout = myBetRef.current.amount * 2;
    else if (matches === 2) payout = myBetRef.current.amount * 3;
    else if (matches === 3) payout = myBetRef.current.amount * 4;
    if (round?.jackpotTriggered && round.jackpotColor === myBetRef.current.color && round.jackpotAmount) {
      payout += round.jackpotAmount;
    }
    setLastPayout(payout);
    setShowResult(true);
    if (payout > 0) setShowCoins(true);
    const hide = setTimeout(() => {
      setShowResult(false);
      setShowCoins(false);
    }, 4500);
    return () => clearTimeout(hide);
  }, [dice, round?.jackpotTriggered, round?.jackpotColor, round?.jackpotAmount]);

  useEffect(() => {
    if (phase === "betting") {
      setSelectedColor(null);
      myBetRef.current = null;
      setShowResult(false);
      setShowCoins(false);
    }
  }, [phase, roundId]);

  const handlePlaceBet = useCallback(async (amount?: number) => {
    const amt = amount ?? betAmount;
    if (!selectedColor || placing || !bettingOpen) return;
    setPlacing(true);
    setError(null);
    try {
      await placeColorBet(selectedColor, amt);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to place bet";
      setError(msg);
    } finally {
      setPlacing(false);
    }
  }, [selectedColor, betAmount, placing, bettingOpen]);

  const betAmounts: Record<string, number> = {};
  if (round?.bets) {
    for (const b of Object.values(round.bets)) {
      betAmounts[b.color] = (betAmounts[b.color] ?? 0) + b.amount;
    }
  }

  const totalBettors = round ? Object.keys(round.bets ?? {}).length : 0;

  if (loading && !round) {
    return (
      <div className="fixed inset-0 bg-[#1a0a2e] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 select-none overflow-hidden">
      {/* Background art — covers full viewport */}
      <img
        src="/colorgame/bg-full.png?v=2"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />

      {/* Coin particles layer */}
      <ColorCoinParticles active={showCoins} count={25} ambient />

      {/* ===== INTERACTIVE OVERLAYS ===== */}

      {/* Back button — over hamburger menu icon (top-left) */}
      <button
        onClick={() => router.push("/dashboard")}
        className="absolute z-20 rounded-full hover:bg-white/10 transition-colors"
        style={{ left: "2.5%", top: "3%", width: "5%", height: "9%" }}
      />

      {/* GP balance — below the coin icon */}
      <div
        className="absolute z-20 flex items-center justify-center"
        style={{ left: "2%", top: "13%", width: "7%", height: "5%" }}
      >
        <span className="font-mono font-bold text-yellow-300 drop-shadow-lg" style={{ fontSize: "clamp(10px, 1vw, 16px)" }}>
          {balance}
        </span>
      </div>

      {/* Timer — top right area */}
      <div
        className="absolute z-20"
        style={{ right: "2%", top: "3%", width: "5%", height: "9%" }}
      >
        <ColorRoundTimer phase={phase} remaining={timer.remaining} />
      </div>

      {/* Online count — near timer */}
      <div
        className="absolute z-20 flex items-center justify-center"
        style={{ right: "7%", top: "4%", width: "5%", height: "4%" }}
      >
        <span className="text-white/50 font-medium" style={{ fontSize: "clamp(8px, 0.7vw, 12px)" }}>{totalBettors} online</span>
      </div>

      {/* Jackpot digits — positioned inside the pink banner's purple digit boxes */}
      <div
        className="absolute z-10"
        style={{ left: "63%", top: "5%", width: "22%", height: "8%" }}
      >
        <ColorJackpotDisplay
          amount={gs.jackpotPool}
          triggered={round?.jackpotTriggered}
        />
      </div>

      {/* Ranking rows — inside the cream area of the wooden easel */}
      <div
        className="absolute z-10"
        style={{ left: "5.5%", top: "18%", width: "20%", height: "58%" }}
      >
        <ColorRankingBoard leaders={leaders} />
      </div>

      {/* Dice — centered inside the open suitcase bottom half */}
      <div
        className="absolute z-10 flex items-center justify-center"
        style={{ left: "27%", top: "32%", width: "24%", height: "35%" }}
      >
        <ColorDice
          results={dice}
          rolling={phase === "rolling"}
        />
      </div>

      {/* History dots — inside the wooden history bar */}
      <div
        className="absolute z-10"
        style={{ left: "57%", top: "20%", width: "29%", height: "5%" }}
      >
        <ColorHistoryStrip history={gs.history} />
      </div>

      {/* Color tiles (3x2) — overlaying the painted color tiles */}
      <div
        className="absolute z-10"
        style={{ left: "56%", top: "27%", width: "36%", height: "42%" }}
      >
        <ColorBettingBoard
          selectedColor={selectedColor}
          onSelect={setSelectedColor}
          disabled={!bettingOpen || hasBet}
          betAmounts={betAmounts}
          results={dice}
        />
      </div>

      {/* Bet controls — over AUTO toggle + 4 gold circles at bottom */}
      <div
        className="absolute z-10"
        style={{ left: "53%", top: "86%", width: "36%", height: "10%" }}
      >
        {!hasBet && bettingOpen ? (
          <ColorBetControls
            betAmount={betAmount}
            onBetChange={setBetAmount}
            onPlaceBet={handlePlaceBet}
            disabled={!bettingOpen}
            balance={balance}
            placing={placing}
            selectedColor={!!selectedColor}
          />
        ) : hasBet ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="bg-black/50 backdrop-blur-sm rounded-full px-3 py-1">
              <span className="text-yellow-300 font-bold" style={{ fontSize: "clamp(10px, 0.9vw, 14px)" }}>
                Bet: {myBet?.amount} GP on {myBet?.color}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Error display */}
      {error && (
        <div className="absolute z-30" style={{ left: "56%", top: "73%", width: "32%", height: "5%" }}>
          <div className="flex items-center justify-center h-full">
            <div className="bg-red-900/80 border border-red-500/50 rounded-lg px-3 py-1">
              <span className="text-red-300" style={{ fontSize: "clamp(9px, 0.6vw, 12px)" }}>{error}</span>
            </div>
          </div>
        </div>
      )}

      {/* Result banner (bottom-left) */}
      <ColorResultOverlay
        visible={showResult}
        betColor={myBetRef.current?.color ?? null}
        betAmount={myBetRef.current?.amount ?? 0}
        dice={dice}
        payout={lastPayout}
        jackpotTriggered={round?.jackpotTriggered}
        jackpotAmount={round?.jackpotAmount}
      />
    </div>
  );
}
