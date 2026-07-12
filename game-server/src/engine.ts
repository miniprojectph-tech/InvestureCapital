// ===== Community Tongits — pure game engine (no Firestore) =====
// Deterministic card logic: deck, deal, meld/run/set validation, sapaw, scoring,
// and showdown resolution. Kept side-effect-free so it's easy to reason about and
// test. Rules per docs/tongits-spec.md: Ace LOW only in runs, caller wins ties.

export type Card = string; // "<rank><suit>", e.g. "AS", "TD", "KH"

const RANKS = "A23456789TJQK"; // A=0 (low) … K=12
const SUITS = "SHDC";

export const rankIndex = (c: Card): number => RANKS.indexOf(c[0]);
export const suitOf = (c: Card): string => c[1];

/** Hand-scoring value (lower is better): A=1, 2–9 pip, T/J/Q/K = 10. */
export function scoreValue(c: Card): number {
  const r = c[0];
  if (r === "A") return 1;
  if (r === "T" || r === "J" || r === "Q" || r === "K") return 10;
  return Number(r);
}

export function fullDeck(): Card[] {
  const out: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) out.push(r + s);
  return out;
}

/** Fisher–Yates shuffle (in place, returns the array). */
export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Deal for 2 or 3 players: seat 0 gets 13, others get 12; the rest is stock. */
export function deal(playerCount: 2 | 3 = 3): { hands: Card[][]; stock: Card[] } {
  const deck = shuffle(fullDeck());
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  let i = 0;
  for (let n = 0; n < 13; n++) hands[0].push(deck[i++]);
  for (let p = 1; p < playerCount; p++) {
    for (let n = 0; n < 12; n++) hands[p].push(deck[i++]);
  }
  const stock = deck.slice(i);
  return { hands, stock };
}

// ===== meld validation =====

/** Set: 3–4 cards, same rank, distinct suits. */
export function isSet(cards: Card[]): boolean {
  if (cards.length < 3 || cards.length > 4) return false;
  const r = cards[0][0];
  if (!cards.every((c) => c[0] === r)) return false;
  return new Set(cards.map(suitOf)).size === cards.length;
}

/** Run: 3+ cards, same suit, consecutive ranks, Ace LOW only (no wrap). */
export function isRun(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  const s = cards[0][1];
  if (!cards.every((c) => c[1] === s)) return false;
  const idx = cards.map(rankIndex).sort((a, b) => a - b);
  for (let i = 1; i < idx.length; i++) {
    if (idx[i] !== idx[i - 1] + 1) return false; // consecutive + no dupes
  }
  return true;
}

export function isValidMeld(cards: Card[]): boolean {
  return isSet(cards) || isRun(cards);
}

/** All cards distinct and drawn from the given hand. */
export function handContainsAll(hand: Card[], cards: Card[]): boolean {
  const pool = [...hand];
  for (const c of cards) {
    const i = pool.indexOf(c);
    if (i === -1) return false;
    pool.splice(i, 1);
  }
  return true;
}

/** Attempt to sapaw (lay off) `card` onto an exposed meld. Returns the resulting
 *  meld (canonically ordered) or null if the card doesn't extend it. */
export function sapaw(meld: Card[], card: Card): Card[] | null {
  if (isSet(meld)) {
    const cand = [...meld, card];
    return isSet(cand) ? cand : null;
  }
  if (isRun(meld)) {
    const cand = [...meld, card].sort((a, b) => rankIndex(a) - rankIndex(b));
    return isRun(cand) ? cand : null;
  }
  return null;
}

/** Sum of unmelded card values in a hand. */
export function handValue(hand: Card[]): number {
  return hand.reduce((s, c) => s + scoreValue(c), 0);
}

// ===== showdown resolution =====

export type ShowdownEntry = { uid: string; seat: number; value: number };

/**
 * Lowest hand value wins. Ties go to `preferUid` when they're among the lowest
 * (the caller wins ties); otherwise the lowest seat number breaks the tie.
 */
export function resolveShowdown(entries: ShowdownEntry[], preferUid?: string): string {
  const min = Math.min(...entries.map((e) => e.value));
  const lowest = entries.filter((e) => e.value === min);
  if (preferUid && lowest.some((e) => e.uid === preferUid)) return preferUid;
  return lowest.sort((a, b) => a.seat - b.seat)[0].uid;
}

/** Pick a card to auto-discard on timeout: the highest-scoring loose card. */
export function autoDiscardCard(hand: Card[]): Card {
  return [...hand].sort((a, b) => scoreValue(b) - scoreValue(a))[0];
}
