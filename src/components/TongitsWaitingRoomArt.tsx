"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import {
  useRoomChat,
  setReady,
  confirmChallenge,
  leaveRoom,
  sendChat,
  type TongitsRoom,
} from "@/lib/tongits";
import { startGame } from "@/lib/tongits-game";
import { TONGITS_ART } from "./AssetImage";

type Box = { l: number; t: number; w: number; h: number };

// Measured against the 1672×941 waiting-room art.
const C = {
  back: { l: 1.2, t: 3, w: 5, h: 7.6 },
  roomCode: { l: 13.5, t: 6.5, w: 16, h: 4 },
  challenge: { l: 35, t: 6.5, w: 8, h: 4 },
  ante: { l: 50.5, t: 6.5, w: 8, h: 4 },
  copyTop: { l: 61.9, t: 4.3, w: 10.8, h: 6.4 },
  leave: { l: 73.9, t: 4.3, w: 13.8, h: 6.4 },
  readyBtn: { l: 16.7, t: 80.2, w: 19.4, h: 9.2 },
  agreeBtn: { l: 38.3, t: 80.2, w: 26.9, h: 9.2 },
  copyCenter: { l: 37.7, t: 68, w: 13.8, h: 5.5 },
  chatMsgs: { l: 76.3, t: 22.8, w: 21.5, h: 53 },
  chatInput: { l: 76.3, t: 77.4, w: 16.4, h: 5.7 },
  chatSend: { l: 93.8, t: 77.2, w: 4.2, h: 6.2 },
};

// Per-seat overlay regions (art positions 0=top-left, 1=top-right, 2=center).
const SEATS: { avatar: Box; name: Box; coin: Box; ready?: Box; agreed?: Box }[] = [
  {
    avatar: { l: 8, t: 21.8, w: 6.9, h: 12.2 },
    name: { l: 17.6, t: 24.2, w: 8, h: 3 },
    coin: { l: 19.1, t: 29.5, w: 7.8, h: 2.9 },
    ready: { l: 27.8, t: 22.8, w: 6, h: 4.8 },
    agreed: { l: 27.2, t: 28.7, w: 6.9, h: 4.8 },
  },
  {
    avatar: { l: 46.4, t: 21.8, w: 7.2, h: 12.2 },
    name: { l: 56.5, t: 24.2, w: 8, h: 3 },
    coin: { l: 58, t: 29.5, w: 7.5, h: 2.9 },
    ready: { l: 66.4, t: 22.8, w: 6.3, h: 4.8 },
    agreed: { l: 66.1, t: 28.7, w: 7.2, h: 4.8 },
  },
  {
    avatar: { l: 23.6, t: 55.8, w: 9.9, h: 17.5 },
    name: { l: 20, t: 74, w: 17, h: 3 },
    coin: { l: 20, t: 77, w: 17, h: 2.5 },
  },
];

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return (p.length === 1 ? p[0].slice(0, 2) : (p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

function Zone({
  box,
  children,
  onClick,
  className,
  style,
  title,
}: {
  box: Box;
  children?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
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
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function TongitsWaitingRoomArt({ code, room }: { code: string; room: TongitsRoom }) {
  const router = useRouter();
  const { user } = useAuth();
  const messages = useRoomChat(code);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const lastSent = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const me = user ? room.players[user.uid] : undefined;
  const bySeat = (n: number) => Object.values(room.players).find((p) => p.seat === n);
  const gold = "#F5C66B";

  async function run(key: string, fn: () => Promise<unknown>, after?: () => void) {
    setError(null);
    setBusy(key);
    try {
      await fn();
      after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*\/ /, "") : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }
  function copyCode() {
    navigator.clipboard.writeText(room.roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  async function send() {
    const { db } = getFirebase();
    if (!db || !user) return;
    const now = Date.now();
    if (now - lastSent.current < 800) return;
    const msg = text.trim();
    if (!msg) return;
    lastSent.current = now;
    setText("");
    try {
      await sendChat(db, room.roomCode, user.uid, me?.name ?? "Player", msg);
    } catch {
      setText(msg);
    }
  }

  const ready = room.status === "ready";

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center overflow-hidden">
      <div
        className="relative"
        style={{ width: "min(100vw, calc(100dvh * 1672 / 941))", aspectRatio: "1672 / 941", containerType: "inline-size" }}
      >
        <img src={TONGITS_ART.waitingRoom} alt="Tongits waiting room" className="absolute inset-0 w-full h-full object-contain" />

        {error && (
          <div
            className="absolute left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-white text-center z-20"
            style={{ top: "13%", background: "rgba(200,40,40,0.9)", fontSize: "1.1cqw" }}
          >
            {error}
          </div>
        )}

        {/* top bar */}
        <Zone box={C.back} onClick={() => run("leave", () => leaveRoom(code), () => router.push("/tongits"))} title="Leave" />
        <Zone box={C.roomCode}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: "1.5cqw", fontFamily: "monospace", letterSpacing: "0.15em" }}>
            {room.roomCode}
          </span>
        </Zone>
        <Zone box={C.challenge}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: "1.4cqw", fontFamily: "monospace" }}>{room.challengePoints}</span>
        </Zone>
        <Zone box={C.ante}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: "1.4cqw", fontFamily: "monospace" }}>{room.jackpotAnte}</span>
        </Zone>
        <Zone box={C.copyTop} onClick={copyCode} title={copied ? "Copied!" : "Copy code"} />
        <Zone box={C.leave} onClick={() => run("leave", () => leaveRoom(code), () => router.push("/tongits"))} title="Leave room" />

        {/* seats */}
        {SEATS.map((s, i) => {
          const p = bySeat(i);
          return (
            <div key={i}>
              {p ? (
                <>
                  <Zone box={s.avatar}>
                    <div
                      style={{
                        width: "80%",
                        aspectRatio: "1",
                        borderRadius: "50%",
                        background: "#0d1a3d",
                        color: gold,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: "1.8cqw",
                      }}
                    >
                      {initials(p.name)}
                    </div>
                  </Zone>
                  <Zone box={s.name}>
                    <span
                      className="truncate"
                      style={{
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: "1.2cqw",
                        background: "rgba(4,12,32,0.72)",
                        padding: "0 0.6cqw",
                        borderRadius: "0.4cqw",
                        maxWidth: "100%",
                      }}
                    >
                      {p.name}
                    </span>
                  </Zone>
                  <Zone box={s.coin}>
                    <span style={{ color: "#fff", fontSize: "1.05cqw", fontFamily: "monospace" }}>{room.challengePoints}</span>
                  </Zone>
                  {/* dim the painted READY / AGREED badge when not yet done */}
                  {s.ready && !p.isReady && <Zone box={s.ready} style={{ background: "rgba(12,20,38,0.72)", borderRadius: "0.6cqw" }} />}
                  {s.agreed && !p.agreedToChallenge && <Zone box={s.agreed} style={{ background: "rgba(12,20,38,0.72)", borderRadius: "0.6cqw" }} />}
                </>
              ) : i === 2 ? (
                // empty center seat → wire the painted COPY CODE button
                <Zone box={C.copyCenter} onClick={copyCode} title="Copy code" />
              ) : null}
            </div>
          );
        })}

        {/* bottom actions (or START when everyone's locked in) */}
        {ready ? (
          <Zone box={{ l: 16.7, t: 80.2, w: 48.5, h: 9.2 }} onClick={() => run("start", () => startGame(code))} title="Start game">
            <div
              className="w-[92%] h-[80%] rounded-2xl flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(180deg,#34d07a,#1f9e5a)", boxShadow: "0 6px 20px rgba(52,208,122,0.5)" }}
            >
              {busy === "start" ? (
                <Loader2 className="animate-spin text-white" style={{ width: "2.2cqw", height: "2.2cqw" }} />
              ) : (
                <span style={{ color: "#fff", fontWeight: 800, fontSize: "1.8cqw" }}>START GAME</span>
              )}
            </div>
          </Zone>
        ) : (
          <>
            <Zone box={C.readyBtn} onClick={() => me && run("ready", () => setReady(code, !me.isReady))} title="Ready">
              {busy === "ready" && <Loader2 className="animate-spin text-white" style={{ width: "2cqw", height: "2cqw" }} />}
            </Zone>
            <Zone
              box={C.agreeBtn}
              onClick={() => me && !me.agreedToChallenge && run("agree", () => confirmChallenge(code))}
              title="Agree to challenge"
            >
              {busy === "agree" && <Loader2 className="animate-spin text-white" style={{ width: "2cqw", height: "2cqw" }} />}
            </Zone>
          </>
        )}

        {/* chat */}
        <div
          ref={scrollRef}
          className="absolute overflow-y-auto"
          style={{ left: `${C.chatMsgs.l}%`, top: `${C.chatMsgs.t}%`, width: `${C.chatMsgs.w}%`, height: `${C.chatMsgs.h}%` }}
        >
          <div className="flex flex-col gap-1.5 p-1">
            {messages.map((m) => {
              const mine = m.uid === user?.uid;
              return (
                <div key={m.id} className={mine ? "self-end" : "self-start"} style={{ maxWidth: "88%" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8cqw" }}>{mine ? "You" : m.name}</span>
                  <div
                    style={{
                      background: mine ? "rgba(245,198,107,0.2)" : "rgba(255,255,255,0.08)",
                      color: "#fff",
                      fontSize: "1cqw",
                      padding: "0.3cqw 0.6cqw",
                      borderRadius: "0.6cqw",
                      wordBreak: "break-word",
                    }}
                  >
                    {m.message}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ position: "absolute", left: `${C.chatInput.l}%`, top: `${C.chatInput.t}%`, width: `${C.chatInput.w}%`, height: `${C.chatInput.h}%` }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 300))}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type a message…"
            className="w-full h-full bg-transparent text-white outline-none"
            style={{ fontSize: "1cqw", padding: "0 1cqw" }}
          />
        </div>
        <Zone box={C.chatSend} onClick={send} title="Send">
          <Send className="text-white" style={{ width: "1.6cqw", height: "1.6cqw" }} />
        </Zone>
      </div>
    </div>
  );
}
