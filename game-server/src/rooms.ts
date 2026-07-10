import {
  isValidMeld,
  handContainsAll,
  sapaw as trySapaw,
  handValue,
  resolveShowdown,
  autoDiscardCard,
  type Card,
} from "./engine.js";
import type { LiveRoom, GameState, SettleInput, ResultType } from "./types.js";

const TURN_MS = 25_000;
const MAX_TIMEOUTS = 2;

function refreshCounts(room: LiveRoom) {
  for (const s of room.gs.seats) {
    room.gs.handCounts[s.uid] = room.hands[s.uid].length;
  }
  room.gs.stockCount = room.deck.length;
}

function advanceTurn(gs: GameState, now: number) {
  gs.turnSeat = (gs.turnSeat + 1) % gs.seats.length;
  gs.turnUid = gs.seats[gs.turnSeat].uid;
  gs.phase = "draw";
  gs.turnDeadline = now + TURN_MS;
  gs.turnStartExposed = (gs.melds[gs.turnUid]?.length ?? 0) > 0;
}

function checkTongits(
  room: LiveRoom,
  uid: string
): SettleInput | null {
  if (room.hands[uid].length > 0) return null;
  const secret = !room.gs.turnStartExposed;
  return settleGame(room, "tongits_win", uid, { secret });
}

function settleGame(
  room: LiveRoom,
  resultType: ResultType,
  winnerUid: string,
  opts: { secret: boolean; forfeitUid?: string }
): SettleInput {
  const now = Date.now();
  const seats = room.gs.seats;
  const C = room.room.challengePoints;

  const values: Record<string, number> = {};
  for (const s of seats) {
    values[s.uid] =
      s.uid === winnerUid && resultType === "tongits_win"
        ? 0
        : handValue(room.hands[s.uid]);
  }
  if (opts.forfeitUid) values[opts.forfeitUid] = 9999;

  const prevWinnerUid = room.room.lastWinnerUid;
  const prevStreak = room.room.winStreak;
  const newStreak = prevWinnerUid === winnerUid ? prevStreak + 1 : 1;
  const payoutJackpot = newStreak >= 2;
  const jackpot = payoutJackpot ? room.gs.jackpotPoints : 0;

  room.gs.status = "ended";
  room.gs.lastAction = `Game over: ${resultType}`;

  return {
    code: room.code,
    now,
    seats,
    values,
    winnerUid,
    resultType,
    jackpot,
    payoutJackpot,
    challengePoints: C,
    secret: opts.secret,
    matchDurationSeconds: Math.round((now - (room.gs.startedAt ?? now)) / 1000),
  };
}

type ActionResult =
  | { ok: true; settle?: undefined }
  | { ok: true; settle: SettleInput };

export function doDraw(room: LiveRoom, uid: string): ActionResult {
  const { gs, deck, hands } = room;
  if (gs.status !== "in_game") throw new Error("Game isn't running.");
  if (gs.turnUid !== uid) throw new Error("It's not your turn.");
  if (gs.phase !== "draw") throw new Error("You must draw now.");

  if (deck.length === 0) {
    const entries = gs.seats.map((s) => ({
      uid: s.uid,
      seat: s.seat,
      value: handValue(hands[s.uid]),
    }));
    const winner = resolveShowdown(entries);
    const settle = settleGame(room, "draw_win", winner, { secret: false });
    return { ok: true, settle };
  }

  const card = deck.shift() as Card;
  hands[uid].push(card);
  gs.phase = "discard";
  gs.consecutiveTimeouts[uid] = 0;
  gs.lastAction = `${gs.seats.find((s) => s.uid === uid)?.name} drew`;
  refreshCounts(room);
  return { ok: true };
}

export function doTakeDiscard(
  room: LiveRoom,
  uid: string,
  meldCards: Card[]
): ActionResult {
  const { gs, hands } = room;
  if (gs.status !== "in_game") throw new Error("Game isn't running.");
  if (gs.turnUid !== uid) throw new Error("It's not your turn.");
  if (gs.phase !== "draw") throw new Error("You must draw now.");

  const top = gs.discard[gs.discard.length - 1];
  if (!top) throw new Error("The discard pile is empty.");
  if (!meldCards.includes(top))
    throw new Error("The meld must use the top discard.");
  if (!isValidMeld(meldCards)) throw new Error("That isn't a valid meld.");
  const fromHand = meldCards.filter((c) => c !== top);
  if (!handContainsAll(hands[uid], fromHand))
    throw new Error("You don't hold those cards.");

  gs.discard.pop();
  for (const c of fromHand) hands[uid].splice(hands[uid].indexOf(c), 1);
  gs.melds[uid].push(meldCards);
  gs.hasExposed[uid] = true;
  gs.phase = "discard";
  gs.consecutiveTimeouts[uid] = 0;

  const settle = checkTongits(room, uid);
  if (settle) return { ok: true, settle };

  gs.lastAction = "took discard + melded";
  refreshCounts(room);
  return { ok: true };
}

export function doMeld(
  room: LiveRoom,
  uid: string,
  cards: Card[]
): ActionResult {
  const { gs, hands } = room;
  if (gs.status !== "in_game") throw new Error("Game isn't running.");
  if (gs.turnUid !== uid) throw new Error("It's not your turn.");
  if (gs.phase !== "discard") throw new Error("You must act now.");
  if (!isValidMeld(cards)) throw new Error("That isn't a valid meld.");
  if (!handContainsAll(hands[uid], cards))
    throw new Error("You don't hold those cards.");

  for (const c of cards) hands[uid].splice(hands[uid].indexOf(c), 1);
  gs.melds[uid].push(cards);
  gs.hasExposed[uid] = true;

  const settle = checkTongits(room, uid);
  if (settle) return { ok: true, settle };

  gs.lastAction = "melded";
  refreshCounts(room);
  return { ok: true };
}

export function doSapaw(
  room: LiveRoom,
  uid: string,
  targetUid: string,
  meldIndex: number,
  card: Card
): ActionResult {
  const { gs, hands } = room;
  if (gs.status !== "in_game") throw new Error("Game isn't running.");
  if (gs.turnUid !== uid) throw new Error("It's not your turn.");
  if (gs.phase !== "discard") throw new Error("You must act now.");

  const target = gs.melds[targetUid];
  if (!target || !target[meldIndex])
    throw new Error("That meld doesn't exist.");
  if (!hands[uid].includes(card))
    throw new Error("You don't hold that card.");
  const next = trySapaw(target[meldIndex], card);
  if (!next) throw new Error("That card can't be added to that meld.");

  target[meldIndex] = next;
  hands[uid].splice(hands[uid].indexOf(card), 1);

  const settle = checkTongits(room, uid);
  if (settle) return { ok: true, settle };

  gs.lastAction = "sapaw";
  refreshCounts(room);
  return { ok: true };
}

export function doDiscard(
  room: LiveRoom,
  uid: string,
  card: Card
): ActionResult {
  const { gs, hands } = room;
  const now = Date.now();
  if (gs.status !== "in_game") throw new Error("Game isn't running.");
  if (gs.turnUid !== uid) throw new Error("It's not your turn.");
  if (gs.phase !== "discard") throw new Error("You must act now.");
  if (!hands[uid].includes(card))
    throw new Error("You don't hold that card.");

  hands[uid].splice(hands[uid].indexOf(card), 1);
  gs.discard.push(card);

  const settle = checkTongits(room, uid);
  if (settle) return { ok: true, settle };

  advanceTurn(gs, now);
  gs.lastAction = "discarded";
  refreshCounts(room);
  return { ok: true };
}

export function doCall(room: LiveRoom, uid: string): ActionResult {
  const { gs, hands } = room;
  if (gs.status !== "in_game") throw new Error("Game isn't running.");
  if (gs.turnUid !== uid) throw new Error("It's not your turn.");
  if (gs.phase !== "discard") throw new Error("You must act now.");
  if ((gs.melds[uid]?.length ?? 0) === 0)
    throw new Error("You need at least one exposed meld to call.");

  const entries = gs.seats.map((s) => ({
    uid: s.uid,
    seat: s.seat,
    value: handValue(hands[s.uid]),
  }));
  const winner = resolveShowdown(entries, uid);
  const settle = settleGame(room, "lowest_points_win", winner, {
    secret: false,
  });
  return { ok: true, settle };
}

export function doEnforceTimeout(room: LiveRoom, uid: string): ActionResult {
  const { gs, deck, hands } = room;
  const now = Date.now();
  if (gs.status !== "in_game") return { ok: true };
  if (!gs.seats.some((s) => s.uid === uid))
    throw new Error("Not your room.");
  if (now <= gs.turnDeadline) return { ok: true };

  const cur = gs.turnUid;
  const timeouts = (gs.consecutiveTimeouts[cur] ?? 0) + 1;
  gs.consecutiveTimeouts[cur] = timeouts;

  if (timeouts >= MAX_TIMEOUTS) {
    const others = gs.seats.filter((s) => s.uid !== cur);
    const entries = others.map((s) => ({
      uid: s.uid,
      seat: s.seat,
      value: handValue(hands[s.uid]),
    }));
    const winner = resolveShowdown(entries);
    const settle = settleGame(room, "player_disconnected", winner, {
      secret: false,
      forfeitUid: cur,
    });
    return { ok: true, settle };
  }

  if (gs.phase === "draw") {
    if (deck.length === 0) {
      const entries = gs.seats.map((s) => ({
        uid: s.uid,
        seat: s.seat,
        value: handValue(hands[s.uid]),
      }));
      const winner = resolveShowdown(entries);
      const settle = settleGame(room, "draw_win", winner, { secret: false });
      return { ok: true, settle };
    }
    hands[cur].push(deck.shift() as Card);
  }

  const drop = autoDiscardCard(hands[cur]);
  hands[cur].splice(hands[cur].indexOf(drop), 1);
  gs.discard.push(drop);

  if (hands[cur].length === 0) {
    const secret = !gs.turnStartExposed;
    const settle = settleGame(room, "tongits_win", cur, { secret });
    return { ok: true, settle };
  }

  advanceTurn(gs, now);
  gs.lastAction = "auto-played (timeout)";
  refreshCounts(room);
  return { ok: true };
}
