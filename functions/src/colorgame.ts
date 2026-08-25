import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase, ServerValue } from "firebase-admin/database";
import { db, gameDb } from "./init";
import {
  ALL_COLORS,
  DEFAULT_COLOR_CONFIG,
  type DieColor,
  type ColorBet,
  type ColorRound,
  type ColorGameState,
  type ColorLeaderboardEntry,
} from "./colorgame-types";

const GAME_REGION = "asia-southeast1";
const ROUND_MS = DEFAULT_COLOR_CONFIG.roundDurationMs;
const BET_MS = DEFAULT_COLOR_CONFIG.betWindowMs;
const MAX_HISTORY = 20;

const roundRef = (id: string) => gameDb.doc(`color_rounds/${id}`);
const gameStateRef = () => gameDb.doc(`color_game/state`);
const configRef = () => gameDb.doc(`color_game/config`);
const leaderRef = (uid: string) => gameDb.doc(`color_game_leaderboard/${uid}`);
const userStateRef = (uid: string) => db.doc(`users/${uid}/game/state`);

// Admin-controlled jackpot settings (kept separate from color_game/state,
// which round-resolve overwrites). The jackpot fires only when it's active
// AND the designated player has bet the jackpot color that round.
type JackpotConfig = {
  jackpotColor: DieColor;
  jackpotActive: boolean;
  jackpotTargetUid: string;
  jackpotTargetName: string;
  jackpotDefault: number;      // pool resets to this floor after a win
  jackpotContribution: number; // fraction of each bet added to the pool
};
const DEFAULT_JACKPOT_CONFIG: JackpotConfig = {
  jackpotColor: "blue",
  jackpotActive: false,
  jackpotTargetUid: "",
  jackpotTargetName: "",
  jackpotDefault: 100_000,
  jackpotContribution: 0.02,
};
async function readJackpotConfig(): Promise<JackpotConfig> {
  const snap = await configRef().get();
  return { ...DEFAULT_JACKPOT_CONFIG, ...(snap.exists ? (snap.data() as Partial<JackpotConfig>) : {}) };
}

// Mirror the whole config to RTDB — the client reads it from there because
// Firestore realtime listeners on the named game DB don't deliver in this app.
async function mirrorConfigToRtdb(): Promise<void> {
  try {
    const cfg = await readJackpotConfig();
    await getDatabase().ref("color/config").set(cfg);
  } catch (e) {
    console.error("config RTDB mirror failed", e);
  }
}

function requireUid(request: { auth?: { uid?: string } }): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  return uid;
}

async function playerName(uid: string): Promise<string> {
  const snap = await db.doc(`users/${uid}`).get();
  const p = snap.exists ? (snap.data() as { profile?: { name?: string; email?: string } }) : {};
  return p.profile?.name || p.profile?.email?.split("@")[0] || "Player";
}

function currentRoundId(now: number): string {
  return String(Math.floor(now / ROUND_MS));
}

function roundStart(roundId: string): number {
  return parseInt(roundId, 10) * ROUND_MS;
}

function rollDice(): [DieColor, DieColor, DieColor] {
  const pick = () => ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)];
  return [pick(), pick(), pick()];
}

function countMatches(dice: [DieColor, DieColor, DieColor], color: DieColor): number {
  return dice.filter((d) => d === color).length;
}

// ── Place a bet on the current round ──

export const placeColorBet = onCall({ region: GAME_REGION }, async (request) => {
  const uid = requireUid(request);
  const { color, amount } = request.data as { color: DieColor; amount: number };

  if (!ALL_COLORS.includes(color)) {
    throw new HttpsError("invalid-argument", "Invalid color.");
  }
  if (typeof amount !== "number" || amount < DEFAULT_COLOR_CONFIG.minBet) {
    throw new HttpsError("invalid-argument", `Minimum bet is ${DEFAULT_COLOR_CONFIG.minBet} GP.`);
  }
  if (amount > DEFAULT_COLOR_CONFIG.maxBet) {
    throw new HttpsError("invalid-argument", `Maximum bet is ${DEFAULT_COLOR_CONFIG.maxBet} GP.`);
  }

  const now = Date.now();
  const rid = currentRoundId(now);
  const start = roundStart(rid);
  const elapsed = now - start;

  if (elapsed >= BET_MS) {
    throw new HttpsError("failed-precondition", "Betting window closed for this round.");
  }

  const name = await playerName(uid);
  const cfg = await readJackpotConfig();
  const contribution = Math.round(amount * cfg.jackpotContribution);

  // Deduct GP from user's game state (default db, us-central)
  await db.runTransaction(async (tx) => {
    const stateSnap = await tx.get(userStateRef(uid));
    const state = stateSnap.data() as { points?: number } | undefined;
    const pts = state?.points ?? 0;
    if (pts < amount) {
      throw new HttpsError("failed-precondition", "Not enough Game Points.");
    }
    tx.update(userStateRef(uid), { points: pts - amount });
  });

  // Record bet on gameDb — keyed by uid_color so players can bet on multiple colors.
  // (No client listeners on this doc anymore — clients read the aggregated totals
  //  from Realtime Database below, which is bandwidth-priced instead of per-read.)
  const isNewKey = await gameDb.runTransaction(async (tx) => {
    // Firestore requires ALL reads before ANY writes — read the round and the
    // game-state (jackpot) docs up front, then do both writes afterward.
    const rSnap = await tx.get(roundRef(rid));
    const gsSnap = await tx.get(gameStateRef());

    let round: ColorRound;
    if (rSnap.exists) {
      round = rSnap.data() as ColorRound;
      if (round.dice) {
        throw new HttpsError("failed-precondition", "Round already resolved.");
      }
    } else {
      round = {
        roundId: rid,
        phase: "betting",
        bettingDeadline: start + BET_MS,
        bets: {},
      };
    }
    const betKey = `${uid}_${color}`;
    const existing = round.bets[betKey];
    const bet: ColorBet = {
      uid,
      name,
      color,
      amount: (existing?.amount ?? 0) + amount,
      placedAt: now,
    };
    round.bets[betKey] = bet;

    const gs = gsSnap.exists
      ? (gsSnap.data() as ColorGameState)
      : { jackpotPool: 0, totalRounds: 0, totalWagered: 0, history: [] };

    // Writes (after all reads)
    tx.set(roundRef(rid), round, { merge: true });
    tx.set(gameStateRef(), {
      ...gs,
      jackpotPool: gs.jackpotPool + contribution,
      totalWagered: (gs.totalWagered ?? 0) + amount,
    }, { merge: true });

    return !existing;
  });

  // Mirror the live, high-churn state to Realtime Database (what all clients read).
  try {
    const updates: Record<string, unknown> = {
      [`color/live/${rid}/totals/${color}`]: ServerValue.increment(amount),
      [`color/live/${rid}/roundId`]: rid,
      [`color/state/jackpotPool`]: ServerValue.increment(contribution),
      [`color/state/totalWagered`]: ServerValue.increment(amount),
    };
    if (isNewKey) updates[`color/live/${rid}/bettors`] = ServerValue.increment(1);
    await getDatabase().ref().update(updates);
  } catch (e) {
    // RTDB is a read-optimisation only — never fail the bet if it hiccups.
    console.error("RTDB bet mirror failed", e);
  }

  return { ok: true, roundId: rid, color, amount };
});

// ── Resolve a round: generate dice + compute payouts ──

export const resolveColorRound = onCall({ region: GAME_REGION }, async (request) => {
  requireUid(request);
  const { roundId } = request.data as { roundId: string };

  if (!roundId) throw new HttpsError("invalid-argument", "Missing roundId.");

  const now = Date.now();
  const start = roundStart(roundId);
  if (now - start < BET_MS) {
    throw new HttpsError("failed-precondition", "Betting window still open.");
  }

  const cfg = await readJackpotConfig();

  // Resolve on gameDb
  const result = await gameDb.runTransaction(async (tx) => {
    const rSnap = await tx.get(roundRef(roundId));
    if (!rSnap.exists) {
      return { alreadyResolved: false, noBets: true, dice: rollDice(), payouts: {} as Record<string, number> };
    }
    const round = rSnap.data() as ColorRound;

    if (round.dice) {
      return {
        alreadyResolved: true,
        noBets: false,
        dice: round.dice,
        payouts: {} as Record<string, number>,
        jackpotTriggered: round.jackpotTriggered,
      };
    }

    const bets = round.bets;
    const betEntries = Object.values(bets);
    const totalPool = betEntries.reduce((s, b) => s + b.amount, 0);

    // The jackpot fires only when it's armed AND the designated player has bet
    // the jackpot color this round — then we force 3 of that color so they win.
    // (A random natural triple does NOT trigger the jackpot; it just pays 4x.)
    const targetKey = `${cfg.jackpotTargetUid}_${cfg.jackpotColor}`;
    const fireJackpot = cfg.jackpotActive && !!cfg.jackpotTargetUid && !!bets[targetKey];
    const dice: [DieColor, DieColor, DieColor] = fireJackpot
      ? [cfg.jackpotColor, cfg.jackpotColor, cfg.jackpotColor]
      : rollDice();

    // Firestore requires ALL reads before ANY writes. Read the game-state doc
    // and every bettor's leaderboard row up front, then compute + write below.
    const gsSnap = await tx.get(gameStateRef());
    const gs = gsSnap.exists
      ? (gsSnap.data() as ColorGameState)
      : { jackpotPool: 0, totalRounds: 0, totalWagered: 0, history: [] };

    const leaderSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    for (const b of betEntries) {
      if (!leaderSnaps.has(b.uid)) {
        leaderSnaps.set(b.uid, await tx.get(leaderRef(b.uid)));
      }
    }

    const jackpotTriggered = fireJackpot;
    const jackpotColor: DieColor | null = fireJackpot ? cfg.jackpotColor : null;
    const jackpotAmount = fireJackpot ? gs.jackpotPool : 0;
    // Total staked on the jackpot color this round — the pool is split by this.
    const totalColorBet = fireJackpot
      ? betEntries.filter((b) => b.color === cfg.jackpotColor).reduce((s, b) => s + b.amount, 0)
      : 0;

    // Compute payouts. A player can bet several colours (one bet entry each,
    // all sharing their uid), so ACCUMULATE per uid — indexing by uid alone
    // would overwrite and credit only the last colour (usually under-crediting).
    const payouts: Record<string, number> = {};
    const totalBetByUid: Record<string, number> = {};
    const nameByUid: Record<string, string> = {};
    for (const b of betEntries) {
      const matches = countMatches(dice, b.color);
      let payout = 0;
      if (matches === 1) payout = b.amount * 2;
      else if (matches === 2) payout = b.amount * 3;
      else if (matches === 3) payout = b.amount * 4;

      // Jackpot share — proportional to this player's bet on the jackpot color.
      if (fireJackpot && b.color === cfg.jackpotColor && totalColorBet > 0) {
        payout += Math.floor(jackpotAmount * (b.amount / totalColorBet));
      }
      payouts[b.uid] = (payouts[b.uid] ?? 0) + payout;
      totalBetByUid[b.uid] = (totalBetByUid[b.uid] ?? 0) + b.amount;
      nameByUid[b.uid] = b.name;
    }

    // ── Writes (after all reads) ──
    tx.update(roundRef(roundId), {
      dice,
      phase: "result",
      resolvedAt: now,
      totalPool,
      jackpotTriggered,
      jackpotColor: jackpotColor ?? null,
      jackpotAmount: jackpotTriggered ? jackpotAmount : 0,
    });

    const history = [...(gs.history ?? [])];
    history.unshift({ roundId, dice, at: now });
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;

    tx.set(gameStateRef(), {
      jackpotPool: fireJackpot ? cfg.jackpotDefault : gs.jackpotPool,
      totalRounds: (gs.totalRounds ?? 0) + 1,
      totalWagered: gs.totalWagered ?? 0,
      history,
    });

    // Auto-deactivate the jackpot once it has fired.
    if (fireJackpot) {
      tx.set(configRef(), { jackpotActive: false }, { merge: true });
    }

    // Update leaderboard — once per player (not per bet entry), using the
    // aggregated payout and total bet so multi-colour bettors are counted once.
    const leaderUpdates: Record<string, ColorLeaderboardEntry> = {};
    for (const uid of Object.keys(payouts)) {
      const lSnap = leaderSnaps.get(uid);
      const existing = lSnap?.exists ? (lSnap.data() as ColorLeaderboardEntry) : null;
      const won = payouts[uid] ?? 0;
      const bet = totalBetByUid[uid] ?? 0;
      const netWin = won > 0 ? won - bet : 0;
      const entry: ColorLeaderboardEntry = {
        uid,
        name: nameByUid[uid],
        totalWon: (existing?.totalWon ?? 0) + netWin,
        totalBet: (existing?.totalBet ?? 0) + bet,
        roundsPlayed: (existing?.roundsPlayed ?? 0) + 1,
        biggestWin: Math.max(existing?.biggestWin ?? 0, netWin),
        updatedAt: now,
      };
      tx.set(leaderRef(uid), entry);
      leaderUpdates[uid] = entry;
    }

    return {
      alreadyResolved: false, noBets: false, dice, payouts, jackpotTriggered,
      jackpotColor: jackpotColor ?? null, jackpotAmount: jackpotTriggered ? jackpotAmount : 0,
      newJackpotPool: fireJackpot ? cfg.jackpotDefault : gs.jackpotPool,
      leaderUpdates,
    };
  });

  // Mirror the resolved result to Realtime Database (what clients read).
  try {
    const rtdb = getDatabase();
    const liveUpd: Record<string, unknown> = {
      [`color/live/${roundId}/dice`]: result.dice,
      [`color/live/${roundId}/resolvedAt`]: now,
    };
    if (!result.alreadyResolved && !result.noBets) {
      liveUpd[`color/live/${roundId}/jackpotTriggered`] = result.jackpotTriggered ?? false;
      liveUpd[`color/live/${roundId}/jackpotColor`] = result.jackpotColor ?? null;
      liveUpd[`color/live/${roundId}/jackpotAmount`] = result.jackpotAmount ?? 0;
      liveUpd[`color/state/totalRounds`] = ServerValue.increment(1);
      if (result.jackpotTriggered) liveUpd[`color/state/jackpotPool`] = result.newJackpotPool ?? 0;
      liveUpd[`color/history/${roundId}`] = { dice: result.dice, at: now };
      // Mirror leaderboard rows to RTDB (Firestore listeners on the named game
      // DB don't deliver, so clients read the ranking from here).
      const leaderUpdates = (result as { leaderUpdates?: Record<string, ColorLeaderboardEntry> }).leaderUpdates ?? {};
      for (const [uid, e] of Object.entries(leaderUpdates)) {
        liveUpd[`color/leaderboard/${uid}`] = e;
      }
    }
    await rtdb.ref().update(liveUpd);
  } catch (e) {
    console.error("RTDB resolve mirror failed", e);
  }

  // Jackpot auto-deactivated this round — reflect the config change to clients.
  if (result.jackpotTriggered) await mirrorConfigToRtdb();

  if (result.alreadyResolved || result.noBets) {
    return { ok: true, dice: result.dice, payouts: result.payouts, cached: true };
  }

  // Credit winners on default db (separate transaction — acceptable non-atomicity)
  const payoutEntries = Object.entries(result.payouts).filter(([, amt]) => amt > 0);
  if (payoutEntries.length > 0) {
    await db.runTransaction(async (tx) => {
      const snaps = await Promise.all(payoutEntries.map(([uid]) => tx.get(userStateRef(uid))));
      for (let i = 0; i < payoutEntries.length; i++) {
        const [, payout] = payoutEntries[i];
        const state = snaps[i].data() as { points?: number } | undefined;
        const pts = state?.points ?? 0;
        tx.update(userStateRef(payoutEntries[i][0]), { points: pts + payout });
      }
    });
  }

  return { ok: true, dice: result.dice, payouts: result.payouts, jackpotTriggered: result.jackpotTriggered };
});

// ── Admin: adjust jackpot pool ──

export const adminAdjustColorJackpot = onCall({ region: GAME_REGION }, async (request) => {
  const uid = requireUid(request);
  const callerSnap = await db.doc(`users/${uid}`).get();
  if (!callerSnap.exists || callerSnap.data()?.isAdmin !== true) {
    throw new HttpsError("permission-denied", "Admin role required.");
  }

  const { amount } = request.data as { amount: number };
  if (typeof amount !== "number") {
    throw new HttpsError("invalid-argument", "Amount must be a number.");
  }

  await gameDb.runTransaction(async (tx) => {
    const gsSnap = await tx.get(gameStateRef());
    const gs = gsSnap.exists
      ? (gsSnap.data() as ColorGameState)
      : { jackpotPool: 0, totalRounds: 0, totalWagered: 0, history: [] };
    tx.set(gameStateRef(), { ...gs, jackpotPool: Math.max(0, amount) });
  });

  return { ok: true, newJackpot: Math.max(0, amount) };
});

// ── Admin: set the jackpot color (the combination players must hit) ──
// Kept in a separate config doc so round resolution (which overwrites
// color_game/state) can't wipe it; mirrored to RTDB for the clients.
export const adminSetColorJackpotColor = onCall({ region: GAME_REGION }, async (request) => {
  const uid = requireUid(request);
  const callerSnap = await db.doc(`users/${uid}`).get();
  if (!callerSnap.exists || callerSnap.data()?.isAdmin !== true) {
    throw new HttpsError("permission-denied", "Admin role required.");
  }

  const { color } = request.data as { color: string };
  const valid = ["red", "blue", "yellow", "pink", "white", "green"];
  if (!valid.includes(color)) {
    throw new HttpsError("invalid-argument", "Invalid color.");
  }

  await gameDb.doc("color_game/config").set({ jackpotColor: color }, { merge: true });
  try {
    await getDatabase().ref("color/state/jackpotColor").set(color);
  } catch (e) {
    console.error("RTDB jackpotColor mirror failed", e);
  }
  await mirrorConfigToRtdb();

  return { ok: true, jackpotColor: color };
});

// ── Admin: arm/configure the jackpot (designated winner, activation, floor, %) ──
export const adminSetColorJackpotConfig = onCall({ region: GAME_REGION }, async (request) => {
  const uid = requireUid(request);
  const callerSnap = await db.doc(`users/${uid}`).get();
  if (!callerSnap.exists || callerSnap.data()?.isAdmin !== true) {
    throw new HttpsError("permission-denied", "Admin role required.");
  }

  const patch = (request.data ?? {}) as Partial<JackpotConfig>;
  const clean: Partial<JackpotConfig> = {};
  if (typeof patch.jackpotActive === "boolean") clean.jackpotActive = patch.jackpotActive;
  if (typeof patch.jackpotTargetUid === "string") clean.jackpotTargetUid = patch.jackpotTargetUid;
  if (typeof patch.jackpotTargetName === "string") clean.jackpotTargetName = patch.jackpotTargetName;
  if (typeof patch.jackpotDefault === "number" && patch.jackpotDefault >= 0) {
    clean.jackpotDefault = Math.round(patch.jackpotDefault);
  }
  if (typeof patch.jackpotContribution === "number" && patch.jackpotContribution >= 0 && patch.jackpotContribution <= 1) {
    clean.jackpotContribution = patch.jackpotContribution;
  }

  await configRef().set(clean, { merge: true });
  await mirrorConfigToRtdb();
  return { ok: true, ...clean };
});
