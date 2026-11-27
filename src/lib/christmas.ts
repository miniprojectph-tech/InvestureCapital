"use client";

/**
 * Christmas season in the Community Room: Santa's daily flyby with the
 * countdown to Dec 25 (Manila time), and the CHRISTMAS letter game (one letter
 * a day, 3 spares buy a missing letter, a full word redeems a random gift).
 * Settings live on `settings/platform` (`christmas`), which every member
 * already downloads. Letters and gifts are handed out by the Cloud Functions
 * in functions/src/christmas.ts.
 */
import { useEffect, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";

export type ChristmasMode = "off" | "admins" | "everyone";

export type ChristmasConfig = {
  /** off · admins (test: admins see it now, dates ignored) · everyone (between the dates). */
  mode: ChristmasMode;
  /** First day Santa flies, "YYYY-MM-DD" in Manila time. */
  startDate: string;
  /** Last day Santa flies (and letters are given), "YYYY-MM-DD" in Manila time. */
  endDate: string;
  /** The CHRISTMAS letter game is on. */
  letters: boolean;
  /** Last day to trade spares and redeem gifts. */
  redeemUntil: string;
  /** Manila days when Santa leaves 2 letters. */
  doubleDays: string[];
};

export const DEFAULT_CHRISTMAS: ChristmasConfig = { mode: "off", startDate: "2026-12-01", endDate: "2026-12-25", letters: false, redeemUntil: "2027-01-06", doubleDays: [] };

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
  const redeemUntil = v?.redeemUntil && DATE_RE.test(v.redeemUntil) && v.redeemUntil >= endDate ? v.redeemUntil : DEFAULT_CHRISTMAS.redeemUntil >= endDate ? DEFAULT_CHRISTMAS.redeemUntil : endDate;
  const doubleDays = Array.isArray(v?.doubleDays) ? Array.from(new Set(v.doubleDays.filter((d) => typeof d === "string" && DATE_RE.test(d)))).sort() : [];
  return { mode, startDate, endDate, letters: v?.letters === true, redeemUntil, doubleDays };
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

/* ───────────── CHRISTMAS letter game ───────────── */

export const XMAS_WORD = "CHRISTMAS";
export const XMAS_LETTERS = Array.from(new Set(XMAS_WORD.split("")));
export const XMAS_NEED: Record<string, number> = Object.fromEntries(XMAS_LETTERS.map((l) => [l, XMAS_WORD.split("").filter((c) => c === l).length]));
export const SPARE_COST = 3;

export type XmasPlayer = {
  uid: string; name: string;
  have: Record<string, number>; spares: number;
  lastDay: string | null; today: { day: string; letters: string[] } | null;
  lettersTotal: number; daysCollected: number; setsDone: number; updatedAt: number;
};
export type GiftKind = "points" | "wallet" | "load";
export type XmasGift = {
  id: string; uid: string; name: string; kind: GiftKind; amount: number; label: string; itemId: string; set: number; at: number;
  status: "credited" | "needs_number" | "to_send" | "sent";
  mobile?: string; numberAt?: number; sentAt?: number; sentByName?: string; sentRef?: string;
};
export type PoolItem = { id: string; kind: GiftKind; amount: number; chance: number; limit: number | null };
export type XmasStats = {
  players?: number; letters?: number; spares?: number; trades?: number; sets?: number;
  gifts?: Partial<Record<GiftKind, number>>; giftAmounts?: Partial<Record<GiftKind, number>>; days?: Record<string, number>;
};

export const GIFT_KIND_LABEL: Record<GiftKind, string> = { points: "Game Points", wallet: "Wallet credit", load: "Mobile load" };
export const giftLabel = (g: { kind: GiftKind; amount: number }) =>
  g.kind === "points" ? `${g.amount.toLocaleString("en-PH")} Game Points` : g.kind === "wallet" ? `₱${g.amount.toLocaleString("en-PH")} wallet credit` : `₱${g.amount.toLocaleString("en-PH")} load`;

/** Which of the 9 tiles are filled (the two S tiles fill in order). */
export function boardTiles(have: Record<string, number> | undefined): { letter: string; on: boolean }[] {
  const used: Record<string, number> = {};
  return XMAS_WORD.split("").map((l) => { used[l] = (used[l] ?? 0) + 1; return { letter: l, on: (have?.[l] ?? 0) >= used[l] }; });
}
export const lettersHeld = (have: Record<string, number> | undefined) => XMAS_LETTERS.reduce((s, l) => s + Math.min(XMAS_NEED[l], have?.[l] ?? 0), 0);
export const missingLetters = (have: Record<string, number> | undefined) => XMAS_LETTERS.filter((l) => (have?.[l] ?? 0) < XMAS_NEED[l]);
export const wordComplete = (have: Record<string, number> | undefined) => missingLetters(have).length === 0;

/** Letters are handed out (same dates as Santa). */
export function lettersOpen(cfg: ChristmasConfig, isAdmin: boolean, now = Date.now()): boolean {
  return cfg.letters && christmasActive(cfg, isAdmin, now);
}
/** Trading and redeeming stay open until redeemUntil (admins-only test mode ignores dates). */
export function redeemOpen(cfg: ChristmasConfig, isAdmin: boolean, now = Date.now()): boolean {
  if (!cfg.letters || cfg.mode === "off") return false;
  if (cfg.mode === "admins") return isAdmin;
  const today = manilaDate(now);
  return today >= cfg.startDate && today <= cfg.redeemUntil;
}

/** The signed-in member's board (null until they get their first letter). */
export function useXmasPlayer(uid: string | null | undefined, enabled = true) {
  const [player, setPlayer] = useState<XmasPlayer | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const { db } = getFirebase();
    if (!db || !uid || !enabled) return;
    return onSnapshot(doc(db, "christmas_players", uid), (s) => { setPlayer(s.exists() ? (s.data() as XmasPlayer) : null); setLoaded(true); }, () => setLoaded(true));
  }, [uid, enabled]);
  return { player, loaded };
}

/** The signed-in member's gifts, newest first. */
export function useMyXmasGifts(uid: string | null | undefined, enabled = true) {
  const [gifts, setGifts] = useState<XmasGift[]>([]);
  useEffect(() => {
    const { db } = getFirebase();
    if (!db || !uid || !enabled) return;
    return onSnapshot(query(collection(db, "christmas_gifts"), where("uid", "==", uid), limit(50)), (s) => {
      setGifts(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<XmasGift, "id">) })).sort((a, b) => b.at - a.at));
    }, () => {});
  }, [uid, enabled]);
  return gifts;
}

export type CollectResult = {
  ok: true; status: "new" | "already" | "closed" | "no-plan" | "suspended";
  drawn?: string[]; repeats?: number; double: boolean; player: XmasPlayer;
};
function call<A, R>(name: string) {
  return async (a: A): Promise<R> => {
    const { functions } = getFirebase();
    if (!functions) throw new Error("Not connected");
    return (await httpsCallable<A, R>(functions, name)(a)).data;
  };
}
export const xmasCollect = () => call<Record<string, never>, CollectResult>("xmasCollect")({});
export const xmasTrade = (letter: string) => call<{ letter: string }, { ok: true; player: XmasPlayer }>("xmasTrade")({ letter });
export const xmasRedeem = () => call<Record<string, never>, { ok: true; gift: XmasGift; labels: string[]; player: XmasPlayer }>("xmasRedeem")({});
export const xmasSetLoadNumber = (giftId: string, mobile: string) => call<{ giftId: string; mobile: string }, { ok: true; mobile: string }>("xmasSetLoadNumber")({ giftId, mobile });
export const adminXmasSavePool = (items: PoolItem[]) => call<{ items: PoolItem[] }, { ok: true; items: PoolItem[] }>("adminXmasSavePool")({ items });
export const adminXmasLoadSent = (giftId: string, ref?: string) => call<{ giftId: string; ref?: string }, { ok: true }>("adminXmasLoadSent")({ giftId, ref });

/** Admin: a christmas_admin document (pool, stock, stats). */
export function useXmasAdminDoc<T>(id: "pool" | "stock" | "stats") {
  const [data, setData] = useState<T | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const { db } = getFirebase();
    if (!db) return;
    return onSnapshot(doc(db, "christmas_admin", id), (s) => { setData(s.exists() ? (s.data() as T) : null); setLoaded(true); }, () => setLoaded(true));
  }, [id]);
  return { data, loaded };
}

/** Admin: the most recent gifts (all members). */
export function useAllXmasGifts(max = 500) {
  const [gifts, setGifts] = useState<XmasGift[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const { db } = getFirebase();
    if (!db) return;
    return onSnapshot(query(collection(db, "christmas_gifts"), orderBy("at", "desc"), limit(max)), (s) => {
      setGifts(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<XmasGift, "id">) })));
      setLoaded(true);
    }, () => setLoaded(true));
  }, [max]);
  return { gifts, loaded };
}
