"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Trophy, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useGameState } from "@/lib/game";
import {
  useCurrentRound,
  useColorGameState,
  useColorLeaderboard,
  placeColorBet,
  resolveColorRound,
  type DieColor,
  type RoundPhase,
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
  const [showRanking, setShowRanking] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [lastPayout, setLastPayout] = useState(0);
  const [showCoins, setShowCoins] = useState(false);

  const resolvedRef = useRef<string>("");
  const myBetRef = useRef<{ color: DieColor; amount: number } | null>(null);

  const balance = gameState.state?.points ?? 0;
  const phase = timer.phase;
  const bettingOpen = phase === "betting";

  // My bet in current round
  const myBet = round?.bets?.[user?.uid ?? ""] ?? null;
  const hasBet = !!myBet;
  const dice = round?.dice;

  // Auto-resolve when betting window closes
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

  // Track my bet for result display
  useEffect(() => {
    if (myBet) {
      myBetRef.current = { color: myBet.color, amount: myBet.amount };
    }
  }, [myBet]);

  // Show result overlay when dice resolve
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

  // Reset selection on new round
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

  // Build bet amounts map for the board
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

      {/* Dark overlay for better contrast */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Coin particles */}
      <ColorCoinParticles active={showCoins} count={25} />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-3 py-2">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-1 text-white/80 hover:text-white text-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="text-xs hidden sm:inline">Back</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="bg-black/50 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <span className="text-xs font-mono font-bold text-yellow-300">{balance} GP</span>
          </div>
          <div className="bg-black/50 backdrop-blur-sm rounded-full px-3 py-1">
            <span className="text-[10px] text-white/60">{totalBettors} player{totalBettors !== 1 ? "s" : ""}</span>
          </div>
        </div>

        <button
          onClick={() => setShowRanking(!showRanking)}
          className="flex items-center gap-1 text-yellow-300/80 hover:text-yellow-300"
        >
          <Trophy className="w-4 h-4" />
          <span className="text-xs hidden sm:inline">Rank</span>
        </button>
      </div>

      {/* Main game layout */}
      <div className="absolute inset-0 z-10 flex items-center justify-center pt-10 pb-2">
        <div className="flex gap-3 sm:gap-6 items-center max-w-[1200px] w-full px-3">

          {/* Left: Timer + Dice area */}
          <div className="flex flex-col items-center gap-3 shrink-0">
            <ColorRoundTimer phase={phase} remaining={timer.remaining} />

            {/* Dice suitcase */}
            <div className="relative">
              <img
                src="/colorgame/dice-suitcase.png"
                alt=""
                className="w-[200px] sm:w-[280px] h-auto"
                draggable={false}
              />
              <div className="absolute inset-0 flex items-center justify-center pt-[10%]">
                <ColorDice
                  results={dice}
                  rolling={phase === "rolling"}
                  size={50}
                />
              </div>
            </div>

            {/* Jackpot */}
            <div className="w-[200px] sm:w-[280px]">
              <ColorJackpotDisplay
                amount={gs.jackpotPool}
                triggered={round?.jackpotTriggered}
              />
            </div>
          </div>

          {/* Center: Betting Board */}
          <div className="flex flex-col items-center gap-2 flex-1 max-w-[400px]">
            <div className="w-full">
              <ColorBettingBoard
                selectedColor={selectedColor}
                onSelect={setSelectedColor}
                disabled={!bettingOpen || hasBet}
                betAmounts={betAmounts}
                results={dice}
              />
            </div>

            {/* Bet controls */}
            {!hasBet && bettingOpen ? (
              <div className="w-full">
                <ColorBetControls
                  betAmount={betAmount}
                  onBetChange={setBetAmount}
                  onPlaceBet={handlePlaceBet}
                  disabled={!selectedColor || !bettingOpen}
                  balance={balance}
                  placing={placing}
                />
              </div>
            ) : hasBet ? (
              <div className="bg-black/40 backdrop-blur-sm rounded-lg px-4 py-2 text-center">
                <span className="text-xs text-yellow-300 font-bold">
                  Bet placed: {myBet?.amount} GP on {myBet?.color}
                </span>
              </div>
            ) : (
              <div className="bg-black/40 backdrop-blur-sm rounded-lg px-4 py-2 text-center">
                <span className="text-xs text-white/50">
                  {phase === "rolling" ? "Rolling dice..." : phase === "result" ? "Round complete" : "Waiting..."}
                </span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-900/60 border border-red-500/40 rounded-lg px-3 py-1.5 text-center">
                <span className="text-[10px] text-red-300">{error}</span>
              </div>
            )}
          </div>

          {/* Right: History */}
          <div className="flex flex-col items-center gap-3 shrink-0">
            <div className="w-[200px] sm:w-[240px]">
              <div className="text-[9px] text-white/50 text-center mb-1 uppercase tracking-wider">Recent Results</div>
              <ColorHistoryStrip history={gs.history} />
            </div>
          </div>
        </div>
      </div>

      {/* Rankings overlay */}
      <ColorRankingBoard
        visible={showRanking}
        onClose={() => setShowRanking(false)}
        leaders={leaders}
      />

      {/* Result overlay */}
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
