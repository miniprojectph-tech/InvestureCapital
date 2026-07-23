"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";
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
  const [betAmount, setBetAmount] = useState(10);
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

  const handlePlaceBet = useCallback(async () => {
    if (!selectedColor || placing || !bettingOpen) return;
    setPlacing(true);
    setError(null);
    try {
      await placeColorBet(selectedColor, betAmount);
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
    <div className="fixed inset-0 overflow-hidden select-none" style={{ backgroundColor: "#1a0a2e" }}>
      {/* Background */}
      <img
        src="/colorgame/bg-full.png"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />
      <div className="absolute inset-0 bg-black/30" />

      {/* Ambient + win coin particles */}
      <ColorCoinParticles active={showCoins} count={25} ambient />

      {/* === Top bar: back, jackpot center, balance right === */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-3 py-2">
        {/* Left: back + player count */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-0.5 text-white/70 hover:text-white"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="text-[10px] hidden sm:inline">Back</span>
          </button>
          <span className="text-[9px] text-white/40">{totalBettors} online</span>
        </div>

        {/* Center: jackpot */}
        <ColorJackpotDisplay
          amount={gs.jackpotPool}
          triggered={round?.jackpotTriggered}
          lastDice={dice}
        />

        {/* Right: balance + timer */}
        <div className="flex items-center gap-2">
          <div className="bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1 flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <span className="text-[10px] font-mono font-bold text-yellow-300">{balance} GP</span>
          </div>
          <ColorRoundTimer phase={phase} remaining={timer.remaining} />
        </div>
      </div>

      {/* === Main 3-column layout === */}
      <div className="absolute inset-0 z-10 flex items-stretch pt-14 pb-2 px-2 sm:px-4 gap-2 sm:gap-3">
        {/* Left column: ranking board */}
        <div className="w-[140px] sm:w-[170px] shrink-0">
          <ColorRankingBoard leaders={leaders} />
        </div>

        {/* Center column: dice suitcase */}
        <div className="flex-1 flex flex-col items-center justify-center min-w-0">
          <div className="relative">
            <img
              src="/colorgame/dice-suitcase.png"
              alt=""
              className="w-[240px] sm:w-[340px] h-auto"
              draggable={false}
            />
            <div className="absolute inset-0 flex items-center justify-center pt-[8%]">
              <ColorDice
                results={dice}
                rolling={phase === "rolling"}
                size={70}
              />
            </div>
          </div>
        </div>

        {/* Right column: history + betting board + controls */}
        <div className="w-[220px] sm:w-[300px] shrink-0 flex flex-col gap-2 justify-center">
          {/* History strip */}
          <ColorHistoryStrip history={gs.history} />

          {/* Betting board */}
          <ColorBettingBoard
            selectedColor={selectedColor}
            onSelect={setSelectedColor}
            disabled={!bettingOpen || hasBet}
            betAmounts={betAmounts}
            results={dice}
          />

          {/* Bet controls or status */}
          {!hasBet && bettingOpen ? (
            <ColorBetControls
              betAmount={betAmount}
              onBetChange={setBetAmount}
              onPlaceBet={handlePlaceBet}
              disabled={!selectedColor || !bettingOpen}
              balance={balance}
              placing={placing}
              hasSelectedColor={!!selectedColor}
            />
          ) : hasBet ? (
            <div className="bg-black/40 backdrop-blur-sm rounded-lg px-3 py-1.5 text-center">
              <span className="text-[10px] text-yellow-300 font-bold">
                Bet: {myBet?.amount} GP on {myBet?.color}
              </span>
            </div>
          ) : (
            <div className="bg-black/40 backdrop-blur-sm rounded-lg px-3 py-1.5 text-center">
              <span className="text-[10px] text-white/50">
                {phase === "rolling" ? "Rolling..." : phase === "result" ? "Round complete" : "Waiting..."}
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-900/60 border border-red-500/40 rounded-lg px-2 py-1 text-center">
              <span className="text-[9px] text-red-300">{error}</span>
            </div>
          )}
        </div>
      </div>

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
