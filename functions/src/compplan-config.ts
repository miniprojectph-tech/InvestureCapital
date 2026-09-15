// Compensation plan configuration — pure types, defaults and math shared by the
// web app and Cloud Functions. src/lib/compplan-config.ts is a verbatim copy;
// keep the two in sync.

export type CompPlanTerm = {
  /** Term length in months (a month is `monthDays` long). */
  months: number;
  /** Locked-In Bonus paid with the final payout, per placement unit. */
  lockedBonusPerUnit: number;
};

export type FastStartTier = {
  /** Each direct referral must have at least this much actively placed. */
  minPlacement: number;
  /** One-time bonus paid to the sponsor when `fastStartDirects` directs qualify. */
  bonus: number;
};

export type CompPlanConfig = {
  /** Days between payouts (a "cycle"). */
  cycleDays: number;
  /** Percent of capital paid every cycle. */
  cycleRate: number;
  /** Days in a month for term math. */
  monthDays: number;
  /** Smallest allowed placement. */
  minPlacement: number;
  /** Placement step; also the "unit" all per-unit bonuses are quoted against. */
  increment: number;
  terms: CompPlanTerm[];
  /** Referral commission percent per level (index 0 = direct referral). */
  referralLevels: number[];
  /** An upline must have at least this much actively placed to receive
   *  commissions / bonuses. 0 disables the requirement. */
  uplineMinActive: number;
  /** Number of qualifying direct referrals for a Fast-Start tier. */
  fastStartDirects: number;
  fastStartTiers: FastStartTier[];
  /** Sponsor's Leadership Bonus as a percent of the direct's Locked-In Bonus. */
  leadershipPct: number;
  /** Post a daily "Earning +₱x today" notification between payouts. */
  dailyAccrualNotifications: boolean;
};

export const DEFAULT_COMP_PLAN: CompPlanConfig = {
  cycleDays: 5,
  cycleRate: 10,
  monthDays: 30,
  minPlacement: 1000,
  increment: 1000,
  terms: [
    { months: 1, lockedBonusPerUnit: 0 },
    { months: 3, lockedBonusPerUnit: 6000 },
    { months: 6, lockedBonusPerUnit: 15000 },
  ],
  referralLevels: [10, 4, 2.5, 1.5, 1, 1],
  uplineMinActive: 1000,
  fastStartDirects: 10,
  fastStartTiers: [
    { minPlacement: 1000, bonus: 500 },
    { minPlacement: 10000, bonus: 5000 },
    { minPlacement: 100000, bonus: 50000 },
  ],
  leadershipPct: 50,
  dailyAccrualNotifications: true,
};

/** Overlay a stored (possibly partial / older) config on the defaults. */
export function mergeCompPlan(stored: Partial<CompPlanConfig> | null | undefined): CompPlanConfig {
  if (!stored) return DEFAULT_COMP_PLAN;
  const out: CompPlanConfig = { ...DEFAULT_COMP_PLAN, ...stored };
  if (!Array.isArray(stored.terms) || stored.terms.length === 0) out.terms = DEFAULT_COMP_PLAN.terms;
  if (!Array.isArray(stored.referralLevels) || stored.referralLevels.length === 0) out.referralLevels = DEFAULT_COMP_PLAN.referralLevels;
  if (!Array.isArray(stored.fastStartTiers)) out.fastStartTiers = DEFAULT_COMP_PLAN.fastStartTiers;
  return out;
}

export function cyclesForTerm(cfg: CompPlanConfig, months: number): number {
  return Math.max(1, Math.round((months * cfg.monthDays) / cfg.cycleDays));
}

export function unitsFor(cfg: CompPlanConfig, amount: number): number {
  return Math.floor(amount / cfg.increment);
}

/** Returns a human error, or null when the amount is placeable. */
export function validatePlacementAmount(cfg: CompPlanConfig, amount: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "Enter an amount";
  if (amount < cfg.minPlacement) return `Minimum placement is ₱${cfg.minPlacement.toLocaleString()}`;
  if (amount % cfg.increment !== 0) return `Placements must be in steps of ₱${cfg.increment.toLocaleString()}`;
  return null;
}

export type PlacementProjection = {
  units: number;
  cycles: number;
  days: number;
  perCycle: number;
  dailyAccrual: number;
  totalIncome: number;
  lockedBonus: number;
  capitalReturn: number;
  total: number;
};

export function projectPlacement(cfg: CompPlanConfig, amount: number, months: number): PlacementProjection {
  const term = cfg.terms.find((t) => t.months === months) ?? cfg.terms[0];
  const units = unitsFor(cfg, amount);
  const cycles = cyclesForTerm(cfg, term.months);
  const perCycle = (amount * cfg.cycleRate) / 100;
  const totalIncome = perCycle * cycles;
  const lockedBonus = units * term.lockedBonusPerUnit;
  return {
    units,
    cycles,
    days: cycles * cfg.cycleDays,
    perCycle,
    dailyAccrual: perCycle / cfg.cycleDays,
    totalIncome,
    lockedBonus,
    capitalReturn: amount,
    total: totalIncome + lockedBonus + amount,
  };
}

export function peso(n: number): string {
  return `₱${Math.round(n).toLocaleString("en-US")}`;
}
