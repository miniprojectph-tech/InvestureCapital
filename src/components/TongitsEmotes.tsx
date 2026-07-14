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
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="rk1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f5f5f5"/><stop offset="100%" stop-color="#ccc"/></linearGradient>
      <linearGradient id="rk2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ff4444"/><stop offset="100%" stop-color="#cc0000"/></linearGradient>
      <radialGradient id="rk3" cx="50%" cy="20%"><stop offset="0%" stop-color="#ffe082"/><stop offset="100%" stop-color="#ff6d00"/></radialGradient></defs>
      <ellipse cx="32" cy="55" rx="6" ry="6" fill="url(#rk3)" opacity="0.9"/>
      <ellipse cx="32" cy="57" rx="4" ry="4" fill="#ffd600" opacity="0.8"/>
      <path d="M32 6c-7 10-11 22-11 34h22c0-12-4-24-11-34z" fill="url(#rk1)" stroke="#999" stroke-width="0.6"/>
      <path d="M32 6c-5 9-8 18-9 28h18c-1-10-4-19-9-28z" fill="url(#rk2)"/>
      <circle cx="32" cy="28" r="3.5" fill="#42a5f5" stroke="#1e88e5" stroke-width="0.5"/>
      <circle cx="32" cy="28" r="1.5" fill="#90caf9"/>
      <path d="M21 36c-5 2-7 7-7 11l7-3z" fill="url(#rk1)" stroke="#999" stroke-width="0.4"/>
      <path d="M43 36c5 2 7 7 7 11l-7-3z" fill="url(#rk1)" stroke="#999" stroke-width="0.4"/>
    </svg>`,
    impactSvg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="ri1"><stop offset="0%" stop-color="#fff" stop-opacity="1"/><stop offset="40%" stop-color="#ffd600" stop-opacity="0.8"/><stop offset="100%" stop-color="#ff6d00" stop-opacity="0"/></radialGradient></defs>
      <circle cx="40" cy="40" r="35" fill="url(#ri1)"/>
      <circle cx="40" cy="40" r="8" fill="#fff" opacity="0.9"/>
    </svg>`,
    shake: true,
  },
  {
    id: "tomato",
    label: "Tomato",
    projectile: true,
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="tm1" cx="40%" cy="35%"><stop offset="0%" stop-color="#ff6659"/><stop offset="60%" stop-color="#e53935"/><stop offset="100%" stop-color="#b71c1c"/></radialGradient></defs>
      <ellipse cx="32" cy="37" rx="21" ry="19" fill="url(#tm1)"/>
      <ellipse cx="26" cy="30" rx="6" ry="4" fill="#ff8a80" opacity="0.4" transform="rotate(-15 26 30)"/>
      <path d="M28 19c1-5 4-7 4-7s3 2 4 7" stroke="#2e7d32" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M27 19c-3-1-5 0-6 2" stroke="#388e3c" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M37 19c3-1 5 0 6 2" stroke="#388e3c" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <ellipse cx="30" cy="18" rx="3.5" ry="2" fill="#43a047" transform="rotate(-25 30 18)"/>
      <ellipse cx="35" cy="17.5" rx="3.5" ry="2" fill="#2e7d32" transform="rotate(20 35 17.5)"/>
    </svg>`,
    impactSvg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="40" cy="48" rx="30" ry="10" fill="#e53935" opacity="0.4"/>
      <circle cx="22" cy="28" r="5" fill="#e53935" opacity="0.6"/><circle cx="30" cy="22" r="4" fill="#ff5252" opacity="0.5"/>
      <circle cx="52" cy="32" r="4.5" fill="#e53935" opacity="0.5"/><circle cx="58" cy="26" r="3" fill="#ff5252" opacity="0.4"/>
      <circle cx="40" cy="20" r="6" fill="#c62828" opacity="0.6"/><circle cx="38" cy="40" r="3" fill="#ff8a80" opacity="0.3"/>
    </svg>`,
  },
  {
    id: "bomb",
    label: "Bomb",
    projectile: true,
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="bm1" cx="38%" cy="32%"><stop offset="0%" stop-color="#607d8b"/><stop offset="100%" stop-color="#263238"/></radialGradient></defs>
      <circle cx="30" cy="38" r="17" fill="url(#bm1)" stroke="#37474f" stroke-width="0.8"/>
      <ellipse cx="24" cy="32" rx="5" ry="4" fill="#78909c" opacity="0.3" transform="rotate(-20 24 32)"/>
      <rect x="28" y="17" width="4" height="9" rx="2" fill="#5d4037"/>
      <path d="M32 17c2-4 5-6 8-5" stroke="#ff9800" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <circle cx="41" cy="10" r="3" fill="#ff6d00" opacity="0.9"/>
      <circle cx="41" cy="10" r="1.8" fill="#ffd600"/>
      <circle cx="43" cy="8" r="1.2" fill="#fff8e1" opacity="0.7"/>
    </svg>`,
    impactSvg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="bi1"><stop offset="0%" stop-color="#fff" stop-opacity="0.9"/><stop offset="30%" stop-color="#ffd600" stop-opacity="0.8"/><stop offset="60%" stop-color="#ff6d00" stop-opacity="0.5"/><stop offset="100%" stop-color="#ff3d00" stop-opacity="0"/></radialGradient></defs>
      <circle cx="50" cy="50" r="45" fill="url(#bi1)"/>
      <polygon points="50,8 54,35 78,20 62,45 92,50 62,55 78,80 54,65 50,92 46,65 22,80 38,55 8,50 38,45 22,20 46,35" fill="#ff9800" opacity="0.5"/>
    </svg>`,
    shake: true,
  },
  {
    id: "lightning",
    label: "Lightning",
    projectile: true,
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="lt1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fff9c4"/><stop offset="50%" stop-color="#ffd600"/><stop offset="100%" stop-color="#f9a825"/></linearGradient></defs>
      <polygon points="37,3 17,29 27,29 21,61 47,25 35,25" fill="url(#lt1)" stroke="#f57f17" stroke-width="0.8" stroke-linejoin="round"/>
      <polygon points="34,12 24,29 29,29 25,46 40,25 34,25" fill="#fff8e1" opacity="0.5"/>
    </svg>`,
    impactSvg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="li1"><stop offset="0%" stop-color="#fff" stop-opacity="0.9"/><stop offset="50%" stop-color="#ffd600" stop-opacity="0.4"/><stop offset="100%" stop-color="#ffd600" stop-opacity="0"/></radialGradient></defs>
      <circle cx="40" cy="40" r="30" fill="url(#li1)"/>
      <path d="M40 12v8M40 60v8M12 40h8M60 40h8M19 19l6 6M55 55l6 6M55 19l-6 6M19 55l6 6" stroke="#ffd600" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
    </svg>`,
  },
  {
    id: "slap",
    label: "Slap",
    projectile: true,
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="sl1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffe0b2"/><stop offset="100%" stop-color="#ffab40"/></linearGradient></defs>
      <path d="M30 56c-10 0-15-5-15-12v-6l5-2v-7c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5v5h2v-12c0-2 1.5-3.5 3.5-3.5S36 18 36 20v12h2v-10c0-2 1.5-3.5 3.5-3.5S45 20 45 22v10h2v-7c0-2 1.5-3.5 3.5-3.5S54 20 54 22v12c0 12-7 22-24 22z" fill="url(#sl1)" stroke="#e65100" stroke-width="0.6"/>
      <path d="M23 38c0-1 1-2 2-2h4" stroke="#ffcc80" stroke-width="0.8" opacity="0.6" fill="none"/>
      <path d="M8 22l6 4M8 34l6-2M10 28h6" stroke="#ff5722" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
    </svg>`,
    impactSvg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="si1"><stop offset="0%" stop-color="#ff5722" stop-opacity="0.8"/><stop offset="100%" stop-color="#ff5722" stop-opacity="0"/></radialGradient></defs>
      <circle cx="40" cy="40" r="25" fill="url(#si1)"/>
      <path d="M20 20L30 30M60 20L50 30M20 60L30 50M60 60L50 50" stroke="#ff5722" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
      <text x="40" y="46" text-anchor="middle" font-size="20" font-weight="900" fill="#ff3d00" opacity="0.9">POW</text>
    </svg>`,
  },
  {
    id: "heart",
    label: "Heart",
    projectile: false,
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="ht1" cx="35%" cy="30%"><stop offset="0%" stop-color="#f48fb1"/><stop offset="100%" stop-color="#c2185b"/></radialGradient></defs>
      <path d="M32 54S10 40 10 26c0-7 5-12 12-12a12 12 0 0110 5 12 12 0 0110-5c7 0 12 5 12 12 0 14-22 28-22 28z" fill="url(#ht1)" stroke="#880e4f" stroke-width="0.5"/>
      <path d="M22 22c-3 0-6 2-6 6 0 2 1 5 4 8" stroke="#f8bbd0" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.7"/>
    </svg>`,
  },
  {
    id: "confetti",
    label: "Confetti",
    projectile: false,
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="cf1" x1="0" y1="0" x2="0.5" y2="1"><stop offset="0%" stop-color="#ffb300"/><stop offset="100%" stop-color="#ff6f00"/></linearGradient></defs>
      <path d="M16 56L24 20l5 3z" fill="url(#cf1)"/>
      <path d="M16 56L29 23l-1 5z" fill="#e65100" opacity="0.5"/>
      <circle cx="28" cy="16" r="2.5" fill="#e91e63"/><circle cx="36" cy="12" r="2" fill="#4caf50"/><circle cx="22" cy="10" r="2" fill="#2196f3"/>
      <rect x="32" y="17" width="3.5" height="3.5" rx="0.8" fill="#ffd600" transform="rotate(25 34 19)"/>
      <rect x="40" y="20" width="3" height="3" rx="0.8" fill="#e91e63" transform="rotate(-10 41 21)"/>
      <circle cx="44" cy="14" r="2" fill="#7c4dff"/><circle cx="18" cy="6" r="1.8" fill="#ff5722"/>
      <rect x="38" y="8" width="3" height="3" rx="0.8" fill="#00bcd4" transform="rotate(40 39 9)"/>
      <circle cx="48" cy="22" r="1.5" fill="#4caf50"/>
      <path d="M26 8c1-2 3-2 4 0" stroke="#e91e63" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    </svg>`,
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
        background: "linear-gradient(160deg, rgba(12,32,56,0.97), rgba(8,20,40,0.97))",
        border: "0.12cqw solid rgba(245,198,107,0.35)",
        borderRadius: "1.2cqw",
        padding: "1cqw",
        backdropFilter: "blur(10px)",
        boxShadow: "0 0.4cqw 2cqw rgba(0,0,0,0.6), inset 0 0.1cqw 0 rgba(255,255,255,0.05)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "0.6cqw",
        }}
      >
        {EMOTES.map((e) => (
          <button
            key={e.id}
            onClick={() => onPick(e)}
            title={e.label}
            style={{
              width: "5.5cqw",
              height: "5.5cqw",
              background: "rgba(255,255,255,0.06)",
              border: "0.08cqw solid rgba(255,255,255,0.1)",
              borderRadius: "0.8cqw",
              cursor: "pointer",
              padding: "0.6cqw",
              transition: "all 150ms",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(ev) => {
              ev.currentTarget.style.background = "rgba(245,198,107,0.2)";
              ev.currentTarget.style.borderColor = "rgba(245,198,107,0.4)";
              ev.currentTarget.style.transform = "scale(1.1)";
            }}
            onMouseLeave={(ev) => {
              ev.currentTarget.style.background = "rgba(255,255,255,0.06)";
              ev.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
              ev.currentTarget.style.transform = "scale(1)";
            }}
          >
            <div dangerouslySetInnerHTML={{ __html: e.svg }} style={{ width: "100%", height: "100%" }} />
          </button>
        ))}
      </div>
      <div style={{ marginTop: "0.5cqw", textAlign: "center" }}>
        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75cqw" }}>Tap to send</span>
      </div>
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
        background: "linear-gradient(160deg, rgba(12,32,56,0.97), rgba(8,20,40,0.97))",
        border: "0.12cqw solid rgba(245,198,107,0.35)",
        borderRadius: "1.2cqw",
        display: "flex",
        flexDirection: "column",
        backdropFilter: "blur(10px)",
        boxShadow: "0 0.4cqw 2cqw rgba(0,0,0,0.6), inset 0 0.1cqw 0 rgba(255,255,255,0.05)",
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

      {/* Chat button — transparent hit zone over painted art */}
      <div
        onClick={() => { setPanel(panel === "chat" ? "none" : "chat"); setPendingEmote(null); }}
        style={{
          position: "absolute",
          left: "89%",
          top: "66%",
          width: "7%",
          height: "10%",
          zIndex: 40,
          cursor: "pointer",
        }}
        title="Chat"
      >
        {panel === "chat" && (
          <div style={{
            position: "absolute",
            inset: "8%",
            borderRadius: "50%",
            background: "rgba(245,198,107,0.15)",
            boxShadow: "0 0 1cqw rgba(245,198,107,0.3)",
            pointerEvents: "none",
          }} />
        )}
      </div>

      {/* Emoji button — transparent hit zone over painted art */}
      <div
        onClick={() => { setPanel(panel === "emote" ? "none" : "emote"); setPendingEmote(null); }}
        style={{
          position: "absolute",
          left: "89%",
          top: "78%",
          width: "7%",
          height: "10%",
          zIndex: 40,
          cursor: "pointer",
        }}
        title="Emotes"
      >
        {panel === "emote" && (
          <div style={{
            position: "absolute",
            inset: "8%",
            borderRadius: "50%",
            background: "rgba(245,198,107,0.15)",
            boxShadow: "0 0 1cqw rgba(245,198,107,0.3)",
            pointerEvents: "none",
          }} />
        )}
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
