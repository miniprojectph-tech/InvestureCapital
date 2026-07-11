import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { db, gameDb } from "./init";
import type { Transaction } from "firebase-admin/firestore";

// Every room mutation runs in Singapore, next to the gameDb it writes.
const GAME_REGION = "asia-southeast1";

// ===== Community Tongits — Phase 1 (rooms + economy plumbing, no gameplay) =====
// Points are the SHARED game economy at users/{uid}/game/state (Function-written).
// All room/economy mutations go through these callables; clients only read.

const MIN_CHALLENGE = 50;
const MAX_PLAYERS = 3;
const DEFAULT_ANTE = 5;
const STALE_ROOM_MS = 30 * 60 * 1000; // rooms idle this long get reaped

type RoomStatus = "open" | "full" | "ready" | "cancelled" | "in_game" | "completed";

type RoomPlayer = {
  uid: string;
  name: string;
  seat: number;
  isReady: boolean;
  agreedToChallenge: boolean;
  joinedAt: number;
  jackpotContributed: number;
};

type Room = {
  roomCode: string;
  creatorUserId: string;
  challengePoints: number;
  jackpotAnte: number;
  jackpotPoints: number;
  // Streak-based jackpot: 2 consecutive wins by the same player claims the pot.
  lastWinnerUid: string | null;
  winStreak: number;
  isPrivate?: boolean;
  maxPlayers: number;
  status: RoomStatus;
  chatEnabled: boolean;
  players: Record<string, RoomPlayer>;
  // Array mirror of players keys — indexed so the lobby can find a user's
  // active room with array-contains without a per-user field-path index.
  playerUids: string[];
  gamesPlayed: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
};

// ===== helpers =====

function requireUid(request: { auth?: { uid?: string } }): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  return uid;
}

// Rooms live in the Singapore game db; user economy stays on the default db.
const roomRef = (code: string) => gameDb.doc(`game_rooms/${code}`);
const stateRef = (uid: string) => db.doc(`users/${uid}/game/state`);
const txnCol = () => db.collection("game_point_transactions");

async function playerName(uid: string): Promise<string> {
  const snap = await db.doc(`users/${uid}`).get();
  const p = snap.exists ? (snap.data() as { profile?: { name?: string; email?: string } }) : {};
  return p.profile?.name || p.profile?.email?.split("@")[0] || "Player";
}

function genCode(): string {
  // 5-digit numeric, shareable. Uniqueness enforced by doc .create().
  return String(Math.floor(10000 + Math.random() * 90000));
}

function writeTxn(
  tx: Transaction,
  data: { userId: string; type: string; amount: number; roomCode: string; description: string; now: number }
) {
  tx.set(txnCol().doc(), {
    userId: data.userId,
    type: data.type,
    amount: data.amount,
    roomCode: data.roomCode,
    matchId: null,
    description: data.description,
    createdAt: data.now,
  });
}

/**
 * Post-gameDb-commit action requested by finalizeRoom / refundAndCancel. The
 * caller runs the appropriate helper AFTER the gameDb transaction commits so
 * economy writes happen on the default db (us-central).
 *
 * We accept the non-atomicity: in the rare split-brain case (room transitions
 * on gameDb but economy write fails), the room is in the new state but stakes
 * aren't locked/refunded. A maintenance function can reconcile. For testing
 * this is fine.
 */
type PostRoomAction =
  | { kind: "lockStakes"; players: Array<{ uid: string; name: string }>; challengePoints: number; roomCode: string; now: number }
  | { kind: "refund"; players: Array<{ uid: string; name: string; jackpotContributed: number }>; challengePoints: number; roomCode: string; returnStakes: boolean; hasJackpot: boolean; now: number };

/**
 * gameDb-only room-state transition. Writes room + playerUids and returns a
 * follow-up action for the caller to apply on the default db if a stake lock
 * needs to happen (room transitions to "ready").
 */
function finalizeRoom(tx: Transaction, room: Room, now: number): PostRoomAction | null {
  const players = Object.values(room.players);
  const full = players.length >= MAX_PLAYERS;
  const allReady = full && players.every((p) => p.isReady);
  const allAgreed = full && players.every((p) => p.agreedToChallenge);

  if (allReady && allAgreed && room.status !== "ready") {
    tx.update(roomRef(room.roomCode), {
      players: room.players,
      playerUids: Object.keys(room.players),
      status: "ready",
      updatedAt: now,
    });
    return {
      kind: "lockStakes",
      players: players.map((p) => ({ uid: p.uid, name: p.name })),
      challengePoints: room.challengePoints,
      roomCode: room.roomCode,
      now,
    };
  }

  const status: RoomStatus = full ? "full" : "open";
  tx.update(roomRef(room.roomCode), {
    players: room.players,
    playerUids: Object.keys(room.players),
    status,
    updatedAt: now,
  });
  return null;
}

/** gameDb-only cancel. Returns a refund action for the caller to run on default db. */
function refundAndCancel(tx: Transaction, room: Room, now: number): PostRoomAction {
  const players = Object.values(room.players);
  const returnStakes = room.status === "ready" || room.status === "in_game";
  const hasJackpot = (room.jackpotPoints ?? 0) > 0;
  tx.update(roomRef(room.roomCode), {
    status: "cancelled",
    jackpotPoints: 0,
    updatedAt: now,
    completedAt: now,
  });
  return {
    kind: "refund",
    players: players.map((p) => ({ uid: p.uid, name: p.name, jackpotContributed: p.jackpotContributed ?? 0 })),
    challengePoints: room.challengePoints,
    roomCode: room.roomCode,
    returnStakes,
    hasJackpot,
    now,
  };
}

/** Apply the follow-up economy write on the default db. Errors are surfaced. */
async function applyPostRoomAction(action: PostRoomAction): Promise<void> {
  if (action.kind === "lockStakes") {
    await db.runTransaction(async (tx) => {
      const snaps = await Promise.all(action.players.map((p) => tx.get(stateRef(p.uid))));
      const states = snaps.map((s, i) => ({
        uid: action.players[i].uid,
        name: action.players[i].name,
        points: (s.data()?.points as number) ?? 0,
        locked: (s.data()?.lockedPoints as number) ?? 0,
      }));
      for (const s of states) {
        if (s.points < action.challengePoints) {
          throw new HttpsError("failed-precondition", `${s.name} no longer has enough points for this challenge.`);
        }
      }
      for (const s of states) {
        tx.set(
          stateRef(s.uid),
          { points: s.points - action.challengePoints, lockedPoints: s.locked + action.challengePoints },
          { merge: true }
        );
        writeTxn(tx, {
          userId: s.uid,
          type: "challenge_points_locked",
          amount: action.challengePoints,
          roomCode: action.roomCode,
          description: `Locked ${action.challengePoints} for Tongits room ${action.roomCode}`,
          now: action.now,
        });
      }
    });
    return;
  }
  // refund
  const { players, challengePoints, roomCode, returnStakes, hasJackpot, now } = action;
  if (!returnStakes && !hasJackpot) return;
  await db.runTransaction(async (tx) => {
    const snaps = await Promise.all(players.map((p) => tx.get(stateRef(p.uid))));
    snaps.forEach((s, i) => {
      const p = players[i];
      const points = (s.data()?.points as number) ?? 0;
      const lp = (s.data()?.lockedPoints as number) ?? 0;
      const stakeRefund = returnStakes ? Math.min(lp, challengePoints) : 0;
      const anteRefund = p.jackpotContributed ?? 0;
      const refund = stakeRefund + anteRefund;
      if (refund <= 0 && stakeRefund <= 0) return;
      tx.set(
        stateRef(p.uid),
        { points: points + refund, lockedPoints: Math.max(0, lp - stakeRefund) },
        { merge: true }
      );
      if (stakeRefund > 0) {
        writeTxn(tx, {
          userId: p.uid,
          type: "challenge_points_returned",
          amount: stakeRefund,
          roomCode,
          description: `Returned ${stakeRefund} stake — Tongits room ${roomCode} cancelled`,
          now,
        });
      }
      if (anteRefund > 0) {
        writeTxn(tx, {
          userId: p.uid,
          type: "jackpot_refunded",
          amount: anteRefund,
          roomCode,
          description: `Refunded ${anteRefund} jackpot ante — Tongits room ${roomCode} cancelled`,
          now,
        });
      }
    });
  });
}

// ===== callables =====

export const createTongitsRoom = onCall({ region: GAME_REGION }, async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as { challengePoints?: number; jackpotAnte?: number; isPrivate?: boolean };
  const challengePoints = Math.floor(Number(data.challengePoints));
  const jackpotAnte = data.jackpotAnte == null ? DEFAULT_ANTE : Math.max(0, Math.floor(Number(data.jackpotAnte)));
  const isPrivate = data.isPrivate === true;
  if (!Number.isFinite(challengePoints) || challengePoints < MIN_CHALLENGE) {
    throw new HttpsError("invalid-argument", `Challenge must be at least ${MIN_CHALLENGE} points.`);
  }

  const stateSnap = await stateRef(uid).get();
  const points = (stateSnap.data()?.points as number) ?? 0;
  if (points < challengePoints) {
    throw new HttpsError("failed-precondition", "You don't have enough Game Points for this challenge.");
  }

  const name = await playerName(uid);
  const now = Date.now();

  // Retry a few codes to dodge collisions (doc.create fails if the code exists).
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = genCode();
    const room: Room = {
      roomCode: code,
      creatorUserId: uid,
      challengePoints,
      jackpotAnte,
      jackpotPoints: 0,
      lastWinnerUid: null,
      winStreak: 0,
      isPrivate,
      maxPlayers: MAX_PLAYERS,
      status: "open",
      chatEnabled: true,
      players: {
        [uid]: { uid, name, seat: 0, isReady: false, agreedToChallenge: false, joinedAt: now, jackpotContributed: 0 },
      },
      playerUids: [uid],
      gamesPlayed: 0,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await roomRef(code).create(room);
      return { code };
    } catch (err) {
      // ALREADY_EXISTS → try another code; anything else is fatal.
      if ((err as { code?: number }).code === 6) continue;
      logger.error("createTongitsRoom failed", err);
      throw new HttpsError("internal", "Could not create room, please retry.");
    }
  }
  throw new HttpsError("resource-exhausted", "Could not allocate a room code, please retry.");
});

export const joinTongitsRoom = onCall({ region: GAME_REGION }, async (request) => {
  const uid = requireUid(request);
  const code = String((request.data as { code?: string })?.code ?? "").trim();
  if (!code) throw new HttpsError("invalid-argument", "Room code required.");
  const name = await playerName(uid);
  const now = Date.now();

  // Point balance check runs on the default db — bail early if under-funded.
  const stateSnap = await stateRef(uid).get();
  const points = (stateSnap.data()?.points as number) ?? 0;

  let post: PostRoomAction | null = null;
  const result = await gameDb.runTransaction<{ code: string }>(async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = snap.data() as Room;

    if (room.status !== "open") throw new HttpsError("failed-precondition", "This room isn't accepting players.");
    if (room.players[uid]) throw new HttpsError("failed-precondition", "You're already in this room.");
    const count = Object.keys(room.players).length;
    if (count >= MAX_PLAYERS) throw new HttpsError("failed-precondition", "This room is full.");
    if (points < room.challengePoints) {
      throw new HttpsError("failed-precondition", "You don't have enough Game Points to join this room.");
    }

    const usedSeats = new Set(Object.values(room.players).map((p) => p.seat));
    let seat = 0;
    while (usedSeats.has(seat)) seat++;
    room.players[uid] = {
      uid, name, seat, isReady: false, agreedToChallenge: false, joinedAt: now, jackpotContributed: 0,
    };
    room.playerUids = Object.keys(room.players);
    post = finalizeRoom(tx, room, now);
    return { code };
  });
  if (post) await applyPostRoomAction(post);
  return result;
});

export const setTongitsReady = onCall({ region: GAME_REGION }, async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as { code?: string; ready?: boolean };
  const code = String(data.code ?? "").trim();
  const ready = data.ready !== false;
  const now = Date.now();

  let post: PostRoomAction | null = null;
  await gameDb.runTransaction(async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = snap.data() as Room;
    if (!room.players[uid]) throw new HttpsError("permission-denied", "You're not in this room.");
    if (room.status === "cancelled" || room.status === "ready" || room.status === "in_game") {
      throw new HttpsError("failed-precondition", "Ready can't be changed now.");
    }
    room.players[uid].isReady = ready;
    post = finalizeRoom(tx, room, now);
  });
  if (post) await applyPostRoomAction(post);
  return { ok: true };
});

export const confirmTongitsChallenge = onCall({ region: GAME_REGION }, async (request) => {
  const uid = requireUid(request);
  const code = String((request.data as { code?: string })?.code ?? "").trim();
  const now = Date.now();

  let post: PostRoomAction | null = null;
  await gameDb.runTransaction(async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = snap.data() as Room;
    if (!room.players[uid]) throw new HttpsError("permission-denied", "You're not in this room.");
    if (room.status === "cancelled" || room.status === "ready" || room.status === "in_game") {
      throw new HttpsError("failed-precondition", "Challenge can't be changed now.");
    }
    room.players[uid].agreedToChallenge = true;
    post = finalizeRoom(tx, room, now);
  });
  if (post) await applyPostRoomAction(post);
  return { ok: true };
});

export const leaveTongitsRoom = onCall({ region: GAME_REGION }, async (request) => {
  const uid = requireUid(request);
  const code = String((request.data as { code?: string })?.code ?? "").trim();
  const now = Date.now();

  let post: PostRoomAction | null = null;
  await gameDb.runTransaction(async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists) return;
    const room = snap.data() as Room;
    if (!room.players[uid]) return;
    if (room.status === "cancelled" || room.status === "completed") return;
    if (room.status === "in_game") {
      throw new HttpsError("failed-precondition", "You can't leave during a live game — play your turn or let the timer run.");
    }

    // A locked (ready) room can't proceed once someone leaves pre-game → cancel + refund all.
    if (room.status === "ready") {
      post = refundAndCancel(tx, room, now);
      return;
    }

    // Unlocked room: just remove the player.
    delete room.players[uid];
    const remaining = Object.values(room.players);
    if (remaining.length === 0) {
      tx.update(roomRef(code), { status: "cancelled", updatedAt: now, completedAt: now });
      return;
    }
    if (room.creatorUserId === uid) {
      room.creatorUserId = remaining.sort((a, b) => a.seat - b.seat)[0].uid;
    }
    tx.update(roomRef(code), {
      players: room.players,
      playerUids: Object.keys(room.players),
      creatorUserId: room.creatorUserId,
      status: "open",
      updatedAt: now,
    });
  });
  if (post) await applyPostRoomAction(post);
  return { ok: true };
});

export const cancelTongitsRoom = onCall({ region: GAME_REGION }, async (request) => {
  const uid = requireUid(request);
  const code = String((request.data as { code?: string })?.code ?? "").trim();
  const now = Date.now();

  // Admin check on the default db — user profile lives there.
  const isAdmin = (await db.doc(`users/${uid}`).get()).data()?.isAdmin === true;

  let post: PostRoomAction | null = null;
  await gameDb.runTransaction(async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = snap.data() as Room;
    if (room.creatorUserId !== uid && !isAdmin) {
      throw new HttpsError("permission-denied", "Only the room creator or an admin can cancel.");
    }
    if (room.status === "cancelled" || room.status === "completed") return;
    post = refundAndCancel(tx, room, now);
  });
  if (post) await applyPostRoomAction(post);
  return { ok: true };
});

/**
 * Reap abandoned rooms (idle > STALE_ROOM_MS), refunding any locked stakes.
 * Called from the existing hourly maintenance schedule — no new scheduler.
 */
export async function reapStaleTongitsRooms(now: number): Promise<number> {
  const cutoff = now - STALE_ROOM_MS;
  const snap = await db
    .collection("game_rooms")
    .where("status", "in", ["open", "full", "ready"])
    .get();
  let reaped = 0;
  for (const d of snap.docs) {
    const room = d.data() as Room;
    if ((room.updatedAt ?? 0) > cutoff) continue;
    try {
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(d.ref);
        if (!fresh.exists) return;
        const r = fresh.data() as Room;
        if (!["open", "full", "ready"].includes(r.status) || (r.updatedAt ?? 0) > cutoff) return;
        await refundAndCancel(tx, r, now);
      });
      reaped++;
    } catch (err) {
      logger.error(`reapStaleTongitsRooms failed for ${d.id}`, err);
    }
  }
  return reaped;
}
