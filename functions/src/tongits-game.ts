import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { Transaction } from "firebase-admin/firestore";
import { db } from "./init";
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
const MAX_TIMEOUTS = 2;
const RP_TONGITS = 30;
const RP_SHOWDOWN = 20;
const RP_LOSS = 2;
const RP_SECRET = 50;

type ResultType = "tongits_win" | "draw_win" | "lowest_points_win" | "player_disconnected";

type Seat = { uid: string; seat: number; name: string };

type GamePublic = {
  status: "in_game" | "ended";
  round: number;
  turnSeat: number;
  turnUid: string;
  phase: "draw" | "discard";
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
};

// ===== refs =====
const roomRef = (code: string) => db.doc(`game_rooms/${code}`);
const gsRef = (code: string) => db.doc(`game_rooms/${code}/game/state`);
const handRef = (code: string, uid: string) => db.doc(`game_rooms/${code}/hands/${uid}`);
const deckRef = (code: string) => db.doc(`game_rooms/${code}/secret/deck`);
const userStateRef = (uid: string) => db.doc(`users/${uid}/game/state`);
const txnCol = () => db.collection("game_point_transactions");

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

/** Persist the in-progress game (no resolution). */
function commitProgress(tx: Transaction, code: string, ctx: Ctx, action: string) {
  refreshCounts(ctx);
  ctx.gs.lastAction = action;
  tx.set(gsRef(code), ctx.gs);
  tx.set(deckRef(code), { stock: ctx.deck });
  for (const s of ctx.gs.seats) tx.set(handRef(code, s.uid), { cards: ctx.hands[s.uid] });
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

async function resolveAndSettle(
  tx: Transaction,
  code: string,
  ctx: Ctx,
  resultType: ResultType,
  winnerUid: string,
  opts: { jackpotPaid: boolean; secret: boolean; forfeitUid?: string }
) {
  const now = Date.now();
  const seats = ctx.gs.seats;
  const C = (ctx.room.challengePoints as number) ?? 0;

  // Final unmelded values (winner is 0 on a Tongits).
  const values: Record<string, number> = {};
  for (const s of seats) {
    values[s.uid] = s.uid === winnerUid && resultType === "tongits_win" ? 0 : handValue(ctx.hands[s.uid]);
  }
  if (opts.forfeitUid) values[opts.forfeitUid] = 9999; // forfeiter counts as worst

  // Read all three economy docs before writing.
  const stateSnaps: Record<string, FirebaseFirestore.DocumentData> = {};
  for (const s of seats) {
    const snap = await tx.get(userStateRef(s.uid));
    stateSnaps[s.uid] = (snap.exists ? snap.data() : {}) as FirebaseFirestore.DocumentData;
  }

  const jackpot = opts.jackpotPaid ? ctx.gs.jackpotPoints : 0;

  // Match + per-player result records.
  const matchRef = db.collection("game_matches").doc();
  tx.set(matchRef, {
    roomCode: code,
    winnerUserId: winnerUid,
    resultType,
    matchStatus: "completed",
    matchDurationSeconds: Math.round((now - (ctx.gs.startedAt ?? now)) / 1000),
    createdAt: ctx.gs.startedAt ?? now,
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

    const rankingEarned = isWinner
      ? (resultType === "tongits_win" ? RP_TONGITS : RP_SHOWDOWN) + (opts.secret ? RP_SECRET : 0)
      : RP_LOSS;
    const winnings = isWinner ? C * seats.length + jackpot : 0; // pool = 3C (+ jackpot)

    tx.set(
      userStateRef(s.uid),
      {
        points: points + winnings,
        lockedPoints: Math.max(0, locked - C), // release this game's stake
        rankingPoints: rp + rankingEarned,
        tongitsGames: games + 1,
        tongitsWins: wins + (isWinner ? 1 : 0),
        tongitsLosses: losses + (isWinner ? 0 : 1),
      },
      { merge: true }
    );

    tx.set(db.collection("game_match_results").doc(), {
      matchId: matchRef.id,
      userId: s.uid,
      finalPosition: isWinner ? 1 : i + 1,
      finalHandValue: values[s.uid],
      pointsEarned: winnings,
      pointsLost: isWinner ? 0 : C,
      rankingPointsEarned: rankingEarned,
      createdAt: now,
    });

    tx.set(txnCol().doc(), {
      userId: s.uid,
      type: isWinner ? "challenge_points_won" : "challenge_points_lost",
      amount: isWinner ? winnings : C,
      roomCode: code,
      matchId: matchRef.id,
      description: isWinner
        ? `Won ${winnings} in Tongits room ${code}`
        : `Lost ${C} in Tongits room ${code}`,
      createdAt: now,
    });
  });

  if (opts.jackpotPaid && jackpot > 0) {
    tx.set(txnCol().doc(), {
      userId: winnerUid,
      type: "jackpot_won",
      amount: jackpot,
      roomCode: code,
      matchId: matchRef.id,
      description: `Won the ${jackpot} jackpot in room ${code}`,
      createdAt: now,
    });
  }

  // Post-game room state: keep jackpot unless it was paid; reset ready/agreed.
  const players = { ...(ctx.room.players as Record<string, Record<string, unknown>>) };
  for (const uid of Object.keys(players)) {
    players[uid] = { ...players[uid], isReady: false, agreedToChallenge: false };
  }
  const winnerName = seats.find((s) => s.uid === winnerUid)?.name ?? "Winner";
  tx.update(roomRef(code), {
    players,
    status: "post_game",
    jackpotPoints: opts.jackpotPaid ? 0 : ctx.gs.jackpotPoints,
    gamesPlayed: ((ctx.room.gamesPlayed as number) ?? 0) + 1,
    updatedAt: now,
    lastResult: {
      matchId: matchRef.id,
      resultType,
      winnerUserId: winnerUid,
      winnerName,
      jackpotWon: jackpot,
      values,
      melds: ctx.gs.melds,
      completedAt: now,
    },
  });

  // Tear down the live game (hands + deck), leave a small ended marker.
  ctx.gs.status = "ended";
  tx.set(gsRef(code), { ...ctx.gs, status: "ended" });
  tx.set(deckRef(code), { stock: [] });
  for (const s of seats) tx.set(handRef(code, s.uid), { cards: [] });
}

/** Detect a Tongits (empty hand) for the acting player and resolve if so. */
async function checkTongits(tx: Transaction, code: string, ctx: Ctx, uid: string): Promise<boolean> {
  if (ctx.hands[uid].length > 0) return false;
  const secret = !ctx.gs.turnStartExposed; // won without a pre-existing exposed meld
  await resolveAndSettle(tx, code, ctx, "tongits_win", uid, { jackpotPaid: true, secret });
  return true;
}

// ===== callables =====

/** Start the match once the room is locked & ready. Deals, collects antes. */
export const startTongitsGame = onCall(async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef(code));
    if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = roomSnap.data() as FirebaseFirestore.DocumentData;
    if (!room.players?.[uid]) throw new HttpsError("permission-denied", "You're not in this room.");
    if (room.status !== "ready") throw new HttpsError("failed-precondition", "Room isn't ready to start.");

    const players = Object.values(room.players as Record<string, { uid: string; seat: number; name: string }>);
    if (players.length !== 3) throw new HttpsError("failed-precondition", "Need exactly 3 players.");
    const seats: Seat[] = players
      .map((p) => ({ uid: p.uid, seat: p.seat, name: p.name }))
      .sort((a, b) => a.seat - b.seat);

    // Collect the jackpot ante from each player's available points.
    const ante = (room.jackpotAnte as number) ?? 0;
    const stateSnaps: Record<string, FirebaseFirestore.DocumentData> = {};
    for (const s of seats) {
      const snap = await tx.get(userStateRef(s.uid));
      stateSnaps[s.uid] = (snap.exists ? snap.data() : {}) as FirebaseFirestore.DocumentData;
      if (ante > 0 && ((stateSnaps[s.uid].points as number) ?? 0) < ante) {
        throw new HttpsError("failed-precondition", `${s.name} can't cover the ${ante} jackpot ante.`);
      }
    }

    const { hands, stock } = deal();
    const handMap: Record<string, Card[]> = {};
    seats.forEach((s, i) => (handMap[s.uid] = hands[i])); // seat 0 (dealer) gets 13

    const gs: GamePublic = {
      status: "in_game",
      round: ((room.gamesPlayed as number) ?? 0) + 1,
      turnSeat: 0,
      turnUid: seats[0].uid, // dealer plays first, no draw
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
    };

    // Writes.
    const jackpotContrib: Record<string, Record<string, unknown>> = {};
    for (const s of seats) {
      if (ante > 0) {
        tx.set(
          userStateRef(s.uid),
          { points: ((stateSnaps[s.uid].points as number) ?? 0) - ante },
          { merge: true }
        );
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
      const prev = (room.players[s.uid].jackpotContributed as number) ?? 0;
      jackpotContrib[s.uid] = { ...room.players[s.uid], jackpotContributed: prev + ante };
      tx.set(handRef(code, s.uid), { cards: handMap[s.uid] });
    }
    tx.set(deckRef(code), { stock });
    tx.set(gsRef(code), gs);
    tx.update(roomRef(code), {
      players: { ...room.players, ...jackpotContrib },
      status: "in_game",
      jackpotPoints: gs.jackpotPoints,
      startedAt: now,
      updatedAt: now,
    });
    return { ok: true };
  });
});

export const tongitsDraw = onCall(async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  return db.runTransaction(async (tx) => {
    const ctx = await loadCtx(tx, code);
    requireTurn(ctx, uid, "draw");
    if (ctx.deck.length === 0) {
      // Stock exhausted → showdown, lowest hand wins (draw).
      const entries = ctx.gs.seats.map((s) => ({ uid: s.uid, seat: s.seat, value: handValue(ctx.hands[s.uid]) }));
      const winner = resolveShowdown(entries);
      await resolveAndSettle(tx, code, ctx, "draw_win", winner, { jackpotPaid: false, secret: false });
      return { ok: true, ended: true };
    }
    const card = ctx.deck.shift() as Card;
    ctx.hands[uid].push(card);
    ctx.gs.phase = "discard";
    ctx.gs.consecutiveTimeouts[uid] = 0;
    commitProgress(tx, code, ctx, `${ctx.gs.seats.find((s) => s.uid === uid)?.name} drew`);
    return { ok: true };
  });
});

export const tongitsTakeDiscard = onCall(async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const meldCards = ((request.data as { meldCards?: Card[] })?.meldCards ?? []).map(String);
  return db.runTransaction(async (tx) => {
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
    if (await checkTongits(tx, code, ctx, uid)) return { ok: true, ended: true };
    commitProgress(tx, code, ctx, "took discard + melded");
    return { ok: true };
  });
});

export const tongitsMeld = onCall(async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const cards = ((request.data as { cards?: Card[] })?.cards ?? []).map(String);
  return db.runTransaction(async (tx) => {
    const ctx = await loadCtx(tx, code);
    requireTurn(ctx, uid, "discard");
    if (!isValidMeld(cards)) throw new HttpsError("invalid-argument", "That isn't a valid meld.");
    if (!handContainsAll(ctx.hands[uid], cards)) throw new HttpsError("invalid-argument", "You don't hold those cards.");
    for (const c of cards) ctx.hands[uid].splice(ctx.hands[uid].indexOf(c), 1);
    ctx.gs.melds[uid].push(cards);
    ctx.gs.hasExposed[uid] = true;
    if (await checkTongits(tx, code, ctx, uid)) return { ok: true, ended: true };
    commitProgress(tx, code, ctx, "melded");
    return { ok: true };
  });
});

export const tongitsSapaw = onCall(async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const data = (request.data ?? {}) as { targetUid?: string; meldIndex?: number; card?: string };
  const targetUid = String(data.targetUid ?? "");
  const meldIndex = Number(data.meldIndex);
  const card = String(data.card ?? "");
  return db.runTransaction(async (tx) => {
    const ctx = await loadCtx(tx, code);
    requireTurn(ctx, uid, "discard");
    const target = ctx.gs.melds[targetUid];
    if (!target || !target[meldIndex]) throw new HttpsError("not-found", "That meld doesn't exist.");
    if (!ctx.hands[uid].includes(card)) throw new HttpsError("invalid-argument", "You don't hold that card.");
    const next = sapaw(target[meldIndex], card);
    if (!next) throw new HttpsError("invalid-argument", "That card can't be added to that meld.");
    target[meldIndex] = next;
    ctx.hands[uid].splice(ctx.hands[uid].indexOf(card), 1);
    if (await checkTongits(tx, code, ctx, uid)) return { ok: true, ended: true };
    commitProgress(tx, code, ctx, "sapaw");
    return { ok: true };
  });
});

export const tongitsDiscard = onCall(async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const card = String((request.data as { card?: string })?.card ?? "");
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const ctx = await loadCtx(tx, code);
    requireTurn(ctx, uid, "discard");
    if (!ctx.hands[uid].includes(card)) throw new HttpsError("invalid-argument", "You don't hold that card.");
    ctx.hands[uid].splice(ctx.hands[uid].indexOf(card), 1);
    ctx.gs.discard.push(card);
    // Discarding your last card is a Tongits.
    if (await checkTongits(tx, code, ctx, uid)) return { ok: true, ended: true };
    advanceTurn(ctx, now);
    commitProgress(tx, code, ctx, "discarded");
    return { ok: true };
  });
});

export const tongitsCall = onCall(async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  return db.runTransaction(async (tx) => {
    const ctx = await loadCtx(tx, code);
    requireTurn(ctx, uid, "discard");
    if ((ctx.gs.melds[uid]?.length ?? 0) === 0) {
      throw new HttpsError("failed-precondition", "You need at least one exposed meld to call.");
    }
    const entries = ctx.gs.seats.map((s) => ({ uid: s.uid, seat: s.seat, value: handValue(ctx.hands[s.uid]) }));
    const winner = resolveShowdown(entries, uid); // caller wins ties
    await resolveAndSettle(tx, code, ctx, "lowest_points_win", winner, { jackpotPaid: false, secret: false });
    return { ok: true, ended: true };
  });
});

/** Any player may enforce the turn timer once the deadline passes. */
export const enforceTongitsTimeout = onCall(async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const ctx = await loadCtx(tx, code);
    if (ctx.gs.status !== "in_game") return { ok: true, ended: true };
    if (!ctx.gs.seats.some((s) => s.uid === uid)) throw new HttpsError("permission-denied", "Not your room.");
    if (now <= ctx.gs.turnDeadline) return { ok: true, skipped: true };

    const cur = ctx.gs.turnUid;
    const timeouts = (ctx.gs.consecutiveTimeouts[cur] ?? 0) + 1;
    ctx.gs.consecutiveTimeouts[cur] = timeouts;

    if (timeouts >= MAX_TIMEOUTS) {
      // Forfeit → resolve among the other two (lowest wins), forfeiter loses.
      const others = ctx.gs.seats.filter((s) => s.uid !== cur);
      const entries = others.map((s) => ({ uid: s.uid, seat: s.seat, value: handValue(ctx.hands[s.uid]) }));
      const winner = resolveShowdown(entries);
      await resolveAndSettle(tx, code, ctx, "player_disconnected", winner, {
        jackpotPaid: false,
        secret: false,
        forfeitUid: cur,
      });
      return { ok: true, ended: true };
    }

    // Auto-play: draw from stock if needed, then discard the worst card.
    if (ctx.gs.phase === "draw") {
      if (ctx.deck.length === 0) {
        const entries = ctx.gs.seats.map((s) => ({ uid: s.uid, seat: s.seat, value: handValue(ctx.hands[s.uid]) }));
        const winner = resolveShowdown(entries);
        await resolveAndSettle(tx, code, ctx, "draw_win", winner, { jackpotPaid: false, secret: false });
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
      await resolveAndSettle(tx, code, ctx, "tongits_win", cur, { jackpotPaid: true, secret });
      return { ok: true, ended: true };
    }
    advanceTurn(ctx, now);
    commitProgress(tx, code, ctx, "auto-played (timeout)");
    return { ok: true, autoPlayed: true };
  });
});

/** Reset a finished room for another game (stakes re-lock via the ready flow). */
export const tongitsPlayAgain = onCall(async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
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

/**
 * Split an unclaimed jackpot equally among the remaining players and close the
 * room. Both remaining players must call it (mutual consent).
 */
export const splitTongitsJackpot = onCall(async (request) => {
  const uid = requireUid(request);
  const code = codeArg(request);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef(code));
    if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = roomSnap.data() as FirebaseFirestore.DocumentData;
    const players = room.players as Record<string, Record<string, unknown>>;
    if (!players?.[uid]) throw new HttpsError("permission-denied", "You're not in this room.");
    const uids = Object.keys(players);

    // Record this player's consent.
    const consent: Record<string, boolean> = { ...((room.splitConsent as Record<string, boolean>) ?? {}) };
    consent[uid] = true;
    const everyoneAgreed = uids.every((u) => consent[u]);
    if (!everyoneAgreed) {
      tx.update(roomRef(code), { splitConsent: consent, updatedAt: now });
      return { ok: true, waiting: true };
    }

    // Split the jackpot equally; refund is exact to the peso via floor + remainder.
    const jackpot = (room.jackpotPoints as number) ?? 0;
    const share = Math.floor(jackpot / uids.length);
    const stateSnaps: Record<string, FirebaseFirestore.DocumentData> = {};
    for (const u of uids) stateSnaps[u] = (await tx.get(userStateRef(u))).data() ?? {};
    uids.forEach((u, i) => {
      const extra = i === 0 ? jackpot - share * uids.length : 0; // remainder to first
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
    tx.update(roomRef(code), { status: "cancelled", jackpotPoints: 0, completedAt: now, updatedAt: now });
    return { ok: true, split: true };
  });
});
