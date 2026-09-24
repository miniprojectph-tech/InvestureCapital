// Limited events — shared by the app and Cloud Functions
// (functions/src/events-config.ts is an identical copy; keep them in sync).
//
//  slot event      admin sells N slots of ₱X each, max M per member; every slot is
//                  an ordinary placement whose 5-day income is multiplied (×1.5).
//  referral event  for a time window, referral commissions are multiplied per level.

export type EventKind = "slot" | "referral" | "spin";
export type EventStatus = "draft" | "live" | "ended";
export type PopupFrequency = "daily" | "always" | "once";

export type SlotEventConfig = {
  price: number; // ₱ per slot
  totalSlots: number;
  maxPerMember: number;
  payoutMultiplier: number; // 1.5 = each slot's cycle income ×1.5
  holdHours: number; // how long a payment-request reservation is held
  taken: number; // slots on active placements
  reserved: number; // slots on pending payment requests
};

export type ReferralEventConfig = {
  /** One multiplier per referral level (index 0 = level 1). 1 = unchanged. */
  levelMultipliers: number[];
};

//  spin event  a prize wheel paid in Game Points. Free spins per Manila day plus
//              bonus spins earned by actions; a DAILY budget split into time
//              windows so early spinners can't drain the whole day.
export type SpinWedge = { label: string; points: number; chance: number; color: string };
export type SpinEventConfig = {
  wedges: SpinWedge[];
  freeSpinsPerDay: number;
  dailyBudget: number; // GP per Manila day
  windowsPerDay: 1 | 2 | 3 | 4;
  carryOver: boolean; // unspent window budget rolls into the next window
  maxBankedBonus: number;
  bonusFor: { placement: boolean; referral: boolean; withdrawal: boolean };
  // live counters (server-written)
  spent: number;
  spins: number;
  biggestWin: number;
};

/** Per-window ledger doc: events/{id}/windows/{key}. */
export type SpinWindow = { key: string; startsAt: number; endsAt: number; budget: number; carriedIn: number; spent: number; spins: number };
/** Per-member spin state: events/{id}/spinners/{uid}. */
export type Spinner = { userId: string; freeDay: string; freeUsed: number; bonus: number; totalSpins: number; totalWon: number; lastSpinAt?: number };
/** One spin: events/{id}/spins/{auto}. */
export type SpinRecord = { id: string; userId: string; userName: string; wedge: number; label: string; points: number; kind: "free" | "bonus"; window: string; at: number };

export const WEDGE_COLORS = ["#1E5A45", "#2A2350", "#3A2F1A", "#6B2140", "#1F3A5F", "#3B2F5E", "#2E4A2E", "#4A2E2E"];
export const DEFAULT_SPIN: SpinEventConfig = {
  wedges: [
    { label: "5 GP", points: 5, chance: 30, color: WEDGE_COLORS[0] },
    { label: "10 GP", points: 10, chance: 25, color: WEDGE_COLORS[1] },
    { label: "Try again", points: 0, chance: 9, color: WEDGE_COLORS[2] },
    { label: "20 GP", points: 20, chance: 15, color: WEDGE_COLORS[0] },
    { label: "50 GP", points: 50, chance: 8, color: WEDGE_COLORS[1] },
    { label: "Try again", points: 0, chance: 9, color: WEDGE_COLORS[2] },
    { label: "100 GP", points: 100, chance: 3, color: WEDGE_COLORS[4] },
    { label: "500 GP", points: 500, chance: 1, color: WEDGE_COLORS[3] },
  ],
  freeSpinsPerDay: 1,
  dailyBudget: 15000,
  windowsPerDay: 2,
  carryOver: true,
  maxBankedBonus: 5,
  bonusFor: { placement: true, referral: true, withdrawal: false },
  spent: 0,
  spins: 0,
  biggestWin: 0,
};

const HOUR_MS_ = 3_600_000;
export function manilaDayKey(ts: number): string {
  return new Date(ts + 8 * HOUR_MS_).toISOString().slice(0, 10);
}
/** Which prize window `ts` falls in: key "YYYY-MM-DD-w1", plus its real start/end. */
export function spinWindowAt(ts: number, windowsPerDay: number): { key: string; startsAt: number; endsAt: number; index: number } {
  const n = Math.max(1, Math.min(4, windowsPerDay));
  const d = new Date(ts + 8 * HOUR_MS_);
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 8 * HOUR_MS_;
  const len = 86_400_000 / n;
  const index = Math.min(n - 1, Math.floor((ts - dayStart) / len));
  return { key: `${manilaDayKey(ts)}-w${index + 1}`, startsAt: dayStart + index * len, endsAt: dayStart + (index + 1) * len, index };
}
export function spinChanceTotal(w: SpinWedge[]): number {
  return Math.round(w.reduce((s, x) => s + (Number(x.chance) || 0), 0) * 100) / 100;
}
export function spinAveragePayout(w: SpinWedge[]): number {
  const total = spinChanceTotal(w) || 100;
  return Math.round((w.reduce((s, x) => s + (Number(x.points) || 0) * (Number(x.chance) || 0), 0) / total) * 100) / 100;
}

export type InvestureEvent = {
  id: string;
  kind: EventKind;
  name: string;
  /** Short hook shown under the name. */
  tagline: string;
  /** Mechanics, one line per bullet. */
  mechanics: string[];
  bannerUrl?: string;
  bannerPath?: string;
  status: EventStatus;
  startsAt: number;
  endsAt: number | null;
  /** Eligible placement terms in months; empty = all terms. */
  terms: number[];
  popupFrequency: PopupFrequency;
  slot?: SlotEventConfig;
  referral?: ReferralEventConfig;
  spin?: SpinEventConfig;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  publishedAt?: number;
  endedAt?: number;
};

export type EventClaimStatus = "reserved" | "active" | "released" | "expired";

export type EventClaim = {
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  slots: number;
  amount: number;
  termMonths: number;
  status: EventClaimStatus;
  method: "wallet" | "request";
  requestId?: string;
  placementId?: string;
  createdAt: number;
  expiresAt?: number | null;
  resolvedAt?: number;
};

export const DEFAULT_SLOT: SlotEventConfig = { price: 1000, totalSlots: 100, maxPerMember: 3, payoutMultiplier: 1.5, holdHours: 24, taken: 0, reserved: 0 };
export const DEFAULT_REFERRAL: ReferralEventConfig = { levelMultipliers: [2, 1.5, 1, 1, 1, 1] };

export function eventIsLive(e: Pick<InvestureEvent, "status" | "startsAt" | "endsAt">, now = Date.now()): boolean {
  return e.status === "live" && e.startsAt <= now && (e.endsAt == null || e.endsAt > now);
}

export function eventAllowsTerm(e: Pick<InvestureEvent, "terms">, termMonths: number): boolean {
  return e.terms.length === 0 || e.terms.includes(termMonths);
}

export function slotsFree(e: InvestureEvent): number {
  if (!e.slot) return 0;
  return Math.max(0, e.slot.totalSlots - e.slot.taken - e.slot.reserved);
}

/** The best live referral multiplier per level across every live referral event that covers `termMonths`. */
export function referralMultipliers(events: InvestureEvent[], termMonths: number, levels: number, now = Date.now()): { mult: number[]; event: InvestureEvent | null } {
  const mult = Array.from({ length: levels }, () => 1);
  let best: InvestureEvent | null = null;
  for (const e of events) {
    if (e.kind !== "referral" || !e.referral || !eventIsLive(e, now) || !eventAllowsTerm(e, termMonths)) continue;
    e.referral.levelMultipliers.forEach((m, i) => {
      if (i < levels && m > mult[i]) {
        mult[i] = m;
        best = e;
      }
    });
  }
  return { mult, event: best };
}

/** Validation shared by the admin form and the server. Returns an error message or null. */
export function validateEvent(e: Partial<InvestureEvent>): string | null {
  if (!e.name || e.name.trim().length < 3) return "Give the event a name.";
  if (e.kind !== "slot" && e.kind !== "referral" && e.kind !== "spin") return "Choose an event type.";
  if (typeof e.startsAt !== "number") return "Set a start date.";
  if (e.endsAt != null && e.endsAt <= e.startsAt) return "The end date must be after the start.";
  if (e.kind === "slot") {
    const s = e.slot;
    if (!s) return "Slot settings are missing.";
    if (!(s.price >= 100)) return "Slot price must be at least ₱100.";
    if (!(Number.isInteger(s.totalSlots) && s.totalSlots >= 1)) return "Total slots must be a whole number of at least 1.";
    if (!(Number.isInteger(s.maxPerMember) && s.maxPerMember >= 1 && s.maxPerMember <= s.totalSlots)) return "Max per member must be between 1 and the total slots.";
    if (!(s.payoutMultiplier >= 1 && s.payoutMultiplier <= 5)) return "Payout multiplier must be between 1 and 5.";
    if (!(s.holdHours >= 1 && s.holdHours <= 168)) return "Reservation hold must be 1–168 hours.";
  } else if (e.kind === "spin") {
    const s = e.spin;
    if (!s) return "Wheel settings are missing.";
    if (!Array.isArray(s.wedges) || s.wedges.length < 2 || s.wedges.length > 12) return "The wheel needs 2 to 12 wedges.";
    for (const w of s.wedges) {
      if (!w.label || !w.label.trim()) return "Every wedge needs a label.";
      if (!(Number.isInteger(w.points) && w.points >= 0 && w.points <= 100_000)) return `"${w.label}": points must be a whole number (0 = try again).`;
      if (!(w.chance > 0 && w.chance <= 100)) return `"${w.label}": chance must be between 0 and 100%.`;
    }
    if (Math.abs(spinChanceTotal(s.wedges) - 100) > 0.05) return `Chances add up to ${spinChanceTotal(s.wedges)}% — they must total 100%.`;
    if (!(Number.isInteger(s.freeSpinsPerDay) && s.freeSpinsPerDay >= 0 && s.freeSpinsPerDay <= 10)) return "Free spins per day must be 0–10.";
    if (!(s.dailyBudget >= 1)) return "Set a daily prize budget (GP).";
    if (![1, 2, 3, 4].includes(s.windowsPerDay)) return "Windows per day must be 1, 2, 3 or 4.";
    if (!(Number.isInteger(s.maxBankedBonus) && s.maxBankedBonus >= 0 && s.maxBankedBonus <= 50)) return "Max banked bonus spins must be 0–50.";
    if (e.endsAt == null) return "A spin event needs an end date.";
  } else {
    const r = e.referral;
    if (!r || !Array.isArray(r.levelMultipliers) || r.levelMultipliers.length === 0) return "Set the level multipliers.";
    if (r.levelMultipliers.some((m) => !(m >= 1 && m <= 10))) return "Each level multiplier must be between 1 and 10.";
    if (e.endsAt == null) return "A referral event needs an end date.";
  }
  return null;
}

/**
 * Pick a wedge by weight, never one the window can't afford (`remaining` GP).
 * Big prizes drop out first as the budget runs low; 0-point wedges always fit.
 * Returns null only when nothing at all fits (no "try again" wedge and no budget).
 */
export function pickWedge(wedges: SpinWedge[], remaining: number, rnd = Math.random()): number | null {
  const ok = wedges.map((w, i) => ({ w, i })).filter(({ w }) => w.points <= remaining);
  const total = ok.reduce((s, x) => s + x.w.chance, 0);
  if (ok.length === 0 || total <= 0) return null;
  let r = rnd * total;
  for (const x of ok) {
    r -= x.w.chance;
    if (r <= 0) return x.i;
  }
  return ok[ok.length - 1].i;
}
