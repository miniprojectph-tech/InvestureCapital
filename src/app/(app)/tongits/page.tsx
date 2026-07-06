"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Spade, Plus, LogIn, Users, Coins, Lock, Loader2, Trophy, BarChart3, Gift } from "lucide-react";
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
import { useMyMatchHistory } from "@/lib/tongits-social";
import { AssetImage, TONGITS_ART } from "@/components/AssetImage";

export default function TongitsDashboard() {
  const router = useRouter();
  const { demoMode } = useAuth();
  const { state } = useGameState();
  const { rooms, loading: roomsLoading } = useOpenRooms();
  const { rows: history } = useMyMatchHistory(10);

  const points = state?.points ?? 0;
  const locked = state?.lockedPoints ?? 0;
  const games = state?.tongitsGames ?? 0;
  const wins = state?.tongitsWins ?? 0;
  const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;

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

      {/* Hero band — lights up with lobby-bg.webp + logo.png when present */}
      <div
        className="relative rounded-2xl overflow-hidden mb-3 border border-[#3DD598]/15"
        style={{
          backgroundColor: "#0a1c17",
          backgroundImage: `linear-gradient(90deg, rgba(6,10,20,0.92), rgba(10,28,23,0.35)), radial-gradient(90% 140% at 100% 0%, rgba(61,213,152,0.14), transparent 60%), url(${TONGITS_ART.lobbyBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="px-5 py-6">
          <AssetImage
            src={TONGITS_ART.logo}
            alt="Tongits"
            className="h-12 object-contain"
            fallback={
              <div className="flex items-center gap-2.5">
                <Spade className="w-7 h-7 text-gold" />
                <span className="text-[24px] font-medium text-white" style={{ fontFamily: "var(--font-display)" }}>
                  Tongits
                </span>
              </div>
            }
          />
          <p className="text-[11px] text-white/60 mt-2 m-0">Deal · meld · sapaw · call. Winner takes the pot.</p>
        </div>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
          {error}
        </div>
      )}

      {/* Points + record */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        <Stat icon={Coins} label="Game Points" value={points.toLocaleString()} tone="gold" />
        <Stat icon={Lock} label="Locked" value={locked.toLocaleString()} tone="vault" />
        <Stat icon={Trophy} label="Ranking pts" value={(state?.rankingPoints ?? 0).toLocaleString()} tone="green" />
        <Stat icon={Spade} label="Games" value={games.toLocaleString()} tone="text" />
        <Stat icon={Trophy} label="Wins" value={wins.toLocaleString()} tone="green" />
        <Stat icon={BarChart3} label="Win rate" value={games > 0 ? `${winRate}%` : "—"} tone="text" />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Link
          href="/tongits/leaderboard"
          className="flex items-center gap-2 px-4 py-3 bg-card border border-border rounded-xl text-[12px] text-text hover:border-gold/40 transition"
        >
          <BarChart3 className="w-4 h-4 text-gold" /> Leaderboard
        </Link>
        <Link
          href="/rewards"
          className="flex items-center gap-2 px-4 py-3 bg-card border border-border rounded-xl text-[12px] text-text hover:border-gold/40 transition"
        >
          <Gift className="w-4 h-4 text-gold" /> Redeem rewards
        </Link>
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

      {/* Match history */}
      {history.length > 0 && (
        <Card className="mt-3">
          <CardHeader title="Your recent matches" subtitle="Latest Tongits results" />
          <div className="flex flex-col divide-y divide-border/60">
            {history.map((h) => {
              const won = h.pointsEarned > 0;
              return (
                <div key={h.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[12px] m-0">
                      {won ? (
                        <span className="text-green">Won</span>
                      ) : (
                        <span className="text-text-muted">Lost</span>
                      )}
                      <span className="text-text-subtle"> · hand {h.finalHandValue} · +{h.rankingPointsEarned} RP</span>
                    </p>
                    <p className="text-[10px] text-text-subtle m-0">
                      {new Date(h.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={cn("text-[12px] font-mono shrink-0", won ? "text-green" : "text-red")}>
                    {won ? `+${h.pointsEarned.toLocaleString()}` : `−${h.pointsLost.toLocaleString()}`}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
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
  tone: "gold" | "vault" | "green" | "text";
}) {
  const color =
    tone === "gold" ? "text-gold" : tone === "vault" ? "text-vault" : tone === "green" ? "text-green" : "text-text";
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
