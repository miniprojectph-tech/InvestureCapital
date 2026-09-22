import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase, ServerValue } from "firebase-admin/database";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
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
const betsCol = (id: string) => roundRef(id).collection("bets");
const betRef = (id: string, uid: string, color: DieColor) => betsCol(id).doc(`${uid}_${color}`);
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

// Mirror the config to RTDB for the ADMIN page (Firestore realtime listeners on
// the named game DB don't deliver in this app). It holds the designated winner,
// so it lives under `colorAdmin/` — readable by admins only — never under
// `color/`, which every signed-in player can read. Players only ever get the
// jackpot colour, via `color/state/jackpotColor`. The old public node is cleared.
async function mirrorConfigToRtdb(): Promise<void> {
  try {
    const cfg = await readJackpotConfig();
    await getDatabase().ref().update({ "colorAdmin/config": cfg, "color/config": null });
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

  // Record the bet on gameDb. Each (player, colour) has its OWN document under
  // color_rounds/{rid}/bets, so simultaneous bettors never write the same doc —
  // the old design funnelled every bet through the round doc and the shared
  // jackpot doc, which throttled a round to ~15 bets. The round doc is only
  // created once (first bet) and the jackpot pool is settled at resolve time.
  // The transaction still READS the round doc, so a bet can't slip in after the
  // dice have been rolled (that read conflicts with the resolve and retries).
  // The points are already deducted (different database, so it can't share this
  // transaction). If recording the bet fails for ANY reason — contention, the
  // round resolving in the gap, a crash-free error — give the points straight back.
  const isNewKey = await gameDb.runTransaction(async (tx) => {
    const rSnap = await tx.get(roundRef(rid));
    const bRef = betRef(rid, uid, color);
    const bSnap = await tx.get(bRef);

    if (rSnap.exists) {
      const round = rSnap.data() as ColorRound;
      if (round.dice || round.phase !== "betting") {
        throw new HttpsError("failed-precondition", "Betting window closed for this round.");
      }
    } else {
      // Open work for the server sweeper: `pending` stays true until the round
      // is resolved AND its winners are credited (see sweepColorRounds).
      tx.create(roundRef(rid), {
        roundId: rid, phase: "betting", bettingDeadline: start + BET_MS, bets: {}, pending: true,
      });
    }
    tx.set(bRef, {
      uid, name, color,
      amount: FieldValue.increment(amount),
      contribution: FieldValue.increment(contribution),
      placedAt: now,
    }, { merge: true });
    return !bSnap.exists;
  }).catch(async (err) => {
    try {
      await userStateRef(uid).update({ points: FieldValue.increment(amount) });
    } catch (refundErr) {
      console.error(`BET REFUND FAILED uid=${uid} round=${rid} amount=${amount}`, refundErr);
    }
    throw err instanceof HttpsError
      ? err
      : new HttpsError("aborted", "Bet not placed — your points were returned. Try again.");
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
//
// Who triggers it:
//   • a player's browser, the moment betting closes (fast path — dice land on time)
//   • the server sweeper, once a minute (safety net — a round still resolves and
//     pays even if every player closed the tab, lost signal, or the call failed)
// Both go through resolveRoundCore, which is safe to run any number of times.

const VOID_AFTER_MS = 60 * 60 * 1000; // an unresolved round this stale is refunded, not rolled
const SWEEP_GRACE_MS = 5_000; // let the players' own call go first
const PAYOUT_MARKER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const payoutMarkerRef = (roundId: string) => db.doc(`color_payouts/${roundId}`);

const LIVE_KEEP_ROUNDS = 40; // ≈ 20 minutes of RTDB `color/live` (clients only read the current round)
const ROUND_DOC_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Drop finished rounds nobody can read any more, so the game DB and RTDB don't grow forever. */
async function pruneColorHistory(now: number): Promise<void> {
  const rtdb = getDatabase();
  const cutoff = String(Math.floor(now / ROUND_MS) - LIVE_KEEP_ROUNDS);
  const live = await rtdb.ref("color/live").orderByKey().endAt(cutoff).limitToFirst(300).once("value");
  if (live.exists()) {
    const gone: Record<string, null> = {};
    live.forEach((c) => { if (c.key) gone[c.key] = null; });
    await rtdb.ref("color/live").update(gone);
  }
  const old = await gameDb.collection("color_rounds").where("resolvedAt", "<", now - ROUND_DOC_TTL_MS).limit(100).get();
  for (const d of old.docs) {
    const r = d.data() as ColorRound;
    if (r.pending === true || r.stuck) continue; // still owed, or parked for a human
    await gameDb.recursiveDelete(d.ref); // takes the bets subcollection with it
  }
}

type CoreResult = {
  dice?: [DieColor, DieColor, DieColor];
  payouts: Record<string, number>;
  jackpotTriggered: boolean;
  fresh: boolean; // this call is the one that resolved it
  voided: boolean;
};

/**
 * Credit a round's payouts exactly once. The points live on the default database
 * and the round on the game database, so they can't share a transaction — instead
 * the credit and a `color_payouts/{roundId}` marker are written together, and any
 * retry that finds the marker skips the credit. Then the round is closed.
 */
async function payRound(roundId: string, payouts: Record<string, number>): Promise<void> {
  const entries = Object.entries(payouts).filter(([, amt]) => amt > 0);
  if (entries.length > 0) {
    await db.runTransaction(async (tx) => {
      const marker = await tx.get(payoutMarkerRef(roundId));
      if (marker.exists) return; // already credited by an earlier attempt
      const snaps = await Promise.all(entries.map(([uid]) => tx.get(userStateRef(uid))));
      entries.forEach(([uid, payout], i) => {
        const pts = (snaps[i].data() as { points?: number } | undefined)?.points ?? 0;
        tx.set(userStateRef(uid), { points: pts + payout }, { merge: true });
      });
      const now = Date.now();
      tx.create(payoutMarkerRef(roundId), {
        roundId,
        at: now,
        total: entries.reduce((s, [, a]) => s + a, 0),
        expireAt: Timestamp.fromMillis(now + PAYOUT_MARKER_TTL_MS),
      });
    });
  }
  await roundRef(roundId).set({ pending: false, paidAt: Date.now() }, { merge: true });
}

async function resolveRoundCore(roundId: string, now: number): Promise<CoreResult> {
  const cfg = await readJackpotConfig();

  const result = await gameDb.runTransaction(async (tx) => {
    const rSnap = await tx.get(roundRef(roundId));

    // Nobody bet. Persist the dice anyway so every caller sees the SAME roll
    // (it used to re-roll per caller, so the dice could change on screen) and so
    // a late-arriving bet finds the round closed and is refunded.
    if (!rSnap.exists) {
      if (now - roundStart(roundId) < BET_MS) {
        throw new HttpsError("failed-precondition", "Betting window still open.");
      }
      const dice = rollDice();
      tx.set(roundRef(roundId), {
        roundId, phase: "result", bettingDeadline: roundStart(roundId) + BET_MS,
        bets: {}, dice, resolvedAt: now, totalPool: 0, pending: false,
      });
      return { kind: "empty" as const, dice };
    }

    const round = rSnap.data() as ColorRound;

    if (round.dice || round.phase === "void") {
      return {
        kind: "done" as const,
        dice: round.dice,
        payouts: round.payouts ?? {},
        unpaid: round.pending === true,
        jackpotTriggered: round.jackpotTriggered ?? false,
        voided: round.phase === "void",
      };
    }

    // Use the deadline stored on the round (round length has changed before, so
    // re-deriving it from the id would be wrong for older rounds).
    if (now < round.bettingDeadline) {
      throw new HttpsError("failed-precondition", "Betting window still open.");
    }

    // Bets live in the per-bet subcollection; `round.bets` is only still read for
    // rounds written by the previous version.
    const bets: Record<string, ColorBet> = { ...(round.bets ?? {}) };
    let roundContribution = 0;
    let roundWagered = 0;
    for (const d of (await tx.get(betsCol(roundId))).docs) {
      const b = d.data() as ColorBet & { contribution?: number };
      bets[d.id] = { uid: b.uid, name: b.name, color: b.color, amount: b.amount, placedAt: b.placedAt };
      roundContribution += b.contribution ?? 0;
      roundWagered += b.amount;
    }
    const betEntries = Object.values(bets);
    const totalPool = betEntries.reduce((s, b) => s + b.amount, 0);

    // Far too late to play out fairly (outage / abandoned legacy round): void it
    // and hand every stake back. No dice, no history row, no leaderboard change.
    if (now - round.bettingDeadline > VOID_AFTER_MS) {
      const refunds: Record<string, number> = {};
      for (const b of betEntries) refunds[b.uid] = (refunds[b.uid] ?? 0) + b.amount;
      tx.update(roundRef(roundId), { phase: "void", resolvedAt: now, totalPool, payouts: refunds, pending: true });
      return { kind: "void" as const, payouts: refunds };
    }

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
    const gs0 = gsSnap.exists
      ? (gsSnap.data() as ColorGameState)
      : { jackpotPool: 0, totalRounds: 0, totalWagered: 0, history: [] };
    // This round's jackpot contributions and wagers are folded into the shared
    // state HERE, once per round, instead of once per bet (see placeColorBet).
    const gs: ColorGameState = {
      ...gs0,
      jackpotPool: (gs0.jackpotPool ?? 0) + roundContribution,
      totalWagered: (gs0.totalWagered ?? 0) + roundWagered,
    };

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
    const owes = Object.values(payouts).some((p) => p > 0);

    // ── Writes (after all reads) ──
    // The payouts are saved ON the round before anyone is credited, and the round
    // stays `pending` until payRound confirms — so a crash between "dice rolled"
    // and "winners credited" is finished by the sweeper instead of lost.
    tx.update(roundRef(roundId), {
      dice,
      phase: "result",
      resolvedAt: now,
      totalPool,
      jackpotTriggered,
      jackpotColor: jackpotColor ?? null,
      jackpotAmount: jackpotTriggered ? jackpotAmount : 0,
      payouts,
      pending: owes,
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
      kind: "resolved" as const, dice, payouts, jackpotTriggered,
      jackpotColor: jackpotColor ?? null, jackpotAmount: jackpotTriggered ? jackpotAmount : 0,
      newJackpotPool: fireJackpot ? cfg.jackpotDefault : gs.jackpotPool,
      leaderUpdates,
    };
  });

  // Mirror the result to Realtime Database (what clients read). Re-mirroring an
  // already-resolved round is harmless and heals a mirror write that failed.
  if (result.kind !== "void" && result.dice) {
    try {
      const liveUpd: Record<string, unknown> = {
        [`color/live/${roundId}/dice`]: result.dice,
      };
      if (result.kind !== "done") liveUpd[`color/live/${roundId}/resolvedAt`] = now;
      if (result.kind === "resolved") {
        liveUpd[`color/live/${roundId}/jackpotTriggered`] = result.jackpotTriggered;
        liveUpd[`color/live/${roundId}/jackpotColor`] = result.jackpotColor;
        liveUpd[`color/live/${roundId}/jackpotAmount`] = result.jackpotAmount;
        liveUpd[`color/state/totalRounds`] = ServerValue.increment(1);
        if (result.jackpotTriggered) liveUpd[`color/state/jackpotPool`] = result.newJackpotPool;
        liveUpd[`color/history/${roundId}`] = { dice: result.dice, at: now };
        // Mirror leaderboard rows to RTDB (Firestore listeners on the named game
        // DB don't deliver, so clients read the ranking from here).
        for (const [uid, e] of Object.entries(result.leaderUpdates)) {
          liveUpd[`color/leaderboard/${uid}`] = e;
        }
      }
      await getDatabase().ref().update(liveUpd);
    } catch (e) {
      console.error("RTDB resolve mirror failed", e);
    }
  }

  // Jackpot auto-deactivated this round — reflect the config change to the admin page.
  if (result.kind === "resolved" && result.jackpotTriggered) await mirrorConfigToRtdb();

  // Credit winners (or refund a voided round). Idempotent, so it also finishes a
  // round that an earlier attempt resolved but failed to pay.
  const payouts = result.kind === "empty" ? {} : result.payouts;
  const needsPay = result.kind === "resolved" || result.kind === "void" || (result.kind === "done" && result.unpaid);
  if (needsPay) await payRound(roundId, payouts);

  return {
    dice: result.kind === "void" ? undefined : result.dice,
    payouts,
    jackpotTriggered: result.kind === "resolved" ? result.jackpotTriggered : result.kind === "done" ? result.jackpotTriggered : false,
    fresh: result.kind === "resolved" || result.kind === "empty",
    voided: result.kind === "void" || (result.kind === "done" && result.voided),
  };
}

export const resolveColorRound = onCall({ region: GAME_REGION }, async (request) => {
  requireUid(request);
  const { roundId } = request.data as { roundId: string };
  if (!roundId || !/^\d{1,12}$/.test(roundId)) throw new HttpsError("invalid-argument", "Missing roundId.");

  const r = await resolveRoundCore(roundId, Date.now());
  return { ok: true, dice: r.dice, payouts: r.payouts, jackpotTriggered: r.jackpotTriggered, cached: !r.fresh };
});

/**
 * Server safety net, run once a minute from the existing per-minute scheduler
 * (no extra Cloud Scheduler job). Finishes every round still marked `pending`:
 * bet on but never resolved, or resolved but winners not yet credited.
 */
export async function sweepColorRounds(now = Date.now()): Promise<{ swept: number; failed: number }> {
  // Housekeeping every 5th minute: nothing here is needed after a round is over.
  if (Math.floor(now / 60_000) % 5 === 0) await pruneColorHistory(now).catch((e) => console.error("color prune failed", e));

  const snap = await gameDb.collection("color_rounds").where("pending", "==", true).limit(25).get();
  let swept = 0, failed = 0;
  for (const d of snap.docs) {
    const round = d.data() as ColorRound;
    if (!round.dice && round.phase !== "void" && now < (round.bettingDeadline ?? 0) + SWEEP_GRACE_MS) continue;
    try {
      await resolveRoundCore(d.id, now);
      swept++;
    } catch (err) {
      failed++;
      console.error(`color sweep failed for round ${d.id}`, err);
      // A round that can never be finished must not hog the sweep window forever:
      // after 10 failed minutes park it (`stuck`) for a human to look at.
      const fails = (round.sweepFails ?? 0) + 1;
      await d.ref
        .set(fails >= 10 ? { sweepFails: fails, pending: false, stuck: true } : { sweepFails: fails }, { merge: true })
        .catch(() => {});
    }
  }
  return { swept, failed };
}

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
