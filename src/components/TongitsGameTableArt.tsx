"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  useGameState,
  useMyHand,
  draw as cfDraw,
  takeDiscard as cfTakeDiscard,
  meld as cfMeld,
  sapawCard as cfSapawCard,
  discard as cfDiscard,
  callTongits as cfCallTongits,
  enforceTimeout as cfEnforceTimeout,
  cardLabel,
  isRedSuit,
  type Card as TCard,
} from "@/lib/tongits-game";
import { useTongitsWs } from "@/lib/tongits-ws";
import type { TongitsRoom as Room } from "@/lib/tongits";
import { useTongitsAssets } from "@/lib/tongitsAssets";

type Box = { l: number; t: number; w: number; h: number };

// Slot coordinates on the 1774x887 blank table base.
// Iterate these against the painted base if any drift shows up.
// Coordinates snapped to the placeholder-free base (public/tongits/table.png).
// Percent values measured with scripts/measure-table.cjs on the 1774x887 asset.
const S = {
  pot: { l: 42, t: 5, w: 16, h: 7 } as Box,
  trophy1: { l: 28, t: 5, w: 7, h: 14 } as Box,
  trophy2: { l: 65, t: 5, w: 7, h: 14 } as Box,

  opp1Avatar: { l: 7, t: 12, w: 5, h: 10 } as Box,
  opp1Name: { l: 13, t: 13, w: 14, h: 4 } as Box,
  opp1Cards: { l: 13, t: 17, w: 14, h: 3.5 } as Box,
  opp1MeldA: { l: 3, t: 25, w: 27, h: 10 } as Box,
  opp1MeldB: { l: 3, t: 36, w: 27, h: 10 } as Box,

  opp2Avatar: { l: 87.5, t: 12, w: 5, h: 10 } as Box,
  opp2Name: { l: 72, t: 13, w: 15, h: 4 } as Box,
  opp2Cards: { l: 72, t: 17, w: 15, h: 3.5 } as Box,
  opp2MeldA: { l: 70, t: 25, w: 27, h: 10 } as Box,
  opp2MeldB: { l: 70, t: 36, w: 27, h: 10 } as Box,

  stock: { l: 42, t: 21, w: 6, h: 18 } as Box,
  discard: { l: 52, t: 21, w: 6, h: 18 } as Box,
  turnBadge: { l: 60, t: 29, w: 10, h: 6 } as Box,
  timer: { l: 82, t: 44, w: 12, h: 5 } as Box,

  yourMelds: { l: 18, t: 47, w: 60, h: 8 } as Box,
  buttonsStrip: { l: 27, t: 53, w: 42 },

  youAvatar: { l: 6, t: 75, w: 5, h: 10 } as Box,
  youName: { l: 12, t: 77, w: 12, h: 4 } as Box,
  yourHand: { l: 11, t: 70, w: 78, h: 28 } as Box,

  autoSort: { l: 89, t: 38, w: 7, h: 9 } as Box,
  sort: { l: 89, t: 49, w: 7, h: 9 } as Box,
  chat: { l: 89, t: 60, w: 7, h: 9 } as Box,
  emoji: { l: 89, t: 71, w: 7, h: 9 } as Box,
};

// Pill hit-boxes as fractions of the buttons-strip PNG (2048x682).
// Values pixel-measured from the actual asset (opaque-column detection).
const PILL4 = {
  t: 0.346,
  h: 0.287,
  pills: [
    { l: 0.037, w: 0.229 },
    { l: 0.279, w: 0.224 },
    { l: 0.513, w: 0.222 },
    { l: 0.748, w: 0.218 },
  ],
};
const PILL5 = {
  t: 0.371,
  h: 0.233,
  pills: [
    { l: 0.015, w: 0.190 },
    { l: 0.219, w: 0.187 },
    { l: 0.421, w: 0.187 },
    { l: 0.620, w: 0.178 },
    { l: 0.808, w: 0.173 },
  ],
};
const STRIP_ASPECT = 2048 / 682;

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return (p.length === 1 ? p[0].slice(0, 2) : (p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

// Engine turn budget — mirror of functions/src/tongits-game.ts TURN_MS.
const TURN_MS = 25_000;

/** Loading screen shown while the base + button-strip PNGs stream in. */
function TableLoadingScreen() {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-[#0a1730] overflow-hidden">
      <style>{`
        @keyframes tongitsSpin { to { transform: rotate(360deg); } }
        @keyframes tongitsPulse { 0%,100% { opacity: 0.85; } 50% { opacity: 1; } }
      `}</style>
      <div className="flex flex-col items-center gap-6">
        <div style={{ position: "relative", width: "84px", height: "84px" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "6px solid rgba(245,198,107,0.15)",
              boxSizing: "border-box",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "6px solid transparent",
              borderTopColor: "#F5C66B",
              borderRightColor: "#F5C66B",
              animation: "tongitsSpin 1.1s cubic-bezier(0.7,0.2,0.3,1) infinite",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ animation: "tongitsPulse 1.6s ease-in-out infinite" }}>
          <div style={{ color: "#F5C66B", fontWeight: 800, fontSize: "16px", letterSpacing: "0.08em", textAlign: "center" }}>
            DEALING THE TABLE
          </div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "12px", marginTop: "4px", textAlign: "center" }}>
            Loading assets…
          </div>
        </div>
      </div>
    </div>
  );
}

/** SVG ring that counts down as the active player's clock runs out. Overlays the avatar circle. */
function TimerRing({ secondsLeft }: { secondsLeft: number }) {
  const fraction = Math.max(0, Math.min(1, (secondsLeft * 1000) / TURN_MS));
  const urgent = secondsLeft <= 5;
  const r = 46;
  const c = 2 * Math.PI * r;
  const color = urgent ? "#ef4444" : "#4bd47a";
  return (
    <>
      <svg
        viewBox="0 0 100 100"
        style={{
          position: "absolute",
          inset: "-14%",
          width: "128%",
          height: "128%",
          pointerEvents: "none",
          overflow: "visible",
        }}
      >
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(0,0,0,0.28)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dashoffset 400ms linear, stroke 200ms ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          bottom: "-30%",
          left: "50%",
          transform: "translateX(-50%)",
          background: urgent ? "linear-gradient(180deg,#ef4444,#a32020)" : "linear-gradient(180deg,#4bd47a,#2ea655)",
          color: "#fff",
          fontFamily: "monospace",
          fontSize: "0.9cqw",
          fontWeight: 800,
          padding: "0.15cqw 0.6cqw",
          borderRadius: "0.8cqw",
          boxShadow: "0 0.15cqw 0.35cqw rgba(0,0,0,0.4)",
          minWidth: "2.6cqw",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        {secondsLeft}s
      </div>
    </>
  );
}

// ---- meld helpers (mirror engine rules; Ace low-only, same-suit runs, sets) ----
const RANK_ORDER = "A23456789TJQK";
const SUIT_ORDER = "SHDC";
const rankIdx = (c: TCard) => RANK_ORDER.indexOf(c[0]);
const suitIdx = (c: TCard) => SUIT_ORDER.indexOf(c[1]);

/**
 * A hand cluster + its rendering kind.
 *   "meld"  — complete valid drop (3+ set or 3+ same-suit run). Own tray, green shelf.
 *   "loose" — every remaining card (pairs, partial runs, singletons) in ONE tray on the right.
 * Layout: melds first, biggest to smallest; then a single loose group.
 */
type HandGroup = { cards: TCard[]; kind: "meld" | "loose" };

function groupHand(hand: TCard[]): HandGroup[] {
  const remaining = new Set(hand);
  const melds: HandGroup[] = [];
  const takeMeld = (cs: TCard[]) => {
    const sorted = [...cs].sort((a, b) => rankIdx(a) - rankIdx(b) || suitIdx(a) - suitIdx(b));
    melds.push({ cards: sorted, kind: "meld" });
    for (const c of cs) remaining.delete(c);
  };
  const rem = () => [...remaining];

  // 1. Sets of 3+
  const byRank: Record<string, TCard[]> = {};
  for (const c of rem()) (byRank[c[0]] ||= []).push(c);
  for (const list of Object.values(byRank)) if (list.length >= 3) takeMeld(list);

  // 2. Runs of 3+ (same suit, consecutive rank)
  const bySuit: Record<string, TCard[]> = {};
  for (const c of rem()) (bySuit[c[1]] ||= []).push(c);
  for (const list of Object.values(bySuit)) {
    list.sort((a, b) => rankIdx(a) - rankIdx(b));
    let i = 0;
    while (i < list.length) {
      let j = i + 1;
      while (j < list.length && rankIdx(list[j]) === rankIdx(list[j - 1]) + 1) j++;
      if (j - i >= 3) takeMeld(list.slice(i, j));
      i = j;
    }
  }

  // Meld ordering: biggest first, tiebreak by lowest rank
  melds.sort((a, b) => b.cards.length - a.cards.length || rankIdx(a.cards[0]) - rankIdx(b.cards[0]));

  // Everything left goes into a single loose group, sorted by rank ASC then suit.
  // Rank-ASC ordering naturally packs pairs next to each other.
  const loose = rem().sort((a, b) => rankIdx(a) - rankIdx(b) || suitIdx(a) - suitIdx(b));
  const groups: HandGroup[] = [...melds];
  if (loose.length > 0) groups.push({ cards: loose, kind: "loose" });
  return groups;
}
function isSet(cards: TCard[]) {
  if (cards.length < 3 || cards.length > 4) return false;
  if (!cards.every((c) => c[0] === cards[0][0])) return false;
  return new Set(cards.map((c) => c[1])).size === cards.length;
}
function isRun(cards: TCard[]) {
  if (cards.length < 3) return false;
  if (!cards.every((c) => c[1] === cards[0][1])) return false;
  const idxs = cards.map((c) => RANK_ORDER.indexOf(c[0])).sort((a, b) => a - b);
  for (let i = 1; i < idxs.length; i++) if (idxs[i] !== idxs[i - 1] + 1) return false;
  return true;
}
function isValidMeld(cards: TCard[]) {
  return isSet(cards) || isRun(cards);
}
/**
 * Return two hand cards that, together with `top`, form a valid 3-card meld —
 * so PICK can be enabled automatically the moment such a combo exists in hand.
 * Returns null if no combo works.
 */
function findAutoPickWith(hand: TCard[], top: TCard): TCard[] | null {
  const topIdx = RANK_ORDER.indexOf(top[0]);

  // Set: need two more cards of the same rank as the top.
  const sameRank = hand.filter((c) => c[0] === top[0]);
  if (sameRank.length >= 2) return [sameRank[0], sameRank[1]];

  // Run: two same-suit cards whose ranks combine with top into a 3-run.
  // Three window configurations: [top-2, top-1, top], [top-1, top, top+1], [top, top+1, top+2].
  const sameSuit = hand.filter((c) => c[1] === top[1]);
  const findByIdx = (targetIdx: number) => sameSuit.find((c) => RANK_ORDER.indexOf(c[0]) === targetIdx);
  const windows: Array<[number, number]> = [
    [topIdx - 2, topIdx - 1],
    [topIdx - 1, topIdx + 1],
    [topIdx + 1, topIdx + 2],
  ];
  for (const [a, b] of windows) {
    if (a < 0 || b >= RANK_ORDER.length) continue;
    const c1 = findByIdx(a);
    const c2 = findByIdx(b);
    if (c1 && c2 && c1 !== c2) return [c1, c2];
  }
  return null;
}

function canSapawAny(card: TCard, allMelds: TCard[][]) {
  for (const m of allMelds) {
    // set: same rank as the meld
    if (m.every((c) => c[0] === m[0][0]) && card[0] === m[0][0]) return true;
    // run: same suit, extends either end
    if (m.length >= 3 && m.every((c) => c[1] === m[0][1]) && card[1] === m[0][1]) {
      const idxs = m.map((c) => RANK_ORDER.indexOf(c[0])).sort((a, b) => a - b);
      const cIdx = RANK_ORDER.indexOf(card[0]);
      if (cIdx === idxs[0] - 1 || cIdx === idxs[idxs.length - 1] + 1) return true;
    }
  }
  return false;
}

function canSapawMeld(card: TCard, meld: TCard[]) {
  if (meld.every((c) => c[0] === meld[0][0]) && card[0] === meld[0][0]) return true;
  if (meld.length >= 3 && meld.every((c) => c[1] === meld[0][1]) && card[1] === meld[0][1]) {
    const idxs = meld.map((c) => RANK_ORDER.indexOf(c[0])).sort((a, b) => a - b);
    const cIdx = RANK_ORDER.indexOf(card[0]);
    if (cIdx === idxs[0] - 1 || cIdx === idxs[idxs.length - 1] + 1) return true;
  }
  return false;
}

// ---- primitives ----
function Zone({
  box,
  children,
  onClick,
  style,
  title,
  disabled,
}: {
  box: Box;
  children?: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <div
      title={title}
      onClick={disabled ? undefined : onClick}
      style={{
        position: "absolute",
        left: `${box.l}%`,
        top: `${box.t}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: onClick && !disabled ? "pointer" : "default",
        opacity: disabled ? 0.35 : 1,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SmallCard({ card, faceDown }: { card?: TCard; faceDown?: boolean }) {
  if (faceDown) {
    return (
      <div
        style={{
          width: "2.4cqw",
          height: "3.4cqw",
          borderRadius: "0.4cqw",
          background: "linear-gradient(135deg,#1c3568,#0e1e42)",
          border: "0.15cqw solid rgba(245,198,107,0.65)",
        }}
      />
    );
  }
  if (!card) return null;
  const red = isRedSuit(card);
  return (
    <div
      style={{
        width: "2.4cqw",
        height: "3.4cqw",
        borderRadius: "0.4cqw",
        background: "#fff",
        color: red ? "#d33" : "#111",
        border: "0.1cqw solid #d9d9d9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: "1.05cqw",
        fontFamily: "system-ui",
        boxShadow: "0 0.1cqw 0.25cqw rgba(0,0,0,0.35)",
      }}
    >
      {cardLabel(card)}
    </div>
  );
}

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANK_LABEL: Record<string, string> = { A: "A", T: "10", J: "J", Q: "Q", K: "K" };
const rankChar = (c: TCard) => RANK_LABEL[c[0]] ?? c[0];

function BigCard({ card, faceDown, selected, onClick }: { card?: TCard; faceDown?: boolean; selected?: boolean; onClick?: () => void }) {
  if (faceDown) {
    return (
      <div
        style={{
          width: "5.6cqw",
          height: "7.8cqw",
          borderRadius: "0.7cqw",
          background: "linear-gradient(135deg,#1c3568,#0e1e42)",
          border: "0.2cqw solid rgba(245,198,107,0.7)",
          boxShadow: "0 0.3cqw 0.6cqw rgba(0,0,0,0.4)",
        }}
      />
    );
  }
  if (!card) return null;
  const red = isRedSuit(card);
  const color = red ? "#d1341c" : "#101423";
  const isFace = card[0] === "J" || card[0] === "Q" || card[0] === "K";
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative",
        width: "5.6cqw",
        height: "7.8cqw",
        borderRadius: "0.7cqw",
        background: "#fff",
        color,
        border: selected ? "0.25cqw solid #F5C66B" : "0.1cqw solid #d9d9d9",
        transform: selected ? "translateY(-1.4cqw)" : "none",
        boxShadow: selected ? "0 0.5cqw 1cqw rgba(245,198,107,0.55)" : "0 0.3cqw 0.55cqw rgba(0,0,0,0.32)",
        transition: "transform 120ms ease, box-shadow 120ms ease",
        cursor: onClick ? "pointer" : "default",
        padding: 0,
        overflow: "hidden",
        fontFamily: "system-ui",
      }}
    >
      {/* top-left corner: rank over suit */}
      <div
        style={{
          position: "absolute",
          left: "0.35cqw",
          top: "0.25cqw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          lineHeight: 1,
        }}
      >
        <span style={{ fontWeight: 900, fontSize: "1.7cqw" }}>{rankChar(card)}</span>
        <span style={{ fontWeight: 900, fontSize: "1.5cqw", marginTop: "0.1cqw" }}>{SUIT_GLYPH[card[1]]}</span>
      </div>
      {/* center glyph (face cards get letter; number cards get big pip) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 900,
          fontSize: isFace ? "3.4cqw" : "3.2cqw",
          opacity: 0.92,
          letterSpacing: isFace ? "0.02em" : 0,
        }}
      >
        {isFace ? card[0] : SUIT_GLYPH[card[1]]}
      </div>
      {/* bottom-right corner: mirrored */}
      <div
        style={{
          position: "absolute",
          right: "0.35cqw",
          bottom: "0.25cqw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          lineHeight: 1,
          transform: "rotate(180deg)",
        }}
      >
        <span style={{ fontWeight: 900, fontSize: "1.7cqw" }}>{rankChar(card)}</span>
        <span style={{ fontWeight: 900, fontSize: "1.5cqw", marginTop: "0.1cqw" }}>{SUIT_GLYPH[card[1]]}</span>
      </div>
    </button>
  );
}

function MeldRow({ melds, onPick, sapawCard, isSapawed }: { melds: TCard[][]; onPick?: (i: number) => void; sapawCard?: TCard; isSapawed?: boolean }) {
  if (!melds || melds.length === 0)
    return <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.9cqw" }}>—</span>;
  return (
    <div style={{ display: "flex", gap: "0.6cqw", flexWrap: "wrap", justifyContent: "center", alignItems: "center", height: "100%" }}>
      {melds.map((m, i) => {
        const isTarget = !!(onPick && sapawCard && canSapawMeld(sapawCard, m));
        return (
          <div key={i} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
            {isTarget && (
              <div style={{
                color: "#F5C66B",
                fontSize: "1.2cqw",
                lineHeight: 1,
                marginBottom: "-0.15cqw",
                textShadow: "0 0 0.4cqw rgba(245,198,107,0.8)",
                animation: "sapawArrowBounce 0.8s ease-in-out infinite",
                pointerEvents: "none",
              }}>▼</div>
            )}
            <button
              onClick={isTarget ? () => onPick!(i) : undefined}
              disabled={!isTarget}
              style={{
                display: "flex",
                gap: "0.15cqw",
                padding: "0.2cqw",
                borderRadius: "0.4cqw",
                background: isTarget ? "rgba(245,198,107,0.18)" : "transparent",
                border: isTarget ? "0.12cqw solid rgba(245,198,107,0.75)" : "none",
                cursor: isTarget ? "pointer" : "default",
              }}
            >
              {m.map((c) => (
                <SmallCard key={c} card={c} />
              ))}
            </button>
            {isSapawed && (
              <div style={{
                position: "absolute",
                bottom: "-1cqw",
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(220,50,50,0.85)",
                color: "#fff",
                fontSize: "0.55cqw",
                fontWeight: 800,
                padding: "0.1cqw 0.35cqw",
                borderRadius: "0.25cqw",
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}>🚫</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- main ----
export function TongitsGameTableArt({ code, room, spectating }: { code: string; room: Room; spectating?: boolean }) {
  const { user } = useAuth();
  const uid_ = user?.uid ?? null;

  // Firestore listeners (fallback)
  const fsGs = useGameState(code);
  const fsHand = useMyHand(code, uid_);

  // WebSocket (primary when connected)
  const ws = useTongitsWs(code, uid_, (msg) => setError(msg));
  const useWs = ws.connected;

  // Prefer WS state when connected; fall back to Firestore
  const gs = (useWs && ws.gs) || fsGs;
  const myHand = useWs ? ws.hand : fsHand;

  // Action dispatchers: WS when connected, Cloud Functions otherwise
  const draw = useWs ? ws.draw : (async () => { await cfDraw(code); });
  const takeDiscard = useWs ? ws.takeDiscard : (async (mc: TCard[]) => { await cfTakeDiscard(code, mc); });
  const meld_ = useWs ? ws.meld : (async (cs: TCard[]) => { await cfMeld(code, cs); });
  const sapawCard_ = useWs
    ? (async (tu: string, mi: number, c: TCard) => { await ws.sapaw(tu, mi, c); })
    : (async (tu: string, mi: number, c: TCard) => { await cfSapawCard(code, tu, mi, c); });
  const discard_ = useWs ? ws.discard : (async (c: TCard) => { await cfDiscard(code, c); });
  const callTongits_ = useWs ? ws.call : (async () => { await cfCallTongits(code); });
  const enforceTimeout_ = useWs ? ws.enforceTimeout : (async () => { await cfEnforceTimeout(code); });

  const assets = useTongitsAssets();

  // Streak-leader lookup for the trophy slots.
  const winStreak = room.winStreak ?? 0;
  const lastWinnerUid = room.lastWinnerUid ?? null;
  const streakLeaderName =
    (lastWinnerUid &&
      (gs?.seats.find((s) => s.uid === lastWinnerUid)?.name ??
        room.players?.[lastWinnerUid]?.name)) ||
    "";

  const [selected, setSelected] = useState<TCard[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(Date.now());
  const [assetsReady, setAssetsReady] = useState(false);
  // Optimistic: cards the user just committed to a move — hide them immediately
  // so the hand feels responsive; drop them from this shadow as soon as the
  // authoritative snapshot reflects the change (or roll back on failure).
  const [pendingRemoved, setPendingRemoved] = useState<TCard[]>([]);
  const enforcedFor = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-dismiss the error toast so a stale hint never lingers after the state moves on.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(t);
  }, [error]);

  // Preload the critical PNGs so the bare skeleton never flashes before the paint lands.
  useEffect(() => {
    const urls = [assets.table, assets.actionButtons4, assets.actionButtons5];
    let cancelled = false;
    Promise.all(
      urls.map(
        (url) =>
          new Promise<void>((resolve) => {
            const img = new window.Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = url;
          })
      )
    ).then(() => {
      if (!cancelled) setAssetsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [assets.table, assets.actionButtons4, assets.actionButtons5]);

  useEffect(() => {
    if (!gs || gs.status !== "in_game") return;
    if (tick > gs.turnDeadline + 1500 && enforcedFor.current !== gs.turnDeadline) {
      enforcedFor.current = gs.turnDeadline;
      enforceTimeout_().catch(() => {});
    }
  }, [tick, gs, code]);

  useEffect(() => {
    setSelected((sel) => sel.filter((c) => myHand.includes(c)));
    // Once the snapshot no longer contains an optimistically-removed card, we
    // can retire that entry — the server confirmed the move.
    setPendingRemoved((prev) => prev.filter((c) => myHand.includes(c)));
  }, [myHand]);

  if (!gs || !assetsReady) {
    return <TableLoadingScreen />;
  }

  const uid = user?.uid ?? "";
  const isMyTurn = gs.turnUid === uid;
  const secondsLeft = Math.max(0, Math.ceil((gs.turnDeadline - tick) / 1000));
  const discardTop = gs.discard[gs.discard.length - 1];
  const others = gs.seats.filter((s) => s.uid !== uid);
  const opp1 = others[0];
  const opp2 = others[1];
  const me = gs.seats.find((s) => s.uid === uid);
  const iHaveMeld = (gs.melds[uid]?.length ?? 0) > 0;

  const allExposedMelds: TCard[][] = [];
  for (const list of Object.values(gs.melds)) for (const m of list) allExposedMelds.push(m);

  // legal-state flags
  const canDrop = isMyTurn && gs.phase === "discard" && selected.length >= 3 && isValidMeld(selected);
  const canFight = isMyTurn && gs.phase === "discard" && iHaveMeld && !gs.cantFight?.[uid];
  const canUngroup = selected.length > 0;
  const canDump = isMyTurn && gs.phase === "discard" && selected.length === 1;
  const sapawEligible =
    isMyTurn && gs.phase === "discard" && selected.length === 1 && canSapawAny(selected[0], allExposedMelds);
  // show 5-pill strip whenever sapaw could possibly be used (any single card in hand can extend)
  const anySapawPossible = isMyTurn && gs.phase === "discard" && myHand.some((c) => canSapawAny(c, allExposedMelds));

  const canDraw = isMyTurn && gs.phase === "draw" && gs.stockCount > 0;
  // Auto-detect a valid pick: any two cards in hand that would form a set or
  // run WITH the top discard. Enables PICK without the user having to select
  // the meld cards first; on click we auto-select them and take the discard.
  const autoPickCards: TCard[] | null = discardTop ? findAutoPickWith(myHand, discardTop) : null;
  const userSelectedPick = !!discardTop && selected.length >= 2 && isValidMeld([...selected, discardTop]);
  const canPick = isMyTurn && gs.phase === "draw" && !!discardTop && (userSelectedPick || !!autoPickCards);
  const pickCards: TCard[] = userSelectedPick ? selected : (autoPickCards ?? []);

  function toggle(card: TCard) {
    setError(null);
    setSelected((sel) => (sel.includes(card) ? sel.filter((c) => c !== card) : [...sel, card]));
  }
  function toggleGroup(cards: TCard[]) {
    setError(null);
    setSelected((sel) => {
      const allSelected = cards.every((c) => sel.includes(c));
      if (allSelected) return sel.filter((c) => !cards.includes(c));
      return [...sel.filter((c) => !cards.includes(c)), ...cards];
    });
  }
  async function act(key: string, fn: () => Promise<unknown>, optimistic?: { hideCards?: TCard[] }) {
    setError(null);
    setBusy(key);
    const shadow = optimistic?.hideCards ?? [];
    if (shadow.length) setPendingRemoved((prev) => [...prev, ...shadow]);
    try {
      await fn();
      setSelected([]);
    } catch (e) {
      // Roll back the optimistic hide so the cards reappear in the hand.
      if (shadow.length) setPendingRemoved((prev) => prev.filter((c) => !shadow.includes(c)));
      const raw = e instanceof Error ? e.message : "";
      const stripped = raw.replace(/^.*\/ /, "");
      const code = stripped.toUpperCase();
      const friendly =
        code === "INTERNAL" || code === "UNKNOWN"
          ? "Something went wrong on the server. Please try again."
          : code === "UNAUTHENTICATED"
            ? "Please sign in again to continue."
            : code === "DEADLINE_EXCEEDED" || code === "DEADLINE-EXCEEDED"
              ? "That took too long — check your connection and try again."
              : stripped || "Move failed";
      setError(friendly);
    } finally {
      setBusy(null);
    }
  }
  async function onSapawPick(targetUid: string, meldIndex: number) {
    if (selected.length !== 1) return;
    await act("sapaw", () => sapawCard_(targetUid, meldIndex, selected[0]), { hideCards: [selected[0]] });
  }

  // Pill row swaps its 4th button based on phase:
  //   - draw phase:    DROP, FIGHT, UNGROUP, DRAW, [PICK]
  //   - discard phase: DROP, FIGHT, UNGROUP, DUMP, [SAPAW]
  const inDrawPhase = isMyTurn && gs.phase === "draw";
  const showPick = inDrawPhase && !!discardTop;
  const showFivePill = anySapawPossible || showPick;
  const strip = showFivePill ? assets.actionButtons5 : assets.actionButtons4;
  const stripCfg = showFivePill ? PILL5 : PILL4;
  // Explain why DROP is grayed out (fires on click of the disabled pill).
  const dropDisabledHint = !isMyTurn
    ? "Wait for your turn to drop a meld."
    : inDrawPhase && selected.length >= 3 && isValidMeld(selected)
      ? "Draw a card first (tap DRAW or the deck), then drop your meld."
      : selected.length > 0 && selected.length < 3
        ? "Melds need at least 3 cards."
        : selected.length >= 3 && !isValidMeld(selected)
          ? "That group isn't a valid meld (3+ same rank, or 3+ same-suit run)."
          : "Select a valid meld from your hand first.";
  const pickDisabledHint = !isMyTurn
    ? "Wait for your turn to pick the discard."
    : !discardTop
      ? "The discard pile is empty."
      : selected.length < 2
        ? "Select 2+ cards that form a valid meld with the top discard."
        : !isValidMeld([...selected, discardTop])
          ? "Those cards + the top discard aren't a valid meld."
          : undefined;
  const pillActions: Array<{
    label: string;
    enabled: boolean;
    busyKey: string;
    onClick: () => void;
    disabledHint: string | undefined;
  }> = [
    {
      label: "DROP",
      enabled: canDrop,
      busyKey: "drop",
      onClick: () => act("drop", () => meld_(selected), { hideCards: selected }),
      disabledHint: dropDisabledHint,
    },
    {
      label: "FIGHT",
      enabled: canFight,
      busyKey: "fight",
      onClick: () => act("fight", () => callTongits_()),
      disabledHint: !isMyTurn
        ? "Wait for your turn."
        : inDrawPhase
          ? "You can only fight during the discard phase."
          : !iHaveMeld
            ? "You need an exposed meld before you can fight."
            : gs.cantFight?.[uid]
              ? "You can't fight — your meld was sapawed this turn."
              : undefined,
    },
    {
      label: "UNGROUP",
      enabled: canUngroup,
      busyKey: "ungroup",
      onClick: () => setSelected([]),
      disabledHint: "Select some cards first.",
    },
    inDrawPhase
      ? { label: "DRAW", enabled: canDraw, busyKey: "draw", onClick: () => act("draw", () => draw()), disabledHint: !gs.stockCount ? "Stock is empty." : undefined }
      : { label: "DUMP", enabled: canDump, busyKey: "dump", onClick: () => act("dump", () => discard_(selected[0]), { hideCards: [selected[0]] }), disabledHint: !isMyTurn ? "Wait for your turn." : selected.length !== 1 ? "Select exactly one card to dump." : undefined },
  ];
  if (showPick) {
    pillActions.push({
      label: "PICK",
      enabled: canPick,
      busyKey: "pick",
      onClick: () => {
        // Show the user which cards we're picking with, then send the move.
        if (!userSelectedPick) setSelected(pickCards);
        return act(
          "pick",
          () => takeDiscard([...pickCards, discardTop]),
          { hideCards: pickCards }
        );
      },
      disabledHint: pickDisabledHint,
    });
  } else if (anySapawPossible) {
    pillActions.push({
      label: "SAPAW",
      enabled: sapawEligible,
      busyKey: "sapaw-hint",
      onClick: () => setError("Tap an exposed meld to sapaw onto it."),
      disabledHint: selected.length !== 1 ? "Select one card to sapaw." : undefined,
    });
  }

  return (
    <div className="min-h-[100dvh] w-full flex items-start justify-center overflow-hidden" style={{ background: "#1a0e07" }}>
      <div
        className="relative"
        style={{ width: "min(100vw, calc(100dvh * 1774 / 887))", aspectRatio: "1774 / 887", containerType: "inline-size" }}
      >
        {/* base */}
        <img src={assets.table} alt="Tongits table" className="absolute inset-0 w-full h-full object-contain" />
        <style>{`
          @keyframes sapawArrowBounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(0.2cqw); }
          }
        `}</style>

        {error && (
          <div
            className="absolute left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-white z-30 text-center"
            style={{ top: "12%", background: "rgba(200,40,40,0.9)", fontSize: "1.1cqw", maxWidth: "60%" }}
          >
            {error}
          </div>
        )}

        {/* POT */}
        <Zone box={S.pot}>
          <span style={{ color: "#F5C66B", fontWeight: 800, fontSize: "1.6cqw", fontFamily: "monospace" }}>
            {gs.jackpotPoints.toLocaleString()}
          </span>
        </Zone>

        {/* Streak trophies — filled with the streak-leader's initials as they stack. */}
        {[
          { box: S.trophy1, filled: winStreak >= 1 },
          { box: S.trophy2, filled: winStreak >= 2 },
        ].map((slot, i) => (
          <Zone key={i} box={slot.box}>
            <div
              style={{
                height: "88%",
                aspectRatio: "1",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: "1.8cqw",
                fontFamily: "system-ui",
                color: slot.filled ? "#141c2f" : "transparent",
                background: slot.filled ? "linear-gradient(180deg,#F5C66B,#c99534)" : "transparent",
                boxShadow: slot.filled ? "0 0 1.4cqw rgba(245,198,107,0.75)" : "none",
                border: slot.filled ? "0.15cqw solid #7a5216" : "none",
                transition: "background 220ms ease, box-shadow 220ms ease",
              }}
            >
              {slot.filled && streakLeaderName ? initials(streakLeaderName) : ""}
            </div>
          </Zone>
        ))}

        {/* opponent 1 (left) */}
        {opp1 && (
          <>
            <Zone box={S.opp1Avatar}>
              {gs.turnUid === opp1.uid && <TimerRing secondsLeft={secondsLeft} />}
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  color: "#141c2f",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: "2cqw",
                  fontFamily: "system-ui",
                }}
              >
                {initials(opp1.name)}
              </div>
            </Zone>
            <Zone box={S.opp1Name}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: "1.15cqw" }} className="truncate">
                {opp1.name}
              </span>
            </Zone>
            <Zone box={S.opp1Cards}>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.9cqw", fontFamily: "monospace" }}>
                {gs.handCounts[opp1.uid] ?? 0} cards
              </span>
            </Zone>
            <Zone box={S.opp1MeldA}>
              <MeldRow
                melds={(gs.melds[opp1.uid] ?? []).slice(0, 2)}
                onPick={sapawEligible ? (i) => onSapawPick(opp1.uid, i) : undefined}
                sapawCard={sapawEligible ? selected[0] : undefined}
                isSapawed={!!gs.cantFight?.[opp1.uid]}
              />
            </Zone>
            <Zone box={S.opp1MeldB}>
              <MeldRow
                melds={(gs.melds[opp1.uid] ?? []).slice(2)}
                onPick={sapawEligible ? (i) => onSapawPick(opp1.uid, i + 2) : undefined}
                sapawCard={sapawEligible ? selected[0] : undefined}
                isSapawed={!!gs.cantFight?.[opp1.uid]}
              />
            </Zone>
          </>
        )}

        {/* opponent 2 (right) */}
        {opp2 && (
          <>
            <Zone box={S.opp2Avatar}>
              {gs.turnUid === opp2.uid && <TimerRing secondsLeft={secondsLeft} />}
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  color: "#141c2f",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: "2cqw",
                  fontFamily: "system-ui",
                }}
              >
                {initials(opp2.name)}
              </div>
            </Zone>
            <Zone box={S.opp2Name}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: "1.15cqw" }} className="truncate">
                {opp2.name}
              </span>
            </Zone>
            <Zone box={S.opp2Cards}>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.9cqw", fontFamily: "monospace" }}>
                {gs.handCounts[opp2.uid] ?? 0} cards
              </span>
            </Zone>
            <Zone box={S.opp2MeldA}>
              <MeldRow
                melds={(gs.melds[opp2.uid] ?? []).slice(0, 2)}
                onPick={sapawEligible ? (i) => onSapawPick(opp2.uid, i) : undefined}
                sapawCard={sapawEligible ? selected[0] : undefined}
                isSapawed={!!gs.cantFight?.[opp2.uid]}
              />
            </Zone>
            <Zone box={S.opp2MeldB}>
              <MeldRow
                melds={(gs.melds[opp2.uid] ?? []).slice(2)}
                onPick={sapawEligible ? (i) => onSapawPick(opp2.uid, i + 2) : undefined}
                sapawCard={sapawEligible ? selected[0] : undefined}
                isSapawed={!!gs.cantFight?.[opp2.uid]}
              />
            </Zone>
          </>
        )}

        {/* STOCK (draw) — card scaled to fill the tall placeholder box */}
        <Zone
          box={S.stock}
          onClick={canDraw ? () => act("draw", () => draw()) : undefined}
          disabled={!canDraw}
          title="Draw from stock"
        >
          <style>{`
            @keyframes tongitsPull {
              0%, 100% { transform: scale(1.5); }
              50% { transform: scale(1.58); filter: drop-shadow(0 0 0.8cqw rgba(245,198,107,0.65)); }
            }
          `}</style>
          <div
            style={{
              position: "relative",
              transform: "scale(1.5)",
              transformOrigin: "center",
              animation: canDraw ? "tongitsPull 1.4s ease-in-out infinite" : undefined,
            }}
          >
            <BigCard faceDown />
            <span
              style={{
                position: "absolute",
                bottom: "-0.6cqw",
                right: "-0.6cqw",
                background: "rgba(0,0,0,0.75)",
                color: "#fff",
                fontFamily: "monospace",
                fontSize: "0.6cqw",
                padding: "0.1cqw 0.4cqw",
                borderRadius: "0.3cqw",
              }}
            >
              {gs.stockCount}
            </span>
          </div>
        </Zone>

        {/* DISCARD (pick) — card scaled to match stock */}
        <Zone
          box={S.discard}
          onClick={canPick ? () => act("pick", () => takeDiscard([...selected, discardTop])) : undefined}
          disabled={!canPick && !discardTop}
          title="Pick the discard"
        >
          <div style={{ transform: "scale(1.5)", transformOrigin: "center" }}>
            {discardTop ? (
              <BigCard card={discardTop} />
            ) : (
              <div
                style={{
                  width: "5.6cqw",
                  height: "7.8cqw",
                  borderRadius: "0.7cqw",
                  border: "0.15cqw dashed rgba(255,255,255,0.25)",
                }}
              />
            )}
          </div>
        </Zone>

        {/* YOUR TURN badge */}
        {isMyTurn && (
          <Zone box={S.turnBadge}>
            <div
              style={{
                padding: "0.4cqw 0.9cqw",
                borderRadius: "0.7cqw",
                background: "linear-gradient(180deg,#F5C66B,#c99534)",
                color: "#141c2f",
                fontWeight: 800,
                fontSize: "1cqw",
                textAlign: "center",
                lineHeight: 1.1,
              }}
            >
              YOUR
              <br />
              TURN
            </div>
          </Zone>
        )}

        {/* Timer moved onto the active avatar (see TimerRing above). Corner badge retired. */}

        {/* your melds */}
        <Zone box={S.yourMelds}>
          <MeldRow
            melds={gs.melds[uid] ?? []}
            onPick={sapawEligible ? (i) => onSapawPick(uid, i) : undefined}
            sapawCard={sapawEligible ? selected[0] : undefined}
            isSapawed={!!gs.cantFight?.[uid]}
          />
        </Zone>

        {/* action button strip — container aspect matches the PNG so pill hitboxes align */}
        {!spectating && <div
          style={{
            position: "absolute",
            left: `${S.buttonsStrip.l}%`,
            top: `${S.buttonsStrip.t}%`,
            width: `${S.buttonsStrip.w}%`,
            aspectRatio: `${STRIP_ASPECT}`,
          }}
        >
          <img src={strip} alt="" style={{ width: "100%", height: "100%", display: "block" }} />
          {stripCfg.pills.map((p, i) => {
            const a = pillActions[i];
            const isBusy = busy === a.busyKey;
            const clickable = (a.enabled && !isBusy) || (!a.enabled && a.disabledHint);
            return (
              <button
                key={a.label}
                onClick={
                  a.enabled && !isBusy
                    ? a.onClick
                    : !a.enabled && a.disabledHint
                      ? () => setError(a.disabledHint!)
                      : undefined
                }
                disabled={isBusy}
                style={{
                  position: "absolute",
                  left: `${p.l * 100}%`,
                  top: `${stripCfg.t * 100}%`,
                  width: `${p.w * 100}%`,
                  height: `${stripCfg.h * 100}%`,
                  background: "transparent",
                  border: "none",
                  cursor: clickable ? "pointer" : "not-allowed",
                  opacity: a.enabled ? 1 : 0.4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: "1.5cqw",
                  fontFamily: "system-ui",
                  letterSpacing: "0.05em",
                  textShadow: "0 0.15cqw 0.3cqw rgba(0,0,0,0.55)",
                  padding: 0,
                }}
              >
                {isBusy ? <Loader2 className="animate-spin" style={{ width: "1.3cqw", height: "1.3cqw" }} /> : a.label}
                {a.label === "FIGHT" && gs.cantFight?.[uid] && (
                  <span style={{ position: "absolute", top: "-0.3cqw", right: "0", fontSize: "1.5cqw", filter: "drop-shadow(0 0.1cqw 0.2cqw rgba(0,0,0,0.6))" }}>🚫</span>
                )}
              </button>
            );
          })}
        </div>}

        {/* YOU */}
        <Zone box={S.youAvatar}>
          {isMyTurn && <TimerRing secondsLeft={secondsLeft} />}
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              color: "#141c2f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: "2cqw",
              fontFamily: "system-ui",
            }}
          >
            {initials(me?.name ?? "You")}
          </div>
        </Zone>
        <Zone box={S.youName}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: "1.15cqw" }}>{me?.name ?? "You"}</span>
        </Zone>

        {/* your hand — auto-grouped meld clusters, each sitting on a tray */}
        <div
          style={{
            position: "absolute",
            left: `${S.yourHand.l}%`,
            top: `${S.yourHand.t}%`,
            width: `${S.yourHand.w}%`,
            height: `${S.yourHand.h}%`,
            display: spectating ? "none" : "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: "1.5cqw",
            padding: "0.4cqw",
          }}
        >
          {groupHand(myHand.filter((c) => !pendingRemoved.includes(c))).map((group, gi) => {
            const isMeld = group.kind === "meld";
            const isActive = group.cards.some((c) => selected.includes(c));
            return (
              <div
                key={`${gi}-${group.cards.join(",")}`}
                style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
              >
                {/* tray — melds overlap tight, loose group lays cards flat with small gap */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    padding: "0.55cqw 0.7cqw 0.4cqw",
                    borderRadius: "0.9cqw",
                    background: isActive
                      ? "linear-gradient(180deg,#c9e5ff,#9ecdf5)"
                      : "linear-gradient(180deg,#f6f1e4,#e6dcc4)",
                    boxShadow: "0 0.35cqw 0.7cqw rgba(0,0,0,0.35), inset 0 0.1cqw 0 rgba(255,255,255,0.7)",
                    border: isActive ? "0.15cqw solid #3aa0ff" : "0.1cqw solid rgba(0,0,0,0.15)",
                    gap: 0,
                  }}
                >
                  {group.cards.map((c, ci) => {
                    const showSapawHint = !isMeld && isMyTurn && gs.phase === "discard" && !selected.includes(c) && canSapawAny(c, allExposedMelds);
                    return (
                      <div
                        key={c}
                        style={{
                          marginLeft: ci !== 0 ? "-2.9cqw" : 0,
                          zIndex: ci,
                          position: "relative",
                        }}
                      >
                        <BigCard card={c} selected={selected.includes(c)} onClick={() => isMeld ? toggleGroup(group.cards) : toggle(c)} />
                        {showSapawHint && (
                          <div style={{
                            position: "absolute",
                            top: "-0.7cqw",
                            left: "0.4cqw",
                            color: "#F5C66B",
                            fontSize: "0.8cqw",
                            lineHeight: 1,
                            textShadow: "0 0 0.4cqw rgba(245,198,107,0.8)",
                            animation: "sapawArrowBounce 0.8s ease-in-out infinite",
                            pointerEvents: "none",
                            zIndex: 1,
                          }}>▲</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* green shelf only for complete valid melds */}
                {isMeld && (
                  <div
                    style={{
                      marginTop: "-0.15cqw",
                      width: "88%",
                      height: "0.7cqw",
                      borderRadius: "0 0 0.6cqw 0.6cqw",
                      background: "linear-gradient(180deg,#4bd47a,#2ea655)",
                      boxShadow: "0 0.25cqw 0.4cqw rgba(0,0,0,0.35)",
                    }}
                  />
                )}
                {/* selected ribbon */}
                {isActive && (
                  <div
                    style={{
                      marginTop: isMeld ? "0.15cqw" : "0.25cqw",
                      padding: "0.15cqw 0.7cqw",
                      borderRadius: "0.3cqw",
                      background: "#F5C66B",
                      color: "#141c2f",
                      fontWeight: 800,
                      fontSize: "0.85cqw",
                      letterSpacing: "0.06em",
                      boxShadow: "0 0.15cqw 0.3cqw rgba(0,0,0,0.35)",
                    }}
                  >
                    SELECTED
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
