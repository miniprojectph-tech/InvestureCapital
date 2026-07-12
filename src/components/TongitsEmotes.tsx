"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getFirebase } from "@/lib/firebase";
import { useRoomChat, sendChat, type TongitsChat } from "@/lib/tongits";

// ─── Emote definitions ───────────────────────────────────────────────

type EmoteDef = {
  id: string;
  label: string;
  projectile: boolean;
  svg: string;
  impactSvg?: string;
  shake?: boolean;
};

const EMOTES: EmoteDef[] = [
  {
    id: "rocket",
    label: "Rocket",
    projectile: true,
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><ellipse cx="32" cy="52" rx="8" ry="5" fill="#ff6b35" opacity="0.7"/><ellipse cx="32" cy="54" rx="5" ry="4" fill="#ffd700" opacity="0.8"/><path d="M32 4c-8 12-12 24-12 36h24c0-12-4-24-12-36z" fill="#e8e8e8" stroke="#bbb" stroke-width="1"/><path d="M32 4c-6 10-9 20-10 30h20c-1-10-4-20-10-30z" fill="#f44336"/><circle cx="32" cy="28" r="4" fill="#64b5f6"/><path d="M20 36c-6 2-8 8-8 12l8-4z" fill="#e8e8e8" stroke="#bbb" stroke-width="0.5"/><path d="M44 36c6 2 8 8 8 12l-8-4z" fill="#e8e8e8" stroke="#bbb" stroke-width="0.5"/><ellipse cx="32" cy="56" rx="3" ry="3" fill="#ff9800"/></svg>`,
    impactSvg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="30" fill="#ff6b35" opacity="0.6"/><circle cx="40" cy="40" r="20" fill="#ffd700" opacity="0.7"/><circle cx="40" cy="40" r="10" fill="#fff" opacity="0.9"/><path d="M40 5L44 25h-8z" fill="#ff6b35" opacity="0.5"/><path d="M40 75L36 55h8z" fill="#ff6b35" opacity="0.5"/><path d="M5 40L25 36v8z" fill="#ff6b35" opacity="0.5"/><path d="M75 40L55 44v-8z" fill="#ff6b35" opacity="0.5"/></svg>`,
    shake: true,
  },
  {
    id: "tomato",
    label: "Tomato",
    projectile: true,
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><ellipse cx="32" cy="36" rx="22" ry="20" fill="#e53935"/><ellipse cx="32" cy="36" rx="22" ry="20" fill="url(#tg)" opacity="0.4"/><defs><radialGradient id="tg" cx="40%" cy="35%"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="transparent"/></radialGradient></defs><path d="M26 18c2-6 6-8 6-8s4 2 6 8" stroke="#4caf50" stroke-width="2.5" fill="none" stroke-linecap="round"/><ellipse cx="30" cy="18" rx="4" ry="2.5" fill="#66bb6a" transform="rotate(-20 30 18)"/><ellipse cx="35" cy="17" rx="4" ry="2.5" fill="#4caf50" transform="rotate(15 35 17)"/></svg>`,
    impactSvg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><ellipse cx="40" cy="45" rx="28" ry="12" fill="#e53935" opacity="0.5"/><circle cx="25" cy="30" r="5" fill="#e53935" opacity="0.6"/><circle cx="55" cy="35" r="4" fill="#e53935" opacity="0.5"/><circle cx="40" cy="25" r="6" fill="#e53935" opacity="0.7"/><circle cx="30" cy="45" r="3" fill="#c62828" opacity="0.4"/><circle cx="50" cy="42" r="3.5" fill="#c62828" opacity="0.4"/></svg>`,
  },
  {
    id: "bomb",
    label: "Bomb",
    projectile: true,
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="38" r="18" fill="#37474f"/><circle cx="30" cy="38" r="18" fill="url(#bg)" opacity="0.3"/><defs><radialGradient id="bg" cx="35%" cy="30%"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="transparent"/></radialGradient></defs><rect x="28" y="16" width="4" height="10" rx="2" fill="#795548"/><circle cx="30" cy="14" r="3" fill="#ff9800"/><circle cx="30" cy="13" r="2" fill="#ffd700"/><path d="M33 12c2-3 5-4 8-3" stroke="#ff9800" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="42" cy="8" r="2" fill="#ff5722"/><circle cx="44" cy="6" r="1.5" fill="#ffd700"/></svg>`,
    impactSvg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><polygon points="50,5 58,35 90,25 65,50 95,60 60,65 70,95 50,70 30,95 40,65 5,60 35,50 10,25 42,35" fill="#ff9800" opacity="0.8"/><polygon points="50,20 55,40 75,35 60,50 78,56 58,60 64,78 50,64 36,78 42,60 22,56 40,50 25,35 45,40" fill="#ffd700" opacity="0.9"/><circle cx="50" cy="50" r="12" fill="#fff" opacity="0.8"/></svg>`,
    shake: true,
  },
  {
    id: "lightning",
    label: "Lightning",
    projectile: true,
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><polygon points="38,2 18,30 28,30 22,62 48,26 36,26" fill="#ffd600"/><polygon points="38,2 18,30 28,30 22,62 48,26 36,26" fill="url(#lg)" opacity="0.4"/><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="transparent"/></linearGradient></defs></svg>`,
    impactSvg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="25" fill="#ffd600" opacity="0.3"/><circle cx="40" cy="40" r="15" fill="#fff" opacity="0.5"/><path d="M40 10v10M40 60v10M10 40h10M60 40h10M18 18l7 7M55 55l7 7M55 18l-7 7M18 55l7 7" stroke="#ffd600" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/></svg>`,
  },
  {
    id: "slap",
    label: "Slap",
    projectile: true,
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M32 58c-12 0-18-6-18-14v-8l6-2v-8c0-2 2-4 4-4s4 2 4 4v6h2v-14c0-2 2-4 4-4s4 2 4 4v14h2v-12c0-2 2-4 4-4s4 2 4 4v12h2v-8c0-2 2-4 4-4s4 2 4 4v14c0 14-8 22-20 22z" fill="#ffcc80"/><path d="M32 58c-12 0-18-6-18-14v-8l6-2v-8c0-2 2-4 4-4s4 2 4 4v6h2v-14c0-2 2-4 4-4s4 2 4 4v14h2v-12c0-2 2-4 4-4s4 2 4 4v12h2v-8c0-2 2-4 4-4s4 2 4 4v14c0 14-8 22-20 22z" fill="url(#sg)" opacity="0.2"/><defs><radialGradient id="sg" cx="40%" cy="30%"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="transparent"/></radialGradient></defs></svg>`,
    impactSvg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><text x="40" y="48" text-anchor="middle" font-size="30" font-weight="900" fill="#ff5722" opacity="0.9">💥</text><path d="M20 20L30 30M60 20L50 30M20 60L30 50M60 60L50 50" stroke="#ff5722" stroke-width="3" stroke-linecap="round" opacity="0.5"/></svg>`,
  },
  {
    id: "heart",
    label: "Heart",
    projectile: false,
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M32 56S8 40 8 24c0-8 6-14 14-14a14 14 0 0110 4 14 14 0 0110-4c8 0 14 6 14 14 0 16-24 32-24 32z" fill="#e91e63"/><path d="M32 56S8 40 8 24c0-8 6-14 14-14a14 14 0 0110 4 14 14 0 0110-4c8 0 14 6 14 14 0 16-24 32-24 32z" fill="url(#hg)" opacity="0.4"/><defs><radialGradient id="hg" cx="35%" cy="30%"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="transparent"/></radialGradient></defs></svg>`,
  },
  {
    id: "confetti",
    label: "Confetti",
    projectile: false,
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M14 58L22 20l6 4z" fill="#ff9800"/><path d="M14 58L28 24l-2 6z" fill="#f57c00"/><circle cx="26" cy="18" r="2.5" fill="#e91e63"/><circle cx="34" cy="14" r="2" fill="#4caf50"/><circle cx="20" cy="12" r="1.8" fill="#2196f3"/><rect x="30" y="18" width="4" height="4" rx="0.5" fill="#ffd600" transform="rotate(20 32 20)"/><rect x="38" y="22" width="3" height="3" rx="0.5" fill="#e91e63" transform="rotate(-15 39 23)"/><circle cx="42" cy="16" r="2" fill="#9c27b0"/><rect x="22" y="8" width="3.5" height="3.5" rx="0.5" fill="#ff5722" transform="rotate(35 24 10)"/><path d="M36 10c2-2 4-1 4 1s-2 3-4 3-2-2 0-4z" fill="#4caf50"/><circle cx="46" cy="24" r="1.5" fill="#2196f3"/></svg>`,
  },
];

// ─── Avatar center coordinates (% of container) ─────────────────────

type AvatarPos = { x: number; y: number };

function avatarCenter(box: { l: number; t: number; w: number; h: number }): AvatarPos {
  return { x: box.l + box.w / 2, y: box.t + box.h / 2 };
}

const AVATAR_BOXES = {
  opp1: { l: 7, t: 12, w: 5, h: 10 },
  opp2: { l: 87.5, t: 12, w: 5, h: 10 },
  you: { l: 6, t: 75, w: 5, h: 10 },
};

// ─── Active animation state ─────────────────────────────────────────

type ActiveAnim = {
  key: string;
  emote: EmoteDef;
  from: AvatarPos;
  to: AvatarPos;
  startedAt: number;
};

type ActiveBubble = {
  key: string;
  uid: string;
  text: string;
  startedAt: number;
};

type ActiveBroadcast = {
  key: string;
  emote: EmoteDef;
  at: AvatarPos;
  startedAt: number;
};

// ─── Keyframe CSS (injected once) ───────────────────────────────────

const EMOTE_CSS = `
@keyframes emoteImpact {
  0% { transform: translate(-50%,-50%) scale(0); opacity: 1; }
  40% { transform: translate(-50%,-50%) scale(1.4); opacity: 0.9; }
  100% { transform: translate(-50%,-50%) scale(1.8); opacity: 0; }
}
@keyframes emoteBubble {
  0% { transform: scale(0.5) translateY(10%); opacity: 0; }
  8% { transform: scale(1.05) translateY(0%); opacity: 1; }
  12% { transform: scale(1) translateY(0%); opacity: 1; }
  85% { transform: scale(1) translateY(0%); opacity: 1; }
  100% { transform: scale(0.9) translateY(-10%); opacity: 0; }
}
@keyframes emoteBroadcast {
  0% { transform: scale(0); opacity: 0; }
  15% { transform: scale(1.3); opacity: 1; }
  25% { transform: scale(1); opacity: 1; }
  75% { transform: scale(1); opacity: 1; }
  100% { transform: scale(0.5) translateY(-40%); opacity: 0; }
}
@keyframes emoteShake {
  0%, 100% { transform: translate(0,0); }
  10% { transform: translate(-0.3%,-0.2%); }
  20% { transform: translate(0.3%,0.1%); }
  30% { transform: translate(-0.2%,0.3%); }
  40% { transform: translate(0.2%,-0.3%); }
  50% { transform: translate(-0.1%,0.2%); }
  60% { transform: translate(0.3%,-0.1%); }
  70% { transform: translate(-0.3%,0.2%); }
  80% { transform: translate(0.1%,-0.2%); }
  90% { transform: translate(-0.2%,0.1%); }
}
@keyframes emoteHeartFloat {
  0% { transform: scale(0) translateY(0); opacity: 0; }
  15% { transform: scale(1.2) translateY(-10%); opacity: 1; }
  25% { transform: scale(1) translateY(-15%); opacity: 1; }
  100% { transform: scale(0.6) translateY(-120%); opacity: 0; }
}
`;

const PROJECTILE_DURATION = 900;
const IMPACT_DURATION = 600;
const BUBBLE_DURATION = 4000;
const BROADCAST_DURATION = 2000;

function ImpactEffect({ anim }: { anim: ActiveAnim }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const delay = PROJECTILE_DURATION * 0.75;
    const elapsed = Date.now() - anim.startedAt;
    const remaining = Math.max(0, delay - elapsed);
    const t = setTimeout(() => setShow(true), remaining);
    return () => clearTimeout(t);
  }, [anim]);
  if (!show || !anim.emote.impactSvg) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: `${anim.to.x}%`,
        top: `${anim.to.y}%`,
        width: "10cqw",
        height: "10cqw",
        zIndex: 49,
        animation: `emoteImpact ${IMPACT_DURATION}ms ease-out forwards`,
        pointerEvents: "none",
      }}
      dangerouslySetInnerHTML={{ __html: anim.emote.impactSvg }}
    />
  );
}

// ─── Emote layer (projectiles + impacts + bubbles) ──────────────────

function EmoteLayer({
  anims,
  bubbles,
  broadcasts,
  shaking,
}: {
  anims: ActiveAnim[];
  bubbles: ActiveBubble[];
  broadcasts: ActiveBroadcast[];
  shaking: boolean;
}) {
  return (
    <>
      <style>{EMOTE_CSS}</style>

      {anims.map((a) => {
        const midX = (a.from.x + a.to.x) / 2;
        const midY = Math.min(a.from.y, a.to.y) - 15;
        const animName = `fly-${a.key.replace(/[^a-zA-Z0-9]/g, "")}`;
        const kf = `@keyframes ${animName} {
          0% { left: ${a.from.x}%; top: ${a.from.y}%; opacity: 1; transform: translate(-50%,-50%) scale(0.7); }
          20% { opacity: 1; transform: translate(-50%,-50%) scale(1); }
          50% { left: ${midX}%; top: ${midY}%; transform: translate(-50%,-50%) scale(1.1); }
          85% { opacity: 1; transform: translate(-50%,-50%) scale(1.1); }
          100% { left: ${a.to.x}%; top: ${a.to.y}%; opacity: 0; transform: translate(-50%,-50%) scale(0.8); }
        }`;
        return (
          <div key={a.key}>
            <style>{kf}</style>
            <div
              style={{
                position: "absolute",
                left: `${a.from.x}%`,
                top: `${a.from.y}%`,
                width: "5cqw",
                height: "5cqw",
                zIndex: 50,
                animation: `${animName} ${PROJECTILE_DURATION}ms ease-in-out forwards`,
                pointerEvents: "none",
              }}
              dangerouslySetInnerHTML={{ __html: a.emote.svg }}
            />
            <ImpactEffect anim={a} />
          </div>
        );
      })}

      {broadcasts.map((b) => (
        <div
          key={b.key}
          style={{
            position: "absolute",
            left: `${b.at.x}%`,
            top: `${b.at.y - 12}%`,
            width: "8cqw",
            height: "8cqw",
            marginLeft: "-4cqw",
            marginTop: "-4cqw",
            zIndex: 50,
            animation: `${b.emote.id === "heart" ? "emoteHeartFloat" : "emoteBroadcast"} ${BROADCAST_DURATION}ms ease-out forwards`,
            pointerEvents: "none",
          }}
          dangerouslySetInnerHTML={{ __html: b.emote.svg }}
        />
      ))}

      {bubbles.map((b) => (
        <SpeechBubble key={b.key} bubble={b} />
      ))}

      {shaking && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 48,
            animation: "emoteShake 0.4s ease-in-out",
            pointerEvents: "none",
          }}
        />
      )}
    </>
  );
}

function SpeechBubble({ bubble }: { bubble: ActiveBubble }) {
  const pos = AVATAR_BOXES;
  let box = pos.you;
  if (bubble.uid !== "__you__") {
    box = bubble.uid === "__opp1__" ? pos.opp1 : pos.opp2;
  }
  const center = avatarCenter(box);
  const isLeft = center.x < 50;

  return (
    <div
      style={{
        position: "absolute",
        left: isLeft ? `${center.x + 4}%` : undefined,
        right: !isLeft ? `${100 - center.x + 4}%` : undefined,
        top: `${center.y - 6}%`,
        zIndex: 51,
        animation: `emoteBubble ${BUBBLE_DURATION}ms ease-out forwards`,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.95)",
          color: "#1a1a2e",
          fontWeight: 700,
          fontSize: "1.2cqw",
          padding: "0.5cqw 1cqw",
          borderRadius: "1cqw",
          maxWidth: "18cqw",
          wordBreak: "break-word",
          boxShadow: "0 0.2cqw 0.6cqw rgba(0,0,0,0.3)",
          position: "relative",
        }}
      >
        {bubble.text}
        <div
          style={{
            position: "absolute",
            top: "40%",
            [isLeft ? "left" : "right"]: "-0.6cqw",
            width: 0,
            height: 0,
            borderTop: "0.5cqw solid transparent",
            borderBottom: "0.5cqw solid transparent",
            [isLeft ? "borderRight" : "borderLeft"]: "0.7cqw solid rgba(255,255,255,0.95)",
          }}
        />
      </div>
    </div>
  );
}

// ─── Emote picker panel ─────────────────────────────────────────────

function EmotePicker({
  onPick,
  onClose,
}: {
  onPick: (emote: EmoteDef) => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        right: "2%",
        bottom: "22%",
        zIndex: 55,
        background: "linear-gradient(135deg, rgba(10,28,48,0.97), rgba(14,40,72,0.97))",
        border: "0.12cqw solid rgba(245,198,107,0.4)",
        borderRadius: "1cqw",
        padding: "0.8cqw",
        backdropFilter: "blur(8px)",
        boxShadow: "0 0.3cqw 1.5cqw rgba(0,0,0,0.5)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "0.5cqw",
        }}
      >
        {EMOTES.map((e) => (
          <button
            key={e.id}
            onClick={() => onPick(e)}
            title={e.label}
            style={{
              width: "5cqw",
              height: "5cqw",
              background: "rgba(255,255,255,0.08)",
              border: "0.08cqw solid rgba(255,255,255,0.15)",
              borderRadius: "0.6cqw",
              cursor: "pointer",
              padding: "0.5cqw",
              transition: "background 150ms",
            }}
            onMouseEnter={(ev) => (ev.currentTarget.style.background = "rgba(245,198,107,0.2)")}
            onMouseLeave={(ev) => (ev.currentTarget.style.background = "rgba(255,255,255,0.08)")}
          >
            <div dangerouslySetInnerHTML={{ __html: e.svg }} style={{ width: "100%", height: "100%" }} />
          </button>
        ))}
      </div>
      <button
        onClick={onClose}
        style={{
          marginTop: "0.4cqw",
          width: "100%",
          background: "rgba(255,255,255,0.1)",
          border: "none",
          borderRadius: "0.5cqw",
          color: "rgba(255,255,255,0.6)",
          fontSize: "0.9cqw",
          fontWeight: 600,
          padding: "0.3cqw",
          cursor: "pointer",
        }}
      >
        Close
      </button>
    </div>
  );
}

// ─── Target picker overlay ──────────────────────────────────────────

function TargetPicker({
  seats,
  myUid,
  onPick,
  onCancel,
}: {
  seats: { uid: string; name: string }[];
  myUid: string;
  onPick: (targetUid: string) => void;
  onCancel: () => void;
}) {
  const opponents = seats.filter((s) => s.uid !== myUid);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 56,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "3cqw",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          position: "absolute",
          top: "3%",
          left: "50%",
          transform: "translateX(-50%)",
          color: "#F5C66B",
          fontWeight: 800,
          fontSize: "1.6cqw",
          textShadow: "0 0.2cqw 0.5cqw rgba(0,0,0,0.6)",
        }}
      >
        Pick a target!
      </div>
      {opponents.map((opp) => (
        <button
          key={opp.uid}
          onClick={(e) => { e.stopPropagation(); onPick(opp.uid); }}
          style={{
            background: "linear-gradient(135deg, rgba(245,198,107,0.2), rgba(245,198,107,0.1))",
            border: "0.15cqw solid rgba(245,198,107,0.5)",
            borderRadius: "1.2cqw",
            padding: "1.5cqw 2.5cqw",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.5cqw",
            transition: "background 150ms, transform 150ms",
          }}
          onMouseEnter={(ev) => {
            ev.currentTarget.style.background = "linear-gradient(135deg, rgba(245,198,107,0.35), rgba(245,198,107,0.2))";
            ev.currentTarget.style.transform = "scale(1.05)";
          }}
          onMouseLeave={(ev) => {
            ev.currentTarget.style.background = "linear-gradient(135deg, rgba(245,198,107,0.2), rgba(245,198,107,0.1))";
            ev.currentTarget.style.transform = "scale(1)";
          }}
        >
          <div
            style={{
              width: "6cqw",
              height: "6cqw",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #F5C66B, #c99534)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#141c2f",
              fontWeight: 900,
              fontSize: "2cqw",
              fontFamily: "system-ui",
            }}
          >
            {opp.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: "1.1cqw" }}>{opp.name}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Chat panel ─────────────────────────────────────────────────────

function ChatPanel({
  messages,
  onSend,
  onClose,
}: {
  messages: TongitsChat[];
  onSend: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function send() {
    const now = Date.now();
    if (now - lastSent.current < 800) return;
    const msg = text.trim();
    if (!msg) return;
    lastSent.current = now;
    setText("");
    onSend(msg);
  }

  return (
    <div
      style={{
        position: "absolute",
        right: "2%",
        bottom: "22%",
        width: "24cqw",
        height: "35cqw",
        zIndex: 55,
        background: "linear-gradient(135deg, rgba(10,28,48,0.97), rgba(14,40,72,0.97))",
        border: "0.12cqw solid rgba(245,198,107,0.4)",
        borderRadius: "1cqw",
        display: "flex",
        flexDirection: "column",
        backdropFilter: "blur(8px)",
        boxShadow: "0 0.3cqw 1.5cqw rgba(0,0,0,0.5)",
        overflow: "hidden",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          padding: "0.5cqw 0.8cqw",
          borderBottom: "0.08cqw solid rgba(255,255,255,0.1)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ color: "#F5C66B", fontWeight: 700, fontSize: "1cqw" }}>Chat</span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "1.2cqw", lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0.4cqw",
          display: "flex",
          flexDirection: "column",
          gap: "0.3cqw",
        }}
      >
        {messages.filter((m) => !m.message.startsWith("emote:")).map((m) => (
          <div key={m.id} style={{ fontSize: "0.9cqw", lineHeight: 1.3 }}>
            <span style={{ color: "#F5C66B", fontWeight: 700 }}>{m.name}: </span>
            <span style={{ color: "rgba(255,255,255,0.85)" }}>{m.message}</span>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: "0.4cqw",
          borderTop: "0.08cqw solid rgba(255,255,255,0.1)",
          display: "flex",
          gap: "0.3cqw",
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message..."
          maxLength={100}
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.08)",
            border: "0.08cqw solid rgba(255,255,255,0.15)",
            borderRadius: "0.5cqw",
            padding: "0.35cqw 0.6cqw",
            color: "#fff",
            fontSize: "0.9cqw",
            outline: "none",
          }}
        />
        <button
          onClick={send}
          style={{
            background: "linear-gradient(135deg, #F5C66B, #c99534)",
            border: "none",
            borderRadius: "0.5cqw",
            padding: "0.35cqw 0.8cqw",
            color: "#141c2f",
            fontWeight: 800,
            fontSize: "0.9cqw",
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ─── Main export: TongitsEmoteSystem ────────────────────────────────

export function TongitsEmoteSystem({
  code,
  myUid,
  seats,
}: {
  code: string;
  myUid: string;
  seats: { uid: string; name: string }[];
}) {
  const messages = useRoomChat(code);
  const [panel, setPanel] = useState<"none" | "chat" | "emote">("none");
  const [pendingEmote, setPendingEmote] = useState<EmoteDef | null>(null);
  const [anims, setAnims] = useState<ActiveAnim[]>([]);
  const [bubbles, setBubbles] = useState<ActiveBubble[]>([]);
  const [broadcasts, setBroadcasts] = useState<ActiveBroadcast[]>([]);
  const [shaking, setShaking] = useState(false);
  const processedRef = useRef(new Set<string>());
  const lastCleanup = useRef(0);

  const uidToSlot = useCallback(
    (uid: string): "you" | "opp1" | "opp2" => {
      if (uid === myUid) return "you";
      const opponents = seats.filter((s) => s.uid !== myUid);
      if (opponents[0]?.uid === uid) return "opp1";
      return "opp2";
    },
    [myUid, seats]
  );

  const slotToAvatarPos = (slot: "you" | "opp1" | "opp2"): AvatarPos =>
    avatarCenter(AVATAR_BOXES[slot]);

  // Process incoming messages for animations
  useEffect(() => {
    const now = Date.now();
    for (const msg of messages) {
      if (processedRef.current.has(msg.id)) continue;
      if (now - msg.createdAt > 8000) {
        processedRef.current.add(msg.id);
        continue;
      }
      processedRef.current.add(msg.id);

      if (msg.message.startsWith("emote:")) {
        const parts = msg.message.split(":");
        const emoteId = parts[1];
        const targetUid = parts[2] || null;
        const emote = EMOTES.find((e) => e.id === emoteId);
        if (!emote) continue;

        const senderSlot = uidToSlot(msg.uid);
        const senderPos = slotToAvatarPos(senderSlot);

        if (emote.projectile && targetUid) {
          const targetSlot = uidToSlot(targetUid);
          const targetPos = slotToAvatarPos(targetSlot);
          const key = `anim-${msg.id}`;
          setAnims((prev) => [...prev, { key, emote, from: senderPos, to: targetPos, startedAt: now }]);
          if (emote.shake) {
            setTimeout(() => {
              setShaking(true);
              setTimeout(() => setShaking(false), 400);
            }, PROJECTILE_DURATION * 0.75);
          }
          setTimeout(() => setAnims((prev) => prev.filter((a) => a.key !== key)), PROJECTILE_DURATION + IMPACT_DURATION);
        } else {
          const key = `bc-${msg.id}`;
          setBroadcasts((prev) => [...prev, { key, emote, at: senderPos, startedAt: now }]);
          setTimeout(() => setBroadcasts((prev) => prev.filter((b) => b.key !== key)), BROADCAST_DURATION);
        }
      } else {
        const senderSlot = uidToSlot(msg.uid);
        const key = `bub-${msg.id}`;
        const bubbleUid = senderSlot === "you" ? "__you__" : senderSlot === "opp1" ? "__opp1__" : "__opp2__";
        setBubbles((prev) => {
          const filtered = prev.filter((b) => b.uid !== bubbleUid);
          return [...filtered, { key, uid: bubbleUid, text: msg.message, startedAt: now }];
        });
        setTimeout(() => setBubbles((prev) => prev.filter((b) => b.key !== key)), BUBBLE_DURATION);
      }
    }

    if (now - lastCleanup.current > 10000) {
      lastCleanup.current = now;
      const cutoff = now - 15000;
      const newProcessed = new Set<string>();
      for (const msg of messages) {
        if (msg.createdAt > cutoff) newProcessed.add(msg.id);
      }
      processedRef.current = newProcessed;
    }
  }, [messages, uidToSlot]);

  async function sendEmoteMsg(emoteId: string, targetUid?: string) {
    const { gameDb: db } = getFirebase();
    if (!db) return;
    const me = seats.find((s) => s.uid === myUid);
    const msg = targetUid ? `emote:${emoteId}:${targetUid}` : `emote:${emoteId}`;
    await sendChat(db, code, myUid, me?.name ?? "Player", msg);
  }

  async function sendTextMsg(text: string) {
    const { gameDb: db } = getFirebase();
    if (!db) return;
    const me = seats.find((s) => s.uid === myUid);
    await sendChat(db, code, myUid, me?.name ?? "Player", text);
  }

  function onEmotePick(emote: EmoteDef) {
    if (emote.projectile) {
      setPendingEmote(emote);
      setPanel("none");
    } else {
      sendEmoteMsg(emote.id);
      setPanel("none");
    }
  }

  function onTargetPick(targetUid: string) {
    if (!pendingEmote) return;
    sendEmoteMsg(pendingEmote.id, targetUid);
    setPendingEmote(null);
  }

  return (
    <>
      <EmoteLayer anims={anims} bubbles={bubbles} broadcasts={broadcasts} shaking={shaking} />

      {/* Chat button */}
      <div
        onClick={() => { setPanel(panel === "chat" ? "none" : "chat"); setPendingEmote(null); }}
        style={{
          position: "absolute",
          left: "89%",
          top: "60%",
          width: "7%",
          height: "9%",
          zIndex: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
        title="Chat"
      >
        <div
          style={{
            width: "3.5cqw",
            height: "3.5cqw",
            borderRadius: "0.7cqw",
            background: panel === "chat" ? "rgba(245,198,107,0.3)" : "rgba(255,255,255,0.08)",
            border: panel === "chat" ? "0.12cqw solid rgba(245,198,107,0.5)" : "0.08cqw solid rgba(255,255,255,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 150ms",
          }}
        >
          <svg viewBox="0 0 24 24" style={{ width: "2cqw", height: "2cqw" }} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </div>
      </div>

      {/* Emoji button */}
      <div
        onClick={() => { setPanel(panel === "emote" ? "none" : "emote"); setPendingEmote(null); }}
        style={{
          position: "absolute",
          left: "89%",
          top: "71%",
          width: "7%",
          height: "9%",
          zIndex: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
        title="Emotes"
      >
        <div
          style={{
            width: "3.5cqw",
            height: "3.5cqw",
            borderRadius: "0.7cqw",
            background: panel === "emote" ? "rgba(245,198,107,0.3)" : "rgba(255,255,255,0.08)",
            border: panel === "emote" ? "0.12cqw solid rgba(245,198,107,0.5)" : "0.08cqw solid rgba(255,255,255,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 150ms",
          }}
        >
          <svg viewBox="0 0 24 24" style={{ width: "2cqw", height: "2cqw" }} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </div>
      </div>

      {/* Panels */}
      {panel === "chat" && (
        <ChatPanel messages={messages} onSend={sendTextMsg} onClose={() => setPanel("none")} />
      )}
      {panel === "emote" && (
        <EmotePicker onPick={onEmotePick} onClose={() => setPanel("none")} />
      )}

      {/* Target picker */}
      {pendingEmote && (
        <TargetPicker
          seats={seats}
          myUid={myUid}
          onPick={onTargetPick}
          onCancel={() => setPendingEmote(null)}
        />
      )}
    </>
  );
}
