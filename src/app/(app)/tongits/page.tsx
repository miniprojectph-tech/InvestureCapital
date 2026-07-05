"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spade, Plus, LogIn, Users, Coins, Lock, Loader2, Trophy } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useGameState } from "@/lib/game";
import {
  useOpenRooms,
  createRoom,
  joinRoom,
  seatedPlayers,
  MIN_CHALLENGE,
  MAX_PLAYERS,
} from "@/lib/tongits";

export default function TongitsDashboard() {
  const router = useRouter();
  const { demoMode } = useAuth();
  const { state } = useGameState();
  const { rooms, loading: roomsLoading } = useOpenRooms();

  const points = state?.points ?? 0;
  const locked = state?.lockedPoints ?? 0;

  const [challenge, setChallenge] = useState(MIN_CHALLENGE);
  const [ante, setAnte] = useState(5);
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
    if (points < challenge) return setError("You don't have enough Game Points for this challenge.");
    setBusy("create");
    try {
      const { code } = await createRoom(challenge, ante);
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
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <TopHeader
        title="Community Tongits"
        subtitle="Play with friends · challenge with Game Points · climb the leaderboard"
      />

      {error && (
        <div className="mb-3 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
          {error}
        </div>
      )}

      {/* Points */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        <Stat icon={Coins} label="Game Points" value={points.toLocaleString()} tone="gold" />
        <Stat icon={Lock} label="Locked" value={locked.toLocaleString()} tone="vault" />
        <Stat icon={Trophy} label="Rank" value={state?.rankingPoints ? `${state.rankingPoints} RP` : "—"} tone="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        {/* Create room */}
        <Card>
          <CardHeader title="Create a room" subtitle="Set the challenge, share the code, wait for 3 players" />
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Challenge (min ${MIN_CHALLENGE})`}>
                <input
                  type="number"
                  min={MIN_CHALLENGE}
                  value={challenge}
                  onChange={(e) => setChallenge(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-canvas border border-border rounded-md px-3 py-2 text-[13px] font-mono text-text outline-none focus:border-gold/40"
                />
              </Field>
              <Field label="Jackpot ante / game">
                <input
                  type="number"
                  min={0}
                  value={ante}
                  onChange={(e) => setAnte(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-canvas border border-border rounded-md px-3 py-2 text-[13px] font-mono text-text outline-none focus:border-gold/40"
                />
              </Field>
            </div>
            <button
              onClick={onCreate}
              disabled={busy === "create"}
              className="py-2.5 bg-gold text-gold-dark rounded-lg text-[13px] font-medium flex items-center justify-center gap-2 hover:brightness-110 transition disabled:opacity-60"
            >
              {busy === "create" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create room
            </button>
          </div>
        </Card>

        {/* Join by code */}
        <Card>
          <CardHeader title="Join by code" subtitle="Got a room code from a friend? Enter it here" />
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="e.g. 12345"
              className="flex-1 bg-canvas border border-border rounded-md px-3 py-2.5 text-[14px] font-mono tracking-widest text-text outline-none focus:border-gold/40"
            />
            <button
              onClick={() => onJoin(joinCode)}
              disabled={busy === `join-${joinCode}`}
              className="px-4 py-2.5 bg-green text-white rounded-lg text-[13px] font-medium flex items-center gap-1.5 hover:brightness-110 transition disabled:opacity-60"
            >
              {busy === `join-${joinCode}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              Join
            </button>
          </div>
          <p className="text-[10px] text-text-subtle mt-2 m-0">
            You need at least the room&apos;s challenge in Game Points to join.
          </p>
        </Card>
      </div>

      {/* Lobby */}
      <Card>
        <CardHeader title="Open rooms" subtitle="Public lobby — jump into a room that needs players" />
        {roomsLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-5 h-5 text-gold animate-spin" />
          </div>
        ) : rooms.length === 0 ? (
          <p className="text-[12px] text-text-muted text-center py-10 m-0">
            No open rooms right now. Create one above and invite your friends!
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border/60">
            {rooms.map((r) => {
              const count = seatedPlayers(r).length;
              const host = r.players[r.creatorUserId]?.name ?? "—";
              return (
                <div key={r.roomCode} className="flex items-center gap-3 py-2.5">
                  <div className="w-9 h-9 rounded-lg bg-gold/15 flex items-center justify-center shrink-0">
                    <Spade className="w-4 h-4 text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] m-0 font-medium">
                      Room <span className="font-mono">{r.roomCode}</span>
                      <span className="text-text-subtle font-normal"> · {host}</span>
                    </p>
                    <p className="text-[10px] text-text-subtle mt-0.5 m-0 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" /> {count}/{MAX_PLAYERS}
                      </span>
                      <span>· {r.challengePoints.toLocaleString()} pts</span>
                      {r.jackpotAnte > 0 && <span>· ante {r.jackpotAnte}</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => onJoin(r.roomCode)}
                    disabled={busy === `join-${r.roomCode}`}
                    className="px-3 py-1.5 bg-card-elev border border-border-strong rounded-lg text-[11px] text-text hover:bg-gold/10 hover:text-gold transition disabled:opacity-60 shrink-0"
                  >
                    {busy === `join-${r.roomCode}` ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      "Join"
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  tone: "gold" | "vault" | "green";
}) {
  const color = tone === "gold" ? "text-gold" : tone === "vault" ? "text-vault" : "text-green";
  return (
    <Card>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={cn("w-3.5 h-3.5", color)} />
        <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0">{label}</p>
      </div>
      <p className={cn("text-[18px] font-medium font-mono m-0", color)}>{value}</p>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-text-muted uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}
