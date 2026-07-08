"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  useGameState,
  useMyHand,
  draw,
  takeDiscard,
  meld,
  sapawCard,
  discard,
  callTongits,
  enforceTimeout,
  cardLabel,
  isRedSuit,
  type Card as TCard,
} from "@/lib/tongits-game";
import type { TongitsRoom as Room } from "@/lib/tongits";
import { useTongitsAssets } from "@/lib/tongitsAssets";

type Box = { l: number; t: number; w: number; h: number };

// Slot coordinates on the 1672x941 blank table base.
// Iterate these against the painted base if any drift shows up.
const S = {
  pot: { l: 40, t: 4.5, w: 22, h: 5.5 } as Box,
  // Streak trophies flank the POT: filled with the streak-leader's initials when winStreak >= 1/2.
  trophy1: { l: 25.2, t: 2, w: 7.5, h: 12 } as Box,
  trophy2: { l: 67.3, t: 2, w: 7.5, h: 12 } as Box,

  opp1Avatar: { l: 7, t: 9, w: 8.5, h: 15 } as Box,
  opp1Name: { l: 16, t: 15, w: 14, h: 5 } as Box,
  opp1Cards: { l: 16, t: 19, w: 14, h: 3.5 } as Box,
  opp1MeldA: { l: 6, t: 22, w: 26, h: 11 } as Box,
  opp1MeldB: { l: 6, t: 34, w: 26, h: 11 } as Box,

  opp2Avatar: { l: 84.5, t: 9, w: 8.5, h: 15 } as Box,
  opp2Name: { l: 70, t: 15, w: 14, h: 5 } as Box,
  opp2Cards: { l: 70, t: 19, w: 14, h: 3.5 } as Box,
  opp2MeldA: { l: 68, t: 22, w: 26, h: 11 } as Box,
  opp2MeldB: { l: 68, t: 34, w: 26, h: 11 } as Box,

  stock: { l: 40, t: 18, w: 9, h: 22 } as Box,
  discard: { l: 51, t: 18, w: 9, h: 22 } as Box,
  turnBadge: { l: 61, t: 27, w: 10, h: 6 } as Box,
  jackpot: { l: 82, t: 34, w: 12, h: 6 } as Box,
  timer: { l: 82, t: 41, w: 12, h: 5 } as Box,

  yourMelds: { l: 24, t: 45, w: 52, h: 12 } as Box,

  // Strip container: only l/t/w are fixed; height derives from aspectRatio matching the PNG.
  buttonsStrip: { l: 25, t: 52, w: 50 },

  youAvatar: { l: 7, t: 69, w: 8.5, h: 15 } as Box,
  youName: { l: 16, t: 75, w: 14, h: 4 } as Box,
  yourHand: { l: 16, t: 68, w: 78, h: 28 } as Box,

  autoSort: { l: 93, t: 46, w: 6, h: 8 } as Box,
  sort: { l: 93, t: 57, w: 6, h: 8 } as Box,
  chat: { l: 93, t: 68, w: 6, h: 8 } as Box,
  emoji: { l: 93, t: 79, w: 6, h: 8 } as Box,
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
  if (cards.length < 3) return false;
  return cards.every((c) => c[0] === cards[0][0]);
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

function MeldRow({ melds, onPick }: { melds: TCard[][]; onPick?: (i: number) => void }) {
  if (!melds || melds.length === 0)
    return <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.9cqw" }}>—</span>;
  return (
    <div style={{ display: "flex", gap: "0.6cqw", flexWrap: "wrap", justifyContent: "center", alignItems: "center", height: "100%" }}>
      {melds.map((m, i) => (
        <button
          key={i}
          onClick={onPick ? () => onPick(i) : undefined}
          disabled={!onPick}
          style={{
            display: "flex",
            gap: "0.15cqw",
            padding: "0.2cqw",
            borderRadius: "0.4cqw",
            background: onPick ? "rgba(61,213,152,0.18)" : "transparent",
            border: onPick ? "0.12cqw solid rgba(61,213,152,0.75)" : "none",
            cursor: onPick ? "pointer" : "default",
          }}
        >
          {m.map((c) => (
            <SmallCard key={c} card={c} />
          ))}
        </button>
      ))}
    </div>
  );
}

// ---- main ----
export function TongitsGameTableArt({ code, room }: { code: string; room: Room }) {
  const { user } = useAuth();
  const gs = useGameState(code);
  const myHand = useMyHand(code, user?.uid ?? null);
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
  const enforcedFor = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!gs || gs.status !== "in_game") return;
    if (tick > gs.turnDeadline + 1500 && enforcedFor.current !== gs.turnDeadline) {
      enforcedFor.current = gs.turnDeadline;
      enforceTimeout(code).catch(() => {});
    }
  }, [tick, gs, code]);

  useEffect(() => {
    setSelected((sel) => sel.filter((c) => myHand.includes(c)));
  }, [myHand]);

  if (!gs) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-white/60 animate-spin" />
      </div>
    );
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
  const canFight = isMyTurn && gs.phase === "discard" && iHaveMeld;
  const canUngroup = selected.length > 0;
  const canDump = isMyTurn && gs.phase === "discard" && selected.length === 1;
  const sapawEligible =
    isMyTurn && gs.phase === "discard" && selected.length === 1 && canSapawAny(selected[0], allExposedMelds);
  // show 5-pill strip whenever sapaw could possibly be used (any single card in hand can extend)
  const anySapawPossible = isMyTurn && gs.phase === "discard" && myHand.some((c) => canSapawAny(c, allExposedMelds));

  const canDraw = isMyTurn && gs.phase === "draw" && gs.stockCount > 0;
  const canPick = isMyTurn && gs.phase === "draw" && !!discardTop && selected.length >= 2 && isValidMeld([...selected, discardTop]);

  function toggle(card: TCard) {
    setSelected((sel) => (sel.includes(card) ? sel.filter((c) => c !== card) : [...sel, card]));
  }
  async function act(key: string, fn: () => Promise<unknown>) {
    setError(null);
    setBusy(key);
    try {
      await fn();
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*\/ /, "") : "Move failed");
    } finally {
      setBusy(null);
    }
  }
  async function onSapawPick(targetUid: string, meldIndex: number) {
    if (selected.length !== 1) return;
    await act("sapaw", () => sapawCard(code, targetUid, meldIndex, selected[0]));
  }

  // pill order in both strips: DROP, FIGHT, UNGROUP, DUMP, [SAPAW]
  const strip = anySapawPossible ? assets.actionButtons5 : assets.actionButtons4;
  const stripCfg = anySapawPossible ? PILL5 : PILL4;
  const pillActions = [
    { label: "DROP", enabled: canDrop, busyKey: "drop", onClick: () => act("drop", () => meld(code, selected)) },
    { label: "FIGHT", enabled: canFight, busyKey: "fight", onClick: () => act("fight", () => callTongits(code)) },
    { label: "UNGROUP", enabled: canUngroup, busyKey: "ungroup", onClick: () => setSelected([]) },
    { label: "DUMP", enabled: canDump, busyKey: "dump", onClick: () => act("dump", () => discard(code, selected[0])) },
  ];
  if (anySapawPossible) {
    pillActions.push({
      label: "SAPAW",
      enabled: sapawEligible,
      busyKey: "sapaw-hint",
      onClick: () => setError("Tap an exposed meld to sapaw onto it."),
    });
  }

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center overflow-hidden">
      <div
        className="relative"
        style={{ width: "min(100vw, calc(100dvh * 1672 / 941))", aspectRatio: "1672 / 941", containerType: "inline-size" }}
      >
        {/* base */}
        <img src={assets.table} alt="Tongits table" className="absolute inset-0 w-full h-full object-contain" />

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
              <div
                style={{
                  height: "78%",
                  aspectRatio: "1",
                  borderRadius: "50%",
                  background: gs.turnUid === opp1.uid ? "#0a1730" : "#0a1730cc",
                  color: "#F5C66B",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "1.9cqw",
                  boxShadow: gs.turnUid === opp1.uid ? "0 0 2cqw #F5C66B" : "none",
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
              />
            </Zone>
            <Zone box={S.opp1MeldB}>
              <MeldRow
                melds={(gs.melds[opp1.uid] ?? []).slice(2)}
                onPick={sapawEligible ? (i) => onSapawPick(opp1.uid, i + 2) : undefined}
              />
            </Zone>
          </>
        )}

        {/* opponent 2 (right) */}
        {opp2 && (
          <>
            <Zone box={S.opp2Avatar}>
              <div
                style={{
                  height: "78%",
                  aspectRatio: "1",
                  borderRadius: "50%",
                  background: gs.turnUid === opp2.uid ? "#0a1730" : "#0a1730cc",
                  color: "#F5C66B",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "1.9cqw",
                  boxShadow: gs.turnUid === opp2.uid ? "0 0 2cqw #F5C66B" : "none",
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
              />
            </Zone>
            <Zone box={S.opp2MeldB}>
              <MeldRow
                melds={(gs.melds[opp2.uid] ?? []).slice(2)}
                onPick={sapawEligible ? (i) => onSapawPick(opp2.uid, i + 2) : undefined}
              />
            </Zone>
          </>
        )}

        {/* STOCK (draw) */}
        <Zone
          box={S.stock}
          onClick={canDraw ? () => act("draw", () => draw(code)) : undefined}
          disabled={!canDraw}
          title="Draw from stock"
        >
          <div style={{ position: "relative" }}>
            <BigCard faceDown />
            <span
              style={{
                position: "absolute",
                bottom: "-0.6cqw",
                right: "-0.6cqw",
                background: "rgba(0,0,0,0.75)",
                color: "#fff",
                fontFamily: "monospace",
                fontSize: "0.9cqw",
                padding: "0.1cqw 0.4cqw",
                borderRadius: "0.3cqw",
              }}
            >
              {gs.stockCount}
            </span>
          </div>
        </Zone>

        {/* DISCARD (pick) */}
        <Zone
          box={S.discard}
          onClick={canPick ? () => act("pick", () => takeDiscard(code, [...selected, discardTop])) : undefined}
          disabled={!canPick && !discardTop}
          title="Pick the discard"
        >
          {discardTop ? (
            <BigCard card={discardTop} />
          ) : (
            <div
              style={{
                width: "4cqw",
                height: "5.6cqw",
                borderRadius: "0.6cqw",
                border: "0.15cqw dashed rgba(255,255,255,0.25)",
              }}
            />
          )}
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

        {/* Timer */}
        <Zone box={S.timer}>
          <div
            style={{
              padding: "0.3cqw 0.8cqw",
              borderRadius: "0.6cqw",
              background: secondsLeft <= 5 ? "rgba(220,60,60,0.35)" : "rgba(0,0,0,0.5)",
              color: secondsLeft <= 5 ? "#ffb0b0" : "#fff",
              fontWeight: 700,
              fontFamily: "monospace",
              fontSize: "1.2cqw",
            }}
          >
            {secondsLeft}s
          </div>
        </Zone>

        {/* your melds */}
        <Zone box={S.yourMelds}>
          <MeldRow
            melds={gs.melds[uid] ?? []}
            onPick={sapawEligible ? (i) => onSapawPick(uid, i) : undefined}
          />
        </Zone>

        {/* action button strip — container aspect matches the PNG so pill hitboxes align */}
        <div
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
            return (
              <button
                key={a.label}
                onClick={a.enabled && !isBusy ? a.onClick : undefined}
                disabled={!a.enabled || isBusy}
                style={{
                  position: "absolute",
                  left: `${p.l * 100}%`,
                  top: `${stripCfg.t * 100}%`,
                  width: `${p.w * 100}%`,
                  height: `${stripCfg.h * 100}%`,
                  background: "transparent",
                  border: "none",
                  cursor: a.enabled ? "pointer" : "not-allowed",
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
              </button>
            );
          })}
        </div>

        {/* YOU */}
        <Zone box={S.youAvatar}>
          <div
            style={{
              height: "78%",
              aspectRatio: "1",
              borderRadius: "50%",
              background: isMyTurn ? "#0a1730" : "#0a1730cc",
              color: "#F5C66B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "1.9cqw",
              boxShadow: isMyTurn ? "0 0 2cqw #F5C66B" : "none",
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
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: "1.5cqw",
            padding: "0.4cqw",
          }}
        >
          {groupHand(myHand).map((group, gi) => {
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
                    gap: isMeld ? 0 : "0.25cqw",
                  }}
                >
                  {group.cards.map((c, ci) => (
                    <div
                      key={c}
                      style={{
                        marginLeft: isMeld && ci !== 0 ? "-2.9cqw" : 0,
                        zIndex: ci,
                      }}
                    >
                      <BigCard card={c} selected={selected.includes(c)} onClick={() => toggle(c)} />
                    </div>
                  ))}
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
