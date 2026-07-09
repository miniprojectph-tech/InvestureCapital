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

// Slot bounds measured from public/tongits/victory-popup.png (1672x941).
// If the base image changes, re-run scripts/measure-victory.cjs and update these.
const S = {
  winnerAvatar: { l: 25, t: 30, w: 10, h: 20 },
  winnerName: { l: 45, t: 32, w: 34, h: 9 },
  winnerPoints: { l: 47, t: 50, w: 21, h: 6 },
  ru1Avatar: { l: 27, t: 65, w: 4, h: 7 },
  ru1Text: { l: 33, t: 65, w: 45, h: 7 },
  ru1Points: { l: 79, t: 65, w: 13, h: 7 },
  ru2Avatar: { l: 27, t: 76, w: 4, h: 7 },
  ru2Text: { l: 33, t: 76, w: 45, h: 7 },
  ru2Points: { l: 79, t: 76, w: 13, h: 7 },
  continueBtn: { l: 20, t: 87, w: 24, h: 10 },
  timerBadge: { l: 47, t: 87, w: 6, h: 10 },
  quitBtn: { l: 56, t: 87, w: 24, h: 10 },
  resultLabel: { l: 30, t: 21, w: 40, h: 5 },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

type Box = { l: number; t: number; w: number; h: number };
function Slot({ box, children, style }: { box: Box; children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${box.l}%`,
        top: `${box.t}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      {children}
    </div>
  );
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
  const winnerPayout = C * seats.length + r.jackpotWon;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="relative"
        style={{
          width: "min(94vw, calc(94dvh * 1672 / 941))",
          aspectRatio: "1672 / 941",
          containerType: "inline-size",
        }}
      >
        <img
          src={assets.victoryPopup}
          alt=""
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
          draggable={false}
        />

        {/* Result label ribbon (only for losers — winners have "TONGITS CHAMPION!" baked in) */}
        {!iAmWinner && (
          <Slot box={S.resultLabel}>
            <span
              style={{
                color: "#fff5d8",
                background: "#8f1d2a",
                fontWeight: 800,
                fontSize: "1.3cqw",
                letterSpacing: "0.08em",
                padding: "0.4cqw 1.2cqw",
                borderRadius: "0.5cqw",
              }}
            >
              {RESULT_LABEL[r.resultType] ?? r.resultType}
            </span>
          </Slot>
        )}

        {/* Winner avatar — initials sit inside the crowned blue circle */}
        <Slot box={S.winnerAvatar}>
          <span style={{ color: "#F5C66B", fontWeight: 900, fontSize: "3.2cqw", fontFamily: "system-ui" }}>
            {winner ? initials(winner.name) : "?"}
          </span>
        </Slot>

        {/* Winner name — big tan banner on the right of the avatar */}
        <Slot box={S.winnerName}>
          <span
            style={{
              color: "#4a2f0d",
              fontWeight: 900,
              fontSize: "2.6cqw",
              letterSpacing: "0.02em",
              padding: "0 1cqw",
              maxWidth: "100%",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {winner?.name ?? "Winner"}
          </span>
        </Slot>

        {/* Points banner — blue bar below the name */}
        <Slot box={S.winnerPoints}>
          <span
            style={{
              color: "#F5C66B",
              fontWeight: 900,
              fontSize: "2.4cqw",
              fontFamily: "monospace",
            }}
          >
            +{winnerPayout.toLocaleString()} GP
          </span>
        </Slot>

        {/* Runner-up rows */}
        {losers[0] && (
          <>
            <Slot box={S.ru1Avatar}>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: "1.4cqw", fontFamily: "system-ui" }}>
                {initials(losers[0].name)}
              </span>
            </Slot>
            <Slot box={S.ru1Text} style={{ justifyContent: "flex-start" }}>
              <span
                style={{
                  color: "#4a2f0d",
                  fontWeight: 800,
                  fontSize: "1.6cqw",
                  paddingLeft: "0.6cqw",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {losers[0].name}
                {user?.uid === losers[0].uid && <span style={{ color: "#8f1d2a" }}> · you</span>}
              </span>
            </Slot>
            <Slot box={S.ru1Points}>
              <span style={{ color: "#8f1d2a", fontWeight: 900, fontSize: "1.7cqw", fontFamily: "monospace" }}>
                −{C} GP
              </span>
            </Slot>
          </>
        )}
        {losers[1] && (
          <>
            <Slot box={S.ru2Avatar}>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: "1.4cqw", fontFamily: "system-ui" }}>
                {initials(losers[1].name)}
              </span>
            </Slot>
            <Slot box={S.ru2Text} style={{ justifyContent: "flex-start" }}>
              <span
                style={{
                  color: "#4a2f0d",
                  fontWeight: 800,
                  fontSize: "1.6cqw",
                  paddingLeft: "0.6cqw",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {losers[1].name}
                {user?.uid === losers[1].uid && <span style={{ color: "#8f1d2a" }}> · you</span>}
              </span>
            </Slot>
            <Slot box={S.ru2Points}>
              <span style={{ color: "#8f1d2a", fontWeight: 900, fontSize: "1.7cqw", fontFamily: "monospace" }}>
                −{C} GP
              </span>
            </Slot>
          </>
        )}

        {/* Buttons and timer — hit-boxes only; the visuals are baked into the PNG */}
        <button
          onClick={onContinue}
          disabled={!!busy}
          style={{
            position: "absolute",
            left: `${S.continueBtn.l}%`,
            top: `${S.continueBtn.t}%`,
            width: `${S.continueBtn.w}%`,
            height: `${S.continueBtn.h}%`,
            background: "transparent",
            border: "none",
            cursor: busy ? "not-allowed" : "pointer",
            fontWeight: 900,
            color: "transparent",
          }}
          aria-label="Continue"
        >
          {busy === "again" && <Loader2 className="w-6 h-6 mx-auto animate-spin text-[#4a2f0d]" />}
        </button>

        <Slot box={S.timerBadge}>
          <span
            style={{
              color: "#F5C66B",
              fontWeight: 900,
              fontSize: "2.4cqw",
              fontFamily: "monospace",
              textShadow: "0 0.15cqw 0.3cqw rgba(0,0,0,0.5)",
            }}
          >
            {secondsLeft}
          </span>
        </Slot>

        <button
          onClick={onQuit}
          disabled={!!busy}
          style={{
            position: "absolute",
            left: `${S.quitBtn.l}%`,
            top: `${S.quitBtn.t}%`,
            width: `${S.quitBtn.w}%`,
            height: `${S.quitBtn.h}%`,
            background: "transparent",
            border: "none",
            cursor: busy ? "not-allowed" : "pointer",
            fontWeight: 900,
            color: "transparent",
          }}
          aria-label="Quit"
        >
          {(busy === "quit" || busy === "auto") && <Loader2 className="w-6 h-6 mx-auto animate-spin text-white" />}
        </button>
      </div>
    </div>
  );
}
