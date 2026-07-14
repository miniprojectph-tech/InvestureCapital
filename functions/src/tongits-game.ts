import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { Transaction } from "firebase-admin/firestore";
import { db, gameDb } from "./init";

// Region for all live Tongits actions — sits next to the game-live-asia DB.
const GAME_REGION = "asia-southeast1";
import {
  deal,
  isValidMeld,
  handContainsAll,
  sapaw,
  handValue,
  resolveShowdown,
  autoDiscardCard,
  type Card,
} from "./tongits-engine";

// ===== Community Tongits — Phase 2 game engine (Firestore-wrapped) =====
// Server-authoritative: the deck + every hand live server-side; clients only see
// public state (discards, exposed melds, counts, whose turn) + their own hand.

const TURN_MS = 25_000;

const RP_TONGITS = 30;
const RP_SHOWDOWN = 20;
const RP_LOSS = 2;
const RP_SECRET = 50;

type ResultType = "tongits_win" | "draw_win" | "lowest_points_win";

type Seat = { uid: string; seat: number; name: string };

type GamePublic = {
  status: "in_game" | "ended";
  round: number;
  turnSeat: number;
  turnUid: string;
  phase: "draw" | "discard" | "fight";
  stockCount: number;
  discard: Card[];
  melds: Record<string, Card[][]>;
  handCounts: Record<string, number>;
  hasExposed: Record<string, boolean>;
  turnStartExposed: boolean; // did the current player already have a meld at turn start?
  seats: Seat[];
  turnDeadline: number;
  consecutiveTimeouts: Record<string, number>;
  jackpotPoints: number;
  startedAt: number;
  lastAction?: string;
  cantFight: Record<string, boolean>;
  idleUids?: string[];
  fightState?: {
    callerUid: string;
    responses: Record<string, "fight" | "fold" | "burned">;
    deadline: number;
  };
};

/**
 * Firestore doesn't allow nested arrays (Card[][]), so we serialize each
 * exposed meld as an object { cards: Card[] } before writing and unwrap on
 * read. Callers keep working with the natural Card[][] type in memory.
 */
type MeldsWire = Record<string, { cards: Card[] }[]>;
function encodeMelds(m: Record<string, Card[][]>): MeldsWire {
  const out: MeldsWire = {};
  for (const uid of Object.keys(m)) out[uid] = m[uid].map((cards) => ({ cards }));
  return out;
}
function decodeMelds(raw: unknown): Record<string, Card[][]> {
  const out: Record<string, Card[][]> = {};
  const src = (raw ?? {}) as Record<string, Array<{ cards?: Card[] } | Card[]>>;
  for (const uid of Object.keys(src)) {
    out[uid] = (src[uid] ?? []).map((entry) => (Array.isArray(entry) ? entry : entry?.cards ?? []));
  }
  return out;
}

// ===== refs =====
// Game state (rooms + gs + hands + deck + chat) lives on gameDb (Singapore).
// User economy, transactions, and match history live on the default db (us-central).
const roomRef = (code: string) => gameDb.doc(`game_rooms/${code}`);
const gsRef = (code: string) => gameDb.doc(`game_rooms/${code}/game/state`);
const handRef = (code: string, uid: string) => gameDb.doc(`game_rooms/${code}/hands/${uid}`);
const deckRef = (code: string) => gameDb.doc(`game_rooms/${code}/secret/deck`);
const userStateRef = (uid: string) => db.doc(`users/${uid}/game/state`);
const lbRef = (uid: string) => db.doc(`tongits_leaderboard/${uid}`);
const txnCol = () => db.collection("game_point_transactions");

const HOUR_MS = 3_600_000;
/** Manila (UTC+8) period keys for rolling leaderboards. */
function periodKeys(ts: number): { day: string; week: string; month: string } {
  const d = new Date(ts + 8 * HOUR_MS);
  const day = d.toISOString().slice(0, 10); // YYYY-MM-DD
  const month = d.toISOString().slice(0, 7); // YYYY-MM
  // ISO week number.
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7;
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThu = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const week = `${tmp.getUTCFullYear()}-W${String(
    1 + Math.round(((tmp.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
  ).padStart(2, "0")}`;
  return { day, week, month };
}

function requireUid(request: { auth?: { uid?: string } }): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  return uid;
}
function codeArg(request: { data?: unknown }): string {
  const code = String((request.data as { code?: string })?.code ?? "").trim();
  if (!code) throw new HttpsError("invalid-argument", "Room code required.");
  return code;
}

type Ctx = {
  room: FirebaseFirestore.DocumentData;
  gs: GamePublic;
  deck: Card[];
  hands: Record<string, Card[]>;
};

async function loadCtx(tx: Transaction, code: string): Promise<Ctx> {
  const roomSnap = await tx.get(roomRef(code));
  if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found.");
  const room = roomSnap.data() as FirebaseFirestore.DocumentData;
  const gsSnap = await tx.get(gsRef(code));
  if (!gsSnap.exists) throw new HttpsError("failed-precondition", "No active game.");
  const gs = gsSnap.data() as GamePublic;
  // Un-nest the melds wire format so in-memory code stays Card[][].
  gs.melds = decodeMelds(gs.melds);
  const deckSnap = await tx.get(deckRef(code));
  const deck = (deckSnap.exists ? (deckSnap.data() as { stock: Card[] }).stock : []) ?? [];
  const hands: Record<string, Card[]> = {};
  for (const s of gs.seats) {
    const h = await tx.get(handRef(code, s.uid));
    hands[s.uid] = (h.exists ? (h.data() as { cards: Card[] }).cards : []) ?? [];
  }
  return { room, gs, deck, hands };
}

function requireTurn(ctx: Ctx, uid: string, phase?: "draw" | "discard") {
  if (ctx.gs.status !== "in_game") throw new HttpsError("failed-precondition", "Game isn't running.");
  if (ctx.gs.turnUid !== uid) throw new HttpsError("failed-precondition", "It's not your turn.");
  if (phase && ctx.gs.phase !== phase) {
    throw new HttpsError("failed-precondition", `You must ${phase === "draw" ? "draw" : "act"} now.`);
  }
}

function refreshCounts(ctx: Ctx) {
  const counts: Record<string, number> = {};
  for (const s of ctx.gs.seats) counts[s.uid] = ctx.hands[s.uid].length;
  ctx.gs.handCounts = counts;
  ctx.gs.stockCount = ctx.deck.length;
}

/**
 * Persist the in-progress game (no resolution).
 * `changedHandUids` should list only the players whose cards actually moved
 * (usually just the acting player) so we skip needless writes; if omitted, all
 * hands are written (used by advanceTurn callers that don't touch hands but
 * historically wrote them all).
 */
function commitProgress(
  tx: Transaction,
  code: string,
  ctx: Ctx,
  action: string,
  changedHandUids?: string[]
) {
  refreshCounts(ctx);
  ctx.gs.lastAction = action;
  // Firestore can't take nested arrays, so encode melds before persist.
  tx.set(gsRef(code), { ...ctx.gs, melds: encodeMelds(ctx.gs.melds) });
  tx.set(deckRef(code), { stock: ctx.deck });
  const uidsToWrite = changedHandUids ?? ctx.gs.seats.map((s) => s.uid);
  for (const uid of uidsToWrite) tx.set(handRef(code, uid), { cards: ctx.hands[uid] });
  tx.update(roomRef(code), { updatedAt: Date.now() });
}

function advanceTurn(ctx: Ctx, now: number) {
  ctx.gs.turnSeat = (ctx.gs.turnSeat + 1) % ctx.gs.seats.length;
  ctx.gs.turnUid = ctx.gs.seats[ctx.gs.turnSeat].uid;
  ctx.gs.phase = "draw";
  ctx.gs.turnDeadline = now + TURN_MS;
  ctx.gs.turnStartExposed = (ctx.gs.melds[ctx.gs.turnUid]?.length ?? 0) > 0;
}

// ===== resolution + settlement =====

/**
 * Inputs settleEconomy needs. Produced by settleGameStateInTx during the
 * gameDb transaction so we can settle the economy after that transaction
 * commits.
 */
type FightResponse = "fight" | "fold" | "burned";
type SettleEcoInputs = {
  code: string;
  now: number;
  seats: Seat[];
  values: Record<string, number>;
  winnerUid: string;
  resultType: ResultType;
  jackpot: number;
  payoutJackpot: boolean;
  C: number;
  secret: boolean;
  fightResponses?: Record<string, FightResponse>;
  matchId: string;
  matchDurationSeconds: number;
};

/**
 * Runs INSIDE the gameDb transaction. Writes only to gameDb — room →
 * post_game with lastResult, gs → ended, deck cleared, hands cleared. Returns
 * everything settleEconomy needs to finalise on the default db.
 */
function settleGameStateInTx(
  tx: Transaction,
  code: string,
  ctx: Ctx,
  resultType: ResultType,
  winnerUid: string,
  opts: { secret: boolean; fightResponses?: Record<string, FightResponse> }
): SettleEcoInputs {
  const now = Date.now();
  const seats = ctx.gs.seats;
  const C = (ctx.room.challengePoints as number) ?? 0;

  const values: Record<string, number> = {};
  for (const s of seats) {
    values[s.uid] = s.uid === winnerUid && resultType === "tongits_win" ? 0 : handValue(ctx.hands[s.uid]);
  }
  // Streak-based jackpot: same winner two hands in a row claims the pot.
  const prevWinnerUid = (ctx.room.lastWinnerUid as string | null | undefined) ?? null;
  const prevStreak = (ctx.room.winStreak as number | undefined) ?? 0;
  const newStreak = prevWinnerUid === winnerUid ? prevStreak + 1 : 1;
  const payoutJackpot = newStreak >= 2;
  const nextWinStreak = payoutJackpot ? 0 : newStreak;
  const nextLastWinnerUid = winnerUid;
  const jackpot = payoutJackpot ? ctx.gs.jackpotPoints : 0;

  // Pre-generate matchId (default-db collection id) so lastResult can point at
  // the match record that settleEconomy will write after commit.
  const matchId = db.collection("game_matches").doc().id;

  const players = { ...(ctx.room.players as Record<string, Record<string, unknown>>) };
  // Process idle spectators from this round
  const idleUids = (ctx.gs.idleUids ?? []) as string[];
  for (const idleUid of idleUids) {
    if (!players[idleUid]) continue;
    if (players[idleUid].joinNextRound) {
      players[idleUid] = { ...players[idleUid], role: "active", joinNextRound: false, isReady: false, agreedToChallenge: false };
    } else {
      delete players[idleUid];
    }
  }
  // Reset active players' ready state
  for (const uid of Object.keys(players)) {
    if (!idleUids.includes(uid)) {
      players[uid] = { ...players[uid], isReady: false, agreedToChallenge: false };
    }
  }
  const winnerName = seats.find((s) => s.uid === winnerUid)?.name ?? "Winner";

  tx.update(roomRef(code), {
    players,
    playerUids: Object.keys(players),
    status: "post_game",
    jackpotPoints: payoutJackpot ? 0 : ctx.gs.jackpotPoints,
    lastWinnerUid: nextLastWinnerUid,
    winStreak: nextWinStreak,
    gamesPlayed: ((ctx.room.gamesPlayed as number) ?? 0) + 1,
    updatedAt: now,
    postGameResponses: {},
    postGameDeadline: now + 15_000,
    lastResult: {
      matchId,
      resultType,
      winnerUserId: winnerUid,
      winnerName,
      jackpotWon: jackpot,
      values,
      melds: encodeMelds(ctx.gs.melds),
      hands: Object.fromEntries(seats.map((s) => [s.uid, ctx.hands[s.uid]])),
      completedAt: now,
      ...(opts.fightResponses ? { fightResponses: opts.fightResponses } : {}),
    },
  });

  ctx.gs.status = "ended";
  tx.set(gsRef(code), { ...ctx.gs, status: "ended", melds: encodeMelds(ctx.gs.melds) });
  tx.set(deckRef(code), { stock: [] });
  for (const s of seats) tx.set(handRef(code, s.uid), { cards: [] });

  return {
    code,
    now,
    seats,
    values,
    winnerUid,
    resultType,
    jackpot,
    payoutJackpot,
    C,
    secret: opts.secret,
    fightResponses: opts.fightResponses,
    matchId,
    matchDurationSeconds: Math.round((now - (ctx.gs.startedAt ?? now)) / 1000),
  };
}

/**
 * Runs AFTER the gameDb transaction commits. Its own default-db transaction:
 * writes user points, ranking, tongits stats, match records, transactions,
 * and the rolling leaderboard.
 *
 * If this throws, the room is already post_game but balances/history didn't
 * apply. The lastResult on the room carries enough info to retry from an
 * ops function later.
 */
async function settleEconomy(input: SettleEcoInputs) {
  const { code, now, seats, values, winnerUid, resultType, jackpot, payoutJackpot, C, secret, matchId, matchDurationSeconds, fightResponses } = input;
  const hasFight = resultType === "lowest_points_win" && fightResponses;
  const fighterCount = hasFight ? seats.filter((s) => fightResponses[s.uid] === "fight").length : seats.length;

  await db.runTransaction(async (tx) => {
    const stateSnaps: Record<string, FirebaseFirestore.DocumentData> = {};
    const lbSnaps: Record<string, FirebaseFirestore.DocumentData> = {};
    for (const s of seats) {
      const snap = await tx.get(userStateRef(s.uid));
      stateSnaps[s.uid] = (snap.exists ? snap.data() : {}) as FirebaseFirestore.DocumentData;
      const lb = await tx.get(lbRef(s.uid));
      lbSnaps[s.uid] = (lb.exists ? lb.data() : {}) as FirebaseFirestore.DocumentData;
    }
    const keys = periodKeys(now);

    tx.set(db.doc(`game_matches/${matchId}`), {
      roomCode: code,
      winnerUserId: winnerUid,
      resultType,
      matchStatus: "completed",
      matchDurationSeconds,
      createdAt: now - matchDurationSeconds * 1000,
      completedAt: now,
    });

    const ranked = [...seats].sort((a, b) => values[a.uid] - values[b.uid]);
    ranked.forEach((s, i) => {
      const isWinner = s.uid === winnerUid;
      const cur = stateSnaps[s.uid];
      const points = (cur.points as number) ?? 0;
      const locked = (cur.lockedPoints as number) ?? 0;
      const rp = (cur.rankingPoints as number) ?? 0;
      const games = (cur.tongitsGames as number) ?? 0;
      const wins = (cur.tongitsWins as number) ?? 0;
      const losses = (cur.tongitsLosses as number) ?? 0;

      const isFighter = !hasFight || fightResponses[s.uid] === "fight";
      const didFold = hasFight && !isFighter;

      const rankingEarned = isWinner
        ? (resultType === "tongits_win" ? RP_TONGITS : RP_SHOWDOWN) + (secret ? RP_SECRET : 0)
        : RP_LOSS;
      const winnings = isWinner ? C * fighterCount + jackpot : didFold ? C : 0;

      tx.set(
        userStateRef(s.uid),
        {
          points: points + winnings,
          lockedPoints: Math.max(0, locked - C),
          rankingPoints: rp + rankingEarned,
          tongitsGames: games + 1,
          tongitsWins: wins + (isWinner ? 1 : 0),
          tongitsLosses: losses + (isWinner ? 0 : 1),
        },
        { merge: true }
      );

      const pointsLost = isWinner ? 0 : didFold ? 0 : C;
      tx.set(db.collection("game_match_results").doc(), {
        matchId,
        userId: s.uid,
        finalPosition: isWinner ? 1 : i + 1,
        finalHandValue: values[s.uid],
        pointsEarned: winnings,
        pointsLost,
        rankingPointsEarned: rankingEarned,
        createdAt: now,
      });

      const txnType = isWinner ? "challenge_points_won" : didFold ? "challenge_points_refunded" : "challenge_points_lost";
      const txnAmount = isWinner ? winnings : didFold ? C : C;
      tx.set(txnCol().doc(), {
        userId: s.uid,
        type: txnType,
        amount: txnAmount,
        roomCode: code,
        matchId,
        description: isWinner
          ? `Won ${winnings} in Tongits room ${code}`
          : didFold
            ? `Folded — ${C} refunded in room ${code}`
            : `Lost ${C} in Tongits room ${code}`,
        createdAt: now,
      });

      const lb = lbSnaps[s.uid];
      const roll = (key: string, storedKey: unknown, storedRP: unknown) =>
        (storedKey === key ? ((storedRP as number) ?? 0) : 0) + rankingEarned;
      tx.set(
        lbRef(s.uid),
        {
          uid: s.uid,
          name: s.name,
          allTimeRP: ((lb.allTimeRP as number) ?? 0) + rankingEarned,
          wins: ((lb.wins as number) ?? 0) + (isWinner ? 1 : 0),
          games: ((lb.games as number) ?? 0) + 1,
          dayKey: keys.day,
          dayRP: roll(keys.day, lb.dayKey, lb.dayRP),
          weekKey: keys.week,
          weekRP: roll(keys.week, lb.weekKey, lb.weekRP),
          monthKey: keys.month,
          monthRP: roll(keys.month, lb.monthKey, lb.monthRP),
          updatedAt: now,
        },
        { merge: true }
      );
    });

    if (payoutJackpot && jackpot > 0) {
      tx.set(txnCol().doc(), {
        userId: winnerUid,
        type: "jackpot_won",
        amount: jackpot,
        roomCode: code,
        matchId,
        description: `Won the ${jackpot} jackpot in room ${code}`,
        createdAt: now,
      });
    }
  });
}

/**
 * Detect a Tongits (empty hand) and, if so, tear down the game state inside
 * the current gameDb transaction and return the settle inputs. The caller
 * must run `settleEconomy(returnValue)` after the gameDb transaction commits.
 * Returns null if no Tongits occurred (the caller keeps going normally).
 */
function checkTongits(tx: Transaction, code: string, ctx: Ctx, uid: string): SettleEcoInputs | null {
  if (ctx.hands[uid].length > 0) return null;
  const secret = !ctx.gs.turnStartExposed;
  return settleGameStateInTx(tx, code, ctx, "tongits_win", uid, { secret });
}

// ===== callables =====

/**
 * Start the match once the room is locked & ready. Deals, collects antes.
 * Two-phase because room lives on gameDb (Singapore) while user economy lives
 * on the default db (us-central):
 *   Phase A (default db): validate + deduct antes from each player's points.
 *   Phase B (gameDb): validate room again, create gs/deck/hands, flip to in_game.
 * If B fails after A, we refund the antes.
 */
export const startTongitsGame = onCall({ region: GAME_REGION }, async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const now = Date.now();

  // Read the room from gameDb first so both phases work with the same seats/ante.
  const roomSnapPre = await roomRef(code).get();
  if (!roomSnapPre.exists) throw new HttpsError("not-found", "Room not found.");
  const roomPre = roomSnapPre.data() as FirebaseFirestore.DocumentData;
  if (!roomPre.players?.[uid]) throw new HttpsError("permission-denied", "You're not in this room.");
  if (roomPre.status !== "ready") throw new HttpsError("failed-precondition", "Room isn't ready to start.");

  const allPlayers = Object.values(roomPre.players as Record<string, { uid: string; seat: number; name: string; role?: string }>);
  const activePlayers = allPlayers.filter((p) => p.role !== "idle");
  const idlePlayers = allPlayers.filter((p) => p.role === "idle");
  if (activePlayers.length < 2 || activePlayers.length > 3) {
    throw new HttpsError("failed-precondition", "Need 2 or 3 active players.");
  }
  const seats: Seat[] = activePlayers.map((p) => ({ uid: p.uid, seat: p.seat, name: p.name })).sort((a, b) => a.seat - b.seat);
  const lastWinnerUid = roomPre.lastWinnerUid as string | null;
  if (lastWinnerUid) {
    const wi = seats.findIndex((s) => s.uid === lastWinnerUid);
    if (wi > 0) {
      const tail = seats.splice(0, wi);
      seats.push(...tail);
    }
  }
  const ante = (roomPre.jackpotAnte as number) ?? 0;

  // Phase A — deduct antes on the default (us-central) db.
  if (ante > 0) {
    await db.runTransaction(async (tx) => {
      const stateSnaps: Record<string, FirebaseFirestore.DocumentData> = {};
      for (const s of seats) {
        const snap = await tx.get(userStateRef(s.uid));
        stateSnaps[s.uid] = (snap.exists ? snap.data() : {}) as FirebaseFirestore.DocumentData;
        if (((stateSnaps[s.uid].points as number) ?? 0) < ante) {
          throw new HttpsError("failed-precondition", `${s.name} can't cover the ${ante} jackpot ante.`);
        }
      }
      for (const s of seats) {
        tx.set(userStateRef(s.uid), { points: ((stateSnaps[s.uid].points as number) ?? 0) - ante }, { merge: true });
        tx.set(txnCol().doc(), {
          userId: s.uid,
          type: "jackpot_ante",
          amount: ante,
          roomCode: code,
          matchId: null,
          description: `Ante ${ante} to the room ${code} jackpot`,
          createdAt: now,
        });
      }
    });
  }

  // Phase B — create game state on gameDb. If this fails, refund the antes.
  try {
    const { hands, stock } = deal(seats.length as 2 | 3);
    const handMap: Record<string, Card[]> = {};
    seats.forEach((s, i) => (handMap[s.uid] = hands[i]));

    await gameDb.runTransaction(async (tx) => {
      const roomSnap = await tx.get(roomRef(code));
      if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found.");
      const room = roomSnap.data() as FirebaseFirestore.DocumentData;
      if (room.status !== "ready") throw new HttpsError("failed-precondition", "Room isn't ready to start.");

      const gs: GamePublic = {
        status: "in_game",
        round: ((room.gamesPlayed as number) ?? 0) + 1,
        turnSeat: 0,
        turnUid: seats[0].uid,
        phase: "discard",
        stockCount: stock.length,
        discard: [],
        melds: Object.fromEntries(seats.map((s) => [s.uid, [] as Card[][]])),
        handCounts: Object.fromEntries(seats.map((s) => [s.uid, handMap[s.uid].length])),
        hasExposed: Object.fromEntries(seats.map((s) => [s.uid, false])),
        turnStartExposed: false,
        seats,
        turnDeadline: now + TURN_MS,
        consecutiveTimeouts: Object.fromEntries(seats.map((s) => [s.uid, 0])),
        jackpotPoints: ((room.jackpotPoints as number) ?? 0) + ante * seats.length,
        startedAt: now,
        cantFight: Object.fromEntries(seats.map((s) => [s.uid, false])),
        idleUids: idlePlayers.map((p) => p.uid),
      };

      const jackpotContrib: Record<string, Record<string, unknown>> = {};
      for (const s of seats) {
        const prev = (room.players[s.uid].jackpotContributed as number) ?? 0;
        jackpotContrib[s.uid] = { ...room.players[s.uid], jackpotContributed: prev + ante };
        tx.set(handRef(code, s.uid), { cards: handMap[s.uid] });
      }
      tx.set(deckRef(code), { stock });
      tx.set(gsRef(code), { ...gs, melds: encodeMelds(gs.melds) });
      tx.update(roomRef(code), {
        players: { ...room.players, ...jackpotContrib },
        status: "in_game",
        jackpotPoints: gs.jackpotPoints,
        startedAt: now,
        updatedAt: now,
      });
    });
  } catch (err) {
    if (ante > 0) {
      // Refund on failure so nobody's balance is stuck out.
      await db.runTransaction(async (tx) => {
        for (const s of seats) {
          const snap = await tx.get(userStateRef(s.uid));
          const cur = (snap.exists ? snap.data() : {}) as FirebaseFirestore.DocumentData;
          tx.set(userStateRef(s.uid), { points: ((cur.points as number) ?? 0) + ante }, { merge: true });
          tx.set(txnCol().doc(), {
            userId: s.uid,
            type: "jackpot_ante_refund",
            amount: ante,
            roomCode: code,
            matchId: null,
            description: `Refund ante ${ante} — game start failed in room ${code}`,
            createdAt: Date.now(),
          });
        }
      }).catch((refundErr) => {
        // Best-effort — log and let the outer error propagate.
        // eslint-disable-next-line no-console
        console.error("Ante refund failed", { code, refundErr });
      });
    }
    throw err;
  }
  return { ok: true };
});

export const tongitsDraw = onCall({ region: GAME_REGION, minInstances: 1 }, async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  let eco: SettleEcoInputs | null = null;
  await gameDb.runTransaction(async (tx) => {
    const ctx = await loadCtx(tx, code);
    requireTurn(ctx, uid, "draw");
    if (ctx.deck.length === 0) {
      // Stock exhausted → showdown, lowest hand wins (draw).
      const entries = ctx.gs.seats.map((s) => ({ uid: s.uid, seat: s.seat, value: handValue(ctx.hands[s.uid]) }));
      const winner = resolveShowdown(entries);
      eco = settleGameStateInTx(tx, code, ctx, "draw_win", winner, { secret: false });
      return;
    }
    const card = ctx.deck.shift() as Card;
    ctx.hands[uid].push(card);
    ctx.gs.phase = "discard";
    ctx.gs.consecutiveTimeouts[uid] = 0;
    commitProgress(tx, code, ctx, `${ctx.gs.seats.find((s) => s.uid === uid)?.name} drew`, [uid]);
  });
  if (eco) {
    await settleEconomy(eco);
    return { ok: true, ended: true };
  }
  return { ok: true };
});

export const tongitsTakeDiscard = onCall({ region: GAME_REGION, minInstances: 1 }, async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const meldCards = ((request.data as { meldCards?: Card[] })?.meldCards ?? []).map(String);
  let eco: SettleEcoInputs | null = null;
  await gameDb.runTransaction(async (tx) => {
    const ctx = await loadCtx(tx, code);
    requireTurn(ctx, uid, "draw");
    const top = ctx.gs.discard[ctx.gs.discard.length - 1];
    if (!top) throw new HttpsError("failed-precondition", "The discard pile is empty.");
    if (!meldCards.includes(top)) throw new HttpsError("invalid-argument", "The meld must use the top discard.");
    if (!isValidMeld(meldCards)) throw new HttpsError("invalid-argument", "That isn't a valid meld.");
    const fromHand = meldCards.filter((c) => c !== top);
    if (!handContainsAll(ctx.hands[uid], fromHand)) {
      throw new HttpsError("invalid-argument", "You don't hold those cards.");
    }
    // Take the discard, remove used cards from hand, expose the meld.
    ctx.gs.discard.pop();
    for (const c of fromHand) ctx.hands[uid].splice(ctx.hands[uid].indexOf(c), 1);
    ctx.gs.melds[uid].push(meldCards);
    ctx.gs.hasExposed[uid] = true;
    ctx.gs.phase = "discard";
    ctx.gs.consecutiveTimeouts[uid] = 0;
    eco = checkTongits(tx, code, ctx, uid);
    if (!eco) commitProgress(tx, code, ctx, "took discard + melded", [uid]);
  });
  if (eco) {
    await settleEconomy(eco);
    return { ok: true, ended: true };
  }
  return { ok: true };
});

export const tongitsMeld = onCall({ region: GAME_REGION, minInstances: 1 }, async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const cards = ((request.data as { cards?: Card[] })?.cards ?? []).map(String);
  let eco: SettleEcoInputs | null = null;
  await gameDb.runTransaction(async (tx) => {
    const ctx = await loadCtx(tx, code);
    requireTurn(ctx, uid, "discard");
    if (!isValidMeld(cards)) throw new HttpsError("invalid-argument", "That isn't a valid meld.");
    if (!handContainsAll(ctx.hands[uid], cards)) throw new HttpsError("invalid-argument", "You don't hold those cards.");
    for (const c of cards) ctx.hands[uid].splice(ctx.hands[uid].indexOf(c), 1);
    ctx.gs.melds[uid].push(cards);
    ctx.gs.hasExposed[uid] = true;
    eco = checkTongits(tx, code, ctx, uid);
    if (!eco) commitProgress(tx, code, ctx, "melded", [uid]);
  });
  if (eco) {
    await settleEconomy(eco);
    return { ok: true, ended: true };
  }
  return { ok: true };
});

export const tongitsSapaw = onCall({ region: GAME_REGION, minInstances: 1 }, async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const data = (request.data ?? {}) as { targetUid?: string; meldIndex?: number; card?: string };
  const targetUid = String(data.targetUid ?? "");
  const meldIndex = Number(data.meldIndex);
  const card = String(data.card ?? "");
  let eco: SettleEcoInputs | null = null;
  await gameDb.runTransaction(async (tx) => {
    const ctx = await loadCtx(tx, code);
    requireTurn(ctx, uid, "discard");
    const target = ctx.gs.melds[targetUid];
    if (!target || !target[meldIndex]) throw new HttpsError("not-found", "That meld doesn't exist.");
    if (!ctx.hands[uid].includes(card)) throw new HttpsError("invalid-argument", "You don't hold that card.");
    const next = sapaw(target[meldIndex], card);
    if (!next) throw new HttpsError("invalid-argument", "That card can't be added to that meld.");
    target[meldIndex] = next;
    ctx.hands[uid].splice(ctx.hands[uid].indexOf(card), 1);
    if (targetUid !== uid) ctx.gs.cantFight[targetUid] = true;
    eco = checkTongits(tx, code, ctx, uid);
    if (!eco) commitProgress(tx, code, ctx, "sapaw", [uid]);
  });
  if (eco) {
    await settleEconomy(eco);
    return { ok: true, ended: true };
  }
  return { ok: true };
});

export const tongitsDiscard = onCall({ region: GAME_REGION, minInstances: 1 }, async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const card = String((request.data as { card?: string })?.card ?? "");
  const now = Date.now();
  let eco: SettleEcoInputs | null = null;
  await gameDb.runTransaction(async (tx) => {
    const ctx = await loadCtx(tx, code);
    requireTurn(ctx, uid, "discard");
    if (!ctx.hands[uid].includes(card)) throw new HttpsError("invalid-argument", "You don't hold that card.");
    ctx.hands[uid].splice(ctx.hands[uid].indexOf(card), 1);
    ctx.gs.discard.push(card);
    if (ctx.gs.cantFight) ctx.gs.cantFight[uid] = false;
    // Discarding your last card is a Tongits.
    eco = checkTongits(tx, code, ctx, uid);
    if (eco) return;
    advanceTurn(ctx, now);
    commitProgress(tx, code, ctx, "discarded", [uid]);
  });
  if (eco) {
    await settleEconomy(eco);
    return { ok: true, ended: true };
  }
  return { ok: true };
});

export const tongitsCall = onCall({ region: GAME_REGION, minInstances: 1 }, async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  let eco: SettleEcoInputs | null = null;
  let fightStarted = false;
  await gameDb.runTransaction(async (tx) => {
    const ctx = await loadCtx(tx, code);
    requireTurn(ctx, uid, "discard");
    if ((ctx.gs.melds[uid]?.length ?? 0) === 0) {
      throw new HttpsError("failed-precondition", "You need at least one exposed meld to call.");
    }
    if (ctx.gs.cantFight?.[uid]) {
      throw new HttpsError("failed-precondition", "You can't fight this turn — your meld was sapawed.");
    }
    const now = Date.now();
    const responses: Record<string, FightResponse> = { [uid]: "fight" };
    for (const s of ctx.gs.seats) {
      if (s.uid === uid) continue;
      if ((ctx.gs.melds[s.uid]?.length ?? 0) === 0) responses[s.uid] = "burned";
    }
    const allResolved = ctx.gs.seats.every((s) => responses[s.uid] !== undefined);
    if (allResolved) {
      eco = resolveFightInTx(tx, code, ctx, uid, responses);
    } else {
      ctx.gs.phase = "fight";
      ctx.gs.fightState = { callerUid: uid, responses, deadline: now + 10_000 };
      commitProgress(tx, code, ctx, "fight_called", []);
      fightStarted = true;
    }
  });
  if (eco) await settleEconomy(eco);
  if (eco) return { ok: true, ended: true };
  if (fightStarted) return { ok: true, fight: true };
  return { ok: true, ended: true };
});

function resolveFightInTx(
  tx: Transaction, code: string, ctx: Ctx,
  callerUid: string, responses: Record<string, FightResponse>
): SettleEcoInputs {
  const fighters = ctx.gs.seats.filter((s) => responses[s.uid] === "fight");
  let winner: string;
  if (fighters.length <= 1) {
    winner = callerUid;
  } else {
    const entries = fighters.map((s) => ({ uid: s.uid, seat: s.seat, value: handValue(ctx.hands[s.uid]) }));
    winner = resolveShowdown(entries, callerUid);
  }
  return settleGameStateInTx(tx, code, ctx, "lowest_points_win", winner, { secret: false, fightResponses: responses });
}

export const tongitsFightRespond = onCall({ region: GAME_REGION, minInstances: 1 }, async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const response = (request.data as { response?: string }).response;
  if (response !== "fight" && response !== "fold") {
    throw new HttpsError("invalid-argument", "Response must be 'fight' or 'fold'.");
  }
  let eco: SettleEcoInputs | null = null;
  await gameDb.runTransaction(async (tx) => {
    const ctx = await loadCtx(tx, code);
    if (ctx.gs.status !== "in_game") throw new HttpsError("failed-precondition", "Game isn't running.");
    if (ctx.gs.phase !== "fight") throw new HttpsError("failed-precondition", "Not in fight phase.");
    if (!ctx.gs.fightState) throw new HttpsError("failed-precondition", "No fight state.");
    if (!ctx.gs.seats.some((s) => s.uid === uid)) throw new HttpsError("permission-denied", "Not in this game.");
    if (ctx.gs.fightState.responses[uid] !== undefined) {
      throw new HttpsError("failed-precondition", "You already responded.");
    }
    ctx.gs.fightState.responses[uid] = response;
    const allResolved = ctx.gs.seats.every((s) => ctx.gs.fightState!.responses[s.uid] !== undefined);
    if (allResolved) {
      eco = resolveFightInTx(tx, code, ctx, ctx.gs.fightState.callerUid, ctx.gs.fightState.responses);
    } else {
      commitProgress(tx, code, ctx, "fight_responded", []);
    }
  });
  if (eco) await settleEconomy(eco);
  return { ok: true, ended: !!eco };
});

/** Any player may enforce the turn timer or fight deadline once it passes. */
export const enforceTongitsTimeout = onCall({ region: GAME_REGION }, async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const now = Date.now();
  let eco: SettleEcoInputs | null = null;
  const result = await gameDb.runTransaction<{ ok: boolean; ended?: boolean; skipped?: boolean; autoPlayed?: boolean }>(async (tx) => {
    const ctx = await loadCtx(tx, code);
    if (ctx.gs.status !== "in_game") return { ok: true, ended: true };
    if (!ctx.gs.seats.some((s) => s.uid === uid)) throw new HttpsError("permission-denied", "Not your room.");

    if (ctx.gs.phase === "fight" && ctx.gs.fightState) {
      if (now <= ctx.gs.fightState.deadline) return { ok: true, skipped: true };
      for (const s of ctx.gs.seats) {
        if (ctx.gs.fightState.responses[s.uid] === undefined) ctx.gs.fightState.responses[s.uid] = "fold";
      }
      eco = resolveFightInTx(tx, code, ctx, ctx.gs.fightState.callerUid, ctx.gs.fightState.responses);
      return { ok: true, ended: true };
    }

    if (now <= ctx.gs.turnDeadline) return { ok: true, skipped: true };

    const cur = ctx.gs.turnUid;
    const timeouts = (ctx.gs.consecutiveTimeouts[cur] ?? 0) + 1;
    ctx.gs.consecutiveTimeouts[cur] = timeouts;

    // Auto-play: draw from stock if needed, then discard the worst card.
    if (ctx.gs.phase === "draw") {
      if (ctx.deck.length === 0) {
        const entries = ctx.gs.seats.map((s) => ({ uid: s.uid, seat: s.seat, value: handValue(ctx.hands[s.uid]) }));
        const winner = resolveShowdown(entries);
        eco = settleGameStateInTx(tx, code, ctx, "draw_win", winner, { secret: false });
        return { ok: true, ended: true };
      }
      ctx.hands[cur].push(ctx.deck.shift() as Card);
    }
    const drop = autoDiscardCard(ctx.hands[cur]);
    ctx.hands[cur].splice(ctx.hands[cur].indexOf(drop), 1);
    ctx.gs.discard.push(drop);
    if (ctx.hands[cur].length === 0) {
      // Auto-play emptied the hand — count it as a Tongits for that player.
      const secret = !ctx.gs.turnStartExposed;
      eco = settleGameStateInTx(tx, code, ctx, "tongits_win", cur, { secret });
      return { ok: true, ended: true };
    }
    advanceTurn(ctx, now);
    commitProgress(tx, code, ctx, "auto-played (timeout)", [cur]);
    return { ok: true, autoPlayed: true };
  });
  if (eco) await settleEconomy(eco);
  return result;
});

/** Idle player chooses to join the next round or quit the room. */
export const tongitsIdleAction = onCall({ region: GAME_REGION }, async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const action = (request.data as { action?: string }).action;
  if (action !== "join_next" && action !== "quit") {
    throw new HttpsError("invalid-argument", "Action must be 'join_next' or 'quit'.");
  }
  const now = Date.now();
  return gameDb.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef(code));
    if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = roomSnap.data() as FirebaseFirestore.DocumentData;
    if (!room.players?.[uid]) throw new HttpsError("permission-denied", "Not in this room.");
    if (room.players[uid].role !== "idle") throw new HttpsError("failed-precondition", "You're not idle.");
    const players = { ...room.players };
    if (action === "quit") {
      delete players[uid];
      tx.update(roomRef(code), { players, playerUids: Object.keys(players), updatedAt: now });
    } else {
      players[uid] = { ...players[uid], joinNextRound: true };
      tx.update(roomRef(code), { players, updatedAt: now });
    }
    return { ok: true };
  });
});

/** Reset a finished room for another game (stakes re-lock via the ready flow). */
export const tongitsPlayAgain = onCall({ region: GAME_REGION }, async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const now = Date.now();
  return gameDb.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef(code));
    if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = roomSnap.data() as FirebaseFirestore.DocumentData;
    if (!room.players?.[uid]) throw new HttpsError("permission-denied", "You're not in this room.");
    if (room.status !== "post_game") throw new HttpsError("failed-precondition", "No finished game to replay.");
    const count = Object.keys(room.players).length;
    tx.update(roomRef(code), {
      status: count >= 3 ? "full" : "open",
      lastResult: null,
      updatedAt: now,
    });
    tx.delete(gsRef(code));
    return { ok: true };
  });
});

/** Record a player's post-game choice (continue or quit). */
export const tongitsPostGameRespond = onCall({ region: GAME_REGION }, async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const response = (request.data as { response?: string }).response;
  if (response !== "continue" && response !== "quit") {
    throw new HttpsError("invalid-argument", "Response must be 'continue' or 'quit'.");
  }
  const now = Date.now();
  return gameDb.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef(code));
    if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = roomSnap.data() as FirebaseFirestore.DocumentData;
    if (!room.players?.[uid]) throw new HttpsError("permission-denied", "You're not in this room.");
    if (room.status !== "post_game") throw new HttpsError("failed-precondition", "Not in post-game.");
    const responses = { ...(room.postGameResponses ?? {}) } as Record<string, string>;
    if (responses[uid]) throw new HttpsError("failed-precondition", "Already responded.");
    responses[uid] = response;
    tx.update(roomRef(code), { postGameResponses: responses, updatedAt: now });
    const allResponded = Object.keys(room.players).every((u: string) => responses[u]);
    return { ok: true, allResponded };
  });
});

/** Resolve the post-game phase: start next round or return to waiting room. */
export const tongitsResolvePostGame = onCall({ region: GAME_REGION }, async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const now = Date.now();
  return gameDb.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef(code));
    if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = roomSnap.data() as FirebaseFirestore.DocumentData;
    if (!room.players?.[uid]) throw new HttpsError("permission-denied", "You're not in this room.");
    if (room.status !== "post_game") throw new HttpsError("failed-precondition", "Not in post-game.");
    const players = { ...(room.players as Record<string, Record<string, unknown>>) };
    const playerUids = Object.keys(players);
    const responses = { ...(room.postGameResponses ?? {}) } as Record<string, string>;
    const deadline = (room.postGameDeadline as number) ?? 0;
    const allResponded = playerUids.every((u) => responses[u]);
    if (!allResponded && now < deadline) {
      throw new HttpsError("failed-precondition", "Waiting for responses or deadline.");
    }
    // Quitters → removed; non-responders → idle; continuers → active
    for (const u of playerUids) {
      if (responses[u] === "quit") {
        delete players[u];
      } else if (!responses[u]) {
        players[u] = { ...players[u], role: "idle", joinNextRound: false, isReady: false, agreedToChallenge: false };
      } else {
        players[u] = { ...players[u], role: "active", isReady: true, agreedToChallenge: true };
      }
    }
    const remaining = Object.keys(players);
    if (remaining.length === 0) {
      tx.update(roomRef(code), { status: "cancelled", updatedAt: now, completedAt: now, postGameResponses: null, postGameDeadline: null });
      tx.delete(gsRef(code));
      return { ok: true, result: "cancelled" as const };
    }
    const activePlayers = remaining.filter((u) => players[u].role !== "idle");
    // Pot just paid out + only 2 active → force waiting room
    const lastJackpotWon = (room.lastResult?.jackpotWon as number) ?? 0;
    const forceWaitingRoom = lastJackpotWon > 0 && activePlayers.length <= 2;
    if (activePlayers.length <= 1 || forceWaitingRoom) {
      for (const u of remaining) {
        players[u] = { ...players[u], role: "active", isReady: false, agreedToChallenge: false };
      }
      tx.update(roomRef(code), {
        players, playerUids: remaining,
        status: remaining.length >= 3 ? "full" : "open",
        postGameResponses: null, postGameDeadline: null, lastResult: null, updatedAt: now,
      });
      tx.delete(gsRef(code));
      return { ok: true, result: "waiting_room" as const };
    }
    // 2+ active → auto-start next round
    tx.update(roomRef(code), {
      players, playerUids: remaining,
      status: "ready",
      postGameResponses: null, postGameDeadline: null, lastResult: null, updatedAt: now,
    });
    tx.delete(gsRef(code));
    return { ok: true, result: "ready" as const, needsStart: true };
  });
});

/**
 * Split an unclaimed jackpot equally among the remaining players and close the
 * room. Both remaining players must call it (mutual consent).
 */
export const splitTongitsJackpot = onCall(async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const now = Date.now();

  type Outcome = {
    phaseA: { ok: boolean; waiting?: boolean; split?: boolean };
    payout: { uids: string[]; jackpot: number } | null;
  };
  const outcome = await gameDb.runTransaction<Outcome>(async (tx) => {
    const roomSnap = await tx.get(roomRef(code));
    if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = roomSnap.data() as FirebaseFirestore.DocumentData;
    const players = room.players as Record<string, Record<string, unknown>>;
    if (!players?.[uid]) throw new HttpsError("permission-denied", "You're not in this room.");
    const uids = Object.keys(players);

    const consent: Record<string, boolean> = { ...((room.splitConsent as Record<string, boolean>) ?? {}) };
    consent[uid] = true;
    const everyoneAgreed = uids.every((u) => consent[u]);
    if (!everyoneAgreed) {
      tx.update(roomRef(code), { splitConsent: consent, updatedAt: now });
      return { phaseA: { ok: true, waiting: true }, payout: null };
    }
    tx.update(roomRef(code), { status: "cancelled", jackpotPoints: 0, completedAt: now, updatedAt: now });
    return { phaseA: { ok: true, split: true }, payout: { uids, jackpot: (room.jackpotPoints as number) ?? 0 } };
  });

  if (outcome.payout) {
    const { uids, jackpot } = outcome.payout;
    const share = Math.floor(jackpot / uids.length);
    await db.runTransaction(async (tx) => {
      const stateSnaps: Record<string, FirebaseFirestore.DocumentData> = {};
      for (const u of uids) stateSnaps[u] = (await tx.get(userStateRef(u))).data() ?? {};
      uids.forEach((u, i) => {
        const extra = i === 0 ? jackpot - share * uids.length : 0;
        const amount = share + extra;
        tx.set(userStateRef(u), { points: ((stateSnaps[u].points as number) ?? 0) + amount }, { merge: true });
        tx.set(txnCol().doc(), {
          userId: u,
          type: "jackpot_split",
          amount,
          roomCode: code,
          matchId: null,
          description: `Split share of the ${jackpot} jackpot in room ${code}`,
          createdAt: now,
        });
      });
    });
  }
  return outcome.phaseA;
});
