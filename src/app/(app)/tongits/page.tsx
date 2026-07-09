"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, LogIn, Loader2, Globe, Lock, Minus, ChevronRight, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useGameState } from "@/lib/game";
import { useOpenRooms, useMyActiveRoom, createRoom, joinRoom, seatedPlayers, MIN_CHALLENGE, MAX_PLAYERS } from "@/lib/tongits";
import { useTongitsLeaderboard, rowPoints, useImageAvailable, useIsWide } from "@/lib/tongits-social";
import { TongitsShell, ArcadePanel, T } from "@/components/TongitsShell";
import { TongitsImageLobby } from "@/components/TongitsImageLobby";
import { useTongitsAssets } from "@/lib/tongitsAssets";

export default function TongitsLobbyPage() {
  const router = useRouter();
  const { user } = useAuth();
  const assets = useTongitsAssets();
  const hasArt = useImageAvailable(assets.lobbyFull);
  const wide = useIsWide();
  const activeRoom = useMyActiveRoom(user?.uid ?? null);
  // Any lobby variant (fancy or CSS) — if the user is still a member of a
  // non-terminated room, offer to route them back in so they don't get stuck.
  const banner = activeRoom ? (
    <button
      onClick={() => router.push(`/tongits/room/${activeRoom.roomCode}`)}
      className="w-full mb-3 px-3 py-2.5 rounded-lg bg-gold/15 border border-gold/50 text-[12px] text-gold text-left flex items-center justify-between hover:bg-gold/25 transition group"
    >
      <span className="flex flex-col">
        <span className="font-bold uppercase tracking-wider text-[11px]">You have an active room</span>
        <span className="text-white/80 text-[12px] font-normal">
          Room {activeRoom.roomCode} · {activeRoom.status.replace("_", " ")}
        </span>
      </span>
      <span className="text-gold font-semibold whitespace-nowrap flex items-center gap-1">
        Return <ChevronRight className="w-4 h-4 -mr-1 group-hover:translate-x-0.5 transition" />
      </span>
    </button>
  ) : null;
  if (hasArt && wide) return <TongitsImageLobby topBanner={banner} />;
  return <CssLobby topBanner={banner} />;
}

const SUITS = ["♠", "♣", "♥", "♦"];
const ACCENTS = [
  { from: "#2f8f3e", to: "#1b5e20", ring: "#7bd17f" },
  { from: "#1f6fd0", to: "#0d3f8a", ring: "#5fa8f5" },
  { from: "#7e3ca8", to: "#4a148c", ring: "#c07bd8" },
  { from: "#e07b1a", to: "#bf5a0c", ring: "#ffab4a" },
  { from: "#2f8f3e", to: "#166534", ring: "#7bd17f" },
  { from: "#2a63c9", to: "#123f8a", ring: "#5fa8f5" },
];

function CssLobby({ topBanner }: { topBanner?: React.ReactNode }) {
  const router = useRouter();
  const { demoMode } = useAuth();
  const { state } = useGameState();
  const { rooms, loading: roomsLoading } = useOpenRooms();
  const board = useTongitsLeaderboard("week", 4);

  const points = state?.points ?? 0;
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
    if (challenge < MIN_CHALLENGE) return setError(`Challenge must be at least ${MIN_CHALLENGE} points.`);
    if (points < challenge) return setError("Not enough Game Points for this challenge.");
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
    if (!code) return setError("Enter a room code.");
    setBusy(`join-${code}`);
    try {
      await joinRoom(code);
      router.push(`/tongits/room/${code}`);
    } catch (e) {
      // If the join server said "you're already in this room", route straight
      // to it — the user got separated from their seat and just needs to go back.
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

  return (
    <TongitsShell>
      {topBanner}
      {error && (
        <div className="mb-3 px-3 py-2 bg-red-500/20 border border-red-400/40 rounded-lg text-[12px] text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column: create + join */}
        <div className="flex flex-col gap-4">
          <ArcadePanel title="Create Room">
            <div className="flex flex-col gap-3">
              <Stepper label="Challenge Points" value={challenge} min={MIN_CHALLENGE} step={10} onChange={setChallenge} />
              <Stepper label="Ante Per Game" value={ante} min={0} step={1} onChange={setAnte} />
              <div>
                <p className="text-[10px] text-white/60 uppercase tracking-wider text-center m-0 mb-1.5">Room Type</p>
                <div className="grid grid-cols-2 gap-2">
                  <TypeBtn active={!isPrivate} onClick={() => setIsPrivate(false)} icon={Globe} label="Public" tone={T.green} />
                  <TypeBtn active={isPrivate} onClick={() => setIsPrivate(true)} icon={Lock} label="Private" tone="#7c5cff" />
                </div>
              </div>
              <GoldButton onClick={onCreate} busy={busy === "create"}>
                <Plus className="w-4 h-4" /> Create Room
              </GoldButton>
            </div>
          </ArcadePanel>

          <ArcadePanel title="Join By Code">
            <div className="flex flex-col gap-2.5">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="ENTER ROOM CODE"
                className="w-full text-center bg-black/40 border border-white/15 rounded-lg px-3 py-3 text-[16px] font-mono tracking-[0.3em] text-white outline-none focus:border-[#F5C66B]/60 placeholder:text-white/30 placeholder:tracking-normal placeholder:text-[12px]"
              />
              <GreenButton onClick={() => onJoin(joinCode)} busy={busy === `join-${joinCode}`}>
                <LogIn className="w-4 h-4" /> Join Room
              </GreenButton>
            </div>
          </ArcadePanel>
        </div>

        {/* Right: public rooms + leaderboard */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center justify-center gap-3">
            <span className="text-[#F5C66B]">◆</span>
            <h2 className="text-[15px] font-bold uppercase tracking-widest m-0">Public Rooms</h2>
            <span className="text-[#F5C66B]">◆</span>
          </div>

          {roomsLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: T.gold }} />
            </div>
          ) : rooms.length === 0 ? (
            <ArcadePanel className="text-center py-10">
              <p className="text-[13px] text-white/70 m-0">No open rooms right now.</p>
              <p className="text-[11px] text-white/50 mt-1 m-0">Create one on the left and invite your friends!</p>
            </ArcadePanel>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {rooms.map((r, i) => {
                const a = ACCENTS[i % ACCENTS.length];
                const count = seatedPlayers(r).length;
                return (
                  <div
                    key={r.roomCode}
                    className="rounded-2xl p-3 flex flex-col items-center gap-2 relative"
                    style={{
                      background: `linear-gradient(180deg, ${a.from}, ${a.to})`,
                      border: `1px solid ${a.ring}`,
                      boxShadow: `0 6px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)`,
                    }}
                  >
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-[22px] -mt-6"
                      style={{ background: "#0d1a3d", border: `2px solid ${a.ring}`, color: "#fff" }}
                    >
                      {SUITS[i % SUITS.length]}
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-white/70 uppercase tracking-wider m-0">Room Code</p>
                      <p className="text-[16px] font-mono font-bold m-0 tracking-widest">{r.roomCode}</p>
                    </div>
                    <div className="w-full text-[10px] text-white/90 space-y-0.5">
                      <Row label="Host" value={r.players[r.creatorUserId]?.name ?? "—"} />
                      <Row label="Challenge" value={`${r.challengePoints}`} />
                      <Row label="Ante" value={`${r.jackpotAnte}`} />
                      <Row label="Players" value={`${count}/${MAX_PLAYERS}`} />
                    </div>
                    <button
                      onClick={() => onJoin(r.roomCode)}
                      disabled={busy === `join-${r.roomCode}`}
                      className="w-full py-1.5 rounded-lg text-[12px] font-bold text-[#0a1740] flex items-center justify-center gap-1 hover:brightness-110 transition disabled:opacity-60"
                      style={{ background: `linear-gradient(180deg, ${T.green}, #1f9e5a)` }}
                    >
                      {busy === `join-${r.roomCode}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "JOIN"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Leaderboard mini-panel */}
          <ArcadePanel>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4" style={{ color: T.gold }} />
                <span className="text-[13px] font-bold uppercase tracking-wider">Leaderboard</span>
              </div>
              <Link href="/tongits/leaderboard" className="text-[11px] flex items-center gap-0.5" style={{ color: T.gold }}>
                View all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            {board.rows.length === 0 ? (
              <p className="text-[11px] text-white/50 text-center py-3 m-0">No ranked players yet this week.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {board.rows.map((row, i) => (
                  <div key={row.uid} className="flex items-center gap-2.5 py-1">
                    <span
                      className="w-5 text-center text-[12px] font-bold"
                      style={{ color: i === 0 ? T.gold : i === 1 ? "#cbd5e1" : i === 2 ? "#e0a94a" : "#fff" }}
                    >
                      {i + 1}
                    </span>
                    <div className="w-6 h-6 rounded-full bg-black/40 border border-white/20 flex items-center justify-center text-[9px] font-semibold">
                      {row.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="flex-1 text-[12px] truncate">{row.name}</span>
                    <span className="text-[12px] font-mono font-semibold" style={{ color: T.gold }}>
                      {rowPoints(row, "week").toLocaleString()}
                    </span>
                    <Trophy className="w-3 h-3" style={{ color: T.gold }} />
                  </div>
                ))}
              </div>
            )}
          </ArcadePanel>
        </div>
      </div>
    </TongitsShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-white/60">{label}</span>
      <span className="font-mono truncate max-w-[70px]">{value}</span>
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <p className="text-[10px] text-white/60 uppercase tracking-wider text-center m-0 mb-1.5">{label}</p>
      <div className="flex items-center gap-2">
        <StepBtn onClick={() => onChange(Math.max(min, value - step))} icon={Minus} />
        <div className="flex-1 text-center bg-black/40 border border-white/15 rounded-lg py-2 text-[15px] font-mono font-bold" style={{ color: T.gold }}>
          {value}
        </div>
        <StepBtn onClick={() => onChange(value + step)} icon={Plus} />
      </div>
    </div>
  );
}

function StepBtn({ onClick, icon: Icon }: { onClick: () => void; icon: typeof Plus }) {
  return (
    <button
      onClick={onClick}
      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 hover:brightness-110 transition"
      style={{ background: `linear-gradient(180deg, ${T.gold}, ${T.goldDeep})`, color: "#0a1740" }}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

function TypeBtn({
  active,
  onClick,
  icon: Icon,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Globe;
  label: string;
  tone: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn("py-2 rounded-lg text-[12px] font-bold flex items-center justify-center gap-1.5 transition")}
      style={
        active
          ? { background: tone, color: "#0a1740", boxShadow: `0 3px 10px ${tone}66` }
          : { background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)" }
      }
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function GoldButton({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="py-2.5 rounded-xl text-[13px] font-bold text-[#0a1740] flex items-center justify-center gap-2 hover:brightness-110 transition disabled:opacity-60"
      style={{ background: `linear-gradient(180deg, ${T.gold}, ${T.goldDeep})`, boxShadow: "0 4px 14px rgba(245,198,107,0.4)" }}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
    </button>
  );
}

function GreenButton({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="py-2.5 rounded-xl text-[13px] font-bold text-white flex items-center justify-center gap-2 hover:brightness-110 transition disabled:opacity-60"
      style={{ background: `linear-gradient(180deg, ${T.green}, #1f9e5a)`, boxShadow: "0 4px 14px rgba(52,208,122,0.35)" }}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
    </button>
  );
}
