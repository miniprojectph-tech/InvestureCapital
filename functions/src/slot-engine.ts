/**
 * Dragon Spire — the slot maths, pure and side-effect free so the Cloud
 * Function, the admin "simulate" button and a local script all run the same
 * code. 5 reels × 4 rows, 1,024 ways: a symbol pays when it sits on
 * consecutive reels from the left, any row; wilds stand in. Wins burst,
 * symbols fall, new ones drop in (a cascade), and each cascade step raises
 * the multiplier. Multiplier orbs that land during a chain are added up and
 * multiply the whole chain at the end. Three dragon eyes start free spins;
 * six medallions start Hold & Win.
 */

export type Sym = "L1" | "L2" | "L3" | "L4" | "H1" | "H2" | "H3" | "H4" | "W" | "S" | "O" | "C";
export const PAY_SYMS: Sym[] = ["L1", "L2", "L3", "L4", "H1", "H2", "H3", "H4"];
export const REELS = 5;
export const ROWS = 4;
export type Rng = () => number; // [0, 1)

export type SlotConfig = {
  /** Allowed bets in Game Points. */
  bets: number[];
  /** Pay per single way, as a multiple of the bet, by symbol and reel count (3, 4, 5). */
  paytable: Record<Exclude<Sym, "W" | "S" | "O" | "C">, [number, number, number]>;
  /** Relative weight of each symbol on each reel (index 0 = leftmost). */
  weights: Record<Sym, number[]>;
  /** Cascade multipliers by step in the base game and in free spins (last value repeats). */
  cascadeBase: number[];
  cascadeFree: number[];
  /** Orb values and their relative weights. */
  orbValues: number[];
  orbWeights: number[];
  /** Free spins for 3 / 4 / 5 scatters, and the retrigger amount. */
  freeSpins: [number, number, number];
  freeSpinsRetrigger: number;
  holdWin: {
    minCoins: number;
    respins: number;
    /** Chance an empty cell lands a coin on each respin. */
    landChance: number;
    /** Coin values as multiples of the bet, with weights; "mini"/"minor"/"major" pay the pot. */
    coinValues: (number | "mini" | "minor" | "major")[];
    coinWeights: number[];
  };
  pots: {
    seed: Record<PotKey, number>;
    /** Share of every bet fed to each pot (0.01 = 1%). */
    feed: Record<PotKey, number>;
    /** The bet at which a pot pays in full; smaller bets win a proportional share. */
    refBet: number;
  };
  /** Chance per spin, given a chain had no other feature, is implicit in the weights. */
  maxWinMultiple: number;
};
export type PotKey = "mini" | "minor" | "major" | "grand";
export const POT_KEYS: PotKey[] = ["mini", "minor", "major", "grand"];

export const DEFAULT_SLOT_CONFIG: SlotConfig = {
  bets: [5, 10, 25, 50, 100, 250, 500],
  // Tuned by simulation (scratchpad slot-tune.js) to ~94% return: ~63% from line wins and cascades,
  // ~17% from free spins, ~13% from Hold & Win, 2.4% fed to the pots. Hit rate ~55%.
  paytable: {
    L1: [0.022, 0.045, 0.11],
    L2: [0.022, 0.045, 0.11],
    L3: [0.027, 0.055, 0.14],
    L4: [0.027, 0.055, 0.14],
    H1: [0.045, 0.11, 0.28],
    H2: [0.065, 0.18, 0.45],
    H3: [0.09, 0.22, 0.65],
    H4: [0.13, 0.35, 1.1],
  },
  weights: {
    L1: [12, 12, 12, 12, 12],
    L2: [12, 12, 12, 12, 12],
    L3: [11, 11, 11, 11, 11],
    L4: [11, 11, 11, 11, 11],
    H1: [8, 8, 8, 8, 8],
    H2: [6, 6, 6, 6, 6],
    H3: [5, 5, 5, 5, 5],
    H4: [4, 4, 4, 4, 4],
    W: [0, 2.2, 2.2, 2.2, 0],
    S: [1.15, 1.15, 1.15, 1.15, 1.15],
    O: [0.65, 0.65, 0.65, 0.65, 0.65],
    C: [5, 5, 5, 5, 5],
  },
  cascadeBase: [1, 2, 3, 5],
  cascadeFree: [2, 4, 6, 10],
  orbValues: [2, 3, 5, 10, 25],
  orbWeights: [50, 28, 15, 6, 1],
  freeSpins: [10, 12, 15],
  freeSpinsRetrigger: 5,
  holdWin: {
    minCoins: 6,
    respins: 3,
    landChance: 0.09,
    coinValues: [0.2, 0.3, 0.5, 1, 2, 3, 5, 10, 25, "mini", "minor", "major"],
    coinWeights: [30, 25, 18, 12, 7, 4, 2.5, 1, 0.3, 2, 0.6, 0.15],
  },
  pots: {
    seed: { mini: 200, minor: 1000, major: 5000, grand: 25000 },
    feed: { mini: 0.01, minor: 0.007, major: 0.004, grand: 0.003 },
    refBet: 100,
  },
  maxWinMultiple: 5000,
};

/** A pot pays in proportion to the bet: bet/refBet of the pot, never more than the pot. */
export function potPayout(cfg: SlotConfig, pot: number, bet: number): number {
  return Math.round(Math.min(pot, (pot * bet) / Math.max(1, cfg.pots.refBet)));
}

export type Cell = { sym: Sym; orb?: number };
export type Grid = Cell[][]; // [reel][row]
export type Win = { sym: Sym; reels: number; ways: number; pay: number; cells: [number, number][] };
export type Step = { grid: Grid; wins: Win[]; mult: number; stepWin: number; removed: [number, number][] };
export type HoldWinRound = { landed: [number, number][]; respinsLeft: number };
export type HoldWinResult = {
  coins: ({ reel: number; row: number; value: number | PotKey })[];
  rounds: HoldWinRound[];
  total: number;
  potsHit: PotKey[];
  grandFilled: boolean;
};
export type SpinResult = {
  bet: number;
  mode: "base" | "free";
  steps: Step[];
  orbs: { reel: number; row: number; value: number }[];
  orbSum: number;
  lineWin: number;
  scatters: [number, number][];
  freeSpinsAwarded: number;
  holdWin: HoldWinResult | null;
  totalWin: number;
  capped: boolean;
};

function pick<T>(items: T[], weights: number[], rng: Rng): T {
  let total = 0;
  for (const w of weights) total += w;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

const ALL_SYMS: Sym[] = ["L1", "L2", "L3", "L4", "H1", "H2", "H3", "H4", "W", "S", "O", "C"];

function drawCell(cfg: SlotConfig, reel: number, mode: "base" | "free", rng: Rng): Cell {
  const weights = ALL_SYMS.map((s) => {
    const w = cfg.weights[s][reel] ?? 0;
    if (mode === "free" && s === "C") return 0; // no Hold & Win inside free spins
    return w;
  });
  const sym = pick(ALL_SYMS, weights, rng);
  if (sym === "O") return { sym, orb: pick(cfg.orbValues, cfg.orbWeights, rng) };
  return { sym };
}

export function drawGrid(cfg: SlotConfig, mode: "base" | "free", rng: Rng): Grid {
  const g: Grid = [];
  for (let r = 0; r < REELS; r++) {
    const col: Cell[] = [];
    for (let y = 0; y < ROWS; y++) col.push(drawCell(cfg, r, mode, rng));
    g.push(col);
  }
  return g;
}

/** Ways wins on the grid, as multiples of the bet. */
export function evaluate(cfg: SlotConfig, grid: Grid): Win[] {
  const wins: Win[] = [];
  for (const sym of PAY_SYMS) {
    const perReel: [number, number][][] = [];
    for (let r = 0; r < REELS; r++) {
      const cells: [number, number][] = [];
      for (let y = 0; y < ROWS; y++) {
        const s = grid[r][y].sym;
        if (s === sym || s === "W") cells.push([r, y]);
      }
      if (cells.length === 0) break;
      perReel.push(cells);
    }
    if (perReel.length < 3) continue;
    // a pure-wild run on the first reels counts for every symbol; that's intended (wilds are rare)
    const reels = perReel.length;
    const ways = perReel.reduce((p, c) => p * c.length, 1);
    const pay = cfg.paytable[sym as keyof SlotConfig["paytable"]][reels - 3] * ways;
    wins.push({ sym, reels, ways, pay, cells: perReel.flat() });
  }
  return wins;
}

function cascade(cfg: SlotConfig, grid: Grid, removed: [number, number][], mode: "base" | "free", rng: Rng): Grid {
  const gone = new Set(removed.map(([r, y]) => r * 10 + y));
  const next: Grid = [];
  for (let r = 0; r < REELS; r++) {
    const keep = grid[r].filter((_, y) => !gone.has(r * 10 + y));
    const fresh: Cell[] = [];
    while (keep.length + fresh.length < ROWS) fresh.push(drawCell(cfg, r, mode, rng));
    // new symbols land on top (index 0 = top row)
    next.push([...fresh, ...keep]);
  }
  return next;
}

/** One full spin: initial grid, the whole cascade chain, orbs, scatters, and Hold & Win if it triggers. */
export function spin(cfg: SlotConfig, bet: number, mode: "base" | "free", pots: Record<PotKey, number>, rng: Rng): SpinResult {
  const table = mode === "free" ? cfg.cascadeFree : cfg.cascadeBase;
  let grid = drawGrid(cfg, mode, rng);
  const steps: Step[] = [];
  const orbs: SpinResult["orbs"] = [];
  const scatters: [number, number][] = [];
  const seenOrb = new Set<string>();
  let lineWin = 0;

  const collect = (g: Grid, stepIndex: number) => {
    // orbs and scatters are counted once per position per step they appear (cells shift between steps,
    // so a key includes the step index); scatters on the first grid and on any later drop all count
    for (let r = 0; r < REELS; r++) for (let y = 0; y < ROWS; y++) {
      const c = g[r][y];
      if (c.sym === "O" && c.orb) { const k = `${stepIndex}:${r}:${y}`; if (!seenOrb.has(k)) { seenOrb.add(k); orbs.push({ reel: r, row: y, value: c.orb }); } }
    }
  };

  for (let i = 0; i < 30; i++) {
    const wins = evaluate(cfg, grid);
    const mult = table[Math.min(i, table.length - 1)];
    const stepWin = wins.reduce((s, w) => s + w.pay, 0) * bet * mult;
    const removed = wins.flatMap((w) => w.cells);
    // orbs only "count" on steps that have a win (that's when they're on screen during a chain);
    // orbs on the very first grid count if any win happens at all in the chain
    steps.push({ grid, wins, mult, stepWin, removed });
    if (wins.length === 0) break;
    collect(grid, i);
    lineWin += stepWin;
    // dedupe removed cells (a wild can sit in several symbols' wins)
    const uniq = Array.from(new Set(removed.map(([r, y]) => r * 10 + y))).map((k) => [Math.floor(k / 10), k % 10] as [number, number]);
    steps[steps.length - 1].removed = uniq;
    grid = cascade(cfg, grid, uniq, mode, rng);
  }
  const finalGrid = steps[steps.length - 1].grid;
  // scatters: count on the final grid plus any that were on earlier grids (they are never removed, so the final grid holds them all)
  for (let r = 0; r < REELS; r++) for (let y = 0; y < ROWS; y++) if (finalGrid[r][y].sym === "S") scatters.push([r, y]);

  const orbSum = lineWin > 0 ? orbs.reduce((s, o) => s + o.value, 0) : 0;
  let total = orbSum > 0 ? lineWin * orbSum : lineWin;

  const freeSpinsAwarded = scatters.length >= 3
    ? (mode === "free" ? cfg.freeSpinsRetrigger : cfg.freeSpins[Math.min(scatters.length - 3, 2)])
    : 0;

  let holdWin: HoldWinResult | null = null;
  if (mode === "base") {
    const coins: [number, number][] = [];
    for (let r = 0; r < REELS; r++) for (let y = 0; y < ROWS; y++) if (finalGrid[r][y].sym === "C") coins.push([r, y]);
    if (coins.length >= cfg.holdWin.minCoins) {
      holdWin = playHoldWin(cfg, bet, coins, pots, rng);
      total += holdWin.total;
    }
  }

  const cap = bet * cfg.maxWinMultiple;
  const capped = total > cap;
  if (capped) total = cap;
  total = Math.round(total * 100) / 100;

  return { bet, mode, steps, orbs, orbSum, lineWin: Math.round(lineWin * 100) / 100, scatters, freeSpinsAwarded, holdWin, totalWin: total, capped };
}

function drawCoin(cfg: SlotConfig, bet: number, rng: Rng): { value: number | PotKey } {
  const v = pick(cfg.holdWin.coinValues, cfg.holdWin.coinWeights, rng);
  if (typeof v === "number") return { value: Math.round(v * bet) };
  return { value: v };
}

export function playHoldWin(cfg: SlotConfig, bet: number, start: [number, number][], pots: Record<PotKey, number>, rng: Rng): HoldWinResult {
  const coins: HoldWinResult["coins"] = start.map(([reel, row]) => ({ reel, row, ...drawCoin(cfg, bet, rng) }));
  const filled = new Set(start.map(([r, y]) => r * 10 + y));
  const rounds: HoldWinRound[] = [];
  let respins = cfg.holdWin.respins;
  while (respins > 0 && filled.size < REELS * ROWS) {
    const landed: [number, number][] = [];
    for (let r = 0; r < REELS; r++) for (let y = 0; y < ROWS; y++) {
      if (filled.has(r * 10 + y)) continue;
      if (rng() < cfg.holdWin.landChance) {
        filled.add(r * 10 + y);
        landed.push([r, y]);
        coins.push({ reel: r, row: y, ...drawCoin(cfg, bet, rng) });
      }
    }
    respins = landed.length > 0 ? cfg.holdWin.respins : respins - 1;
    rounds.push({ landed, respinsLeft: respins });
  }
  const grandFilled = filled.size === REELS * ROWS;
  const potsHit: PotKey[] = [];
  let total = 0;
  const potPaid: Partial<Record<PotKey, boolean>> = {};
  for (const c of coins) {
    if (typeof c.value === "number") total += c.value;
    else if (!potPaid[c.value]) { potPaid[c.value] = true; potsHit.push(c.value); total += potPayout(cfg, pots[c.value], bet); }
    else total += potPayout(cfg, cfg.pots.seed[c.value], bet); // a second coin of the same pot pays the seed value
  }
  if (grandFilled) { potsHit.push("grand"); total += potPayout(cfg, pots.grand, bet); }
  return { coins, rounds, total: Math.round(total), potsHit, grandFilled };
}

/** Monte-Carlo return-to-player for a config: spins the base game (free spins included) N times. */
export function simulate(cfg: SlotConfig, spins: number, rng: Rng, bet = 100): {
  rtp: number; hitRate: number; freeSpinRate: number; holdWinRate: number; maxWin: number;
  parts: { lines: number; freeSpins: number; holdWin: number; potsFeed: number };
} {
  let wagered = 0, paid = 0, hits = 0, fsTriggers = 0, hwTriggers = 0, maxWin = 0;
  let linesPaid = 0, fsPaid = 0, hwPaid = 0;
  const pots: Record<PotKey, number> = { ...cfg.pots.seed };
  for (let i = 0; i < spins; i++) {
    wagered += bet;
    for (const k of POT_KEYS) pots[k] += bet * cfg.pots.feed[k];
    const r = spin(cfg, bet, "base", pots, rng);
    paid += r.totalWin;
    if (r.totalWin > 0) hits++;
    linesPaid += r.totalWin - (r.holdWin?.total ?? 0);
    if (r.holdWin) { hwTriggers++; hwPaid += r.holdWin.total; for (const k of r.holdWin.potsHit) pots[k] = cfg.pots.seed[k]; }
    if (r.totalWin > maxWin) maxWin = r.totalWin;
    if (r.freeSpinsAwarded > 0) {
      fsTriggers++;
      let left = r.freeSpinsAwarded;
      let guard = 0;
      while (left > 0 && guard++ < 200) {
        left--;
        const f = spin(cfg, bet, "free", pots, rng);
        paid += f.totalWin; fsPaid += f.totalWin;
        if (f.totalWin > maxWin) maxWin = f.totalWin;
        left += f.freeSpinsAwarded;
      }
    }
  }
  const feed = POT_KEYS.reduce((s, k) => s + cfg.pots.feed[k], 0);
  return {
    rtp: paid / wagered,
    hitRate: hits / spins,
    freeSpinRate: fsTriggers / spins,
    holdWinRate: hwTriggers / spins,
    maxWin: maxWin / bet,
    parts: { lines: linesPaid / wagered, freeSpins: fsPaid / wagered, holdWin: hwPaid / wagered, potsFeed: feed },
  };
}

/** Merge a partial admin config over the defaults, keeping shapes valid. */
export function mergeSlotConfig(raw: Partial<SlotConfig> | undefined): SlotConfig {
  if (!raw) return DEFAULT_SLOT_CONFIG;
  const d = DEFAULT_SLOT_CONFIG;
  const bets = Array.isArray(raw.bets) && raw.bets.length ? raw.bets.map((b) => Math.max(1, Math.floor(Number(b) || 0))).filter((b) => b > 0).sort((a, b) => a - b) : d.bets;
  return {
    ...d,
    ...raw,
    bets,
    paytable: { ...d.paytable, ...(raw.paytable ?? {}) },
    weights: { ...d.weights, ...(raw.weights ?? {}) },
    holdWin: { ...d.holdWin, ...(raw.holdWin ?? {}) },
    pots: { seed: { ...d.pots.seed, ...(raw.pots?.seed ?? {}) }, feed: { ...d.pots.feed, ...(raw.pots?.feed ?? {}) }, refBet: Math.max(1, Number(raw.pots?.refBet ?? d.pots.refBet) || d.pots.refBet) },
  };
}
