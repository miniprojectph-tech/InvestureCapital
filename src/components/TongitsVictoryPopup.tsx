"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { leaveRoom, seatedPlayers, type TongitsRoom } from "@/lib/tongits";
import { playAgain } from "@/lib/tongits-game";
import { useTongitsAssets } from "@/lib/tongitsAssets";

const RESULT_LABEL: Record<string, string> = {
  tongits_win: "Tongits!",
  draw_win: "Draw — stock ran out",
  lowest_points_win: "Lowest hand wins",
  player_disconnected: "Won by forfeit",
};

const AUTO_QUIT_MS = 15_000;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Post-game popup shown to every player. Winner sees "+points", losers see
 * their per-hand loss. 15-second countdown auto-quits to the lobby if the
 * user hasn't chosen CONTINUE or QUIT.
 */
export function TongitsVictoryPopup({ code, room }: { code: string; room: TongitsRoom }) {
  const router = useRouter();
  const { user } = useAuth();
  const assets = useTongitsAssets();
  const [busy, setBusy] = useState<string | null>(null);
  const [msLeft, setMsLeft] = useState(AUTO_QUIT_MS);

  const r = room.lastResult!;
  const C = room.challengePoints;
  const seats = seatedPlayers(room);
  const winner = seats.find((s) => s.uid === r.winnerUserId);
  const losers = seats.filter((s) => s.uid !== r.winnerUserId);
  const iAmWinner = user?.uid === r.winnerUserId;
  const myNet = iAmWinner ? C * seats.length + r.jackpotWon : -C;

  // Countdown → auto-quit to lobby.
  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, AUTO_QUIT_MS - elapsed);
      setMsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        void autoQuit();
      }
    }, 100);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function autoQuit() {
    if (busy) return;
    setBusy("auto");
    try {
      await leaveRoom(code);
    } catch {
      /* room may already be cancelled — just route out */
    }
    router.push("/tongits");
  }
  async function onContinue() {
    setBusy("again");
    try {
      await playAgain(code);
    } catch {
      /* ignore — room state will show the truth */
    } finally {
      setBusy(null);
    }
  }
  async function onQuit() {
    setBusy("quit");
    try {
      await leaveRoom(code);
    } catch {
      /* ignore */
    }
    router.push("/tongits");
  }

  const secondsLeft = Math.ceil(msLeft / 1000);
  const gold = "#F5C66B";
  const cream = "#f4ead2";
  const border = "#c9a559";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="relative"
        style={{
          width: "min(92vw, 620px)",
          aspectRatio: "16 / 11",
          containerType: "inline-size",
        }}
      >
        {/* Optional baked art — a transparent PNG frame with VICTORY ribbon + slots. */}
        <img
          src={assets.victoryPopup}
          alt=""
          onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />

        {/* Fallback frame — renders when the PNG isn't uploaded / fails to load. */}
        <div
          className="absolute inset-0 rounded-3xl"
          style={{
            background: `linear-gradient(180deg, ${cream}, #e6d9b0)`,
            border: `4px solid ${border}`,
            boxShadow: "0 10px 40px rgba(0,0,0,0.55)",
            zIndex: -1,
          }}
        />

        {/* Title */}
        <div className="absolute top-0 left-0 right-0 flex flex-col items-center -translate-y-1/3">
          <div
            className="text-center px-8 py-2 rounded-2xl"
            style={{
              background: "linear-gradient(180deg, #2c4b8f, #163170)",
              border: `3px solid ${gold}`,
              fontWeight: 900,
              letterSpacing: "0.15em",
              fontSize: "clamp(28px, 5cqw, 44px)",
              color: gold,
              textShadow: "0 3px 0 rgba(0,0,0,0.35)",
            }}
          >
            {iAmWinner ? "VICTORY!" : "MATCH OVER"}
          </div>
          <div
            className="text-center px-4 py-1 mt-1 rounded-md"
            style={{
              background: "#8f1d2a",
              color: "#fff5d8",
              fontWeight: 800,
              fontSize: "clamp(10px, 1.4cqw, 13px)",
              letterSpacing: "0.1em",
            }}
          >
            {iAmWinner ? "TONGITS CHAMPION!" : RESULT_LABEL[r.resultType] ?? r.resultType}
          </div>
        </div>

        {/* Winner row */}
        <div className="absolute top-[22%] left-[8%] right-[8%] flex items-center gap-4">
          <div
            className="flex-shrink-0 rounded-full flex items-center justify-center relative"
            style={{
              width: "clamp(64px, 12cqw, 96px)",
              height: "clamp(64px, 12cqw, 96px)",
              background: "linear-gradient(180deg, #2c4b8f, #163170)",
              border: `4px solid ${gold}`,
              color: gold,
              fontWeight: 900,
              fontSize: "clamp(20px, 3cqw, 28px)",
            }}
          >
            {winner ? initials(winner.name) : "?"}
            <div
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-md"
              style={{
                background: "#8f1d2a",
                color: "#fff5d8",
                fontWeight: 900,
                fontSize: "clamp(9px, 1.1cqw, 11px)",
                letterSpacing: "0.08em",
                whiteSpace: "nowrap",
              }}
            >
              WINNER
            </div>
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div
              className="px-4 py-2 rounded-lg truncate"
              style={{
                background: `linear-gradient(180deg, ${cream}, #d9c99b)`,
                border: `2px solid ${border}`,
                color: "#4a2f0d",
                fontWeight: 800,
                fontSize: "clamp(14px, 2.4cqw, 22px)",
              }}
            >
              {winner?.name ?? "Winner"}
            </div>
            <div
              className="px-4 py-1.5 rounded-lg text-center"
              style={{
                background: "linear-gradient(180deg, #2c4b8f, #163170)",
                border: `2px solid ${gold}`,
                color: gold,
                fontWeight: 900,
                fontSize: "clamp(14px, 2.4cqw, 20px)",
                fontFamily: "monospace",
              }}
            >
              +{C * seats.length + r.jackpotWon} GP
            </div>
          </div>
        </div>

        {/* Runner-up rows */}
        <div className="absolute top-[55%] left-[8%] right-[8%] flex flex-col gap-1.5">
          {losers.map((s, i) => (
            <div key={s.uid} className="flex items-center gap-3">
              <div
                className="flex-shrink-0 rounded-full flex items-center justify-center"
                style={{
                  width: "clamp(28px, 4.5cqw, 40px)",
                  height: "clamp(28px, 4.5cqw, 40px)",
                  background: i === 0 ? "#c14a4a" : "#3d8f4c",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: "clamp(10px, 1.4cqw, 14px)",
                  border: "2px solid rgba(255,255,255,0.7)",
                }}
              >
                {initials(s.name)}
              </div>
              <div
                className="flex-1 min-w-0 truncate text-[clamp(12px,1.9cqw,16px)]"
                style={{ color: "#4a2f0d", fontWeight: 700 }}
              >
                {s.name}
                {user?.uid === s.uid && <span style={{ color: "#8f1d2a" }}> · you</span>}
              </div>
              <div
                className="font-mono text-[clamp(12px,1.9cqw,16px)] whitespace-nowrap"
                style={{ color: "#8f1d2a", fontWeight: 900 }}
              >
                −{C} GP
              </div>
            </div>
          ))}
        </div>

        {/* Buttons + timer */}
        <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3 justify-center">
          <button
            onClick={onContinue}
            disabled={!!busy}
            className="flex-1 max-w-[240px] py-3 rounded-full text-[clamp(14px,2cqw,18px)] font-black tracking-wide disabled:opacity-60"
            style={{
              background: `linear-gradient(180deg, #ffdf7a, #c9a559)`,
              color: "#4a2f0d",
              border: `3px solid ${border}`,
              boxShadow: "0 4px 0 #7a5216, 0 6px 14px rgba(0,0,0,0.35)",
            }}
          >
            {busy === "again" ? <Loader2 className="w-4 h-4 mx-auto animate-spin" /> : "CONTINUE"}
          </button>
          <div
            className="flex-shrink-0 rounded-full flex items-center justify-center"
            style={{
              width: "clamp(44px, 6cqw, 58px)",
              height: "clamp(44px, 6cqw, 58px)",
              background: "linear-gradient(180deg, #2c4b8f, #163170)",
              border: `3px solid ${gold}`,
              color: gold,
              fontWeight: 900,
              fontSize: "clamp(16px, 2.4cqw, 22px)",
              fontFamily: "monospace",
              boxShadow: "0 4px 0 #0a1a3d, 0 6px 14px rgba(0,0,0,0.35)",
            }}
          >
            {secondsLeft}
          </div>
          <button
            onClick={onQuit}
            disabled={!!busy}
            className="flex-1 max-w-[240px] py-3 rounded-full text-[clamp(14px,2cqw,18px)] font-black tracking-wide disabled:opacity-60"
            style={{
              background: "linear-gradient(180deg, #4a75d0, #2846a0)",
              color: "#fff",
              border: `3px solid ${gold}`,
              boxShadow: "0 4px 0 #0a1a3d, 0 6px 14px rgba(0,0,0,0.35)",
            }}
          >
            {busy === "quit" || busy === "auto" ? <Loader2 className="w-4 h-4 mx-auto animate-spin" /> : "QUIT"}
          </button>
        </div>
      </div>
    </div>
  );
}
