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
import { useTongitsAssets } from "@/lib/tongitsAssets";

type Box = { l: number; t: number; w: number; h: number };

// Base overlays (against the plain Waiting Area base).
const C = {
  back: { l: 1.2, t: 3, w: 5, h: 7.6 },
  roomCode: { l: 13.5, t: 5.8, w: 16, h: 4.5 },
  challenge: { l: 35, t: 5.8, w: 8, h: 4.5 },
  ante: { l: 50.5, t: 5.8, w: 8, h: 4.5 },
  copyTop: { l: 61.9, t: 3.5, w: 10.8, h: 6.6 },
  leave: { l: 73.9, t: 3.5, w: 13.8, h: 6.6 },
  readyBtn: { l: 16.7, t: 80.2, w: 19.4, h: 9.2 },
  agreeBtn: { l: 38.3, t: 80.2, w: 26.9, h: 9.2 },
  chatMsgs: { l: 76.3, t: 22.8, w: 21.5, h: 53 },
  chatInput: { l: 76.3, t: 77.4, w: 16.4, h: 5.7 },
  chatSend: { l: 93.8, t: 77.2, w: 4.2, h: 6.2 },
};

// Placed seat components (sizes preserve each PNG's aspect). Anchors are the
// ring-center position on the canvas; left/top are derived so the ring lands there.
// Sizes preserve each PNG's aspect; widths chosen so both rings render the same size.
const OCC = {
  W: 23.6,
  H: 13.3,
  ringcx: 0.154,
  ringcy: 0.498,
  name: { l: 0.35, t: 0.19, w: 0.34, h: 0.30 },
  coin: { l: 0.44, t: 0.59, w: 0.28, h: 0.27 },
  ready: { l: 0.723, t: 0.191, w: 0.255, h: 0.301 },
  agreed: { l: 0.723, t: 0.59, w: 0.255, h: 0.273 },
};
const EMP = { W: 22.5, H: 14.75, ringcx: 0.25, ringcy: 0.50, copy: { l: 0.47, t: 0.68, w: 0.43, h: 0.19 } };
const ANCHORS = [
  { x: 11.5, y: 28 },
  { x: 50, y: 28 },
  { x: 24, y: 60 },
];

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return (p.length === 1 ? p[0].slice(0, 2) : (p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

function Zone({
  box,
  children,
  onClick,
  style,
  title,
}: {
  box: Box;
  children?: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
  title?: string;
}) {
  return (
    <div
      title={title}
      onClick={onClick}
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
  const assets = useTongitsAssets();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
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
    navigator.clipboard.writeText(room.roomCode).catch(() => {});
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
        <img src={assets.waitingRoom} alt="Tongits waiting room" className="absolute inset-0 w-full h-full object-contain" />

        {error && (
          <div
            className="absolute left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-white text-center z-30"
            style={{ top: "13%", background: "rgba(200,40,40,0.9)", fontSize: "1.1cqw" }}
          >
            {error}
          </div>
        )}

        {/* seats */}
        {ANCHORS.map((a, i) => {
          const p = bySeat(i);
          if (p) {
            const left = a.x - OCC.ringcx * OCC.W;
            const top = a.y - OCC.ringcy * OCC.H;
            const abs = (f: { l: number; t: number; w: number; h: number }): Box => ({
              l: left + f.l * OCC.W,
              t: top + f.t * OCC.H,
              w: f.w * OCC.W,
              h: f.h * OCC.H,
            });
            return (
              <div key={i}>
                <img
                  src={assets.seatOccupied}
                  alt=""
                  style={{ position: "absolute", left: `${left}%`, top: `${top}%`, width: `${OCC.W}%`, height: `${OCC.H}%` }}
                />
                {/* avatar in the ring */}
                <Zone box={{ l: left, t: top, w: OCC.ringcx * 2 * OCC.W, h: OCC.H }}>
                  <div
                    style={{
                      height: "62%",
                      aspectRatio: "1",
                      borderRadius: "50%",
                      background: "#0a1730",
                      color: gold,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      fontSize: "1.7cqw",
                    }}
                  >
                    {initials(p.name)}
                  </div>
                </Zone>
                <Zone box={abs(OCC.name)}>
                  <span className="truncate" style={{ color: "#fff", fontWeight: 700, fontSize: "1.3cqw", maxWidth: "100%" }}>
                    {p.name}
                  </span>
                </Zone>
                <Zone box={abs(OCC.coin)} style={{ justifyContent: "flex-start" }}>
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: "1.15cqw", fontFamily: "monospace", paddingLeft: "0.5cqw" }}>
                    {room.challengePoints}
                  </span>
                </Zone>
                {!p.isReady && <Zone box={abs(OCC.ready)} style={{ background: "rgba(8,14,28,0.72)", borderRadius: "0.8cqw" }} />}
                {!p.agreedToChallenge && <Zone box={abs(OCC.agreed)} style={{ background: "rgba(8,14,28,0.72)", borderRadius: "0.8cqw" }} />}
              </div>
            );
          }
          // empty seat → waiting-for-player component + COPY CODE
          const left = a.x - EMP.ringcx * EMP.W;
          const top = a.y - EMP.ringcy * EMP.H;
          return (
            <div key={i}>
              <img
                src={assets.seatEmpty}
                alt=""
                style={{ position: "absolute", left: `${left}%`, top: `${top}%`, width: `${EMP.W}%`, height: `${EMP.H}%` }}
              />
              <Zone
                box={{ l: left + EMP.copy.l * EMP.W, t: top + EMP.copy.t * EMP.H, w: EMP.copy.w * EMP.W, h: EMP.copy.h * EMP.H }}
                onClick={copyCode}
                title="Copy code"
              />
            </div>
          );
        })}

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
        <Zone box={C.copyTop} onClick={copyCode} title="Copy code" />
        <Zone box={C.leave} onClick={() => run("leave", () => leaveRoom(code), () => router.push("/tongits"))} title="Leave room" />

        {/* bottom actions / start */}
        {ready ? (
          <Zone box={{ l: 16.7, t: 80.2, w: 48.5, h: 9.2 }} onClick={() => run("start", () => startGame(code))} title="Start game">
            <div
              className="w-[92%] h-[80%] rounded-2xl flex items-center justify-center"
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
