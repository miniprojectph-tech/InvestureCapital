"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";
import { useAuth } from "./auth";
import type { InvestureEvent, EventClaim, EventStatus } from "./events-config";

export * from "./events-config";

function call<A, R>(name: string, data: A): Promise<R> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Firebase not initialized");
  return httpsCallable<A, R>(functions, name)(data).then((r) => r.data);
}

// ===== Callables =====

export const adminSaveEvent = (event: Partial<InvestureEvent>, id?: string) =>
  call<{ id?: string; event: Partial<InvestureEvent> }, { ok: boolean; id: string }>("adminSaveEvent", { ...(id ? { id } : {}), event });

export const adminSetEventStatus = (id: string, status: Extract<EventStatus, "live" | "ended">) =>
  call<{ id: string; status: EventStatus }, { ok: boolean; status: EventStatus; notified?: number; released?: number }>("adminSetEventStatus", { id, status });

export const adminAddEventSlots = (id: string, slots: number) =>
  call<{ id: string; slots: number }, { ok: boolean }>("adminAddEventSlots", { id, slots });

export type ClaimEventArgs = {
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
export type ClaimEventResult =
  | { ok: true; status: "active"; placementId: string; slots: number; amount: number }
  | { ok: true; status: "reserved"; requestId: string; slots: number; amount: number; expiresAt: number };

export const claimEventSlots = (args: ClaimEventArgs) => call<ClaimEventArgs, ClaimEventResult>("claimEventSlots", args);

// ===== Hooks =====

/** Events currently marked live (members can only read these). Window/terms are checked by the caller. */
export function useLiveEvents(): { events: InvestureEvent[]; loading: boolean } {
  const { user, demoMode } = useAuth();
  const [events, setEvents] = useState<InvestureEvent[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user || demoMode) {
      setEvents([]);
      setLoading(false);
      return;
    }
    const { db } = getFirebase();
    if (!db) {
      setLoading(false);
      return;
    }
    return onSnapshot(
      query(collection(db, "events"), where("status", "==", "live")),
      (snap) => {
        setEvents(snap.docs.map((d) => ({ ...(d.data() as InvestureEvent), id: d.id })).sort((a, b) => b.startsAt - a.startsAt));
        setLoading(false);
      },
      () => {
        setEvents([]);
        setLoading(false);
      },
    );
  }, [user, demoMode]);
  return { events, loading };
}

/** Admin: every event, newest first. */
export function useAllEvents(enabled: boolean): { events: InvestureEvent[]; loading: boolean } {
  const { user } = useAuth();
  const [events, setEvents] = useState<InvestureEvent[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user || !enabled) return;
    const { db } = getFirebase();
    if (!db) return;
    return onSnapshot(
      query(collection(db, "events"), orderBy("createdAt", "desc")),
      (snap) => {
        setEvents(snap.docs.map((d) => ({ ...(d.data() as InvestureEvent), id: d.id })));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user, enabled]);
  return { events, loading };
}

/** Claims on one event: the member's own, or all of them for an admin. */
export function useEventClaims(eventId: string | null, scope: "me" | "all"): EventClaim[] {
  const { user } = useAuth();
  const [claims, setClaims] = useState<EventClaim[]>([]);
  useEffect(() => {
    if (!user || !eventId) {
      setClaims([]);
      return;
    }
    const { db } = getFirebase();
    if (!db) return;
    const col = collection(db, "events", eventId, "claims");
    const q = scope === "me" ? query(col, where("userId", "==", user.uid)) : query(col, orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snap) => setClaims(snap.docs.map((d) => ({ ...(d.data() as EventClaim), id: d.id })).sort((a, b) => b.createdAt - a.createdAt)),
      () => setClaims([]),
    );
  }, [user, eventId, scope]);
  return claims;
}

/** Slots this member holds on an event (reserved + active) — the per-member cap counts both. */
export function useMyEventSlots(eventId: string | null): { held: number; active: number; reserved: number } {
  const claims = useEventClaims(eventId, "me");
  return useMemo(() => {
    const active = claims.filter((c) => c.status === "active").reduce((s, c) => s + c.slots, 0);
    const reserved = claims.filter((c) => c.status === "reserved").reduce((s, c) => s + c.slots, 0);
    return { held: active + reserved, active, reserved };
  }, [claims]);
}

// ===== Pop-up dismissal (per device, per event) =====

const KEY = "investure.eventPopup";
type Seen = Record<string, { day?: string; dismissedForever?: boolean }>;

function readSeen(): Seen {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Seen;
  } catch {
    return {};
  }
}
function manilaDay(ts = Date.now()) {
  return new Date(ts + 8 * 3_600_000).toISOString().slice(0, 10);
}

/** Should the pop-up show for this event now, given its frequency and what this device has seen? */
export function shouldShowPopup(e: InvestureEvent, sessionShown: Set<string>): boolean {
  if (e.popupFrequency === "always") return !sessionShown.has(e.id);
  const seen = readSeen()[e.id];
  if (e.popupFrequency === "once") return !seen?.dismissedForever && !sessionShown.has(e.id);
  return seen?.day !== manilaDay() && !sessionShown.has(e.id);
}

export function markPopupSeen(e: InvestureEvent, forever = false) {
  try {
    const all = readSeen();
    all[e.id] = { day: manilaDay(), dismissedForever: forever || all[e.id]?.dismissedForever };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode */
  }
}

// ===== Formatting =====

export function formatEventDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Manila" });
}

export function countdown(to: number, now = Date.now()): string {
  const left = Math.max(0, to - now);
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
