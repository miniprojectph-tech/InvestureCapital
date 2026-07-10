import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { handValue, type Card } from "./engine.js";
import {
  doDraw,
  doTakeDiscard,
  doMeld,
  doSapaw,
  doDiscard,
  doCall,
  doEnforceTimeout,
} from "./rooms.js";
import type {
  LiveRoom,
  GameState,
  RoomData,
  Seat,
  ClientMsg,
  ServerMsg,
  SettleInput,
} from "./types.js";

// Firebase Admin init — uses GOOGLE_APPLICATION_CREDENTIALS or ADC on Cloud Run
const app = initializeApp();
const auth = getAuth(app);
const defaultDb = getFirestore(app);
const gameDb = getFirestore(app, "game-live-asia");

const PORT = parseInt(process.env.PORT ?? "8080", 10);

// In-memory state
const liveRooms = new Map<string, LiveRoom>();
// Map each WebSocket to its authenticated uid and room code
const clientInfo = new Map<WebSocket, { uid: string; code: string }>();
// All sockets in a room
const roomClients = new Map<string, Set<WebSocket>>();

// Meld wire-format conversions (Firestore can't store nested arrays)
type MeldsWire = Record<string, { cards: Card[] }[]>;
function decodeMelds(raw: unknown): Record<string, Card[][]> {
  const out: Record<string, Card[][]> = {};
  const src = (raw ?? {}) as Record<string, Array<{ cards?: Card[] } | Card[]>>;
  for (const uid of Object.keys(src)) {
    out[uid] = (src[uid] ?? []).map((entry) =>
      Array.isArray(entry) ? entry : entry?.cards ?? []
    );
  }
  return out;
}
function encodeMelds(m: Record<string, Card[][]>): MeldsWire {
  const out: MeldsWire = {};
  for (const uid of Object.keys(m)) out[uid] = m[uid].map((cards) => ({ cards }));
  return out;
}

async function loadRoomFromFirestore(code: string): Promise<LiveRoom | null> {
  const roomSnap = await gameDb.doc(`game_rooms/${code}`).get();
  if (!roomSnap.exists) return null;
  const roomData = roomSnap.data()!;
  if (roomData.status !== "in_game") return null;

  const gsSnap = await gameDb.doc(`game_rooms/${code}/game/state`).get();
  if (!gsSnap.exists) return null;
  const gs = gsSnap.data() as GameState;
  gs.melds = decodeMelds(gs.melds);

  const deckSnap = await gameDb.doc(`game_rooms/${code}/secret/deck`).get();
  const deck: Card[] = deckSnap.exists
    ? ((deckSnap.data() as { stock: Card[] }).stock ?? [])
    : [];

  const hands: Record<string, Card[]> = {};
  for (const s of gs.seats) {
    const h = await gameDb.doc(`game_rooms/${code}/hands/${s.uid}`).get();
    hands[s.uid] = h.exists
      ? ((h.data() as { cards: Card[] }).cards ?? [])
      : [];
  }

  const room: RoomData = {
    challengePoints: (roomData.challengePoints as number) ?? 0,
    jackpotAnte: (roomData.jackpotAnte as number) ?? 0,
    jackpotPoints: (roomData.jackpotPoints as number) ?? 0,
    lastWinnerUid: (roomData.lastWinnerUid as string | null) ?? null,
    winStreak: (roomData.winStreak as number) ?? 0,
    gamesPlayed: (roomData.gamesPlayed as number) ?? 0,
    players: (roomData.players ?? {}) as Record<string, Record<string, unknown>>,
  };

  const live: LiveRoom = { code, room, gs, deck, hands, timer: null };
  liveRooms.set(code, live);
  startTurnTimer(live);
  return live;
}

function startTurnTimer(live: LiveRoom) {
  if (live.timer) clearTimeout(live.timer);
  if (live.gs.status !== "in_game") return;

  const delay = Math.max(0, live.gs.turnDeadline - Date.now()) + 1000;
  live.timer = setTimeout(() => {
    try {
      const result = doEnforceTimeout(live, live.gs.turnUid);
      if (result.settle) {
        broadcastEnded(live.code, live.gs);
        persistSettlement(result.settle).catch(console.error);
        persistGameState(live).catch(console.error);
      } else {
        broadcastState(live.code);
        broadcastHands(live.code);
        startTurnTimer(live);
      }
    } catch (e) {
      console.error("Turn timer error:", e);
    }
  }, delay);
}

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastState(code: string) {
  const clients = roomClients.get(code);
  if (!clients) return;
  const live = liveRooms.get(code);
  if (!live) return;
  const msg: ServerMsg = { type: "state", gs: live.gs };
  for (const ws of clients) send(ws, msg);
}

function broadcastHands(code: string) {
  const clients = roomClients.get(code);
  if (!clients) return;
  const live = liveRooms.get(code);
  if (!live) return;
  for (const ws of clients) {
    const info = clientInfo.get(ws);
    if (!info) continue;
    const cards = live.hands[info.uid];
    if (cards) send(ws, { type: "hand", cards });
  }
}

function broadcastEnded(code: string, gs: GameState) {
  const clients = roomClients.get(code);
  if (!clients) return;
  for (const ws of clients) send(ws, { type: "ended", gs });
}

async function persistGameState(live: LiveRoom) {
  const batch = gameDb.batch();
  batch.set(gameDb.doc(`game_rooms/${live.code}/game/state`), {
    ...live.gs,
    melds: encodeMelds(live.gs.melds),
  });
  batch.set(gameDb.doc(`game_rooms/${live.code}/secret/deck`), {
    stock: live.deck,
  });
  for (const s of live.gs.seats) {
    batch.set(gameDb.doc(`game_rooms/${live.code}/hands/${s.uid}`), {
      cards: live.hands[s.uid],
    });
  }
  batch.update(gameDb.doc(`game_rooms/${live.code}`), {
    updatedAt: Date.now(),
  });
  await batch.commit();
}

const HOUR_MS = 3_600_000;
function periodKeys(ts: number): { day: string; week: string; month: string } {
  const d = new Date(ts + 8 * HOUR_MS);
  const day = d.toISOString().slice(0, 10);
  const month = d.toISOString().slice(0, 7);
  const tmp = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  const dayNum = (tmp.getUTCDay() + 6) % 7;
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThu = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const week = `${tmp.getUTCFullYear()}-W${String(
    1 +
      Math.round(
        ((tmp.getTime() - firstThu.getTime()) / 86400000 -
          3 +
          ((firstThu.getUTCDay() + 6) % 7)) /
          7
      )
  ).padStart(2, "0")}`;
  return { day, week, month };
}

const RP_TONGITS = 30;
const RP_SHOWDOWN = 20;
const RP_LOSS = 2;
const RP_SECRET = 50;

async function persistSettlement(input: SettleInput) {
  const {
    code,
    now,
    seats,
    values,
    winnerUid,
    resultType,
    jackpot,
    payoutJackpot,
    challengePoints: C,
    secret,
    matchDurationSeconds,
  } = input;

  const live = liveRooms.get(code);

  // Write game-end state to gameDb
  if (live) {
    const players = { ...live.room.players };
    for (const uid of Object.keys(players)) {
      players[uid] = { ...players[uid], isReady: false, agreedToChallenge: false };
    }
    const winnerName = seats.find((s) => s.uid === winnerUid)?.name ?? "Winner";
    const newStreak = payoutJackpot ? 0 : (live.room.lastWinnerUid === winnerUid ? live.room.winStreak + 1 : 1);

    const batch = gameDb.batch();
    batch.update(gameDb.doc(`game_rooms/${code}`), {
      players,
      status: "post_game",
      jackpotPoints: payoutJackpot ? 0 : live.gs.jackpotPoints,
      lastWinnerUid: payoutJackpot ? null : winnerUid,
      winStreak: newStreak,
      gamesPlayed: live.room.gamesPlayed + 1,
      updatedAt: now,
      lastResult: {
        resultType,
        winnerUserId: winnerUid,
        winnerName,
        jackpotWon: jackpot,
        values,
        melds: encodeMelds(live.gs.melds),
        hands: Object.fromEntries(seats.map((s) => [s.uid, live.hands[s.uid]])),
        completedAt: now,
      },
    });
    batch.set(gameDb.doc(`game_rooms/${code}/game/state`), {
      ...live.gs,
      status: "ended",
      melds: encodeMelds(live.gs.melds),
    });
    batch.set(gameDb.doc(`game_rooms/${code}/secret/deck`), { stock: [] });
    for (const s of seats) {
      batch.set(gameDb.doc(`game_rooms/${code}/hands/${s.uid}`), { cards: [] });
    }
    await batch.commit();
  }

  // Economy settlement on default db
  const matchRef = defaultDb.collection("game_matches").doc();
  const matchId = matchRef.id;

  await defaultDb.runTransaction(async (tx) => {
    const stateSnaps: Record<string, FirebaseFirestore.DocumentData> = {};
    const lbSnaps: Record<string, FirebaseFirestore.DocumentData> = {};

    for (const s of seats) {
      const snap = await tx.get(defaultDb.doc(`users/${s.uid}/game/state`));
      stateSnaps[s.uid] = snap.exists ? snap.data()! : {};
      const lb = await tx.get(defaultDb.doc(`tongits_leaderboard/${s.uid}`));
      lbSnaps[s.uid] = lb.exists ? lb.data()! : {};
    }

    const keys = periodKeys(now);

    tx.set(matchRef, {
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

      const rankingEarned = isWinner
        ? (resultType === "tongits_win" ? RP_TONGITS : RP_SHOWDOWN) +
          (secret ? RP_SECRET : 0)
        : RP_LOSS;
      const winnings = isWinner ? C * seats.length + jackpot : 0;

      tx.set(
        defaultDb.doc(`users/${s.uid}/game/state`),
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

      tx.set(defaultDb.collection("game_match_results").doc(), {
        matchId,
        userId: s.uid,
        finalPosition: isWinner ? 1 : i + 1,
        finalHandValue: values[s.uid],
        pointsEarned: winnings,
        pointsLost: isWinner ? 0 : C,
        rankingPointsEarned: rankingEarned,
        createdAt: now,
      });

      tx.set(defaultDb.collection("game_point_transactions").doc(), {
        userId: s.uid,
        type: isWinner ? "challenge_points_won" : "challenge_points_lost",
        amount: isWinner ? winnings : C,
        roomCode: code,
        matchId,
        description: isWinner
          ? `Won ${winnings} in Tongits room ${code}`
          : `Lost ${C} in Tongits room ${code}`,
        createdAt: now,
      });

      const lb = lbSnaps[s.uid];
      const roll = (key: string, storedKey: unknown, storedRP: unknown) =>
        (storedKey === key ? ((storedRP as number) ?? 0) : 0) + rankingEarned;
      tx.set(
        defaultDb.doc(`tongits_leaderboard/${s.uid}`),
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
      tx.set(defaultDb.collection("game_point_transactions").doc(), {
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

  // Clean up in-memory state
  if (live?.timer) clearTimeout(live.timer);
  liveRooms.delete(code);
}

function handleAction(ws: WebSocket, msg: ClientMsg) {
  const info = clientInfo.get(ws);
  if (!info) {
    send(ws, { type: "error", error: "Not authenticated" });
    return;
  }

  const { uid, code } = info;
  const live = liveRooms.get(code);
  if (!live) {
    send(ws, { type: "error", error: "Room not loaded" });
    return;
  }

  try {
    let result;
    switch (msg.action) {
      case "draw":
        result = doDraw(live, uid);
        break;
      case "takeDiscard":
        result = doTakeDiscard(live, uid, msg.meldCards);
        break;
      case "meld":
        result = doMeld(live, uid, msg.cards);
        break;
      case "sapaw":
        result = doSapaw(live, uid, msg.targetUid, msg.meldIndex, msg.card);
        break;
      case "discard":
        result = doDiscard(live, uid, msg.card);
        break;
      case "call":
        result = doCall(live, uid);
        break;
      case "enforceTimeout":
        result = doEnforceTimeout(live, uid);
        break;
      default:
        send(ws, { type: "error", error: "Unknown action" });
        return;
    }

    if (result.settle) {
      broadcastEnded(code, live.gs);
      persistSettlement(result.settle).catch(console.error);
    } else {
      broadcastState(code);
      broadcastHands(code);
      startTurnTimer(live);
      // Async persist — don't block the response
      persistGameState(live).catch(console.error);
    }
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : "Action failed";
    send(ws, { type: "error", error: errMsg });
  }
}

// HTTP server + WebSocket
const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Tongits WS server");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.on("message", async (data) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(data.toString()) as ClientMsg;
    } catch {
      send(ws, { type: "error", error: "Invalid JSON" });
      return;
    }

    if (msg.action === "auth") {
      try {
        const decoded = await auth.verifyIdToken(msg.token);
        const uid = decoded.uid;
        const code = msg.code;

        clientInfo.set(ws, { uid, code });
        if (!roomClients.has(code)) roomClients.set(code, new Set());
        roomClients.get(code)!.add(ws);

        send(ws, { type: "auth_ok", uid });

        // Load room if not already in memory
        let live = liveRooms.get(code);
        if (!live) {
          live = (await loadRoomFromFirestore(code)) ?? undefined;
        }
        if (live) {
          send(ws, { type: "state", gs: live.gs });
          const cards = live.hands[uid];
          if (cards) send(ws, { type: "hand", cards });
        }
      } catch (e) {
        send(ws, {
          type: "auth_error",
          error: e instanceof Error ? e.message : "Auth failed",
        });
      }
      return;
    }

    handleAction(ws, msg);
  });

  ws.on("close", () => {
    const info = clientInfo.get(ws);
    if (info) {
      const clients = roomClients.get(info.code);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) roomClients.delete(info.code);
      }
    }
    clientInfo.delete(ws);
  });

  ws.on("error", (err) => {
    console.error("WS error:", err);
  });
});

server.listen(PORT, () => {
  console.log(`Tongits WS server listening on port ${PORT}`);
});
