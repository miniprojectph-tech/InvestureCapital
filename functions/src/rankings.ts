import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from "firebase-admin/database";
import { logger } from "firebase-functions";
import { db, gameDb } from "./init";

/**
 * Admin tools for the three game rankings (all of them weekly):
 *   reef     `leaderboard/{uid}.weeklyScore` (+ the same number on the player's game state)
 *   tongits  `tongits_leaderboard/{uid}` (weekRP bucket keyed by weekKey)
 *   color    `color_game_leaderboard/{uid}` in the game DB, mirrored to RTDB `color/leaderboard/{uid}`
 *
 * A reset clears ranking scores only. Game Points balances, rank tiers, match
 * history and prizes already paid are never touched.
 */

type Game = "reef" | "tongits" | "color";
const GAMES: Game[] = ["reef", "tongits", "color"];

async function assertAdmin(uid: string) {
  const snap = await db.collection("users").doc(uid).get();
  if (snap.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
}

const BATCH_LIMIT = 400;

/** Apply `fn` to every doc of a query in write batches; returns how many docs were touched. */
async function forEachInBatches(
  database: FirebaseFirestore.Firestore,
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  fn: (batch: FirebaseFirestore.WriteBatch, d: FirebaseFirestore.QueryDocumentSnapshot) => number,
): Promise<number> {
  let batch = database.batch();
  let ops = 0;
  for (const d of docs) {
    if (ops >= BATCH_LIMIT) { await batch.commit(); batch = database.batch(); ops = 0; }
    ops += fn(batch, d);
  }
  if (ops > 0) await batch.commit();
  return docs.length;
}

async function resetReef(only?: string): Promise<number> {
  const docs = only
    ? (await db.collection("leaderboard").where("uid", "==", only).get()).docs
    : (await db.collection("leaderboard").get()).docs;
  const n = await forEachInBatches(db, docs, (batch, d) => {
    const uid = (d.data().uid as string | undefined) ?? d.id;
    batch.set(d.ref, { weeklyScore: 0, updatedAt: Date.now() }, { merge: true });
    batch.set(db.doc(`users/${uid}/game/state`), { weeklyScore: 0 }, { merge: true });
    return 2;
  });
  // A player with no leaderboard row can still carry a weekly score on their state.
  if (only && n === 0) await db.doc(`users/${only}/game/state`).set({ weeklyScore: 0 }, { merge: true });
  return n;
}

async function resetTongits(only?: string): Promise<number> {
  const docs = only
    ? (await db.collection("tongits_leaderboard").where("uid", "==", only).get()).docs
    : (await db.collection("tongits_leaderboard").get()).docs;
  return forEachInBatches(db, docs, (batch, d) => { batch.delete(d.ref); return 1; });
}

async function resetColor(only?: string): Promise<number> {
  const docs = only
    ? (await gameDb.collection("color_game_leaderboard").where("uid", "==", only).get()).docs
    : (await gameDb.collection("color_game_leaderboard").get()).docs;
  const n = await forEachInBatches(gameDb, docs, (batch, d) => { batch.delete(d.ref); return 1; });
  // The RTDB mirror is what players actually read.
  await getDatabase().ref(only ? `color/leaderboard/${only}` : "color/leaderboard").remove();
  return n;
}

const RESET: Record<Game, (only?: string) => Promise<number>> = { reef: resetReef, tongits: resetTongits, color: resetColor };

function parseGames(input: unknown): Game[] {
  const list = Array.isArray(input) ? input : [input];
  const games = list.filter((g): g is Game => GAMES.includes(g as Game));
  if (games.length === 0) throw new HttpsError("invalid-argument", "Choose at least one ranking: reef, tongits or color.");
  return [...new Set(games)];
}

/** Admin: clear whole rankings (e.g. after test accounts played). */
export const adminResetRankings = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  await assertAdmin(request.auth.uid);
  const games = parseGames((request.data as { games?: unknown } | undefined)?.games);
  const cleared: Partial<Record<Game, number>> = {};
  for (const g of games) cleared[g] = await RESET[g]();
  await db.collection("admin_audit").add({ type: "rankings_reset", games, cleared, by: request.auth.uid, at: Date.now() });
  logger.info("rankings reset", { games, cleared, by: request.auth.uid });
  return { ok: true, cleared };
});

/** Admin: take one player (a test account) off one or more rankings. */
export const adminRemoveFromRanking = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  await assertAdmin(request.auth.uid);
  const { games: rawGames, uid } = (request.data ?? {}) as { games?: unknown; uid?: unknown };
  if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw new HttpsError("invalid-argument", "Player id is required.");
  const games = parseGames(rawGames);
  const cleared: Partial<Record<Game, number>> = {};
  for (const g of games) cleared[g] = await RESET[g](uid);
  await db.collection("admin_audit").add({ type: "ranking_player_removed", games, uid, by: request.auth.uid, at: Date.now() });
  return { ok: true, cleared };
});
