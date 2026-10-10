import { randomInt } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./init";
import { spin, simulate, mergeSlotConfig, POT_KEYS, type SlotConfig, type PotKey, type SpinResult } from "./slot-engine";
import {
  cleanDaily, cleanPots, cleanGrand, spinsFor, planDay, dailyOutcome, ensurePotQueue, dueDrop,
  type DailySettings, type PotSettings, type GrandSettings, type DayPlan, type PotQueue,
} from "./slot-daily";

/**
 * Dragon Spire — the slot's Cloud Functions. Every spin is decided here; the
 * app only animates the result it is handed.
 *
 * Daily model (the default): members with an active placement get free spins
 * each day; the day's points are drawn from an admin band and planned up
 * front; pots drop per player on a schedule; the Grand is armed by the admin.
 * Paid spins (members stake their own points) exist behind `paidSpins`.
 *
 * Settings: `settings/games.slot`. Per member: `users/{uid}/game/slot`.
 * Daily tally: `games/dragonSpireStats`. Grand history: `games/dragonSpireGrand`.
 */
export type SlotStatus = "off" | "testers" | "everyone";
export type SlotSettings = {
  status: SlotStatus;
  /** While on, spins pay nothing — testers can try the game without touching balances. */
  testing: boolean;
  testers: string[];
  paidSpins: boolean;
  daily: DailySettings;
  pots: PotSettings;
  grand: GrandSettings;
  engine?: Partial<SlotConfig>;
};
const STATS_DOC = "games/dragonSpireStats";
const GRAND_DOC = "games/dragonSpireGrand";
const POTS_DOC = "games/dragonSpire";
const HOUR_MS = 3_600_000;
const dayKey = (ts: number) => new Date(ts + 8 * HOUR_MS).toISOString().slice(0, 10);
const nextMidnight = (ts: number) => { const d = new Date(ts + 8 * HOUR_MS); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - 8 * HOUR_MS; };
const rng = () => randomInt(0, 1 << 30) / (1 << 30);

function parseSettings(raw: Partial<SlotSettings> | undefined): SlotSettings {
  const r = raw ?? {};
  return {
    status: r.status === "testers" || r.status === "everyone" ? r.status : "off",
    testing: r.testing === true,
    testers: Array.isArray(r.testers) ? r.testers.map(String) : [],
    paidSpins: r.paidSpins === true,
    daily: cleanDaily(r.daily),
    pots: cleanPots(r.pots as Partial<Record<string, Partial<PotSettings["mini"]>>> | undefined),
    grand: cleanGrand(r.grand),
    engine: r.engine,
  };
}
async function loadSlot(): Promise<{ settings: SlotSettings; cfg: SlotConfig }> {
  const snap = await db.doc("settings/games").get();
  const raw = ((snap.exists ? snap.data() : {}) as { slot?: Partial<SlotSettings> }).slot;
  return { settings: parseSettings(raw), cfg: mergeSlotConfig(raw?.engine) };
}
function assertCanPlay(uid: string, s: SlotSettings, isAdmin: boolean) {
  if (s.status === "everyone") return;
  if (s.status === "testers" && (s.testers.includes(uid) || isAdmin)) return;
  throw new HttpsError("failed-precondition", s.status === "off" ? "Dragon Spire is not open right now." : "Dragon Spire is open to testers only for now.");
}
const activeCapitalOf = (u: { placements?: { capital?: number }[] } | undefined) => (u?.placements ?? []).reduce((s, p) => s + (Number(p.capital) || 0), 0);

type SlotState = {
  // daily model
  day?: string; spinsTotal?: number; spinsUsed?: number; wonToday?: number; plan?: DayPlan; potQueue?: PotQueue;
  potHistory?: { pot: PotKey; amount: number; at: number }[];
  // paid model
  freeSpinsLeft?: number; freeBet?: number; freeTotal?: number;
  // tallies
  spins?: number; wagered?: number; paid?: number; biggestWin?: number; lastAt?: number; lastBet?: number;
};

/** Today's state for the member, creating the day's plan if it hasn't been made yet. */
export const slotDayStart = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const [{ settings, cfg }, userSnap] = await Promise.all([loadSlot(), db.collection("users").doc(uid).get()]);
  assertCanPlay(uid, settings, userSnap.data()?.isAdmin === true);
  const now = Date.now();
  const today = dayKey(now);
  const capital = activeCapitalOf(userSnap.data() as { placements?: { capital?: number }[] });
  const spinsTotal = spinsFor(capital, settings.daily);
  const slotRef = db.doc(`users/${uid}/game/slot`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(slotRef);
    const st = (snap.exists ? snap.data() : {}) as SlotState;
    let patch: Partial<SlotState> = {};
    if (st.day !== today) {
      // a new day: fresh plan, yesterday's unused spins are gone
      const d = settings.daily;
      const per10 = d.bandMin + rng() * Math.max(0, d.bandMax - d.bandMin);
      const target = Math.round((per10 * spinsTotal) / 10);
      const plan = spinsTotal > 0 ? planDay(cfg, d, spinsTotal, target, randomInt(0, 2 ** 31 - 1)) : { seed: 0, wins: [], hw: [], target: 0 };
      patch = { day: today, spinsTotal, spinsUsed: 0, wonToday: 0, plan };
    }
    const { queue, changed } = ensurePotQueue(st.potQueue, settings.pots, now, rng);
    if (changed) patch.potQueue = queue;
    if (Object.keys(patch).length) tx.set(slotRef, patch, { merge: true });
    const merged = { ...st, ...patch };
    return {
      day: today, spinsTotal: merged.spinsTotal ?? 0, spinsUsed: merged.spinsUsed ?? 0, wonToday: merged.wonToday ?? 0,
      capital, resetAt: nextMidnight(now), minActive: settings.daily.minActive, testing: settings.testing,
    };
  });
});

export const slotSpin = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const [{ settings, cfg }, userSnap] = await Promise.all([loadSlot(), db.collection("users").doc(uid).get()]);
  const isAdmin = userSnap.data()?.isAdmin === true;
  assertCanPlay(uid, settings, isAdmin);
  const now = Date.now();
  const today = dayKey(now);
  const stateRef = db.doc(`users/${uid}/game/state`);
  const slotRef = db.doc(`users/${uid}/game/slot`);
  const statsRef = db.doc(STATS_DOC);
  const testing = settings.testing;
  const wantPaid = (request.data as { paid?: unknown })?.paid === true;

  if (wantPaid && settings.paidSpins) return paidSpin(uid, settings, cfg, request.data as { bet?: unknown }, now, today);

  return db.runTransaction(async (tx) => {
    const [stateSnap, slotSnap] = await Promise.all([tx.get(stateRef), tx.get(slotRef)]);
    const points = Number((stateSnap.data() as { points?: number } | undefined)?.points ?? 0);
    const st = (slotSnap.exists ? slotSnap.data() : {}) as SlotState;
    if (st.day !== today || !st.plan) throw new HttpsError("failed-precondition", "Open the game to start today's spins.");
    const used = st.spinsUsed ?? 0;
    const total = st.spinsTotal ?? 0;
    if (used >= total) throw new HttpsError("failed-precondition", total === 0 ? "No free spins today. An active placement of at least ₱" + settings.daily.minActive.toLocaleString() + " gives you daily spins." : "All of today's spins are played. New spins at midnight.");

    // a pot due for this player, or the Grand if the admin armed it on them
    let drop: { pot: PotKey; amount: number } | null = null;
    const queue = st.potQueue ?? {};
    const grandForMe = settings.grand.armedUid === uid && settings.grand.amount > 0 && !testing;
    if (grandForMe) drop = { pot: "grand", amount: settings.grand.amount };
    else {
      const k = dueDrop(queue, now);
      if (k) drop = { pot: k, amount: settings.pots[k].amount };
    }

    const result: SpinResult = dailyOutcome(cfg, settings.daily, st.plan, used, drop);
    const win = Math.round(result.totalWin);
    const payout = testing ? 0 : win;

    const patch: Record<string, unknown> = {
      spinsUsed: used + 1, wonToday: (st.wonToday ?? 0) + payout, lastAt: now,
      spins: FieldValue.increment(1), paid: FieldValue.increment(payout), biggestWin: Math.max(Number(st.biggestWin ?? 0), payout),
    };
    if (drop && drop.pot !== "grand") {
      const q = { ...(queue[drop.pot] as { period: number; due: number[]; delivered: number }) };
      q.delivered += 1;
      patch.potQueue = { ...queue, [drop.pot]: q };
    }
    if (drop) patch.potHistory = [...(st.potHistory ?? []).slice(-19), { pot: drop.pot, amount: drop.amount, at: now }];
    if (payout) tx.set(stateRef, { points: points + payout }, { merge: true });
    tx.set(slotRef, patch, { merge: true });
    if (drop?.pot === "grand") {
      // the Grand switches itself off and the win goes on record
      tx.set(db.doc("settings/games"), { slot: { grand: { armedUid: null, armedAt: null, armedBy: null, lastWinner: { uid, amount: drop.amount, at: now } } } }, { merge: true });
      tx.set(db.doc(GRAND_DOC), { winners: FieldValue.arrayUnion({ uid, amount: drop.amount, at: now, armedBy: settings.grand.armedBy ?? null }) }, { merge: true });
    }
    if (!testing) {
      tx.set(statsRef, { days: { [today]: { spins: FieldValue.increment(1), paid: FieldValue.increment(payout), holdWins: FieldValue.increment(result.holdWin ? 1 : 0), pots: FieldValue.increment(drop ? 1 : 0), potPoints: FieldValue.increment(drop?.amount ?? 0) } }, updatedAt: now }, { merge: true });
      if (drop || payout >= settings.daily.spinValue * 50) {
        tx.set(db.collection("users").doc(uid).collection("activity").doc(), {
          type: "reinvest",
          title: drop ? `Dragon Spire ${drop.pot === "grand" ? "GRAND" : drop.pot.toUpperCase()} jackpot` : "Dragon Spire big win",
          subtitle: drop ? `${drop.amount.toLocaleString()} points${win - drop.amount > 0 ? ` + ${(win - drop.amount).toLocaleString()} from the spin` : ""}` : `${payout.toLocaleString()} points on a free spin`,
          amount: payout, amountKind: "in", at: FieldValue.serverTimestamp(),
        });
      }
    } else {
      tx.set(statsRef, { days: { [today]: { testSpins: FieldValue.increment(1) } }, updatedAt: now }, { merge: true });
    }
    return {
      result, win: payout, points: points + payout, testing,
      spinsTotal: total, spinsUsed: used + 1, wonToday: (st.wonToday ?? 0) + payout,
      drop: drop ? { pot: drop.pot, amount: drop.amount } : null,
      // kept for the paid path's client shape
      freeSpinsLeft: 0, freeTotal: 0, pots: { mini: settings.pots.mini.amount, minor: settings.pots.minor.amount, major: settings.pots.major.amount, grand: settings.grand.amount },
    };
  });
});

/** The staked-points slot, kept behind the admin's `paidSpins` switch. */
async function paidSpin(uid: string, settings: SlotSettings, cfg: SlotConfig, data: { bet?: unknown }, now: number, today: string) {
  const bet = Math.floor(Number(data?.bet));
  if (!Number.isFinite(bet) || !cfg.bets.includes(bet)) throw new HttpsError("invalid-argument", `Choose a bet of ${cfg.bets.join(", ")} GP.`);
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
    if (mode === "base" && !testing) for (const k of POT_KEYS) pots[k] = Math.round((pots[k] + bet * cfg.pots.feed[k]) * 100) / 100;
    const result: SpinResult = spin(cfg, effBet, mode, pots, rng);
    const win = Math.round(result.totalWin);
    const charge = mode === "base" && !testing ? bet : 0;
    const payout = testing ? 0 : win;
    const newPoints = points - charge + payout;
    const potsAfter = { ...pots };
    if (result.holdWin) for (const k of result.holdWin.potsHit) potsAfter[k] = cfg.pots.seed[k];
    const freeSpinsLeft = (mode === "free" ? freeLeft - 1 : 0) + result.freeSpinsAwarded;
    const freeTotal = mode === "free" || result.freeSpinsAwarded > 0 ? Math.round(Number(st.freeTotal ?? 0) + (mode === "free" ? win : 0)) : 0;
    if (charge || payout) tx.set(stateRef, { points: newPoints }, { merge: true });
    tx.set(slotRef, { freeSpinsLeft, freeBet: freeSpinsLeft > 0 ? effBet : FieldValue.delete(), freeTotal: freeSpinsLeft > 0 ? freeTotal : FieldValue.delete(), spins: FieldValue.increment(1), wagered: FieldValue.increment(charge), paid: FieldValue.increment(payout), biggestWin: Math.max(Number(st.biggestWin ?? 0), payout), lastAt: now, lastBet: effBet }, { merge: true });
    if (!testing) {
      tx.set(potsRef, { pots: potsAfter, updatedAt: now }, { merge: true });
      tx.set(statsRef, { days: { [today]: { spins: FieldValue.increment(1), wagered: FieldValue.increment(charge), paid: FieldValue.increment(payout) } }, updatedAt: now }, { merge: true });
    }
    return { result, points: newPoints, freeSpinsLeft, freeTotal: freeSpinsLeft > 0 ? freeTotal : 0, pots: potsAfter, testing, win: payout, spinsTotal: 0, spinsUsed: 0, wonToday: 0, drop: null };
  });
}

/** Admin: Monte-Carlo the paid-spin maths (the daily band is exact by construction, so this is for the paid path). */
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

/** Admin: arm the Grand on one member (or disarm with uid null). Their next spin pays it. */
export const adminArmGrand = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const caller = await db.collection("users").doc(uid).get();
  if (caller.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
  const target = (request.data as { uid?: unknown })?.uid;
  if (target === null || target === undefined || target === "") {
    await db.doc("settings/games").set({ slot: { grand: { armedUid: null, armedAt: null, armedBy: null } } }, { merge: true });
    return { armedUid: null };
  }
  if (typeof target !== "string") throw new HttpsError("invalid-argument", "Pick a member.");
  const { settings } = await loadSlot();
  const member = await db.collection("users").doc(target).get();
  if (!member.exists) throw new HttpsError("not-found", "That member no longer exists.");
  const capital = activeCapitalOf(member.data() as { placements?: { capital?: number }[] });
  if (capital < settings.grand.minActive) throw new HttpsError("failed-precondition", `Only members with at least ₱${settings.grand.minActive.toLocaleString()} active can be picked.`);
  await db.doc("settings/games").set({ slot: { grand: { armedUid: target, armedAt: Date.now(), armedBy: uid } } }, { merge: true });
  return { armedUid: target };
});

/**
 * Admin: reset a tester's day (fresh plan and full spins on their next open)
 * or add spins to today's plan, paid from the band at the normal rate.
 */
export const adminSlotPlayerSpins = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const caller = await db.collection("users").doc(uid).get();
  if (caller.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
  const d = (request.data ?? {}) as { uid?: unknown; action?: unknown; spins?: unknown };
  const target = typeof d.uid === "string" ? d.uid : "";
  if (!target) throw new HttpsError("invalid-argument", "Pick a member.");
  const action = d.action === "reset" || d.action === "add" ? d.action : null;
  if (!action) throw new HttpsError("invalid-argument", "Action must be reset or add.");
  const add = action === "add" ? Math.floor(Number(d.spins)) : 0;
  if (action === "add" && (!Number.isFinite(add) || add < 1 || add > 200)) throw new HttpsError("invalid-argument", "Add between 1 and 200 spins.");
  const [{ settings, cfg }, member] = await Promise.all([loadSlot(), db.collection("users").doc(target).get()]);
  if (!member.exists) throw new HttpsError("not-found", "That member no longer exists.");
  const name = (member.data()?.profile as { name?: string } | undefined)?.name ?? target;
  const now = Date.now();
  const today = dayKey(now);
  const slotRef = db.doc(`users/${target}/game/slot`);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(slotRef);
    const st = (snap.exists ? snap.data() : {}) as SlotState;
    if (action === "reset") {
      // Dropping the day makes the next open plan it again from scratch.
      tx.set(slotRef, { day: FieldValue.delete(), plan: FieldValue.delete(), spinsTotal: 0, spinsUsed: 0, wonToday: 0 }, { merge: true });
      return { spinsTotal: 0, spinsUsed: 0 };
    }
    const dd = settings.daily;
    const per10 = dd.bandMin + rng() * Math.max(0, dd.bandMax - dd.bandMin);
    const extraTarget = Math.round((per10 * add) / 10);
    const extra = planDay(cfg, dd, add, extraTarget, randomInt(0, 2 ** 31 - 1));
    const sameDay = st.day === today && st.plan;
    const base: DayPlan = sameDay ? (st.plan as DayPlan) : { seed: extra.seed, wins: [], hw: [], target: 0 };
    const offset = base.wins.length;
    const plan: DayPlan = { seed: base.seed, wins: [...base.wins, ...extra.wins], hw: [...base.hw, ...extra.hw.map((i) => i + offset)], target: base.target + extra.target };
    const spinsTotal = (sameDay ? Number(st.spinsTotal ?? 0) : 0) + add;
    const patch: Partial<SlotState> = sameDay
      ? { plan, spinsTotal }
      : { day: today, plan, spinsTotal, spinsUsed: 0, wonToday: 0 };
    tx.set(slotRef, patch, { merge: true });
    return { spinsTotal, spinsUsed: sameDay ? Number(st.spinsUsed ?? 0) : 0 };
  });
  await db.collection("admin_audit").add({
    type: action === "reset" ? "slot_day_reset" : "slot_spins_added", uid: target, userName: name,
    title: action === "reset" ? `Dragon Spire day reset for ${name}` : `${add} Dragon Spire spins added for ${name}`,
    subtitle: action === "reset" ? "Next open gives a fresh plan and full spins" : `Today now has ${result.spinsTotal} spins`,
    spins: add, by: uid, at: now,
  });
  return result;
});

/** Admin: set the paid-path progressive pots by hand (unused in the daily model). */
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
