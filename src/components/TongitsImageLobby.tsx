"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useGameState } from "@/lib/game";
import { useOpenRooms, createRoom, joinRoom, seatedPlayers, MIN_CHALLENGE } from "@/lib/tongits";
import { useTongitsLeaderboard, rowPoints } from "@/lib/tongits-social";
import { TONGITS_ART } from "./AssetImage";

/**
 * Interactive overlay for the fully-painted lobby art (public/tongits/lobby-full.webp).
 * Real controls are positioned over the painted UI. ALL positions live in `C` as
 * percentages of the image canvas — tweak here to fine-tune alignment. Font sizes
 * use cqw so they scale with the canvas.
 */

// left / top / width / height, all in % of the canvas.
type Box = { l: number; t: number; w: number; h: number };

const CARD_LEFTS = [25.5, 37, 48.3, 59.7, 71, 82.4];
const CARD_W = 10.6;
const LB_ROWS_Y = [66.5, 71, 75.5, 80];

const C = {
  // top bar
  gamePoints: { l: 62.5, t: 4.5, w: 9.5, h: 5 },
  rankingPoints: { l: 79.5, t: 4.5, w: 7, h: 5 },
  rewards: { l: 87.5, t: 1.5, w: 5.5, h: 12.5 },
  menu: { l: 93.5, t: 1.5, w: 5.5, h: 13 },
  playerName: { l: 10.5, t: 2.5, w: 13, h: 4 },
  // create room
  chalMinus: { l: 6, t: 24.5, w: 3.6, h: 5.5 },
  chalValue: { l: 9.8, t: 24.5, w: 9, h: 5.5 },
  chalPlus: { l: 19, t: 24.5, w: 3.6, h: 5.5 },
  anteMinus: { l: 6, t: 34, w: 3.6, h: 5.5 },
  anteValue: { l: 9.8, t: 34, w: 9, h: 5.5 },
  antePlus: { l: 19, t: 34, w: 3.6, h: 5.5 },
  publicBtn: { l: 6.3, t: 42.5, w: 9.8, h: 5.5 },
  privateBtn: { l: 16.8, t: 42.5, w: 9.8, h: 5.5 },
  createBtn: { l: 6.3, t: 50, w: 20.5, h: 6.8 },
  // join by code
  joinInput: { l: 6.3, t: 67.5, w: 18.5, h: 5.5 },
  joinBtn: { l: 6.3, t: 77.5, w: 20.5, h: 7 },
  // leaderboard
  viewAll: { l: 54, t: 64.5, w: 5.5, h: 4.5 },
  // bottom nav
  navLobby: { l: 4.5, t: 89, w: 16.5, h: 11 },
  navLeaderboard: { l: 24, t: 89, w: 15, h: 11 },
  navHistory: { l: 41, t: 89, w: 16, h: 11 },
  navHowTo: { l: 59, t: 89, w: 14, h: 11 },
  navPlay: { l: 76.5, t: 87.5, w: 23, h: 12.5 },
};

function Zone({
  box,
  children,
  onClick,
  className,
  title,
}: {
  box: Box;
  children?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      onClick={onClick}
      className={className}
      style={{
        position: "absolute",
        left: `${box.l}%`,
        top: `${box.t}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {children}
    </div>
  );
}

export function TongitsImageLobby() {
  const router = useRouter();
  const { demoMode } = useAuth();
  const { state } = useGameState();
  const { rooms } = useOpenRooms();
  const board = useTongitsLeaderboard("week", 4);

  const points = state?.points ?? 0;
  const rp = state?.rankingPoints ?? 0;
  const [challenge, setChallenge] = useState(MIN_CHALLENGE);
  const [ante, setAnte] = useState(5);
  const [isPrivate, setIsPrivate] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function fail(e: unknown) {
    setError(e instanceof Error ? e.message.replace(/^.*\/ /, "") : "Something went wrong");
  }
  async function onCreate() {
    setError(null);
    if (demoMode) return setError("Connect an account to play.");
    if (points < challenge) return setError("Not enough Game Points.");
    setBusy("create");
    try {
      const { code } = await createRoom(challenge, ante, isPrivate);
      router.push(`/tongits/room/${code}`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }
  async function onJoin(code: string) {
    setError(null);
    if (demoMode) return setError("Connect an account to play.");
    if (!code) return;
    setBusy(`join-${code}`);
    try {
      await joinRoom(code);
      router.push(`/tongits/room/${code}`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  const gold = "#F5C66B";

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center overflow-hidden">
      <div
        className="relative"
        style={{
          width: "min(100vw, calc(100dvh * 1674 / 947))",
          aspectRatio: "1674 / 947",
          containerType: "inline-size",
        }}
      >
        {/* Baked art */}
        <img src={TONGITS_ART.lobbyFull} alt="Tongits lobby" className="absolute inset-0 w-full h-full object-contain" />

        {error && (
          <div
            className="absolute left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-white text-center z-20"
            style={{ top: "16%", background: "rgba(200,40,40,0.9)", fontSize: "1.1cqw" }}
          >
            {error}
          </div>
        )}

        {/* ---- top bar ---- */}
        <Zone box={C.playerName}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: "1.2cqw" }}>{state ? "" : ""}</span>
        </Zone>
        <Zone box={C.gamePoints}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: "1.5cqw", fontFamily: "monospace" }}>
            {points.toLocaleString()}
          </span>
        </Zone>
        <Zone box={C.rankingPoints}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: "1.5cqw", fontFamily: "monospace" }}>
            {rp.toLocaleString()}
          </span>
        </Zone>
        <Zone box={C.rewards} onClick={() => router.push("/rewards")} title="Rewards" />
        <Zone box={C.menu} onClick={() => router.push("/dashboard")} title="Exit to app" />

        {/* ---- create room ---- */}
        <Zone box={C.chalMinus} onClick={() => setChallenge((v) => Math.max(MIN_CHALLENGE, v - 10))} />
        <Zone box={C.chalValue}>
          <span style={{ color: gold, fontWeight: 700, fontSize: "1.6cqw", fontFamily: "monospace" }}>{challenge}</span>
        </Zone>
        <Zone box={C.chalPlus} onClick={() => setChallenge((v) => v + 10)} />
        <Zone box={C.anteMinus} onClick={() => setAnte((v) => Math.max(0, v - 1))} />
        <Zone box={C.anteValue}>
          <span style={{ color: gold, fontWeight: 700, fontSize: "1.6cqw", fontFamily: "monospace" }}>{ante}</span>
        </Zone>
        <Zone box={C.antePlus} onClick={() => setAnte((v) => v + 1)} />
        <Zone
          box={C.publicBtn}
          onClick={() => setIsPrivate(false)}
          className="rounded-lg"
          title="Public"
        >
          {!isPrivate && <div className="w-full h-full rounded-lg" style={{ boxShadow: `inset 0 0 0 2px ${gold}` }} />}
        </Zone>
        <Zone box={C.privateBtn} onClick={() => setIsPrivate(true)} className="rounded-lg" title="Private">
          {isPrivate && <div className="w-full h-full rounded-lg" style={{ boxShadow: `inset 0 0 0 2px ${gold}` }} />}
        </Zone>
        <Zone box={C.createBtn} onClick={onCreate} title="Create room">
          {busy === "create" && <Loader2 className="animate-spin text-[#0a1740]" style={{ width: "2cqw", height: "2cqw" }} />}
        </Zone>

        {/* ---- join by code ---- */}
        <div
          style={{
            position: "absolute",
            left: `${C.joinInput.l}%`,
            top: `${C.joinInput.t}%`,
            width: `${C.joinInput.w}%`,
            height: `${C.joinInput.h}%`,
          }}
        >
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full h-full bg-transparent text-center text-white outline-none"
            style={{ fontSize: "1.6cqw", fontFamily: "monospace", letterSpacing: "0.3em" }}
          />
        </div>
        <Zone box={C.joinBtn} onClick={() => onJoin(joinCode)} title="Join room">
          {busy === `join-${joinCode}` && <Loader2 className="animate-spin text-white" style={{ width: "2cqw", height: "2cqw" }} />}
        </Zone>

        {/* ---- public room cards ---- */}
        {CARD_LEFTS.map((cl, i) => {
          const r = rooms[i];
          if (!r) return null;
          const count = seatedPlayers(r).length;
          return (
            <div key={r.roomCode}>
              <Zone box={{ l: cl, t: 34.2, w: CARD_W, h: 4 }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: "1.4cqw", fontFamily: "monospace", letterSpacing: "0.1em" }}>
                  {r.roomCode}
                </span>
              </Zone>
              <Zone box={{ l: cl + CARD_W * 0.35, t: 45, w: CARD_W * 0.6, h: 3.5 }}>
                <span style={{ color: "#fff", fontSize: "1.1cqw", fontFamily: "monospace" }}>{r.challengePoints}</span>
              </Zone>
              <Zone box={{ l: cl + CARD_W * 0.35, t: 52.8, w: CARD_W * 0.6, h: 3.5 }}>
                <span style={{ color: "#fff", fontSize: "1.1cqw", fontFamily: "monospace" }}>{count}/3</span>
              </Zone>
              <Zone box={{ l: cl + 0.6, t: 56.2, w: CARD_W - 1.2, h: 5 }} onClick={() => onJoin(r.roomCode)} title={`Join ${r.roomCode}`}>
                {busy === `join-${r.roomCode}` && <Loader2 className="animate-spin text-white" style={{ width: "1.6cqw", height: "1.6cqw" }} />}
              </Zone>
            </div>
          );
        })}

        {/* ---- leaderboard ---- */}
        <Zone box={C.viewAll} onClick={() => router.push("/tongits/leaderboard")} title="View all" />
        {board.rows.slice(0, 4).map((row, i) => (
          <div key={row.uid}>
            <Zone box={{ l: 37, t: LB_ROWS_Y[i] - 1.5, w: 12, h: 3.5 }} className="justify-start">
              <span style={{ color: "#fff", fontSize: "1.1cqw" }} className="truncate">
                {row.name}
              </span>
            </Zone>
            <Zone box={{ l: 50, t: LB_ROWS_Y[i] - 1.5, w: 6, h: 3.5 }}>
              <span style={{ color: gold, fontSize: "1.1cqw", fontFamily: "monospace" }}>{rowPoints(row, "week")}</span>
            </Zone>
          </div>
        ))}

        {/* ---- bottom nav ---- */}
        <Zone box={C.navLeaderboard} onClick={() => router.push("/tongits/leaderboard")} title="Leaderboard" />
        <Zone box={C.navHistory} onClick={() => router.push("/tongits/history")} title="Room history" />
        <Zone box={C.navHowTo} onClick={() => router.push("/tongits/how-to-play")} title="How to play" />
        <Zone box={C.navPlay} onClick={onCreate} title="Play now" />
      </div>
    </div>
  );
}
