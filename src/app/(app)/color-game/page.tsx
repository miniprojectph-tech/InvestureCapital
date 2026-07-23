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
    if (round?.dice) { resolvedRef.current = roundId; return; }
    const timeout = setTimeout(() => {
      if (resolvedRef.current === roundId) return;
      resolvedRef.current = roundId;
      resolveColorRound(roundId).catch(() => {});
    }, 500);
    return () => clearTimeout(timeout);
  }, [phase, roundId, round?.dice]);

  useEffect(() => {
    if (myBet) myBetRef.current = { color: myBet.color, amount: myBet.amount };
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
    const hide = setTimeout(() => { setShowResult(false); setShowCoins(false); }, 4500);
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
      setError(e instanceof Error ? e.message : "Failed to place bet");
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
      {/* Background art — 2880x1440, covers full viewport */}
      <img
        src="/colorgame/bg-full.png?v=3"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />

      {/* Coin particles */}
      <ColorCoinParticles active={showCoins} count={25} ambient />

      {/* ===== INTERACTIVE OVERLAYS (positions mapped to 2880x1440 art) ===== */}

      {/* Back button — over hamburger icon */}
      <button
        onClick={() => router.push("/dashboard")}
        className="absolute z-20 rounded-full hover:bg-white/10 transition-colors"
        style={{ left: "1%", top: "2%", width: "4%", height: "8%" }}
      />

      {/* GP balance — below coin icons */}
      <div className="absolute z-20 flex items-center justify-center"
        style={{ left: "1%", top: "11%", width: "5.5%", height: "4%" }}>
        <span className="font-mono font-bold text-yellow-300 drop-shadow-lg" style={{ fontSize: "clamp(10px, 1vw, 16px)" }}>
          {balance}
        </span>
      </div>

      {/* Timer — top right */}
      <div className="absolute z-20" style={{ right: "1.5%", top: "2%", width: "4%", height: "8%" }}>
        <ColorRoundTimer phase={phase} remaining={timer.remaining} />
      </div>

      {/* Online count */}
      <div className="absolute z-20 flex items-center justify-center"
        style={{ right: "5.5%", top: "3%", width: "4%", height: "4%" }}>
        <span className="text-white/50 font-medium" style={{ fontSize: "clamp(8px, 0.65vw, 12px)" }}>{totalBettors} online</span>
      </div>

      {/* Jackpot digits — inside pink banner purple boxes */}
      <div className="absolute z-10"
        style={{ left: "57%", top: "5%", width: "20%", height: "7%" }}>
        <ColorJackpotDisplay amount={gs.jackpotPool} triggered={round?.jackpotTriggered} />
      </div>

      {/* Ranking rows — inside wooden easel cream area */}
      <div className="absolute z-10"
        style={{ left: "3.5%", top: "17%", width: "14%", height: "56%" }}>
        <ColorRankingBoard leaders={leaders} />
      </div>

      {/* Dice — centered in open suitcase */}
      <div className="absolute z-10 flex items-center justify-center"
        style={{ left: "22%", top: "34%", width: "18%", height: "36%" }}>
        <ColorDice results={dice} rolling={phase === "rolling"} />
      </div>

      {/* History dots — inside wooden history bar */}
      <div className="absolute z-10"
        style={{ left: "53%", top: "21%", width: "28%", height: "4.5%" }}>
        <ColorHistoryStrip history={gs.history} />
      </div>

      {/* Color tiles 3x2 — over painted tiles */}
      <div className="absolute z-10"
        style={{ left: "53%", top: "27%", width: "33%", height: "42%" }}>
        <ColorBettingBoard
          selectedColor={selectedColor}
          onSelect={setSelectedColor}
          disabled={!bettingOpen || hasBet}
          betAmounts={betAmounts}
          results={dice}
        />
      </div>

      {/* Bet controls — AUTO + 4 gold buttons */}
      <div className="absolute z-10"
        style={{ left: "54%", top: "84%", width: "28%", height: "10%" }}>
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

      {/* Error */}
      {error && (
        <div className="absolute z-30" style={{ left: "53%", top: "73%", width: "30%", height: "5%" }}>
          <div className="flex items-center justify-center h-full">
            <div className="bg-red-900/80 border border-red-500/50 rounded-lg px-3 py-1">
              <span className="text-red-300" style={{ fontSize: "clamp(9px, 0.6vw, 12px)" }}>{error}</span>
            </div>
          </div>
        </div>
      )}

      {/* Result banner */}
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
