"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { getFirebase } from "./firebase";
import { useAuth } from "./auth";
import type { FaqMedia } from "./faq";

/**
 * Promotional pop-ups ("ads") shown to members after they sign in — a video,
 * a picture, a message and one button. Everything lives in ONE Firestore
 * document (`content/promos`) so a member's visit costs a single read, the
 * same way the FAQ works. Which pop-ups a member has already seen is kept on
 * their own device, so showing them costs nothing more.
 */

export type PromoStatus = "live" | "draft";
/** once = until they close it; daily = once a day; always = every time they open the app. */
export type PromoFrequency = "once" | "daily" | "always";
/** all members · members with no placement yet · members with an active placement. */
export type PromoAudience = "all" | "noPlacement" | "active";

export type Promo = {
  id: string;
  /** Admin-only label for the list (members never see it). */
  name: string;
  title: string;
  /** Same light markup as FAQ answers: blank line = paragraph, "- " = bullet, **bold**. */
  body: string;
  media: FaqMedia | null;
  buttonLabel: string;
  /** "/plans", "/faq", … or a full https:// address. Empty = no button. */
  buttonHref: string;
  status: PromoStatus;
  /** Optional window (ms). null = no limit on that side. */
  startAt: number | null;
  endAt: number | null;
  frequency: PromoFrequency;
  audience: PromoAudience;
  createdAt: number;
  updatedAt: number;
};

export type PromoDoc = { items: Promo[]; updatedAt?: number; updatedBy?: string };

export const PROMO_MAX_TITLE = 80;
export const PROMO_MAX_BODY = 1200;
export const PROMO_MAX_BUTTON = 30;

export function newPromo(): Promo {
  const now = Date.now();
  return {
    id: `promo-${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    title: "",
    body: "",
    media: null,
    buttonLabel: "",
    buttonHref: "",
    status: "draft",
    startAt: null,
    endAt: null,
    frequency: "once",
    audience: "all",
    createdAt: now,
    updatedAt: now,
  };
}

/** Something to show: a title, a message or media. */
export function promoHasContent(p: Promo): boolean {
  return !!(p.title.trim() || p.body.trim() || p.media);
}

export function promoInWindow(p: Promo, now = Date.now()): boolean {
  if (p.startAt && now < p.startAt) return false;
  if (p.endAt && now > p.endAt) return false;
  return true;
}

/** What the list shows: Draft / Scheduled / Live / Ended. */
export function promoState(p: Promo, now = Date.now()): "draft" | "scheduled" | "live" | "ended" {
  if (p.status !== "live") return "draft";
  if (p.startAt && now < p.startAt) return "scheduled";
  if (p.endAt && now > p.endAt) return "ended";
  return "live";
}

export function promoMatchesAudience(p: Promo, hasActivePlacement: boolean): boolean {
  if (p.audience === "active") return hasActivePlacement;
  if (p.audience === "noPlacement") return !hasActivePlacement;
  return true;
}

// ===== "seen" memory (per device) =====

const KEY = "investure.promoSeen";
type Seen = Record<string, { day?: string; closed?: boolean; v?: number; never?: boolean }>;

function manilaDay(ts = Date.now()): string {
  return new Date(ts + 8 * 3_600_000).toISOString().slice(0, 10);
}
function readSeen(): Seen {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Seen;
  } catch {
    return {};
  }
}

/**
 * Should this device show the pop-up now? Editing a pop-up (new `updatedAt`)
 * makes a "once" pop-up eligible again, so a corrected ad is not silently
 * skipped by everyone who closed the earlier version.
 */
export function shouldShowPromo(p: Promo, sessionShown: Set<string>): boolean {
  if (sessionShown.has(p.id)) return false;
  const seen = readSeen()[p.id];
  // "Don't show again" beats every frequency — until the admin edits the pop-up.
  if (seen?.never && seen.v === p.updatedAt) return false;
  if (p.frequency === "always") return true;
  if (!seen) return true;
  if (p.frequency === "once") return !(seen.closed && seen.v === p.updatedAt);
  return seen.day !== manilaDay();
}

export function markPromoSeen(p: Promo, never = false) {
  try {
    const all = readSeen();
    all[p.id] = { day: manilaDay(), closed: true, v: p.updatedAt, never: never || (all[p.id]?.never && all[p.id]?.v === p.updatedAt) || undefined };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode — it will simply show again next visit */
  }
}

// ===== Data =====

export function usePromos(): { promos: Promo[]; loading: boolean } {
  const { user } = useAuth();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    const { db } = getFirebase();
    if (!db) { setLoading(false); return; }
    return onSnapshot(
      doc(db, "content", "promos"),
      (s) => {
        const d = (s.data() as Partial<PromoDoc> | undefined) ?? {};
        setPromos(Array.isArray(d.items) ? d.items : []);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user]);
  return { promos, loading };
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Admin: write the whole pop-up list. */
export async function savePromos(items: Promo[], uid: string): Promise<void> {
  const { db } = getFirebase();
  if (!db) throw new Error("Firebase not initialized");
  const clean = items.map((p) => ({
    ...p,
    name: p.name.trim().slice(0, 60),
    title: p.title.trim().slice(0, PROMO_MAX_TITLE),
    body: p.body.slice(0, PROMO_MAX_BODY),
    buttonLabel: p.buttonLabel.trim().slice(0, PROMO_MAX_BUTTON),
    buttonHref: p.buttonHref.trim().slice(0, 300),
    media: p.media ? stripUndefined({ ...p.media }) : null,
  }));
  await setDoc(doc(db, "content", "promos"), { items: clean, updatedAt: Date.now(), updatedBy: uid, serverUpdatedAt: serverTimestamp() });
}

/** Pages a pop-up button can open, for the admin's picker. */
export const PROMO_LINK_CHOICES: { label: string; href: string }[] = [
  { label: "My plans (place capital)", href: "/plans" },
  { label: "Help & FAQ", href: "/faq" },
  { label: "Referrals", href: "/referrals" },
  { label: "Wallet", href: "/wallet" },
  { label: "Games", href: "/games" },
  { label: "Community", href: "/community" },
  { label: "Withdrawals", href: "/withdrawals" },
];
