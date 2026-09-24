// Limited events — shared by the app and Cloud Functions
// (functions/src/events-config.ts is an identical copy; keep them in sync).
//
//  slot event      admin sells N slots of ₱X each, max M per member; every slot is
//                  an ordinary placement whose 5-day income is multiplied (×1.5).
//  referral event  for a time window, referral commissions are multiplied per level.

export type EventKind = "slot" | "referral";
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
  if (e.kind !== "slot" && e.kind !== "referral") return "Choose an event type.";
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
  } else {
    const r = e.referral;
    if (!r || !Array.isArray(r.levelMultipliers) || r.levelMultipliers.length === 0) return "Set the level multipliers.";
    if (r.levelMultipliers.some((m) => !(m >= 1 && m <= 10))) return "Each level multiplier must be between 1 and 10.";
    if (e.endsAt == null) return "A referral event needs an end date.";
  }
  return null;
}
