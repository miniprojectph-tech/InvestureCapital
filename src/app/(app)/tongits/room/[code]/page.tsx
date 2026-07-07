"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Copy,
  Check,
  LogOut,
  Loader2,
  Send,
  Flag,
  Coins,
  Sparkles,
  ShieldCheck,
  Play,
  Trophy,
  X,
} from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card } from "@/components/Card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import {
  useRoom,
  useRoomChat,
  setReady,
  confirmChallenge,
  leaveRoom,
  cancelRoom,
  joinRoom,
  sendChat,
  reportChat,
  seatedPlayers,
  MAX_PLAYERS,
  type TongitsRoom,
} from "@/lib/tongits";
import { startGame, playAgain, splitJackpot } from "@/lib/tongits-game";
import { useImageAvailable, useIsWide } from "@/lib/tongits-social";
import { useTongitsAssets } from "@/lib/tongitsAssets";
import { TongitsTable } from "@/components/TongitsTable";
import { TongitsWaitingRoomArt } from "@/components/TongitsWaitingRoomArt";
import { PlayingCard } from "@/components/PlayingCard";
import { AssetImage, TONGITS_ART } from "@/components/AssetImage";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function TongitsRoomPage() {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const router = useRouter();
  const { user } = useAuth();
  const { room, loading } = useRoom(code);
  const messages = useRoomChat(code);
  const assets = useTongitsAssets();
  const hasWaitingArt = useImageAvailable(assets.waitingRoom);
  const wide = useIsWide();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const me = user && room ? room.players[user.uid] : undefined;

  function fail(e: unknown) {
    setError(e instanceof Error ? e.message.replace(/^.*\/ /, "") : "Something went wrong");
  }
  async function run(key: string, fn: () => Promise<unknown>, after?: () => void) {
    setError(null);
    setBusy(key);
    try {
      await fn();
      after?.();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => setError("Couldn't copy the code.")
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
      </div>
    );
  }

  if (!room || room.status === "cancelled" || room.status === "completed") {
    return (
      <div>
        <TopHeader title="Tongits room" subtitle="This room is no longer available" />
        <Card className="text-center py-12">
          <p className="text-[13px] text-text-muted m-0 mb-4">
            {room?.status === "cancelled"
              ? "This room was cancelled."
              : room?.status === "completed"
              ? "This game has ended."
              : "Room not found."}
          </p>
          <button
            onClick={() => router.push("/tongits")}
            className="px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium"
          >
            Back to lobby
          </button>
        </Card>
      </div>
    );
  }

  // Signed-in but not a member → offer to join (if open) or go back.
  if (user && !me) {
    return (
      <div>
        <TopHeader title={`Room ${code}`} subtitle="You haven't joined this room" />
        <Card className="text-center py-12">
          <p className="text-[13px] text-text-muted m-0 mb-4">
            {room.status === "open" ? "This room is open — want to join?" : "This room isn't accepting players."}
          </p>
          <div className="flex justify-center gap-2">
            {room.status === "open" && (
              <button
                onClick={() => run("join", () => joinRoom(code))}
                disabled={busy === "join"}
                className="px-4 py-2 bg-green text-white rounded-lg text-[12px] font-medium disabled:opacity-60"
              >
                {busy === "join" ? "Joining…" : "Join room"}
              </button>
            )}
            <button
              onClick={() => router.push("/tongits")}
              className="px-4 py-2 bg-card-elev border border-border-strong rounded-lg text-[12px]"
            >
              Back to lobby
            </button>
          </div>
          {error && <p className="text-[11px] text-red mt-3 m-0">{error}</p>}
        </Card>
      </div>
    );
  }

  const seats = seatedPlayers(room);
  const isCreator = user?.uid === room.creatorUserId;

  // Painted waiting-room art (desktop) once the file is present.
  const waiting = room.status === "open" || room.status === "full" || room.status === "ready";
  if (waiting && hasWaitingArt && wide) {
    return <TongitsWaitingRoomArt code={code} room={room} />;
  }

  // Live game.
  if (room.status === "in_game") {
    return (
      <div>
        <TopHeader title={`Room ${room.roomCode}`} subtitle="Community Tongits · live game" />
        <TongitsTable code={code} room={room} />
      </div>
    );
  }

  // Post-game result.
  if (room.status === "post_game" && room.lastResult) {
    return <ResultScreen code={code} room={room} onError={setError} />;
  }

  return (
    <div>
      <TopHeader title={`Room ${room.roomCode}`} subtitle="Community Tongits · waiting room" />

      {error && (
        <div className="mb-3 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
          {error}
        </div>
      )}

      {/* Room bar */}
      <Card className="mb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-subtle uppercase tracking-wider">Code</span>
            <span className="text-[18px] font-mono font-medium tracking-widest text-gold">{room.roomCode}</span>
            <button
              onClick={copyCode}
              className={cn(
                "p-1.5 rounded-md border border-border-strong transition",
                copied ? "text-green" : "text-text-muted hover:text-text"
              )}
              aria-label="Copy room code"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-text-muted">
            <span className="inline-flex items-center gap-1">
              <Coins className="w-3.5 h-3.5 text-gold" /> {room.challengePoints.toLocaleString()} challenge
            </span>
            {room.jackpotAnte > 0 && (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-vault" /> {room.jackpotAnte} ante
              </span>
            )}
          </div>
          <div className="ml-auto flex gap-2">
            {isCreator && (
              <button
                onClick={() => run("cancel", () => cancelRoom(code), () => router.push("/tongits"))}
                disabled={busy === "cancel"}
                className="px-3 py-1.5 bg-card-elev border border-border-strong rounded-lg text-[11px] text-red hover:bg-red/10 transition disabled:opacity-60"
              >
                Cancel room
              </button>
            )}
            <button
              onClick={() => run("leave", () => leaveRoom(code), () => router.push("/tongits"))}
              disabled={busy === "leave"}
              className="px-3 py-1.5 bg-card-elev border border-border-strong rounded-lg text-[11px] text-text-muted hover:text-text transition disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Leave
            </button>
          </div>
        </div>
      </Card>

      <StartStatus room={room} />

      {room.status === "ready" && (
        <button
          onClick={() => run("start", () => startGame(code))}
          disabled={busy === "start"}
          className="w-full mb-3 py-3 bg-green text-white rounded-xl text-[14px] font-semibold flex items-center justify-center gap-2 hover:brightness-110 transition disabled:opacity-60"
        >
          {busy === "start" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Start game
        </button>
      )}

      {(room.jackpotPoints ?? 0) > 0 && seats.length < MAX_PLAYERS && (
        <div className="mb-3 px-4 py-3 bg-vault/5 border border-border-vault rounded-xl flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-[12px] text-vault-muted">
            <Sparkles className="w-4 h-4 text-vault" />
            An unclaimed <span className="font-mono text-vault">{room.jackpotPoints}</span> jackpot is waiting.
            Invite a 3rd player, or split it (both must agree).
          </div>
          <button
            onClick={() => run("split", () => splitJackpot(code))}
            disabled={busy === "split"}
            className="px-3 py-1.5 bg-vault text-vault-dark rounded-lg text-[11px] font-medium disabled:opacity-60"
          >
            {room.splitConsent?.[user?.uid ?? ""] ? "Waiting for the other player…" : "Split jackpot & close"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        {/* Seats + actions */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            {Array.from({ length: MAX_PLAYERS }, (_, seat) => {
              const p = seats.find((s) => s.seat === seat);
              return (
                <Card key={seat} className={cn(!p && "opacity-60 border-dashed")}>
                  {p ? (
                    <div className="flex flex-col items-center text-center py-2">
                      <div className="w-12 h-12 rounded-full bg-gold/15 flex items-center justify-center text-[14px] font-medium text-gold mb-2">
                        {initials(p.name)}
                      </div>
                      <p className="text-[12px] font-medium m-0 truncate max-w-full">
                        {p.name}
                        {p.uid === room.creatorUserId && <span className="text-text-subtle"> · host</span>}
                      </p>
                      <div className="flex gap-1.5 mt-2">
                        <Badge on={p.isReady} label="Ready" />
                        <Badge on={p.agreedToChallenge} label="Agreed" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center py-2 text-text-subtle">
                      <div className="w-12 h-12 rounded-full bg-card-elev flex items-center justify-center mb-2">
                        <span className="text-[11px]">Seat {seat + 1}</span>
                      </div>
                      <p className="text-[11px] m-0">Waiting for a player…</p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {me && (
            <Card>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => run("ready", () => setReady(code, !me.isReady))}
                  disabled={busy === "ready" || room.status === "ready"}
                  className={cn(
                    "flex-1 py-2.5 rounded-lg text-[13px] font-medium transition disabled:opacity-60 inline-flex items-center justify-center gap-2",
                    me.isReady ? "bg-green/15 text-green border border-green/30" : "bg-green text-white hover:brightness-110"
                  )}
                >
                  {busy === "ready" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {me.isReady ? "Ready ✓ (tap to unready)" : "I'm ready"}
                </button>
                <button
                  onClick={() => run("agree", () => confirmChallenge(code))}
                  disabled={busy === "agree" || me.agreedToChallenge || room.status === "ready"}
                  className={cn(
                    "flex-1 py-2.5 rounded-lg text-[13px] font-medium transition disabled:opacity-60 inline-flex items-center justify-center gap-2",
                    me.agreedToChallenge
                      ? "bg-gold/15 text-gold border border-gold/30"
                      : "bg-gold text-gold-dark hover:brightness-110"
                  )}
                >
                  <ShieldCheck className="w-4 h-4" />
                  {me.agreedToChallenge
                    ? "Challenge agreed ✓"
                    : `Agree to ${room.challengePoints.toLocaleString()} pts`}
                </button>
              </div>
              <p className="text-[10px] text-text-subtle mt-2 m-0">
                Your {room.challengePoints.toLocaleString()} points are locked only after all 3 players ready up and
                agree. Leaving before the game starts returns them.
              </p>
            </Card>
          )}
        </div>

        {/* Chat */}
        <ChatPanel room={room} />
      </div>
    </div>
  );
}

const RESULT_LABEL: Record<string, string> = {
  tongits_win: "Tongits!",
  draw_win: "Draw — stock ran out",
  lowest_points_win: "Lowest hand wins",
  player_disconnected: "Won by forfeit",
};

function ResultScreen({
  code,
  room,
  onError,
}: {
  code: string;
  room: TongitsRoom;
  onError: (s: string | null) => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const r = room.lastResult!;
  const C = room.challengePoints;
  const seats = seatedPlayers(room);

  async function run(key: string, fn: () => Promise<unknown>, after?: () => void) {
    onError(null);
    setBusy(key);
    try {
      await fn();
      after?.();
    } catch (e) {
      onError(e instanceof Error ? e.message.replace(/^.*\/ /, "") : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <TopHeader title="Match result" subtitle={`Room ${room.roomCode}`} />

      <Card className="text-center mb-3">
        <AssetImage
          src={r.resultType === "tongits_win" ? TONGITS_ART.winBanner : null}
          alt="Tongits!"
          className="max-h-36 mx-auto mb-3 object-contain"
          fallback={
            <div className="w-14 h-14 rounded-full bg-gold/15 flex items-center justify-center mx-auto mb-3">
              <Trophy className="w-7 h-7 text-gold" />
            </div>
          }
        />
        <p className="text-[16px] font-medium m-0">{r.winnerName} wins</p>
        <p className="text-[12px] text-text-muted mt-1 m-0">{RESULT_LABEL[r.resultType] ?? r.resultType}</p>
        {r.jackpotWon > 0 && (
          <p className="text-[12px] text-vault mt-1 m-0 inline-flex items-center gap-1 justify-center">
            <Sparkles className="w-3.5 h-3.5" /> +{r.jackpotWon} jackpot claimed
          </p>
        )}
      </Card>

      <Card className="mb-3">
        <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0 mb-2">Breakdown</p>
        <div className="flex flex-col gap-2">
          {seats
            .slice()
            .sort((a, b) => (r.values[a.uid] ?? 0) - (r.values[b.uid] ?? 0))
            .map((s) => {
              const isWinner = s.uid === r.winnerUserId;
              const net = isWinner ? C * seats.length + r.jackpotWon : 0;
              return (
                <div key={s.uid} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/60 last:border-b-0">
                  <div className="min-w-0">
                    <p className="text-[12px] m-0 truncate">
                      {s.name}
                      {isWinner && <span className="text-gold"> · winner</span>}
                    </p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {(r.melds[s.uid] ?? []).flat().map((c) => (
                        <PlayingCard key={c} card={c} size="sm" />
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-text-muted m-0">hand {r.values[s.uid] ?? 0}</p>
                    <p className={cn("text-[12px] font-mono m-0", isWinner ? "text-green" : "text-red")}>
                      {isWinner ? `+${net}` : `−${C}`}
                    </p>
                  </div>
                </div>
              );
            })}
        </div>
      </Card>

      <div className="flex gap-2">
        <button
          onClick={() => run("again", () => playAgain(code))}
          disabled={busy === "again"}
          className="flex-1 py-2.5 bg-gold text-gold-dark rounded-lg text-[13px] font-medium inline-flex items-center justify-center gap-2 hover:brightness-110 transition disabled:opacity-60"
        >
          {busy === "again" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Play again
        </button>
        <button
          onClick={() => run("leave", () => leaveRoom(code), () => router.push("/tongits"))}
          disabled={busy === "leave"}
          className="flex-1 py-2.5 bg-card-elev border border-border-strong rounded-lg text-[13px] text-text-muted hover:text-text transition disabled:opacity-60"
        >
          Back to lobby
        </button>
      </div>
    </div>
  );
}

function StartStatus({ room }: { room: TongitsRoom }) {
  const players = seatedPlayers(room);
  let msg: string;
  let tone: "wait" | "ready";
  if (room.status === "ready") {
    msg = "All players locked in! The game table arrives in Phase 2 — hang tight.";
    tone = "ready";
  } else if (players.length < MAX_PLAYERS) {
    msg = `Waiting for players — ${players.length}/${MAX_PLAYERS} seated. Share the code!`;
    tone = "wait";
  } else if (!players.every((p) => p.isReady)) {
    msg = "All seats filled — waiting for everyone to ready up.";
    tone = "wait";
  } else if (!players.every((p) => p.agreedToChallenge)) {
    msg = "Everyone's ready — waiting on challenge confirmations.";
    tone = "wait";
  } else {
    msg = "Locking in the challenge…";
    tone = "wait";
  }
  return (
    <div
      className={cn(
        "mb-3 px-4 py-2.5 rounded-xl border text-[12px] flex items-center gap-2",
        tone === "ready"
          ? "bg-green/10 border-green/30 text-green"
          : "bg-vault/5 border-border-vault text-vault-muted"
      )}
    >
      {tone === "ready" ? <Sparkles className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
      {msg}
    </div>
  );
}

function Badge({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        "text-[9px] px-1.5 py-0.5 rounded-full",
        on ? "bg-green/15 text-green" : "bg-card-elev text-text-subtle"
      )}
    >
      {on ? "✓ " : ""}
      {label}
    </span>
  );
}

function ChatPanel({ room }: { room: TongitsRoom }) {
  const { user } = useAuth();
  const messages = useRoomChat(room.roomCode);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const lastSent = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const { db } = getFirebase();
    if (!db || !user) return;
    const now = Date.now();
    if (now - lastSent.current < 800) return; // basic spam guard
    const msg = text.trim();
    if (!msg) return;
    setSending(true);
    lastSent.current = now;
    setText("");
    try {
      await sendChat(db, room.roomCode, user.uid, room.players[user.uid]?.name ?? "Player", msg);
    } catch {
      setText(msg); // restore on failure
    } finally {
      setSending(false);
    }
  }

  async function report(messageId: string) {
    const { db } = getFirebase();
    if (!db || !user) return;
    try {
      await reportChat(db, {
        reporterUserId: user.uid,
        roomCode: room.roomCode,
        messageId,
      });
    } catch {
      /* ignore */
    }
  }

  return (
    <Card className="flex flex-col p-0 overflow-hidden h-[380px]">
      <div className="px-4 py-2.5 border-b border-border">
        <p className="text-[12px] font-medium m-0">Room chat</p>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-2">
        {messages.length === 0 ? (
          <p className="text-[11px] text-text-subtle text-center my-auto">Say hi to your table 👋</p>
        ) : (
          messages.map((m) => {
            const mine = m.uid === user?.uid;
            return (
              <div key={m.id} className={cn("group flex flex-col", mine ? "items-end" : "items-start")}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9px] text-text-subtle">
                    {mine ? "You" : m.name} ·{" "}
                    {new Date(m.createdAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {!mine && (
                    <button
                      onClick={() => report(m.id)}
                      className="opacity-0 group-hover:opacity-100 text-text-subtle hover:text-red transition"
                      aria-label="Report message"
                    >
                      <Flag className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
                <span
                  className={cn(
                    "text-[12px] px-2.5 py-1.5 rounded-lg max-w-[85%] break-words",
                    mine ? "bg-gold/15 text-text" : "bg-card-elev text-text"
                  )}
                >
                  {m.message}
                </span>
              </div>
            );
          })
        )}
      </div>
      {room.chatEnabled ? (
        <div className="p-2.5 border-t border-border flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 300))}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Message…"
            className="flex-1 bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40"
          />
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            className="px-3 py-2 bg-gold text-gold-dark rounded-lg disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="p-2.5 border-t border-border text-[10px] text-text-subtle flex items-center gap-1.5">
          <X className="w-3 h-3" /> Chat is disabled for this room.
        </div>
      )}
    </Card>
  );
}
