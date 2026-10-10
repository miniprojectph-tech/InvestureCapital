/**
 * Dragon Spire — the daily free-spins model. Members don't stake points: each
 * day they get free spins from their active placements, and the day's total
 * is drawn from an admin band and planned up front from real slot outcomes,
 * so the pattern looks natural while the total is exact. Pots (Mini / Minor
 * / Major) drop on each player a set number of times per period at random
 * moments; the Grand is armed by the admin on one member.
 */
import { spin, mergeSlotConfig, REELS, ROWS, type SlotConfig, type SpinResult, type Rng, type Grid, type PotKey } from "./slot-engine";

export type DailySettings = {
  /** Spins everyone with at least `minActive` gets. */
  baseSpins: number;
  minActive: number;
  /** Extra spins for every full ₱1,000 above the first. */
  perThousand: number;
  cap: number;
  /** Points a member's day totals, per 10 spins — drawn once a day, then scaled by their spins. */
  bandMin: number;
  bandMax: number;
  /** Notional bet the maths runs at (sets how a win looks relative to the symbols). */
  spinValue: number;
  /** Everyday Hold & Win with small coins (no pot): about 1 in N spins. */
  everydayHwOneIn: number;
};
export const DEFAULT_DAILY: DailySettings = { baseSpins: 10, minActive: 1000, perThousand: 5, cap: 50, bandMin: 200, bandMax: 400, spinValue: 20, everydayHwOneIn: 60 };

export type PotPlan = { amount: number; count: number; weeks: number };
export type PotSettings = Record<Exclude<PotKey, "grand">, PotPlan>;
export const DEFAULT_POTS: PotSettings = {
  mini: { amount: 200, count: 2, weeks: 1 },
  minor: { amount: 500, count: 1, weeks: 1 },
  major: { amount: 1000, count: 1, weeks: 2 },
};
export type GrandSettings = { amount: number; minActive: number; armedUid: string | null; armedAt: number | null; armedBy?: string | null };
export const DEFAULT_GRAND: GrandSettings = { amount: 50000, minActive: 5000, armedUid: null, armedAt: null };

export function cleanDaily(raw: Partial<DailySettings> | undefined): DailySettings {
  const d = { ...DEFAULT_DAILY, ...(raw ?? {}) };
  const int = (v: unknown, lo: number, hi: number, dflt: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
  const out: DailySettings = {
    baseSpins: int(d.baseSpins, 0, 500, DEFAULT_DAILY.baseSpins),
    minActive: int(d.minActive, 0, 10_000_000, DEFAULT_DAILY.minActive),
    perThousand: int(d.perThousand, 0, 500, DEFAULT_DAILY.perThousand),
    cap: int(d.cap, 1, 500, DEFAULT_DAILY.cap),
    bandMin: int(d.bandMin, 0, 1_000_000, DEFAULT_DAILY.bandMin),
    bandMax: int(d.bandMax, 0, 1_000_000, DEFAULT_DAILY.bandMax),
    spinValue: int(d.spinValue, 1, 100_000, DEFAULT_DAILY.spinValue),
    everydayHwOneIn: int(d.everydayHwOneIn, 0, 100_000, DEFAULT_DAILY.everydayHwOneIn),
  };
  if (out.bandMax < out.bandMin) out.bandMax = out.bandMin;
  return out;
}
export function cleanPots(raw: Partial<Record<string, Partial<PotPlan>>> | undefined): PotSettings {
  const out = { ...DEFAULT_POTS } as PotSettings;
  for (const k of ["mini", "minor", "major"] as const) {
    const r = raw?.[k] ?? {};
    const amount = Math.floor(Number(r.amount)), count = Math.floor(Number(r.count)), weeks = Math.floor(Number(r.weeks));
    out[k] = {
      amount: Number.isFinite(amount) && amount >= 0 ? amount : DEFAULT_POTS[k].amount,
      count: Number.isFinite(count) && count >= 0 ? Math.min(50, count) : DEFAULT_POTS[k].count,
      weeks: Number.isFinite(weeks) && weeks >= 1 ? Math.min(52, weeks) : DEFAULT_POTS[k].weeks,
    };
  }
  return out;
}
export function cleanGrand(raw: Partial<GrandSettings> | undefined): GrandSettings {
  const amount = Math.floor(Number(raw?.amount)), minActive = Math.floor(Number(raw?.minActive));
  return {
    amount: Number.isFinite(amount) && amount >= 0 ? amount : DEFAULT_GRAND.amount,
    minActive: Number.isFinite(minActive) && minActive >= 0 ? minActive : DEFAULT_GRAND.minActive,
    armedUid: typeof raw?.armedUid === "string" && raw.armedUid ? raw.armedUid : null,
    armedAt: typeof raw?.armedAt === "number" ? raw.armedAt : null,
    armedBy: typeof raw?.armedBy === "string" ? raw.armedBy : null,
  };
}

/** Free spins for an active capital: none below the minimum, then base + per extra ₱1,000, capped. */
export function spinsFor(activeCapital: number, d: DailySettings): number {
  if (activeCapital < d.minActive || d.minActive <= 0 && activeCapital <= 0) return 0;
  const extraThousands = Math.max(0, Math.floor((activeCapital - Math.max(1000, d.minActive)) / 1000));
  return Math.min(d.cap, d.baseSpins + extraThousands * d.perThousand);
}

// ===== deterministic randomness =====
function hash32(a: number, b: number): number {
  let h = (a ^ 0x9E3779B9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
  h = (h ^ b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
/** mulberry32 seeded from (seed, index) so spin i can be regenerated on its own. */
export function seededRng(seed: number, index: number): Rng {
  let s = hash32(seed, index) || 1;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The maths for daily spins: no scatter free spins and no medallion triggers (those are scheduled, not random). */
export function dailyEngineConfig(base: SlotConfig): SlotConfig {
  return mergeSlotConfig({ ...base, weights: { ...base.weights, S: [0, 0, 0, 0, 0], C: [0, 0, 0, 0, 0] } });
}

const NO_POTS: Record<PotKey, number> = { mini: 0, minor: 0, major: 0, grand: 0 };

export type DayPlan = { seed: number; wins: number[]; hw: number[]; target: number };

/**
 * Plan a day: `spins` real outcomes at the notional spin value, scaled so they
 * add up to `target`. Zero spins stay zero, big chains stay the big ones.
 * `hw` lists the spins that play as an everyday Hold & Win (small coins).
 */
export function planDay(cfg: SlotConfig, d: DailySettings, spins: number, target: number, seed0: number): DayPlan {
  const eng = dailyEngineConfig(cfg);
  for (let attempt = 0; attempt < 20; attempt++) {
    const seed = (seed0 + attempt * 7919) >>> 0;
    const raw: number[] = [];
    for (let i = 0; i < spins; i++) raw.push(spin(eng, d.spinValue, "base", NO_POTS, seededRng(seed, i)).totalWin);
    const rawTotal = raw.reduce((s, w) => s + w, 0);
    if (rawTotal <= 0 && target > 0) continue;
    // no single spin carries more than 60% of the day: real chains can be 1,000×, which would leave
    // every other spin at 1 point — soften the biggest ones and spread the excess over the rest
    const capped = raw.slice();
    const share = 0.6;
    for (let pass = 0; pass < 5; pass++) {
      const tot = capped.reduce((s, w) => s + w, 0);
      const others = capped.filter((w) => w > 0 && w <= tot * share);
      let excess = 0;
      for (let i = 0; i < spins; i++) if (capped[i] > tot * share) { excess += capped[i] - tot * share; capped[i] = tot * share; }
      if (excess <= 0 || others.length === 0) break;
      const oSum = others.reduce((s, w) => s + w, 0);
      for (let i = 0; i < spins; i++) if (capped[i] > 0 && capped[i] < tot * share) capped[i] += (excess * capped[i]) / oSum;
    }
    const cTotal = capped.reduce((s, w) => s + w, 0);
    const wins = capped.map((w) => (cTotal > 0 ? Math.floor((w * target) / cTotal) : 0));
    // tiny wins that rounded to nothing still show as a win on screen — give them 1
    for (let i = 0; i < spins; i++) if (raw[i] > 0 && wins[i] === 0 && target > 0) wins[i] = 1;
    let diff = target - wins.reduce((s, w) => s + w, 0);
    // settle the rounding on the biggest wins (never below 1)
    const order = wins.map((_, i) => i).sort((a, b) => wins[b] - wins[a]);
    let guard = 0;
    while (diff !== 0 && guard++ < 10_000) {
      for (const i of order) {
        if (diff === 0) break;
        if (diff > 0) { wins[i]++; diff--; } else if (wins[i] > 1) { wins[i]--; diff++; }
      }
      if (diff < 0 && wins.every((w) => w <= 1)) break;
    }
    // everyday Hold & Win only on spins with enough points to split into 6–13 coins
    const hw: number[] = [];
    if (d.everydayHwOneIn > 0) {
      const r = seededRng(seed, 1_000_003);
      for (let i = 0; i < spins; i++) if (wins[i] >= 15 && r() < 1 / d.everydayHwOneIn) hw.push(i);
    }
    return { seed, wins, hw, target };
  }
  return { seed: seed0, wins: Array(spins).fill(0), hw: [], target: 0 };
}

/** Scale an outcome's step wins so the chain adds up to `win` (orbs included). */
function scaleOutcome(r: SpinResult, win: number): SpinResult {
  const chain = r.orbSum > 0 ? r.lineWin * r.orbSum : r.lineWin;
  if (chain <= 0 || win <= 0) {
    return { ...r, steps: r.steps.map((s) => ({ ...s, stepWin: 0 })), lineWin: 0, orbSum: 0, orbs: [], totalWin: win, holdWin: null, freeSpinsAwarded: 0, scatters: [] };
  }
  const line = r.orbSum > 0 ? win / r.orbSum : win;
  const k = line / r.lineWin;
  const steps = r.steps.map((s) => ({ ...s, stepWin: Math.round(s.stepWin * k * 100) / 100 }));
  return { ...r, steps, lineWin: Math.round(line * 100) / 100, totalWin: win, holdWin: null, freeSpinsAwarded: 0, scatters: [] };
}

/** Split an amount into n coin values that look like a slot's: a few bigger, most small. */
function splitCoins(total: number, n: number, rng: Rng): number[] {
  if (n <= 0) return [];
  const weights = Array.from({ length: n }, () => 0.3 + Math.pow(rng(), 2.2) * 3);
  const sum = weights.reduce((s, w) => s + w, 0);
  const vals = weights.map((w) => Math.max(1, Math.floor((total * w) / sum)));
  let diff = total - vals.reduce((s, v) => s + v, 0);
  let i = 0;
  while (diff !== 0 && i < 10_000) { const j = i % n; if (diff > 0) { vals[j]++; diff--; } else if (vals[j] > 1) { vals[j]--; diff++; } i++; }
  return vals;
}

/** A Hold & Win round whose coins add up to `coinTotal`, optionally with a pot medallion. */
export function buildHoldWin(grid: Grid, coinTotal: number, pot: PotKey | null, grandFill: boolean, rng: Rng): { grid: Grid; holdWin: NonNullable<SpinResult["holdWin"]> } {
  const cells: [number, number][] = [];
  for (let r = 0; r < REELS; r++) for (let y = 0; y < ROWS; y++) cells.push([r, y]);
  // shuffle
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  const startCount = 6 + Math.floor(rng() * 2); // 6 or 7 triggering medallions
  const landedTotal = grandFill ? cells.length - startCount : Math.min(cells.length - startCount, 2 + Math.floor(rng() * 5)); // 2–6 more land
  const start = cells.slice(0, startCount);
  const later = cells.slice(startCount, startCount + landedTotal);
  const coinCount = startCount + landedTotal;
  const valueCoins = pot ? coinCount - 1 : coinCount;
  const values = splitCoins(Math.max(coinTotal, valueCoins), valueCoins, rng);
  const coins: NonNullable<SpinResult["holdWin"]>["coins"] = [];
  const all = [...start, ...later];
  const potIndex = pot ? Math.floor(rng() * all.length) : -1;
  let vi = 0;
  all.forEach(([reel, row], idx) => { coins.push({ reel, row, value: idx === potIndex ? (pot as PotKey) : values[vi++] }); });
  // rounds: spread the later coins over respins; a dry respin or two for tension
  const rounds: NonNullable<SpinResult["holdWin"]>["rounds"] = [];
  let left = later.slice();
  let respins = 3;
  while (left.length > 0) {
    const dry = rng() < 0.3 && respins > 1;
    if (dry) { respins--; rounds.push({ landed: [], respinsLeft: respins }); continue; }
    const take = Math.min(left.length, 1 + Math.floor(rng() * 2));
    const landed = left.splice(0, take);
    respins = 3;
    rounds.push({ landed, respinsLeft: respins });
  }
  if (!grandFill) { for (let k = 0; k < 3; k++) { respins--; rounds.push({ landed: [], respinsLeft: respins }); } }
  // the grid shows the triggering medallions
  const g: Grid = grid.map((col) => col.map((c) => ({ ...c })));
  for (const [r, y] of start) g[r][y] = { sym: "C" };
  const total = values.reduce((s, v) => s + v, 0);
  return { grid: g, holdWin: { coins, rounds, total, potsHit: pot ? [pot] : [], grandFilled: grandFill } };
}

/** Regenerate spin `i` of a plan and shape it: scaled chain, everyday Hold & Win, or a pot / Grand drop. */
export function dailyOutcome(cfg: SlotConfig, d: DailySettings, plan: DayPlan, i: number, drop: { pot: PotKey; amount: number } | null): SpinResult {
  const eng = dailyEngineConfig(cfg);
  const rng = seededRng(plan.seed, i);
  const raw = spin(eng, d.spinValue, "base", NO_POTS, rng);
  const win = plan.wins[i] ?? 0;
  const base = scaleOutcome(raw, win);
  const everydayHw = plan.hw.includes(i);
  if (!drop && !everydayHw) return base;
  // a Hold & Win spin: the chain is replaced by coins (planned win) plus the pot if one drops
  const hwRng = seededRng(plan.seed ^ 0xABCDEF, i);
  const grandFill = drop?.pot === "grand";
  const { grid, holdWin } = buildHoldWin(base.steps[0].grid, win, drop?.pot ?? null, grandFill, hwRng);
  // the coins are the payout: on a tiny spin they may add a point or two over the plan, never less
  const potAmount = drop?.amount ?? 0;
  const firstStep = { ...base.steps[0], grid, wins: [], stepWin: 0, removed: [] };
  return { ...base, steps: [firstStep], lineWin: 0, orbSum: 0, orbs: [], holdWin: { ...holdWin, total: holdWin.total + potAmount }, totalWin: holdWin.total + potAmount };
}

// ===== pot periods (Manila weeks, Monday 00:00) =====
const HOUR_MS = 3_600_000, DAY_MS = 86_400_000, WEEK_MS = 7 * DAY_MS;
const EPOCH_MONDAY = Date.UTC(2024, 0, 1) - 8 * HOUR_MS; // Mon 1 Jan 2024 00:00 Manila
export function weekIndex(now: number): number { return Math.floor((now - EPOCH_MONDAY) / WEEK_MS); }
export function periodOf(now: number, weeks: number): { key: number; start: number; end: number } {
  const w = weekIndex(now);
  const key = Math.floor(w / weeks);
  const start = EPOCH_MONDAY + key * weeks * WEEK_MS;
  return { key, start, end: start + weeks * WEEK_MS };
}
export type PotQueue = Partial<Record<Exclude<PotKey, "grand">, { period: number; due: number[]; delivered: number }>>;
/** Make sure each pot has its drops scheduled for the current period; unplayed drops from older periods are forfeited. */
export function ensurePotQueue(queue: PotQueue | undefined, pots: PotSettings, now: number, rng: Rng): { queue: PotQueue; changed: boolean } {
  const out: PotQueue = { ...(queue ?? {}) };
  let changed = false;
  for (const k of ["mini", "minor", "major"] as const) {
    const p = pots[k];
    const period = periodOf(now, p.weeks);
    const cur = out[k];
    if (cur && cur.period === period.key) continue;
    // schedule `count` random moments between now and the end of the period
    const due: number[] = [];
    for (let i = 0; i < p.count; i++) due.push(Math.floor(now + rng() * Math.max(1, period.end - now - 60_000)));
    due.sort((a, b) => a - b);
    out[k] = { period: period.key, due, delivered: 0 };
    changed = true;
  }
  return { queue: out, changed };
}
/** The next pot that is due now (earliest first), if any. */
export function dueDrop(queue: PotQueue, now: number): Exclude<PotKey, "grand"> | null {
  let best: { k: Exclude<PotKey, "grand">; at: number } | null = null;
  for (const k of ["mini", "minor", "major"] as const) {
    const q = queue[k];
    if (!q) continue;
    const next = q.due[q.delivered];
    if (next !== undefined && next <= now && (!best || next < best.at)) best = { k, at: next };
  }
  return best?.k ?? null;
}
