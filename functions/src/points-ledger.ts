import { FieldValue, WriteBatch, type Transaction, type DocumentReference } from "firebase-admin/firestore";
import { db } from "./init";

/**
 * One place every Game Points movement is recorded, so the admin can see where
 * each player's points came from and went:
 *   - `game_point_transactions/{id}` — the ledger, one line per movement
 *     (Tongits has written here since launch; the other games join it).
 *   - `game_stats/{uid}` — lifetime per-player totals per game.
 *   - `games/pointsDaily.days[day]` — the whole platform's movements per day,
 *     for the "last 7 days" numbers without reading the ledger.
 * Everything is written inside the caller's transaction or batch, so a
 * movement and its record can't get out of step.
 */
export const TXN_COL = "game_point_transactions";
export const STATS_COL = "game_stats";
export const DAILY_DOC = "games/pointsDaily";

export type LedgerType =
  | "slot_win" | "slot_jackpot" | "slot_bet"
  | "challenge_points_won" | "challenge_points_lost" | "challenge_points_lost_fold" | "challenge_points_locked" | "challenge_points_returned"
  | "color_bet" | "color_refund" | "color_win"
  | "reef_catch" | "reef_quest" | "reef_weekly"
  | "spin_won"
  | "reward_redeem"
  | "admin_set";

const HOUR_MS = 3_600_000;
export const manilaDay = (ts: number) => new Date(ts + 8 * HOUR_MS).toISOString().slice(0, 10);

type Writer = Transaction | WriteBatch;
/** A transaction and a batch have different `set` overloads, so pick one explicitly. */
function setDoc(w: Writer, ref: DocumentReference, data: Record<string, unknown>, merge = false): void {
  if (w instanceof WriteBatch) w.set(ref, data, { merge });
  else w.set(ref, data, { merge });
}

/** Turn {"slot.won": 5} into {slot: {won: increment(5)}} for a merge-set. */
function nest(inc: Record<string, number>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, n] of Object.entries(inc)) {
    if (!n) continue;
    const parts = path.split(".");
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) cur = (cur[parts[i]] ??= {}) as Record<string, unknown>;
    cur[parts[parts.length - 1]] = FieldValue.increment(n);
  }
  return out;
}

export function recordPoints(w: Writer, p: {
  uid: string;
  /** Shown in the admin tables; optional where the caller doesn't have it. */
  name?: string;
  type: LedgerType;
  /** Signed: points added to (+) or taken from (−) the balance. 0 writes no ledger line. */
  delta: number;
  /** Balance after this movement; null when the caller only knows the increment. */
  balanceAfter: number | null;
  description: string;
  /** Extra fields for the ledger line (roomCode, matchId, roundId, pot…). */
  ref?: Record<string, unknown>;
  at: number;
  /** Lifetime per-player increments, dotted paths under game_stats/{uid}. */
  stats?: Record<string, number>;
  /** Platform-wide daily increments under games/pointsDaily.days[day]. */
  daily?: Record<string, number>;
}): void {
  const { uid, type, delta, at } = p;
  if (delta !== 0) {
    setDoc(w, db.collection(TXN_COL).doc(), {
      userId: uid, type, amount: Math.abs(delta), delta, balanceAfter: p.balanceAfter,
      description: p.description, createdAt: at, ...(p.ref ?? {}),
    });
  }
  if (p.stats && Object.values(p.stats).some((n) => n)) {
    setDoc(w, db.collection(STATS_COL).doc(uid), { ...nest(p.stats), uid, ...(p.name ? { name: p.name } : {}), updatedAt: at }, true);
  }
  if (p.daily && Object.values(p.daily).some((n) => n)) {
    setDoc(w, db.doc(DAILY_DOC), { days: { [manilaDay(at)]: nest(p.daily) }, updatedAt: at }, true);
  }
}
