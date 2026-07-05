import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { db } from "./init";
import type { Transaction } from "firebase-admin/firestore";

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
  maxPlayers: number;
  status: RoomStatus;
  chatEnabled: boolean;
  players: Record<string, RoomPlayer>;
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

const roomRef = (code: string) => db.doc(`game_rooms/${code}`);
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
 * Recompute room status and, when the room is full + everyone is ready + everyone
 * agreed, atomically lock each player's challenge points (points → lockedPoints).
 * Must be the LAST thing a callable does in its transaction (it performs the reads
 * it needs before writing). Handles the room write in every branch.
 */
async function finalizeRoom(tx: Transaction, room: Room, now: number): Promise<void> {
  const players = Object.values(room.players);
  const full = players.length >= MAX_PLAYERS;
  const allReady = full && players.every((p) => p.isReady);
  const allAgreed = full && players.every((p) => p.agreedToChallenge);

  if (allReady && allAgreed && room.status !== "ready") {
    // Lock each player's stake. Read all states before any write.
    const snaps = await Promise.all(players.map((p) => tx.get(stateRef(p.uid))));
    const states = snaps.map((s, i) => ({
      uid: players[i].uid,
      name: players[i].name,
      points: (s.data()?.points as number) ?? 0,
      locked: (s.data()?.lockedPoints as number) ?? 0,
    }));
    for (const s of states) {
      if (s.points < room.challengePoints) {
        throw new HttpsError(
          "failed-precondition",
          `${s.name} no longer has enough points for this challenge.`
        );
      }
    }
    for (const s of states) {
      tx.set(
        stateRef(s.uid),
        { points: s.points - room.challengePoints, lockedPoints: s.locked + room.challengePoints },
        { merge: true }
      );
      writeTxn(tx, {
        userId: s.uid,
        type: "challenge_points_locked",
        amount: room.challengePoints,
        roomCode: room.roomCode,
        description: `Locked ${room.challengePoints} for Tongits room ${room.roomCode}`,
        now,
      });
    }
    tx.update(roomRef(room.roomCode), {
      players: room.players,
      status: "ready",
      updatedAt: now,
    });
    return;
  }

  const status: RoomStatus = full ? "full" : "open";
  tx.update(roomRef(room.roomCode), { players: room.players, status, updatedAt: now });
}

/**
 * Cancel a room, returning both any locked stakes (if the room was 'ready') and
 * each player's unclaimed jackpot contributions (the running pot from prior games).
 */
async function refundAndCancel(tx: Transaction, room: Room, now: number): Promise<void> {
  const players = Object.values(room.players);
  // Stakes are locked from 'ready' through the live game, until settled.
  const returnStakes = room.status === "ready" || room.status === "in_game";
  const hasJackpot = (room.jackpotPoints ?? 0) > 0;

  if (returnStakes || hasJackpot) {
    const snaps = await Promise.all(players.map((p) => tx.get(stateRef(p.uid))));
    snaps.forEach((s, i) => {
      const p = players[i];
      const points = (s.data()?.points as number) ?? 0;
      const lp = (s.data()?.lockedPoints as number) ?? 0;
      const stakeRefund = returnStakes ? Math.min(lp, room.challengePoints) : 0;
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
          roomCode: room.roomCode,
          description: `Returned ${stakeRefund} stake — Tongits room ${room.roomCode} cancelled`,
          now,
        });
      }
      if (anteRefund > 0) {
        writeTxn(tx, {
          userId: p.uid,
          type: "jackpot_refunded",
          amount: anteRefund,
          roomCode: room.roomCode,
          description: `Refunded ${anteRefund} jackpot ante — Tongits room ${room.roomCode} cancelled`,
          now,
        });
      }
    });
  }
  tx.update(roomRef(room.roomCode), {
    status: "cancelled",
    jackpotPoints: 0,
    updatedAt: now,
    completedAt: now,
  });
}

// ===== callables =====

export const createTongitsRoom = onCall(async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as { challengePoints?: number; jackpotAnte?: number };
  const challengePoints = Math.floor(Number(data.challengePoints));
  const jackpotAnte = data.jackpotAnte == null ? DEFAULT_ANTE : Math.max(0, Math.floor(Number(data.jackpotAnte)));
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
      maxPlayers: MAX_PLAYERS,
      status: "open",
      chatEnabled: true,
      players: {
        [uid]: { uid, name, seat: 0, isReady: false, agreedToChallenge: false, joinedAt: now, jackpotContributed: 0 },
      },
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

export const joinTongitsRoom = onCall(async (request) => {
  const uid = requireUid(request);
  const code = String((request.data as { code?: string })?.code ?? "").trim();
  if (!code) throw new HttpsError("invalid-argument", "Room code required.");
  const name = await playerName(uid);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = snap.data() as Room;

    if (room.status !== "open") throw new HttpsError("failed-precondition", "This room isn't accepting players.");
    if (room.players[uid]) throw new HttpsError("failed-precondition", "You're already in this room.");
    const count = Object.keys(room.players).length;
    if (count >= MAX_PLAYERS) throw new HttpsError("failed-precondition", "This room is full.");

    const stateSnap = await tx.get(stateRef(uid));
    const points = (stateSnap.data()?.points as number) ?? 0;
    if (points < room.challengePoints) {
      throw new HttpsError("failed-precondition", "You don't have enough Game Points to join this room.");
    }

    const usedSeats = new Set(Object.values(room.players).map((p) => p.seat));
    let seat = 0;
    while (usedSeats.has(seat)) seat++;
    room.players[uid] = {
      uid, name, seat, isReady: false, agreedToChallenge: false, joinedAt: now, jackpotContributed: 0,
    };
    await finalizeRoom(tx, room, now);
    return { code };
  });
});

export const setTongitsReady = onCall(async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as { code?: string; ready?: boolean };
  const code = String(data.code ?? "").trim();
  const ready = data.ready !== false;
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = snap.data() as Room;
    if (!room.players[uid]) throw new HttpsError("permission-denied", "You're not in this room.");
    if (room.status === "cancelled" || room.status === "ready" || room.status === "in_game") {
      throw new HttpsError("failed-precondition", "Ready can't be changed now.");
    }
    room.players[uid].isReady = ready;
    await finalizeRoom(tx, room, now);
    return { ok: true };
  });
});

export const confirmTongitsChallenge = onCall(async (request) => {
  const uid = requireUid(request);
  const code = String((request.data as { code?: string })?.code ?? "").trim();
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = snap.data() as Room;
    if (!room.players[uid]) throw new HttpsError("permission-denied", "You're not in this room.");
    if (room.status === "cancelled" || room.status === "ready" || room.status === "in_game") {
      throw new HttpsError("failed-precondition", "Challenge can't be changed now.");
    }
    room.players[uid].agreedToChallenge = true;
    await finalizeRoom(tx, room, now);
    return { ok: true };
  });
});

export const leaveTongitsRoom = onCall(async (request) => {
  const uid = requireUid(request);
  const code = String((request.data as { code?: string })?.code ?? "").trim();
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists) return { ok: true };
    const room = snap.data() as Room;
    if (!room.players[uid]) return { ok: true };
    if (room.status === "cancelled" || room.status === "completed") return { ok: true };
    if (room.status === "in_game") {
      throw new HttpsError("failed-precondition", "You can't leave during a live game — play your turn or let the timer run.");
    }

    // A locked (ready) room can't proceed once someone leaves pre-game → cancel + refund all.
    if (room.status === "ready") {
      await refundAndCancel(tx, room, now);
      return { ok: true };
    }

    // Unlocked room: just remove the player.
    delete room.players[uid];
    const remaining = Object.values(room.players);
    if (remaining.length === 0) {
      tx.update(roomRef(code), { status: "cancelled", updatedAt: now, completedAt: now });
      return { ok: true };
    }
    // Hand the room to the next-seated player if the creator left.
    if (room.creatorUserId === uid) {
      room.creatorUserId = remaining.sort((a, b) => a.seat - b.seat)[0].uid;
    }
    tx.update(roomRef(code), {
      players: room.players,
      creatorUserId: room.creatorUserId,
      status: "open",
      updatedAt: now,
    });
    return { ok: true };
  });
});

export const cancelTongitsRoom = onCall(async (request) => {
  const uid = requireUid(request);
  const code = String((request.data as { code?: string })?.code ?? "").trim();
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = snap.data() as Room;
    const isAdmin = (await tx.get(db.doc(`users/${uid}`))).data()?.isAdmin === true;
    if (room.creatorUserId !== uid && !isAdmin) {
      throw new HttpsError("permission-denied", "Only the room creator or an admin can cancel.");
    }
    if (room.status === "cancelled" || room.status === "completed") return { ok: true };
    await refundAndCancel(tx, room, now);
    return { ok: true };
  });
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
