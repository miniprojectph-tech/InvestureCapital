"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  COLOR_HEX,
  type DieColor,
} from "@/lib/colorgame";
import { ColorDice } from "@/components/colorgame/ColorDice";
import { ColorBettingBoard } from "@/components/colorgame/ColorBettingBoard";
import { ColorBetControls } from "@/components/colorgame/ColorBetControls";
import { ColorJackpotDisplay } from "@/components/colorgame/ColorJackpotDisplay";
import { ColorHistoryStrip } from "@/components/colorgame/ColorHistoryStrip";
import { ColorHistoryModal } from "@/components/colorgame/ColorHistoryModal";
import { ColorRankingBoard } from "@/components/colorgame/ColorRankingBoard";
import { ColorRoundTimer } from "@/components/colorgame/ColorRoundTimer";
import { ColorCoinParticles } from "@/components/colorgame/ColorCoinParticles";
import { ColorResultOverlay } from "@/components/colorgame/ColorResultOverlay";

const BG_URL = "/colorgame/bg-full.png?v=3";
const IMG_AR = 2; // 2880 / 1440

function useBgReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setReady(true);
    img.onerror = () => setReady(true);
    img.src = BG_URL;
    if (img.complete) setReady(true);
  }, []);
  return ready;
}

function useCoverStyle(): React.CSSProperties {
  const [style, setStyle] = useState<React.CSSProperties>({
    position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
  });
  useEffect(() => {
    function calc() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let w: number, h: number;
      if (vw / vh > IMG_AR) {
        w = vw; h = vw / IMG_AR;
      } else {
        h = vh; w = vh * IMG_AR;
      }
      setStyle({
        position: "absolute",
        left: (vw - w) / 2,
        top: (vh - h) / 2,
        width: w,
        height: h,
      });
    }
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);
  return style;
}

export default function ColorGamePage() {
  const router = useRouter();
  const { user } = useAuth();
  const gameState = useGameState();

  const { live, loading, roundId, timer } = useCurrentRound();
  const gs = useColorGameState();
  const leaders = useColorLeaderboard(10);

  const [selectedColor, setSelectedColor] = useState<DieColor | null>(null);
  const [betAmount, setBetAmount] = useState(50);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCoins, setShowCoins] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // The client places bets so it knows its own; RTDB only carries aggregate totals.
  const myBetsRef = useRef<{ roundId: string; bets: Partial<Record<DieColor, number>> }>({ roundId: "", bets: {} });

  const bgReady = useBgReady();
  const coverStyle = useCoverStyle();

  const prevDiceRef = useRef<[DieColor, DieColor, DieColor] | undefined>(undefined);

  const balance = gameState.state?.points ?? 0;
  const phase = timer.phase;
  const bettingOpen = phase === "betting";

  const isCurrent = live?.roundId === roundId;
  const currentDice = isCurrent ? live?.dice : undefined;

  if (currentDice) prevDiceRef.current = currentDice;
  const dice = currentDice ?? prevDiceRef.current;

  // Keep asking the server to resolve this round until its dice actually land.
  // resolveColorRound is idempotent (re-mirrors the dice to RTDB), so retrying
  // safely recovers rounds where a single attempt failed or never arrived —
  // which is what left rounds stuck with no dice and no payout.
  useEffect(() => {
    if (phase !== "rolling" && phase !== "result") return;
    if (currentDice) return; // resolved and received — stop asking
    let cancelled = false;
    const attempt = () => { if (!cancelled) resolveColorRound(roundId).catch(() => {}); };
    const first = setTimeout(attempt, 400);
    const iv = setInterval(attempt, 2000);
    return () => { cancelled = true; clearTimeout(first); clearInterval(iv); };
  }, [phase, roundId, currentDice]);

  // This player's result for the current round — derived fresh every render, so
  // it can never get "stuck" across rounds. Base win only (2x/3x/4x); any
  // jackpot share is credited server-side and shows in the live balance.
  const myResult = useMemo(() => {
    if (!currentDice || !isCurrent) return null;
    const mine = myBetsRef.current;
    if (mine.roundId !== roundId) return null;
    const entries = Object.entries(mine.bets) as [DieColor, number][];
    if (entries.length === 0) return null;
    let payout = 0;
    let totalBet = 0;
    for (const [color, amt] of entries) {
      totalBet += amt;
      const matches = currentDice.filter((d) => d === color).length;
      if (matches === 1) payout += amt * 2;
      else if (matches === 2) payout += amt * 3;
      else if (matches === 3) payout += amt * 4;
    }
    return { color: entries[0][0], amount: totalBet, payout };
  }, [currentDice, isCurrent, roundId]);

  // Show the result banner through the whole result phase (dice have already
  // settled by then). Nothing to schedule or cancel — it just tracks the phase.
  const showResult = phase === "result" && myResult !== null;

  // One-shot coin burst when a winning result appears.
  useEffect(() => {
    if (showResult && (myResult?.payout ?? 0) > 0) {
      setShowCoins(true);
      const t = setTimeout(() => setShowCoins(false), 3000);
      return () => clearTimeout(t);
    }
    setShowCoins(false);
  }, [showResult]);

  useEffect(() => {
    if (phase === "betting") setSelectedColor(null);
  }, [phase, roundId]);

  const handleColorTap = useCallback(async (color: DieColor) => {
    if (placing || !bettingOpen) return;
    setSelectedColor(color);
    setPlacing(true);
    setError(null);
    try {
      await placeColorBet(color, betAmount);
      const mine = myBetsRef.current;
      if (mine.roundId !== roundId) { mine.roundId = roundId; mine.bets = {}; }
      mine.bets[color] = (mine.bets[color] ?? 0) + betAmount;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to place bet");
    } finally {
      setPlacing(false);
    }
  }, [betAmount, placing, bettingOpen, roundId]);

  const betAmounts: Record<string, number> = (isCurrent && live?.betAmounts ? live.betAmounts : {}) as Record<string, number>;
  const totalBettors = isCurrent ? (live?.totalBettors ?? 0) : 0;

  if (!bgReady || (loading && !live)) {
    return (
      <div className="fixed inset-0 bg-[#1a0a2e] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-[#1a0a2e]">
      {/* Cover-container: sized to mimic background-size:cover + center.
          All overlays inside use % of the IMAGE, not the viewport,
          so positions stay consistent across all screen aspect ratios. */}
      <div style={coverStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BG_URL} alt="" draggable={false}
          className="absolute inset-0 w-full h-full block" />

        {/* Coin particles — only on win */}
        <ColorCoinParticles active={showCoins} count={25} />

        {/* ===== OVERLAYS (% of 2880x1440 image) ===== */}

        {/* Back button — over hamburger icon */}
        <button
          onClick={() => router.push("/dashboard")}
          className="absolute z-20 rounded-full hover:bg-white/10 transition-colors"
          style={{ left: "1%", top: "2%", width: "4%", height: "8%" }}
        />

        {/* GP balance — pill under the coin icon */}
        <div className="absolute z-20 flex items-center justify-center"
          style={{ left: "0.5%", top: "23%", width: "8.5%", height: "5.5%" }}>
          <span
            className="font-mono font-black text-yellow-300"
            style={{
              fontSize: "clamp(13px, 1.6vw, 28px)",
              lineHeight: 1,
              padding: "0.18em 0.7em",
              borderRadius: "999px",
              background: "rgba(20,6,40,0.6)",
              border: "1.5px solid rgba(255,215,0,0.55)",
              textShadow: "0 2px 4px rgba(0,0,0,0.85)",
              whiteSpace: "nowrap",
            }}
          >
            {balance.toLocaleString()}
          </span>
        </div>

        {/* Timer — top right (enlarged for readability) */}
        <div className="absolute z-20" style={{ right: "1.5%", top: "1.5%", width: "6.5%", height: "12%" }}>
          <ColorRoundTimer phase={phase} remaining={timer.remaining} />
        </div>

        {/* Online count — left of the bigger timer */}
        <div className="absolute z-20 flex items-center justify-center"
          style={{ right: "9.5%", top: "2.5%", width: "5%", height: "4%" }}>
          <span className="text-white/60 font-semibold" style={{ fontSize: "clamp(9px, 0.75vw, 14px)" }}>{totalBettors} online</span>
        </div>

        {/* Jackpot digits — seated in the 6 dark tiles of the pink banner.
            Bounds the measured tile centers (61.1%–81.7% of the 2880px art)
            so a flex row of 6 cells lands each digit dead-center in its tile. */}
        <div className="absolute z-10"
          style={{ left: "59.05%", top: "14.2%", width: "24.73%", height: "8%" }}>
          <ColorJackpotDisplay amount={gs.jackpotPool} triggered={live?.jackpotTriggered} />
        </div>

        {/* Ranking rows — measured to the 6 cream slots of the wooden easel */}
        <div className="absolute z-10"
          style={{ left: "9.83%", top: "26.66%", width: "15.6%", height: "44.88%" }}>
          <ColorRankingBoard leaders={leaders} />
        </div>

        {/* Dice — showcase window in the lid, dice drop & scatter into the tray */}
        <div className="absolute z-10"
          style={{ left: "30%", top: "6%", width: "23%", height: "72%" }}>
          <ColorDice results={currentDice} phase={phase} />
        </div>

        {/* Jackpot combination — 3 squares of the admin-set jackpot color,
            in the banner band under the jackpot digits. Hit 3 of this to win. */}
        <div className="absolute z-10 flex items-center justify-center"
          style={{ left: "63.4%", top: "21.4%", width: "16%", height: "3%", gap: "min(0.6vw, 0.9vh)" }}>
          {[0, 1, 2].map((i) => (
            <div key={i}
              style={{
                width: "min(1.6vw, 2.2vh)",
                height: "min(1.6vw, 2.2vh)",
                borderRadius: "3px",
                background: COLOR_HEX[gs.jackpotColor],
                border: "1.5px solid rgba(255,255,255,0.75)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.45)",
              }}
            />
          ))}
        </div>

        {/* History — inside the wooden HISTORY board slots (measured to the art) */}
        <div className="absolute z-10"
          style={{ left: "67.02%", top: "35.42%", width: "16.84%", height: "4.86%" }}>
          <ColorHistoryStrip history={gs.history} onExpand={() => setShowHistory(true)} />
        </div>

        {/* Color tiles 3x2 — over the painted tiles (measured tile block:
            cols 62.1/72.7/83.0%, rows 50.9/69.0% of the 2880x1440 art). */}
        <div className="absolute z-10"
          style={{ left: "57.5%", top: "43.7%", width: "30.1%", height: "32.5%" }}>
          <ColorBettingBoard
            selectedColor={selectedColor}
            onSelect={handleColorTap}
            disabled={!bettingOpen || placing}
            betAmounts={betAmounts}
            results={dice}
          />
        </div>

        {/* Bet controls — 3 gold buttons (always mounted, fade in/out) */}
        <div className="absolute z-10 transition-opacity duration-300"
          style={{
            left: "67%", top: "85%", width: "21%", height: "8.5%",
            opacity: bettingOpen ? 1 : 0,
            pointerEvents: bettingOpen ? "auto" : "none",
          }}>
          <ColorBetControls
            betAmount={betAmount}
            onBetChange={setBetAmount}
            onPlaceBet={() => {}}
            disabled={!bettingOpen}
            balance={balance}
            placing={placing}
            selectedColor={false}
          />
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
          betColor={myResult?.color ?? null}
          betAmount={myResult?.amount ?? 0}
          betColors={myResult ? (Object.keys(myBetsRef.current.bets) as DieColor[]) : []}
          dice={dice}
          payout={myResult?.payout ?? 0}
          jackpotTriggered={live?.jackpotTriggered}
          jackpotAmount={live?.jackpotAmount ?? undefined}
        />
      </div>

      {showHistory && (
        <ColorHistoryModal history={gs.history} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}
