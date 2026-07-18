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

/** Sum of ALL card values in a hand (raw total, no meld exclusion). */
export function handValue(hand: Card[]): number {
  return hand.reduce((s, c) => s + scoreValue(c), 0);
}

/**
 * Find the optimal set of non-overlapping melds in a hand that maximizes
 * the total melded value (= minimizes loose card value). Returns the meld
 * groups and the remaining loose cards.
 */
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
    const sorted = [...cards].sort((a, b) => rankIndex(a) - rankIndex(b));
    let i = 0;
    while (i < sorted.length) {
      let j = i + 1;
      while (j < sorted.length && rankIndex(sorted[j]) === rankIndex(sorted[j - 1]) + 1) j++;
      const seqLen = j - i;
      if (seqLen >= 3) {
        for (let len = 3; len <= seqLen; len++)
          for (let s = i; s + len <= j; s++)
            candidates.push(sorted.slice(s, s + len));
      }
      i = j;
    }
  }

  if (candidates.length === 0) return { melds: [], loose: [...hand] };

  let bestMelds: Card[][] = [];
  let bestMeldedValue = 0;

  function backtrack(idx: number, used: Set<string>, cur: Card[][], curVal: number) {
    if (curVal > bestMeldedValue) {
      bestMeldedValue = curVal;
      bestMelds = cur.map((m) => [...m]);
    }
    for (let i = idx; i < candidates.length; i++) {
      const m = candidates[i];
      if (m.some((c) => used.has(c))) continue;
      for (const c of m) used.add(c);
      cur.push(m);
      backtrack(i + 1, used, cur, curVal + m.reduce((s, c) => s + scoreValue(c), 0));
      cur.pop();
      for (const c of m) used.delete(c);
    }
  }

  backtrack(0, new Set(), [], 0);

  const meldedCards = new Set(bestMelds.flat());
  const loose = hand.filter((c) => !meldedCards.has(c));
  return { melds: bestMelds, loose };
}

/** Sum of only loose (non-meldable) cards in a hand. */
export function looseCardValue(hand: Card[]): number {
  const { loose } = findBestMelds(hand);
  return loose.reduce((s, c) => s + scoreValue(c), 0);
}

// ===== showdown resolution =====

export type ShowdownEntry = { uid: string; seat: number; value: number };

/**
 * Lowest hand value wins. Ties broken by lowest seat number.
 * Used for draw wins (stock exhausted) — no caller preference.
 */
export function resolveShowdown(entries: ShowdownEntry[], preferUid?: string): string {
  const min = Math.min(...entries.map((e) => e.value));
  const lowest = entries.filter((e) => e.value === min);
  if (preferUid && lowest.some((e) => e.uid === preferUid)) return preferUid;
  return lowest.sort((a, b) => a.seat - b.seat)[0].uid;
}

/**
 * Fight showdown: lowest value wins. Tie-breaking reversed from draw:
 * 1. Challengers beat the caller
 * 2. Among tied challengers, first to accept wins (acceptOrder)
 * 3. Fallback: lowest seat
 */
export function resolveFightShowdown(
  entries: ShowdownEntry[],
  callerUid: string,
  acceptOrder: string[]
): string {
  const min = Math.min(...entries.map((e) => e.value));
  const lowest = entries.filter((e) => e.value === min);
  if (lowest.length === 1) return lowest[0].uid;
  const challengers = lowest.filter((e) => e.uid !== callerUid);
  if (challengers.length > 0) {
    if (challengers.length === 1) return challengers[0].uid;
    for (const uid of acceptOrder) {
      if (challengers.some((e) => e.uid === uid)) return uid;
    }
    return challengers.sort((a, b) => a.seat - b.seat)[0].uid;
  }
  return callerUid;
}

/** Pick a card to auto-discard on timeout: the highest-scoring loose card. */
export function autoDiscardCard(hand: Card[]): Card {
  return [...hand].sort((a, b) => scoreValue(b) - scoreValue(a))[0];
}
