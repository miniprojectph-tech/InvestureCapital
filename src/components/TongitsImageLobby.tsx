"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useGameState } from "@/lib/game";
import { useOpenRooms, createRoom, joinRoom, seatedPlayers, MIN_CHALLENGE } from "@/lib/tongits";
import { useTongitsLeaderboard, rowPoints, rankTier } from "@/lib/tongits-social";
import { useTongitsAssets } from "@/lib/tongitsAssets";

/**
 * Interactive overlay for the fully-painted lobby art (public/tongits/lobby-full.webp).
 * Real controls are positioned over the painted UI. ALL positions live in `C` as
 * percentages of the image canvas — tweak here to fine-tune alignment. Font sizes
 * use cqw so they scale with the canvas.
 */

// left / top / width / height, all in % of the canvas.
type Box = { l: number; t: number; w: number; h: number };

// Measured against the 1672×941 art.
const CARD_LEFTS = [25.8, 38, 50.1, 62.3, 74.5, 86.6];
const CARD_W = 10.5;
const LB_ROWS_Y = [71.4, 75.2, 79.2, 83.1]; // row centers

const C = {
  // top bar
  gamePoints: { l: 65.5, t: 5.2, w: 6.5, h: 3.4 },
  rankingPoints: { l: 78.5, t: 5.2, w: 6.5, h: 3.4 },
  rewards: { l: 87.6, t: 2.7, w: 4.8, h: 8 },
  menu: { l: 94, t: 2.3, w: 4.8, h: 8.5 },
  playerName: { l: 9.3, t: 3, w: 11.4, h: 2.9 },
  playerTier: { l: 9.3, t: 5.8, w: 11.4, h: 2 },
  levelValue: { l: 20, t: 7.8, w: 5, h: 2.2 },
  // create room
  chalMinus: { l: 5.8, t: 24.5, w: 3.4, h: 6 },
  chalValue: { l: 9, t: 24.5, w: 10, h: 6 },
  chalPlus: { l: 19.1, t: 24.5, w: 3.4, h: 6 },
  anteMinus: { l: 5.8, t: 33.5, w: 3.4, h: 6 },
  anteValue: { l: 9, t: 33.5, w: 10, h: 6 },
  antePlus: { l: 19.1, t: 33.5, w: 3.4, h: 6 },
  publicBtn: { l: 6.2, t: 42.7, w: 6.9, h: 4.4 },
  privateBtn: { l: 13.9, t: 42.7, w: 7.8, h: 4.4 },
  createBtn: { l: 6.2, t: 49.3, w: 15.5, h: 5.7 },
  // join by code
  joinInput: { l: 5.4, t: 70.7, w: 14.4, h: 5 },
  joinBtn: { l: 5.4, t: 78.4, w: 16.7, h: 5.8 },
  // leaderboard
  viewAll: { l: 54.3, t: 65, w: 5.4, h: 3.2 },
  // bottom nav
  navLobby: { l: 6.3, t: 90.5, w: 13, h: 9 },
  navLeaderboard: { l: 21.5, t: 90.9, w: 12, h: 8.5 },
  navHistory: { l: 36.8, t: 90.9, w: 11.5, h: 8.5 },
  navHowTo: { l: 51.1, t: 90.9, w: 13.5, h: 8.5 },
  navPlay: { l: 76.9, t: 90.3, w: 22, h: 9.5 },
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

export function TongitsImageLobby({ topBanner }: { topBanner?: React.ReactNode }) {
  const router = useRouter();
  const { user, demoMode } = useAuth();
  const { state } = useGameState();
  const { rooms } = useOpenRooms();
  const board = useTongitsLeaderboard("week", 4);
  const assets = useTongitsAssets();

  const points = state?.points ?? 0;
  const rp = state?.rankingPoints ?? 0;
  const tier = rankTier(rp);
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
      // Ghost-room recovery: if the server says we're already in it, just go in.
      const msg = e instanceof Error ? e.message.toLowerCase() : "";
      if (msg.includes("already in this room") || msg.includes("already in the room")) {
        router.push(`/tongits/room/${code}`);
        return;
      }
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  const gold = "#F5C66B";

  return (
    <div className="min-h-[100dvh] w-full flex items-start justify-center overflow-hidden" style={{ background: "#0a1740" }}>
      <div
        className="relative"
        style={{
          width: "100vw",
          aspectRatio: "1672 / 941",
          containerType: "inline-size",
        }}
      >
        {/* Baked art */}
        <img src={assets.lobbyFull} alt="Tongits lobby" className="absolute inset-0 w-full h-full object-contain" />

        {topBanner && (
          <div className="absolute left-1/2 -translate-x-1/2 z-30" style={{ top: "2%", width: "56%" }}>
            {topBanner}
          </div>
        )}

        {error && (
          <div
            className="absolute left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-white text-center z-20"
            style={{ top: "16%", background: "rgba(200,40,40,0.9)", fontSize: "1.1cqw" }}
          >
            {error}
          </div>
        )}

        {/* ---- top bar ---- */}
        <Zone box={C.playerName} className="justify-start">
          <span
            className="truncate"
            style={{ color: "#fff", fontWeight: 700, fontSize: "1.35cqw", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
          >
            {user?.name ?? "Player"}
          </span>
        </Zone>
        <Zone box={C.playerTier} className="justify-start">
          <span style={{ color: gold, fontWeight: 600, fontSize: "1cqw", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
            {tier.name}
          </span>
        </Zone>
        <Zone box={C.levelValue}>
          <span style={{ color: "#fff", fontSize: "0.95cqw", fontFamily: "monospace" }}>
            {rp}
            {tier.nextAt != null ? ` / ${tier.nextAt}` : ""}
          </span>
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
              <Zone box={{ l: cl, t: 36, w: CARD_W, h: 3.6 }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: "1.3cqw", fontFamily: "monospace", letterSpacing: "0.08em" }}>
                  {r.roomCode}
                </span>
              </Zone>
              {/* coin row 1 = challenge, coin row 2 = ante, people row = players */}
              <Zone box={{ l: cl + CARD_W * 0.4, t: 45, w: CARD_W * 0.55, h: 3 }}>
                <span style={{ color: "#fff", fontSize: "1.05cqw", fontFamily: "monospace" }}>{r.challengePoints}</span>
              </Zone>
              <Zone box={{ l: cl + CARD_W * 0.4, t: 48.8, w: CARD_W * 0.55, h: 3 }}>
                <span style={{ color: "#fff", fontSize: "1.05cqw", fontFamily: "monospace" }}>{r.jackpotAnte}</span>
              </Zone>
              <Zone box={{ l: cl + CARD_W * 0.4, t: 52.6, w: CARD_W * 0.55, h: 3 }}>
                <span style={{ color: "#fff", fontSize: "1.05cqw", fontFamily: "monospace" }}>{count}/3</span>
              </Zone>
              <Zone box={{ l: cl + 1.8, t: 56.3, w: CARD_W - 3.6, h: 4.5 }} onClick={() => onJoin(r.roomCode)} title={`Join ${r.roomCode}`}>
                {busy === `join-${r.roomCode}` && <Loader2 className="animate-spin text-white" style={{ width: "1.6cqw", height: "1.6cqw" }} />}
              </Zone>
            </div>
          );
        })}

        {/* ---- leaderboard ---- */}
        <Zone box={C.viewAll} onClick={() => router.push("/tongits/leaderboard")} title="View all" />
        {board.rows.slice(0, 4).map((row, i) => (
          <div key={row.uid}>
            <Zone box={{ l: 34.4, t: LB_ROWS_Y[i] - 1.6, w: 8.4, h: 3.2 }} className="justify-start">
              <span style={{ color: "#fff", fontSize: "1.05cqw" }} className="truncate">
                {row.name}
              </span>
            </Zone>
            <Zone box={{ l: 53.5, t: LB_ROWS_Y[i] - 1.6, w: 4.5, h: 3.2 }}>
              <span style={{ color: gold, fontSize: "1.05cqw", fontFamily: "monospace" }}>{rowPoints(row, "week")}</span>
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
