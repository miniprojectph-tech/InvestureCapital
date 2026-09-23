// Withdrawal release schedule — shared by the member app, the admin app and
// Cloud Functions (functions/src/withdrawalSchedule.ts is an identical copy;
// keep them in sync). All calendar maths is Manila time (UTC+8).

export type WithdrawalScheduleConfig = {
  enabled: boolean;
  /** Weekdays on which payouts are released: 0 = Sunday … 6 = Saturday. */
  releaseDays: number[];
  /**
   * "HH:MM" (Manila). When set, a request made ON a release day before this
   * time is released that same day; otherwise every request waits for the next
   * release day after the day it was made.
   */
  sameDayCutoff: string | null;
  /** Extra line shown to members under the schedule (e.g. "Bank holidays move to the next release day"). */
  note: string;
};

/** Mon–Thu → Friday, Fri–Sun → Monday. */
export const DEFAULT_WITHDRAWAL_SCHEDULE: WithdrawalScheduleConfig = {
  enabled: true,
  releaseDays: [1, 5],
  sameDayCutoff: null,
  note: "",
};

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export function mergeWithdrawalSchedule(partial?: Partial<WithdrawalScheduleConfig> | null): WithdrawalScheduleConfig {
  const cfg = { ...DEFAULT_WITHDRAWAL_SCHEDULE, ...(partial ?? {}) };
  cfg.releaseDays = [...new Set((cfg.releaseDays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  if (cfg.sameDayCutoff && !/^\d{2}:\d{2}$/.test(cfg.sameDayCutoff)) cfg.sameDayCutoff = null;
  return cfg;
}

/** Manila calendar fields for a timestamp. */
function manila(ts: number) {
  const d = new Date(ts + 8 * HOUR_MS);
  return {
    dow: d.getUTCDay(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    /** Midnight (Manila) of that calendar day, as a real timestamp. */
    dayStart: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 8 * HOUR_MS,
  };
}

function cutoffMinutes(cfg: WithdrawalScheduleConfig): number | null {
  if (!cfg.sameDayCutoff) return null;
  const [h, m] = cfg.sameDayCutoff.split(":").map(Number);
  return h * 60 + m;
}

/**
 * When a withdrawal requested at `requestedAt` is due for release: the Manila
 * midnight of the next release day (same day only if a cutoff is set and the
 * request came in before it). Null when the schedule is off or has no days.
 */
export function releaseDateFor(requestedAt: number, cfg: WithdrawalScheduleConfig): number | null {
  if (!cfg.enabled || cfg.releaseDays.length === 0) return null;
  const { dow, minutes, dayStart } = manila(requestedAt);
  const cutoff = cutoffMinutes(cfg);
  if (cutoff !== null && cfg.releaseDays.includes(dow) && minutes < cutoff) return dayStart;
  for (let i = 1; i <= 7; i++) {
    if (cfg.releaseDays.includes((dow + i) % 7)) return dayStart + i * DAY_MS;
  }
  return null;
}

/** The release weekday for a request made on weekday `dow` (ignoring the cutoff). */
export function releaseDowFor(dow: number, cfg: WithdrawalScheduleConfig): number | null {
  if (cfg.releaseDays.length === 0) return null;
  for (let i = 1; i <= 7; i++) if (cfg.releaseDays.includes((dow + i) % 7)) return (dow + i) % 7;
  return null;
}

/**
 * Human summary, e.g. "Requests Mon–Thu are released on Friday; Fri–Sun on Monday."
 * Groups consecutive weekdays (starting Monday) that share a release day.
 */
export function describeSchedule(cfg: WithdrawalScheduleConfig): string {
  if (!cfg.enabled || cfg.releaseDays.length === 0) return "Withdrawals are released as soon as they are approved.";
  const order = [1, 2, 3, 4, 5, 6, 0];
  const groups: { from: number; to: number; release: number }[] = [];
  for (const dow of order) {
    const release = releaseDowFor(dow, cfg)!;
    const last = groups[groups.length - 1];
    if (last && last.release === release) last.to = dow;
    else groups.push({ from: dow, to: dow, release });
  }
  const parts = groups.map((g, i) => {
    const span = g.from === g.to ? DAY_SHORT[g.from] : `${DAY_SHORT[g.from]}–${DAY_SHORT[g.to]}`;
    return i === 0 ? `Requests ${span} are released on ${DAY_NAMES[g.release]}` : `${span} on ${DAY_NAMES[g.release]}`;
  });
  let text = parts.join("; ") + ".";
  if (cfg.sameDayCutoff) text += ` Requests made before ${cfg.sameDayCutoff} on a release day go out the same day.`;
  return text;
}

export function formatReleaseDate(ts: number, opts: { withYear?: boolean } = {}): string {
  return new Date(ts).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(opts.withYear ? { year: "numeric" } : {}),
    timeZone: "Asia/Manila",
  });
}

/** "today" / "tomorrow" / "in 3 days" / "2 days overdue", relative to now (Manila days). */
export function relativeReleaseLabel(releaseAt: number, now = Date.now()): string {
  const days = Math.round((manila(releaseAt).dayStart - manila(now).dayStart) / DAY_MS);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1) return `in ${days} days`;
  return days === -1 ? "1 day overdue" : `${-days} days overdue`;
}
