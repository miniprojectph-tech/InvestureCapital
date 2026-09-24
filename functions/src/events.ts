import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { db } from "./init";
import { loadCompPlan, activateInTx, displayName, type UserDoc } from "./compplan";
import { peso } from "./compplan-config";
import {
  eventIsLive,
  eventAllowsTerm,
  slotsFree,
  validateEvent,
  type InvestureEvent,
  type EventClaim,
  type EventStatus,
} from "./events-config";

// ============================================================================
// Limited events.
//
//  * Slot events: N slots of ₱X, max M per member. Every slot purchase is an
//    ordinary placement (activateInTx) stamped with the event's payout
//    multiplier. Slot counts are moved inside ONE transaction, so two members
//    can't both get the last slot. A payment-request purchase RESERVES its
//    slots for `holdHours`; approval turns them into taken slots, rejection or
//    expiry hands them back.
//  * Referral events: activateInTx reads the live referral events itself and
//    multiplies the level rates (see compplan.ts).
// ============================================================================

const eventRef = (id: string) => db.collection("events").doc(id);
const claimsCol = (eventId: string) => eventRef(eventId).collection("claims");
const userRef = (uid: string) => db.collection("users").doc(uid);

async function assertAdmin(uid: string) {
  const snap = await userRef(uid).get();
  if (!snap.exists || snap.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
}

function cleanEvent(input: Partial<InvestureEvent>): Omit<InvestureEvent, "id" | "createdAt" | "updatedAt" | "status"> {
  const kind = input.kind === "referral" ? "referral" : "slot";
  const terms = Array.isArray(input.terms) ? input.terms.filter((t) => Number.isInteger(t) && t > 0) : [];
  const base = {
    kind,
    name: String(input.name ?? "").trim().slice(0, 60),
    tagline: String(input.tagline ?? "").trim().slice(0, 160),
    mechanics: (Array.isArray(input.mechanics) ? input.mechanics : []).map((m) => String(m).trim().slice(0, 200)).filter(Boolean).slice(0, 6),
    bannerUrl: input.bannerUrl ? String(input.bannerUrl) : "",
    bannerPath: input.bannerPath ? String(input.bannerPath) : "",
    startsAt: Number(input.startsAt),
    endsAt: input.endsAt == null ? null : Number(input.endsAt),
    terms,
    popupFrequency: input.popupFrequency === "always" || input.popupFrequency === "once" ? input.popupFrequency : "daily",
  } as const;
  if (kind === "slot") {
    const s = input.slot ?? ({} as Partial<InvestureEvent["slot"]>);
    return {
      ...base,
      slot: {
        price: Number(s?.price),
        totalSlots: Number(s?.totalSlots),
        maxPerMember: Number(s?.maxPerMember),
        payoutMultiplier: Number(s?.payoutMultiplier),
        holdHours: Number(s?.holdHours ?? 24),
        taken: Number(s?.taken ?? 0),
        reserved: Number(s?.reserved ?? 0),
      },
    };
  }
  const lm = (input.referral?.levelMultipliers ?? []).map((m) => Number(m)).slice(0, 6);
  while (lm.length < 6) lm.push(1);
  return { ...base, referral: { levelMultipliers: lm } };
}

/** Admin: create or update an event. Live counters (taken/reserved) are never overwritten. */
export const adminSaveEvent = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  await assertAdmin(request.auth.uid);
  const { id, event } = (request.data ?? {}) as { id?: string; event?: Partial<InvestureEvent> };
  if (!event) throw new HttpsError("invalid-argument", "event is required.");
  const clean = cleanEvent(event);
  const err = validateEvent({ ...clean, id: id ?? "new", status: "draft", createdAt: 0, updatedAt: 0 });
  if (err) throw new HttpsError("invalid-argument", err);
  const now = Date.now();

  if (!id) {
    const ref = eventRef(db.collection("events").doc().id);
    const doc: InvestureEvent = { ...clean, id: ref.id, status: "draft", createdAt: now, updatedAt: now, createdBy: request.auth.uid };
    await ref.set(doc);
    return { ok: true, id: ref.id };
  }

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef(id));
    if (!snap.exists) throw new HttpsError("not-found", "Event not found.");
    const cur = snap.data() as InvestureEvent;
    if (cur.status === "ended") throw new HttpsError("failed-precondition", "An ended event can't be edited.");
    const next: Partial<InvestureEvent> = { ...clean, updatedAt: now };
    if (cur.kind !== clean.kind && cur.status === "live") throw new HttpsError("failed-precondition", "Can't change the type of a live event.");
    if (clean.slot && cur.slot) {
      // Keep the live counters; never let a save shrink capacity below what's already out.
      next.slot = { ...clean.slot, taken: cur.slot.taken, reserved: cur.slot.reserved };
      if (next.slot.totalSlots < cur.slot.taken + cur.slot.reserved) {
        throw new HttpsError("failed-precondition", `Total slots can't go below the ${cur.slot.taken + cur.slot.reserved} already taken or reserved.`);
      }
    }
    tx.update(eventRef(id), next);
  });
  return { ok: true, id };
});

/** Admin: publish (draft → live) or close (→ ended). Closing releases every reservation. */
export const adminSetEventStatus = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  await assertAdmin(request.auth.uid);
  const { id, status } = (request.data ?? {}) as { id?: string; status?: EventStatus };
  if (!id || (status !== "live" && status !== "ended")) throw new HttpsError("invalid-argument", "id and status (live|ended) are required.");
  const now = Date.now();
  const snap = await eventRef(id).get();
  if (!snap.exists) throw new HttpsError("not-found", "Event not found.");
  const ev = snap.data() as InvestureEvent;

  if (status === "live") {
    if (ev.status !== "draft") throw new HttpsError("failed-precondition", `Event is already ${ev.status}.`);
    const err = validateEvent(ev);
    if (err) throw new HttpsError("failed-precondition", err);
    await eventRef(id).update({ status: "live", publishedAt: now, updatedAt: now });
    const notified = await notifyEveryone(ev, now);
    return { ok: true, status: "live", notified };
  }

  if (ev.status === "ended") return { ok: true, status: "ended", released: 0 };
  const released = await releaseReservations(id, "released", now, "The event has ended.");
  await eventRef(id).update({ status: "ended", endedAt: now, updatedAt: now });
  return { ok: true, status: "ended", released };
});

/** Admin: add capacity to a live slot event. */
export const adminAddEventSlots = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  await assertAdmin(request.auth.uid);
  const { id, slots } = (request.data ?? {}) as { id?: string; slots?: number };
  if (!id || !Number.isInteger(slots) || !slots || slots < 1 || slots > 10_000) throw new HttpsError("invalid-argument", "id and slots (1–10000) are required.");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef(id));
    if (!snap.exists) throw new HttpsError("not-found", "Event not found.");
    const ev = snap.data() as InvestureEvent;
    if (ev.kind !== "slot" || !ev.slot) throw new HttpsError("failed-precondition", "Not a slot event.");
    if (ev.status === "ended") throw new HttpsError("failed-precondition", "The event has ended.");
    tx.update(eventRef(id), { "slot.totalSlots": ev.slot.totalSlots + slots, updatedAt: Date.now() });
  });
  return { ok: true };
});

async function notifyEveryone(ev: InvestureEvent, now: number): Promise<number> {
  const users = await db.collection("users").select().get();
  const title = ev.kind === "slot"
    ? `${ev.name} — ${ev.slot?.totalSlots ?? 0} slots at ${peso(ev.slot?.price ?? 0)}, ×${ev.slot?.payoutMultiplier ?? 1} payouts`
    : `${ev.name} — referral commissions boosted until ${ev.endsAt ? new Date(ev.endsAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" }) : "further notice"}`;
  let batch = db.batch();
  let n = 0;
  for (const u of users.docs) {
    batch.set(u.ref.collection("notifications").doc(), { type: "event", title, body: ev.tagline || "Open the app to see the mechanics.", eventId: ev.id, at: now, read: false });
    n++;
    if (n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (n % 400 !== 0) await batch.commit();
  return n;
}

/**
 * Give reserved slots back to the pool. `status` = "expired" (hold ran out) or
 * "released" (rejected / event closed). The pending payment request is kept —
 * if the admin still approves it, activateInTx re-takes slots when any are free
 * or activates it as a normal placement.
 */
async function releaseReservations(eventId: string, status: "expired" | "released", now: number, why: string, onlyClaimId?: string): Promise<number> {
  const q = onlyClaimId
    ? [await claimsCol(eventId).doc(onlyClaimId).get()].filter((d) => d.exists)
    : (await claimsCol(eventId).where("status", "==", "reserved").get()).docs;
  let released = 0;
  for (const d of q) {
    const claim = d.data() as EventClaim;
    if (claim.status !== "reserved") continue;
    if (status === "expired" && claim.expiresAt != null && claim.expiresAt > now) continue;
    await db.runTransaction(async (tx) => {
      const c = (await tx.get(d.ref)).data() as EventClaim | undefined;
      if (!c || c.status !== "reserved") return;
      tx.update(d.ref, { status, resolvedAt: now });
      tx.update(eventRef(eventId), { "slot.reserved": FieldValue.increment(-c.slots) });
      if (c.requestId) tx.update(db.collection("plan_requests").doc(c.requestId), { "event.reservationStatus": status });
      tx.set(userRef(c.userId).collection("notifications").doc(), {
        type: "event",
        title: `Your ${c.slots} event slot${c.slots === 1 ? "" : "s"} ${status === "expired" ? "expired" : "were released"}`,
        body: `${why} Your payment request is still pending — if it's approved, you'll get slots only if some are still free.`,
        eventId,
        at: now,
        read: false,
      });
    });
    released++;
  }
  return released;
}

/** Hourly (from runMaintenance): expire reservations whose hold ran out. */
export async function expireEventReservations(now = Date.now()): Promise<number> {
  const live = await db.collection("events").where("kind", "==", "slot").where("status", "==", "live").get();
  let total = 0;
  for (const d of live.docs) total += await releaseReservations(d.id, "expired", now, "The payment wasn't verified within the hold time.");
  return total;
}

/** A rejected payment request hands its reserved slots back right away. */
export const onPlanRequestWritten = onDocumentWritten("plan_requests/{id}", async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null;
  const after = event.data?.after.exists ? event.data.after.data() : null;
  if (!before || !after) return;
  if (before.status === "pending" && after.status === "rejected" && after.event?.claimId && after.event?.id) {
    const n = await releaseReservations(after.event.id, "released", Date.now(), "The payment request was rejected.", after.event.claimId);
    if (n) logger.info("event slots released on rejection", { request: event.params.id, event: after.event.id });
  }
});

// ============================================================================
// Member: take slots
// ============================================================================

type ClaimArgs = {
  eventId: string;
  slots: number;
  termMonths: number;
  method: "wallet" | "request";
  paymentMethod?: string;
  paymentMethodLabel?: string;
  referenceNumber?: string;
  receiptUrl?: string;
  receiptPath?: string;
};

export const claimEventSlots = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const uid = request.auth.uid;
  const a = (request.data ?? {}) as ClaimArgs;
  if (!a.eventId) throw new HttpsError("invalid-argument", "eventId is required.");
  if (!Number.isInteger(a.slots) || a.slots < 1) throw new HttpsError("invalid-argument", "Choose at least 1 slot.");
  if (!Number.isInteger(a.termMonths)) throw new HttpsError("invalid-argument", "Choose a term.");
  if (a.method !== "wallet" && a.method !== "request") throw new HttpsError("invalid-argument", "method must be wallet or request.");
  if (a.method === "request" && !a.paymentMethod) throw new HttpsError("invalid-argument", "Pick a payment method.");
  const cfg = await loadCompPlan();
  const now = Date.now();

  return db.runTransaction(async (tx: Transaction) => {
    const evSnap = await tx.get(eventRef(a.eventId));
    if (!evSnap.exists) throw new HttpsError("not-found", "Event not found.");
    const ev = evSnap.data() as InvestureEvent;
    if (ev.kind !== "slot" || !ev.slot) throw new HttpsError("failed-precondition", "Not a slot event.");
    if (!eventIsLive(ev, now)) throw new HttpsError("failed-precondition", "This event isn't running right now.");
    if (!eventAllowsTerm(ev, a.termMonths)) throw new HttpsError("failed-precondition", "That term isn't part of this event.");
    if (!cfg.terms.some((t) => t.months === a.termMonths)) throw new HttpsError("invalid-argument", "Choose a valid term.");

    // This member's slots so far (reserved + active) — the cap counts both.
    const mine = await tx.get(claimsCol(a.eventId).where("userId", "==", uid));
    const held = mine.docs.map((d) => d.data() as EventClaim).filter((c) => c.status === "reserved" || c.status === "active").reduce((s, c) => s + c.slots, 0);
    if (held + a.slots > ev.slot.maxPerMember) {
      throw new HttpsError("failed-precondition", held >= ev.slot.maxPerMember
        ? `You already hold the maximum of ${ev.slot.maxPerMember} slot${ev.slot.maxPerMember === 1 ? "" : "s"}.`
        : `You can take ${ev.slot.maxPerMember - held} more slot${ev.slot.maxPerMember - held === 1 ? "" : "s"} at most.`);
    }
    const free = slotsFree(ev);
    if (a.slots > free) throw new HttpsError("failed-precondition", free === 0 ? "Sold out — no slots left." : `Only ${free} slot${free === 1 ? "" : "s"} left.`);

    const memberSnap = await tx.get(userRef(uid));
    if (!memberSnap.exists) throw new HttpsError("not-found", "Member not found.");
    const member = memberSnap.data() as UserDoc;
    const amount = a.slots * ev.slot.price;
    const claimRef = claimsCol(a.eventId).doc();
    const base = { id: claimRef.id, eventId: a.eventId, userId: uid, userName: displayName(member, uid), slots: a.slots, amount, termMonths: a.termMonths, createdAt: now };

    if (a.method === "wallet") {
      if ((member.balances?.wallet ?? 0) < amount) throw new HttpsError("failed-precondition", `Wallet balance is below ${peso(amount)}.`);
      // activateInTx does its own reads first (member, uplines) — all before any write.
      const result = await activateInTx(
        tx,
        cfg,
        { userId: uid, amount, termMonths: a.termMonths, fromWallet: true, event: { id: ev.id, name: ev.name, payoutMultiplier: ev.slot.payoutMultiplier, slots: a.slots, claimId: claimRef.id } },
        uid,
        now,
      );
      const claim: EventClaim = { ...base, status: "active", method: "wallet", placementId: result.placementId, resolvedAt: now };
      tx.set(claimRef, claim);
      tx.update(eventRef(a.eventId), { "slot.taken": FieldValue.increment(a.slots), updatedAt: now });
      return { ok: true, status: "active", placementId: result.placementId, slots: a.slots, amount };
    }

    // Payment request: reserve the slots and file the request for the admin to verify.
    const expiresAt = now + ev.slot.holdHours * 3_600_000;
    const reqRef = db.collection("plan_requests").doc();
    tx.set(reqRef, {
      userId: uid,
      userName: displayName(member, uid),
      userEmail: member.profile?.email ?? "",
      amount,
      termMonths: a.termMonths,
      planName: `${a.termMonths}-month placement · ${ev.name} (${a.slots} slot${a.slots === 1 ? "" : "s"})`,
      method: a.paymentMethod,
      methodLabel: a.paymentMethodLabel ?? a.paymentMethod,
      ...(a.referenceNumber ? { referenceNumber: String(a.referenceNumber).slice(0, 80) } : {}),
      ...(a.receiptUrl ? { receiptUrl: a.receiptUrl } : {}),
      ...(a.receiptPath ? { receiptPath: a.receiptPath } : {}),
      status: "pending",
      createdAt: now,
      event: { id: ev.id, name: ev.name, slots: a.slots, claimId: claimRef.id, payoutMultiplier: ev.slot.payoutMultiplier, expiresAt, reservationStatus: "reserved" },
    });
    const claim: EventClaim = { ...base, status: "reserved", method: "request", requestId: reqRef.id, expiresAt };
    tx.set(claimRef, claim);
    tx.update(eventRef(a.eventId), { "slot.reserved": FieldValue.increment(a.slots), updatedAt: now });
    tx.set(userRef(uid).collection("notifications").doc(), {
      type: "event",
      title: `${a.slots} slot${a.slots === 1 ? "" : "s"} reserved — ${ev.name}`,
      body: `Held until ${new Date(expiresAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" })} while the admin verifies your ${peso(amount)} payment.`,
      eventId: ev.id,
      at: now,
      read: false,
    });
    return { ok: true, status: "reserved", requestId: reqRef.id, slots: a.slots, amount, expiresAt };
  });
});
