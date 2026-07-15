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

// Measured against the 1774×887 art (2:1 ratio).
const CARD_LEFTS = [27, 39, 51, 63, 75, 87];
const CARD_W = 10;
const LB_ROWS_Y = [74, 78, 82, 86];

const C = {
  // top bar
  gamePoints: { l: 68, t: 7.5, w: 6.5, h: 3.5 },
  rankingPoints: { l: 80, t: 7.5, w: 6.5, h: 3.5 },
  rewards: { l: 89, t: 2.5, w: 5, h: 8.5 },
  menu: { l: 95, t: 2.3, w: 4.5, h: 8.5 },
  playerName: { l: 9, t: 3, w: 11, h: 3 },
  playerTier: { l: 9, t: 5.8, w: 11, h: 2.2 },
  levelValue: { l: 19.5, t: 7.8, w: 5, h: 2.5 },
  // create room
  chalMinus: { l: 7, t: 25, w: 3.5, h: 6 },
  chalValue: { l: 10.5, t: 25, w: 8, h: 6 },
  chalPlus: { l: 18.5, t: 25, w: 3.5, h: 6 },
  anteMinus: { l: 7, t: 34, w: 3.5, h: 6 },
  anteValue: { l: 10.5, t: 34, w: 8, h: 6 },
  antePlus: { l: 18.5, t: 34, w: 3.5, h: 6 },
  publicBtn: { l: 9, t: 44, w: 6.5, h: 5 },
  privateBtn: { l: 16, t: 44, w: 7.5, h: 5 },
  createBtn: { l: 6, t: 50, w: 14.5, h: 6 },
  // join by code
  joinInput: { l: 5, t: 69, w: 14, h: 5.5 },
  joinBtn: { l: 5, t: 77, w: 16, h: 6.5 },
  // leaderboard
  viewAll: { l: 56, t: 65, w: 5.5, h: 3.5 },
  // bottom nav
  navLobby: { l: 6, t: 92, w: 13, h: 8 },
  navLeaderboard: { l: 21, t: 92, w: 12, h: 8 },
  navHistory: { l: 35, t: 92, w: 12, h: 8 },
  navHowTo: { l: 49, t: 92, w: 13, h: 8 },
  navPlay: { l: 73, t: 92, w: 22, h: 8 },
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
          width: "min(100vw, calc(100dvh * 1774 / 887))",
          aspectRatio: "1774 / 887",
          containerType: "inline-size",
        }}
      >
        {/* Baked art */}
        <img src={assets.lobbyFull} alt="Tongits lobby" className="absolute inset-0 w-full h-full object-contain" />

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
        <Zone box={C.publicBtn} onClick={() => setIsPrivate(false)} title="Public" />
        <Zone box={C.privateBtn} onClick={() => setIsPrivate(true)} title="Private" />
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
              <Zone box={{ l: cl, t: 33, w: CARD_W, h: 6 }}>
                <div className="flex flex-col items-center" style={{ lineHeight: 1.2 }}>
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.85cqw" }}>Room</span>
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: "1.3cqw", fontFamily: "monospace", letterSpacing: "0.08em" }}>
                    {r.roomCode}
                  </span>
                </div>
              </Zone>
              {/* coin row 1 = challenge, coin row 2 = ante, people row = players */}
              <Zone box={{ l: cl + 2, t: 46.5, w: 8, h: 3 }}>
                <span style={{ color: "#fff", fontSize: "1.05cqw", fontFamily: "monospace" }}>{r.challengePoints}</span>
              </Zone>
              <Zone box={{ l: cl + 2, t: 50.5, w: 8, h: 3.5 }}>
                <span style={{ color: "#fff", fontSize: "1.05cqw", fontFamily: "monospace" }}>{r.jackpotAnte}</span>
              </Zone>
              <Zone box={{ l: cl + 2, t: 54.5, w: 8, h: 3.5 }}>
                <span style={{ color: "#fff", fontSize: "1.05cqw", fontFamily: "monospace" }}>{count}/3</span>
              </Zone>
              <Zone
                box={{ l: cl, t: 59, w: CARD_W, h: 3.5 }}
                onClick={count < 3 ? () => onJoin(r.roomCode) : undefined}
                title={count < 3 ? `Join ${r.roomCode}` : "Room full"}
              >
                {busy === `join-${r.roomCode}` ? (
                  <Loader2 className="animate-spin text-white" style={{ width: "1.6cqw", height: "1.6cqw" }} />
                ) : (
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: "1.1cqw", textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}>
                    {count >= 3 ? "FULL" : "JOIN"}
                  </span>
                )}
              </Zone>
            </div>
          );
        })}

        {/* ---- leaderboard ---- */}
        <Zone box={C.viewAll} onClick={() => router.push("/tongits/leaderboard")} title="View all" />
        {board.rows.slice(0, 4).map((row, i) => (
          <div key={row.uid}>
            <Zone box={{ l: 35, t: LB_ROWS_Y[i] - 1.6, w: 11, h: 3.2 }}>
              <span style={{ color: "#fff", fontSize: "1.05cqw" }} className="truncate">
                {row.name}
              </span>
            </Zone>
            <Zone box={{ l: 54, t: LB_ROWS_Y[i] - 1.6, w: 5, h: 3.2 }}>
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
