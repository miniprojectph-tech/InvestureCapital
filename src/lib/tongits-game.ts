"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";

export type Card = string; // "<rank><suit>", e.g. "AS", "TD"

export type GameSeat = { uid: string; seat: number; name: string };

export type TongitsGameState = {
  status: "in_game" | "ended";
  round: number;
  turnSeat: number;
  turnUid: string;
  phase: "draw" | "discard" | "fight";
  stockCount: number;
  discard: Card[];
  melds: Record<string, Card[][]>;
  handCounts: Record<string, number>;
  looseValues?: Record<string, number>;
  hasExposed: Record<string, boolean>;
  seats: GameSeat[];
  turnDeadline: number;
  consecutiveTimeouts: Record<string, number>;
  jackpotPoints: number;
  startedAt: number;
  lastAction?: string;
  cantFight?: Record<string, boolean>;
  idleUids?: string[];
  fightState?: {
    callerUid: string;
    responses: Record<string, "fight" | "fold" | "burned">;
    deadline: number;
  };
};

export type TongitsResult = {
  matchId: string;
  resultType: "tongits_win" | "draw_win" | "lowest_points_win";
  winnerUserId: string;
  winnerName: string;
  jackpotWon: number;
  values: Record<string, number>;
  melds: Record<string, Card[][]>;
  hands?: Record<string, Card[]>;
  completedAt: number;
  fightResponses?: Record<string, "fight" | "fold" | "burned">;
};

// ===== card helpers =====
const SUIT_SYMBOL: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const isRedSuit = (c: Card) => c[1] === "H" || c[1] === "D";
export function cardLabel(c: Card): string {
  return `${c[0] === "T" ? "10" : c[0]}${SUIT_SYMBOL[c[1]] ?? ""}`;
}
export function cardScore(c: Card): number {
  const r = c[0];
  if (r === "A") return 1;
  if (r === "T" || r === "J" || r === "Q" || r === "K") return 10;
  return Number(r);
}

const RANKS = "A23456789TJQK";
const rIdx = (c: Card) => RANKS.indexOf(c[0]);

function isSetC(cards: Card[]) {
  if (cards.length < 3 || cards.length > 4) return false;
  if (!cards.every((c) => c[0] === cards[0][0])) return false;
  return new Set(cards.map((c) => c[1])).size === cards.length;
}
function isRunC(cards: Card[]) {
  if (cards.length < 3) return false;
  if (!cards.every((c) => c[1] === cards[0][1])) return false;
  const idxs = cards.map(rIdx).sort((a, b) => a - b);
  for (let i = 1; i < idxs.length; i++) if (idxs[i] !== idxs[i - 1] + 1) return false;
  return true;
}

export function findBestMelds(hand: Card[]): { melds: Card[][]; loose: Card[] } {
  if (hand.length === 0) return { melds: [], loose: [] };
  const candidates: Card[][] = [];
  const byRank: Record<string, Card[]> = {};
  for (const c of hand) (byRank[c[0]] ??= []).push(c);
  for (const cards of Object.values(byRank)) {
    if (cards.length >= 3) {
      for (let i = 0; i < cards.length; i++)
        for (let j = i + 1; j < cards.length; j++)
          for (let k = j + 1; k < cards.length; k++)
            candidates.push([cards[i], cards[j], cards[k]]);
      if (cards.length === 4) candidates.push([...cards]);
    }
  }
  const bySuit: Record<string, Card[]> = {};
  for (const c of hand) (bySuit[c[1]] ??= []).push(c);
  for (const cards of Object.values(bySuit)) {
    if (cards.length < 3) continue;
    const sorted = [...cards].sort((a, b) => rIdx(a) - rIdx(b));
    let i = 0;
    while (i < sorted.length) {
      let j = i + 1;
      while (j < sorted.length && rIdx(sorted[j]) === rIdx(sorted[j - 1]) + 1) j++;
      if (j - i >= 3) {
        for (let len = 3; len <= j - i; len++)
          for (let s = i; s + len <= j; s++)
            candidates.push(sorted.slice(s, s + len));
      }
      i = j;
    }
  }
  if (candidates.length === 0) return { melds: [], loose: [...hand] };
  let bestMelds: Card[][] = [];
  let bestVal = 0;
  function bt(idx: number, used: Set<string>, cur: Card[][], curVal: number) {
    if (curVal > bestVal) { bestVal = curVal; bestMelds = cur.map((m) => [...m]); }
    for (let i = idx; i < candidates.length; i++) {
      const m = candidates[i];
      if (m.some((c) => used.has(c))) continue;
      for (const c of m) used.add(c);
      cur.push(m);
      bt(i + 1, used, cur, curVal + m.reduce((s, c) => s + cardScore(c), 0));
      cur.pop();
      for (const c of m) used.delete(c);
    }
  }
  bt(0, new Set(), [], 0);
  const meldedCards = new Set(bestMelds.flat());
  return { melds: bestMelds, loose: hand.filter((c) => !meldedCards.has(c)) };
}

export function looseCardValue(hand: Card[]): number {
  return findBestMelds(hand).loose.reduce((s, c) => s + cardScore(c), 0);
}

// ===== callables =====
async function call<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const { gameFunctions } = getFirebase();
  if (!gameFunctions) throw new Error("Not connected");
  const fn = httpsCallable<Record<string, unknown>, T>(gameFunctions, name);
  return (await fn(data)).data;
}

export const startGame = (code: string) => call<{ ok: boolean }>("startTongitsGame", { code });
export const draw = (code: string) => call<{ ok: boolean; ended?: boolean }>("tongitsDraw", { code });
export const takeDiscard = (code: string, meldCards: Card[]) =>
  call<{ ok: boolean; ended?: boolean }>("tongitsTakeDiscard", { code, meldCards });
export const meld = (code: string, cards: Card[]) =>
  call<{ ok: boolean; ended?: boolean }>("tongitsMeld", { code, cards });
export const sapawCard = (code: string, targetUid: string, meldIndex: number, card: Card) =>
  call<{ ok: boolean; ended?: boolean }>("tongitsSapaw", { code, targetUid, meldIndex, card });
export const discard = (code: string, card: Card) =>
  call<{ ok: boolean; ended?: boolean }>("tongitsDiscard", { code, card });
export const callTongits = (code: string) => call<{ ok: boolean; ended?: boolean; fight?: boolean }>("tongitsCall", { code });
export const fightRespond = (code: string, response: "fight" | "fold") =>
  call<{ ok: boolean; ended?: boolean }>("tongitsFightRespond", { code, response });
export const enforceTimeout = (code: string) =>
  call<{ ok: boolean; ended?: boolean; skipped?: boolean }>("enforceTongitsTimeout", { code });
export const playAgain = (code: string) => call<{ ok: boolean }>("tongitsPlayAgain", { code });
export const postGameRespond = (code: string, response: "continue" | "quit") =>
  call<{ ok: boolean; allResponded?: boolean }>("tongitsPostGameRespond", { code, response });
export const resolvePostGame = (code: string) =>
  call<{ ok: boolean; result?: string; needsStart?: boolean }>("tongitsResolvePostGame", { code });
export const idleAction = (code: string, action: "join_next" | "quit") =>
  call<{ ok: boolean }>("tongitsIdleAction", { code, action });
export const splitJackpot = (code: string) =>
  call<{ ok: boolean; waiting?: boolean; split?: boolean }>("splitTongitsJackpot", { code });

// ===== hooks =====
/**
 * Firestore rejects nested arrays, so the CF stores each exposed meld as
 * { cards: Card[] } on the wire. Unwrap back to Card[][] here so every
 * consumer keeps the natural shape.
 */
function decodeMelds(raw: unknown): Record<string, Card[][]> {
  const out: Record<string, Card[][]> = {};
  const src = (raw ?? {}) as Record<string, Array<{ cards?: Card[] } | Card[]>>;
  for (const uid of Object.keys(src)) {
    out[uid] = (src[uid] ?? []).map((entry) => (Array.isArray(entry) ? entry : entry?.cards ?? []));
  }
  return out;
}

export function useGameState(code: string | null) {
  const [gs, setGs] = useState<TongitsGameState | null>(null);
  useEffect(() => {
    if (!code) {
      setGs(null);
      return;
    }
    const { gameDb: db } = getFirebase();
    if (!db) return;
    return onSnapshot(
      doc(db, "game_rooms", code, "game", "state"),
      (snap) => {
        if (!snap.exists()) return setGs(null);
        const data = snap.data() as TongitsGameState;
        data.melds = decodeMelds(data.melds);
        setGs(data);
      },
      () => setGs(null)
    );
  }, [code]);
  return gs;
}

export function useMyHand(code: string | null, uid: string | null) {
  const [cards, setCards] = useState<Card[]>([]);
  useEffect(() => {
    if (!code || !uid) {
      setCards([]);
      return;
    }
    const { gameDb: db } = getFirebase();
    if (!db) return;
    return onSnapshot(
      doc(db, "game_rooms", code, "hands", uid),
      (snap) => setCards(snap.exists() ? ((snap.data() as { cards: Card[] }).cards ?? []) : []),
      () => setCards([])
    );
  }, [code, uid]);
  return cards;
}
