/**
 * Christmas season in the Community Room: Santa's daily flyby with the
 * countdown to Dec 25 (Manila time). Settings live on `settings/platform`
 * (`christmas`), which every member already downloads, so this costs no reads.
 */

export type ChristmasMode = "off" | "admins" | "everyone";

export type ChristmasConfig = {
  /** off · admins (test: admins see it now, dates ignored) · everyone (between the dates). */
  mode: ChristmasMode;
  /** First day Santa flies, "YYYY-MM-DD" in Manila time. */
  startDate: string;
  /** Last day Santa flies, "YYYY-MM-DD" in Manila time. */
  endDate: string;
};

export const DEFAULT_CHRISTMAS: ChristmasConfig = { mode: "off", startDate: "2026-12-01", endDate: "2026-12-25" };

const OFFSET = 8 * 3_600_000; // Manila is UTC+8, no daylight saving
const DAY = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" of a moment in Manila. */
export const manilaDate = (ms: number) => new Date(ms + OFFSET).toISOString().slice(0, 10);

/** Midnight (start of the day) in Manila of a "YYYY-MM-DD", as a timestamp. */
const manilaMidnight = (date: string) => Date.parse(`${date}T00:00:00Z`) - OFFSET;

export function cleanChristmas(v: Partial<ChristmasConfig> | null | undefined): ChristmasConfig {
  const mode: ChristmasMode = v?.mode === "admins" || v?.mode === "everyone" ? v.mode : "off";
  const startDate = v?.startDate && DATE_RE.test(v.startDate) ? v.startDate : DEFAULT_CHRISTMAS.startDate;
  const endDate = v?.endDate && DATE_RE.test(v.endDate) && v.endDate >= startDate ? v.endDate : DEFAULT_CHRISTMAS.endDate >= startDate ? DEFAULT_CHRISTMAS.endDate : startDate;
  return { mode, startDate, endDate };
}

/** Whether this person sees Santa today. */
export function christmasActive(cfg: ChristmasConfig, isAdmin: boolean, now = Date.now()): boolean {
  if (cfg.mode === "off") return false;
  if (cfg.mode === "admins") return isAdmin; // test mode: dates don't apply
  const today = manilaDate(now);
  return today >= cfg.startDate && today <= cfg.endDate;
}

export type Countdown =
  | { phase: "days"; days: number }
  | { phase: "eve"; hours: number; minutes: number }
  | { phase: "day" }
  | { phase: "after" };

/** Where we are against Christmas Day (Dec 25 of the season's year, Manila). */
export function christmasCountdown(cfg: ChristmasConfig, now = Date.now()): Countdown {
  const year = cfg.startDate.slice(0, 4);
  const xmas = `${year}-12-25`;
  const today = manilaDate(now);
  if (today === xmas) return { phase: "day" };
  if (today > xmas) return { phase: "after" };
  const target = manilaMidnight(xmas);
  if (today === `${year}-12-24`) {
    const left = Math.max(0, target - now);
    return { phase: "eve", hours: Math.floor(left / 3_600_000), minutes: Math.floor((left % 3_600_000) / 60_000) };
  }
  return { phase: "days", days: Math.round((target - manilaMidnight(today)) / DAY) };
}

/** Short label for the header chip: "21d", "7h", "Today". */
export function countdownChip(c: Countdown): string {
  if (c.phase === "days") return `${c.days}d`;
  if (c.phase === "eve") return c.hours >= 1 ? `${c.hours}h` : `${Math.max(1, c.minutes)}m`;
  return c.phase === "day" ? "Today" : "🎄";
}

const LS_KEY = "investure:xmas:flyby";
/** Santa flies by itself once a Manila day per device. */
export function flybyDueToday(now = Date.now()): boolean {
  try { return window.localStorage.getItem(LS_KEY) !== manilaDate(now); } catch { return false; }
}
export function markFlybyShown(now = Date.now()): void {
  try { window.localStorage.setItem(LS_KEY, manilaDate(now)); } catch { /* private mode */ }
}
