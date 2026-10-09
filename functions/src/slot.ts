import { randomInt } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./init";
import { spin, simulate, mergeSlotConfig, POT_KEYS, type SlotConfig, type PotKey, type SpinResult } from "./slot-engine";

/**
 * Dragon Spire — the slot's Cloud Functions. Every spin is decided here: the
 * app only animates the result it is handed. Settings live in
 * `settings/games.slot`; the shared pots in `games/dragonSpire`; each member's
 * free-spin state in `users/{uid}/game/slot`; a daily tally in
 * `games/dragonSpireStats`.
 */
export type SlotStatus = "off" | "testers" | "everyone";
export type SlotSettings = {
  status: SlotStatus;
  /** While on, spins charge nothing and pay nothing — for testers to try the game. */
  testing: boolean;
  testers: string[];
  engine?: Partial<SlotConfig>;
};
const POTS_DOC = "games/dragonSpire";
const STATS_DOC = "games/dragonSpireStats";
const HOUR_MS = 3_600_000;
const dayKey = (ts: number) => new Date(ts + 8 * HOUR_MS).toISOString().slice(0, 10);
const rng = () => randomInt(0, 1 << 30) / (1 << 30);

async function loadSlot(): Promise<{ settings: SlotSettings; cfg: SlotConfig }> {
  const snap = await db.doc("settings/games").get();
  const raw = ((snap.exists ? snap.data() : {}) as { slot?: Partial<SlotSettings> }).slot ?? {};
  const settings: SlotSettings = {
    status: raw.status === "testers" || raw.status === "everyone" ? raw.status : "off",
    testing: raw.testing === true,
    testers: Array.isArray(raw.testers) ? raw.testers.map(String) : [],
    engine: raw.engine,
  };
  return { settings, cfg: mergeSlotConfig(raw.engine) };
}

function assertCanPlay(uid: string, s: SlotSettings, isAdmin: boolean) {
  if (s.status === "everyone") return;
  if (s.status === "testers" && (s.testers.includes(uid) || isAdmin)) return;
  throw new HttpsError("failed-precondition", s.status === "off" ? "Dragon Spire is not open right now." : "Dragon Spire is open to testers only for now.");
}

type SlotState = { freeSpinsLeft?: number; freeBet?: number; freeTotal?: number; spins?: number; wagered?: number; paid?: number; biggestWin?: number; lastAt?: number };

export const slotSpin = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const [{ settings, cfg }, userSnap] = await Promise.all([loadSlot(), db.collection("users").doc(uid).get()]);
  assertCanPlay(uid, settings, userSnap.data()?.isAdmin === true);

  const bet = Math.floor(Number((request.data as { bet?: unknown })?.bet));
  if (!Number.isFinite(bet) || !cfg.bets.includes(bet)) throw new HttpsError("invalid-argument", `Choose a bet of ${cfg.bets.join(", ")} GP.`);

  const now = Date.now();
  const today = dayKey(now);
  const stateRef = db.doc(`users/${uid}/game/state`);
  const slotRef = db.doc(`users/${uid}/game/slot`);
  const potsRef = db.doc(POTS_DOC);
  const statsRef = db.doc(STATS_DOC);
  const testing = settings.testing;

  return db.runTransaction(async (tx) => {
    const [stateSnap, slotSnap, potsSnap] = await Promise.all([tx.get(stateRef), tx.get(slotRef), tx.get(potsRef)]);
    const points = Number((stateSnap.data() as { points?: number } | undefined)?.points ?? 0);
    const st = (slotSnap.exists ? slotSnap.data() : {}) as SlotState;
    const potsRaw = (potsSnap.exists ? potsSnap.data() : {}) as { pots?: Partial<Record<PotKey, number>> };
    const pots: Record<PotKey, number> = { ...cfg.pots.seed };
    for (const k of POT_KEYS) { const v = Number(potsRaw.pots?.[k]); if (Number.isFinite(v) && v > 0) pots[k] = v; }

    const freeLeft = Math.max(0, Math.floor(Number(st.freeSpinsLeft ?? 0)));
    const mode: "base" | "free" = freeLeft > 0 ? "free" : "base";
    const effBet = mode === "free" ? Math.max(1, Math.floor(Number(st.freeBet ?? bet))) : bet;
    if (mode === "base" && !testing && points < bet) throw new HttpsError("failed-precondition", "Not enough Game Points.");

    // feed the shared pots from paid base spins
    if (mode === "base" && !testing) for (const k of POT_KEYS) pots[k] = Math.round((pots[k] + bet * cfg.pots.feed[k]) * 100) / 100;

    const result: SpinResult = spin(cfg, effBet, mode, pots, rng);
    const win = Math.round(result.totalWin);
    const charge = mode === "base" && !testing ? bet : 0;
    const payout = testing ? 0 : win;
    const newPoints = points - charge + payout;

    const potsAfter = { ...pots };
    if (result.holdWin) for (const k of result.holdWin.potsHit) potsAfter[k] = cfg.pots.seed[k];
    const freeSpinsLeft = (mode === "free" ? freeLeft - 1 : 0) + result.freeSpinsAwarded;
    const freeBet = freeSpinsLeft > 0 ? effBet : FieldValue.delete();
    const freeTotal = mode === "free" || result.freeSpinsAwarded > 0 ? Math.round(Number(st.freeTotal ?? 0) + (mode === "free" ? win : 0)) : 0;

    if (charge || payout) tx.set(stateRef, { points: newPoints }, { merge: true });
    tx.set(slotRef, {
      freeSpinsLeft, freeBet, freeTotal: freeSpinsLeft > 0 ? freeTotal : FieldValue.delete(),
      spins: FieldValue.increment(1), wagered: FieldValue.increment(charge), paid: FieldValue.increment(payout),
      biggestWin: Math.max(Number(st.biggestWin ?? 0), payout), lastAt: now, lastBet: effBet,
    }, { merge: true });
    if (!testing) {
      tx.set(potsRef, { pots: potsAfter, updatedAt: now, ...(result.holdWin?.potsHit.length ? { lastHit: { uid, pots: result.holdWin.potsHit, at: now, bet: effBet } } : {}) }, { merge: true });
      tx.set(statsRef, { days: { [today]: { spins: FieldValue.increment(1), wagered: FieldValue.increment(charge), paid: FieldValue.increment(payout), freeSpins: FieldValue.increment(mode === "free" ? 1 : 0), holdWins: FieldValue.increment(result.holdWin ? 1 : 0) } }, updatedAt: now }, { merge: true });
      if (payout >= effBet * 50) {
        tx.set(db.collection("users").doc(uid).collection("activity").doc(), {
          type: "reinvest", title: "Dragon Spire big win", subtitle: `${payout.toLocaleString()} points on a ${effBet} GP ${mode === "free" ? "free spin" : "spin"}`,
          amount: payout, amountKind: "in", at: FieldValue.serverTimestamp(),
        });
      }
    } else {
      tx.set(statsRef, { days: { [today]: { testSpins: FieldValue.increment(1) } }, updatedAt: now }, { merge: true });
    }
    return { result, points: newPoints, freeSpinsLeft, freeTotal: freeSpinsLeft > 0 ? freeTotal : 0, pots: potsAfter, testing, win: payout };
  });
});

/** Admin: Monte-Carlo the current maths so the admin page can show return and feature rates. */
export const slotSimulate = onCall({ timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const caller = await db.collection("users").doc(uid).get();
  if (caller.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
  const { cfg } = await loadSlot();
  const spins = Math.min(200_000, Math.max(10_000, Math.floor(Number((request.data as { spins?: unknown })?.spins) || 50_000)));
  const r = simulate(cfg, spins, rng);
  return { spins, rtp: r.rtp, hitRate: r.hitRate, freeSpinRate: r.freeSpinRate, holdWinRate: r.holdWinRate, maxWin: r.maxWin, parts: r.parts };
});

/** Admin: set the pots by hand (seed them, or correct a value). */
export const adminSetSlotPots = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const caller = await db.collection("users").doc(uid).get();
  if (caller.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
  const d = (request.data ?? {}) as { pots?: Partial<Record<PotKey, unknown>> };
  const patch: Partial<Record<PotKey, number>> = {};
  for (const k of POT_KEYS) {
    if (d.pots?.[k] === undefined) continue;
    const v = Math.floor(Number(d.pots[k]));
    if (!Number.isFinite(v) || v < 0 || v > 10_000_000) throw new HttpsError("invalid-argument", `${k}: enter a number between 0 and 10,000,000.`);
    patch[k] = v;
  }
  const snap = await db.doc(POTS_DOC).get();
  const cur = ((snap.exists ? snap.data() : {}) as { pots?: Record<PotKey, number> }).pots ?? {};
  const pots = { ...cur, ...patch };
  await db.doc(POTS_DOC).set({ pots, updatedAt: Date.now() }, { merge: true });
  return { pots };
});
