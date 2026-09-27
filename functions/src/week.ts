// Weekly ranking periods. A week runs Monday 00:00 → Sunday 23:59 Manila time
// (UTC+8) and is named by its ISO week, e.g. "2026-W39". Mirrored in
// src/lib/week.ts — keep both in sync.

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export function manilaWeekKey(ts: number = Date.now()): string {
  const d = new Date(ts + 8 * HOUR_MS);
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7; // Monday = 0
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3); // Thursday of this week
  const firstThu = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((tmp.getTime() - firstThu.getTime()) / DAY_MS - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Epoch ms of the next Monday 00:00 Manila — when the weekly rankings roll over. */
export function nextWeekStart(ts: number = Date.now()): number {
  const d = new Date(ts + 8 * HOUR_MS);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dayNum = (new Date(midnight).getUTCDay() + 6) % 7;
  return midnight + (7 - dayNum) * DAY_MS - 8 * HOUR_MS;
}
