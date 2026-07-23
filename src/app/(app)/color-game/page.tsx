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
    <div className="fixed inset-0 bg-black flex items-center justify-center select-none overflow-hidden">
      {/* 16:9 aspect-ratio container - all positions are relative to this */}
      <div
        className="relative"
        style={{
          width: "min(100vw, 177.78vh)",
          height: "min(100vh, 56.25vw)",
        }}
      >
        {/* Background art — single image with all UI chrome */}
        <img
          src="/colorgame/bg-full.png?v=2"
          alt=""
          className="absolute inset-0 w-full h-full"
          draggable={false}
        />

        {/* Coin particles layer */}
        <ColorCoinParticles active={showCoins} count={25} ambient />

        {/* ===== OVERLAYS ===== */}

        {/* Back button — over the hamburger menu icon */}
        <button
          onClick={() => router.push("/dashboard")}
          className="absolute z-20 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          style={{ left: "1%", top: "2%", width: "3.5%", height: "6.2%" }}
        >
          <ChevronLeft className="text-white/80" style={{ width: "min(1.5vw, 2.5vh)", height: "min(1.5vw, 2.5vh)" }} />
        </button>

        {/* GP balance — over the coin icon area */}
        <div
          className="absolute z-20 flex items-center justify-center"
          style={{ left: "0.5%", top: "10%", width: "5%", height: "5%" }}
        >
          <div className="bg-black/60 backdrop-blur-sm rounded-full flex items-center gap-[0.3vw]" style={{ padding: "min(0.3vw, 0.5vh) min(0.6vw, 1vh)" }}>
            <div className="rounded-full bg-yellow-400" style={{ width: "min(0.6vw, 1vh)", height: "min(0.6vw, 1vh)" }} />
            <span className="font-mono font-bold text-yellow-300" style={{ fontSize: "min(0.7vw, 1.1vh)" }}>{balance}</span>
          </div>
        </div>

        {/* Player count + timer — top center area */}
        <div
          className="absolute z-20 flex items-center gap-[1vw]"
          style={{ left: "42%", top: "1%", width: "16%", height: "5%" }}
        >
          <span className="text-white/50" style={{ fontSize: "min(0.6vw, 0.9vh)" }}>{totalBettors} online</span>
          <ColorRoundTimer phase={phase} remaining={timer.remaining} />
        </div>

        {/* Jackpot digits — inside the pink banner digit boxes */}
        <div
          className="absolute z-10"
          style={{ left: "65.5%", top: "4.5%", width: "18%", height: "7.5%" }}
        >
          <ColorJackpotDisplay
            amount={gs.jackpotPool}
            triggered={round?.jackpotTriggered}
          />
        </div>

        {/* Ranking rows — inside the cream area of the wooden easel */}
        <div
          className="absolute z-10"
          style={{ left: "2.8%", top: "16%", width: "15.5%", height: "60%" }}
        >
          <ColorRankingBoard leaders={leaders} />
        </div>

        {/* Dice — inside the open suitcase bottom half */}
        <div
          className="absolute z-10"
          style={{ left: "26%", top: "38%", width: "26%", height: "30%" }}
        >
          <ColorDice
            results={dice}
            rolling={phase === "rolling"}
          />
        </div>

        {/* History dots — inside the wooden history bar slots */}
        <div
          className="absolute z-10"
          style={{ left: "60%", top: "19.5%", width: "26%", height: "4.5%" }}
        >
          <ColorHistoryStrip history={gs.history} />
        </div>

        {/* Color tiles — 3x2 grid overlaying the painted tiles */}
        <div
          className="absolute z-10"
          style={{ left: "59.5%", top: "26%", width: "33%", height: "39%" }}
        >
          <ColorBettingBoard
            selectedColor={selectedColor}
            onSelect={setSelectedColor}
            disabled={!bettingOpen || hasBet}
            betAmounts={betAmounts}
            results={dice}
          />
        </div>

        {/* Bet controls — over AUTO + 4 gold circle buttons */}
        <div
          className="absolute z-10"
          style={{ left: "56%", top: "85%", width: "32%", height: "8%" }}
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
              <div className="bg-black/50 backdrop-blur-sm rounded-full" style={{ padding: "min(0.3vw, 0.5vh) min(1vw, 1.5vh)" }}>
                <span className="text-yellow-300 font-bold" style={{ fontSize: "min(0.8vw, 1.2vh)" }}>
                  Bet: {myBet?.amount} GP on {myBet?.color}
                </span>
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-white/40" style={{ fontSize: "min(0.7vw, 1vh)" }}>
                {phase === "rolling" ? "Rolling..." : phase === "result" ? "Round complete" : ""}
              </span>
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div
            className="absolute z-30 flex items-center justify-center"
            style={{ left: "56%", top: "78%", width: "32%", height: "5%" }}
          >
            <div className="bg-red-900/80 border border-red-500/50 rounded-lg" style={{ padding: "min(0.3vw, 0.5vh) min(0.8vw, 1.2vh)" }}>
              <span className="text-red-300" style={{ fontSize: "min(0.6vw, 0.9vh)" }}>{error}</span>
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
    </div>
  );
}
