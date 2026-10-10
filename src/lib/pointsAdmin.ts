"use client";

import { useEffect, useState } from "react";
import { collection, collectionGroup, doc, getDocs, limit, onSnapshot, orderBy, query, where, type Firestore } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";

/**
 * Admin › Players & points: where every player's Game Points came from.
 * Server side (functions/src/points-ledger.ts) writes three things on every
 * movement: a ledger line in `game_point_transactions`, lifetime per-player
 * totals in `game_stats/{uid}`, and platform totals per day in `games/pointsDaily`.
 */
export type GameStats = {
  uid: string;
  name?: string;
  updatedAt?: number;
  slot?: { spins?: number; won?: number; wagered?: number; jackpots?: number; jackpotPoints?: number; testSpins?: number };
  tongits?: { games?: number; wins?: number; losses?: number; won?: number; lost?: number };
  color?: { bets?: number; bet?: number; won?: number; wins?: number };
  reef?: { catches?: number; won?: number; quests?: number; weekly?: number };
  event?: { spins?: number; won?: number };
  reward?: { count?: number; spent?: number };
  admin?: { edits?: number; up?: number; down?: number };
};
export const n0 = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Net points a player got from each source, lifetime. */
export function statsNet(s: GameStats | undefined) {
  return {
    slot: n0(s?.slot?.won) - n0(s?.slot?.wagered),
    tongits: n0(s?.tongits?.won) - n0(s?.tongits?.lost),
    color: n0(s?.color?.won) - n0(s?.color?.bet),
    reef: n0(s?.reef?.won),
    event: n0(s?.event?.won),
    reward: -n0(s?.reward?.spent),
    admin: n0(s?.admin?.up) - n0(s?.admin?.down),
  };
}

export async function loadGameStats(db: Firestore): Promise<Map<string, GameStats>> {
  const snap = await getDocs(collection(db, "game_stats"));
  const m = new Map<string, GameStats>();
  snap.docs.forEach((d) => m.set(d.id, { ...(d.data() as GameStats), uid: d.id }));
  return m;
}

/** Every player's `game/state` and `game/slot` docs in one collection-group read. */
export type PlayerGameDocs = {
  state: Map<string, { points: number; rankingPoints: number; tongitsGames: number; tongitsWins: number; tongitsLosses: number; lockedPoints: number; totalCasts: number; weeklyScore: number }>;
  slot: Map<string, { spins: number; paid: number; wagered: number; biggestWin: number; wonToday: number; day?: string; spinsTotal: number; spinsUsed: number; lastAt?: number; potHistory: { pot: string; amount: number; at: number }[] }>;
};
export async function loadPlayerGameDocs(db: Firestore): Promise<PlayerGameDocs> {
  const snap = await getDocs(collectionGroup(db, "game"));
  const out: PlayerGameDocs = { state: new Map(), slot: new Map() };
  snap.docs.forEach((d) => {
    const uid = d.ref.parent.parent?.id;
    if (!uid) return;
    const x = d.data() as Record<string, unknown>;
    if (d.id === "state") out.state.set(uid, { points: n0(x.points), rankingPoints: n0(x.rankingPoints), tongitsGames: n0(x.tongitsGames), tongitsWins: n0(x.tongitsWins), tongitsLosses: n0(x.tongitsLosses), lockedPoints: n0(x.lockedPoints), totalCasts: n0(x.totalCasts), weeklyScore: n0(x.weeklyScore) });
    if (d.id === "slot") out.slot.set(uid, { spins: n0(x.spins), paid: n0(x.paid), wagered: n0(x.wagered), biggestWin: n0(x.biggestWin), wonToday: n0(x.wonToday), day: typeof x.day === "string" ? x.day : undefined, spinsTotal: n0(x.spinsTotal), spinsUsed: n0(x.spinsUsed), lastAt: typeof x.lastAt === "number" ? x.lastAt : undefined, potHistory: Array.isArray(x.potHistory) ? (x.potHistory as { pot: string; amount: number; at: number }[]) : [] });
  });
  return out;
}

// ===== platform totals per day =====
export type DailyTotals = Record<string, number>;
const HOUR_MS = 3_600_000;
export const manilaDay = (ts: number) => new Date(ts + 8 * HOUR_MS).toISOString().slice(0, 10);
/** Sum of games/pointsDaily over the last `days` Manila days (today included). */
export function useDailyTotals(days = 7): { sum: DailyTotals; byDay: Record<string, DailyTotals>; loaded: boolean } {
  const [v, setV] = useState<{ sum: DailyTotals; byDay: Record<string, DailyTotals>; loaded: boolean }>({ sum: {}, byDay: {}, loaded: false });
  useEffect(() => {
    const { db } = getFirebase();
    if (!db) return;
    return onSnapshot(doc(db, "games", "pointsDaily"), (s) => {
      const byDay = ((s.data() as { days?: Record<string, DailyTotals> } | undefined)?.days) ?? {};
      const now = Date.now();
      const sum: DailyTotals = {};
      for (let i = 0; i < days; i++) for (const [f, x] of Object.entries(byDay[manilaDay(now - i * 86_400_000)] ?? {})) sum[f] = (sum[f] ?? 0) + n0(x);
      setV({ sum, byDay, loaded: true });
    }, () => setV((p) => ({ ...p, loaded: true })));
  }, [days]);
  return v;
}

// ===== the ledger =====
export type LedgerLine = {
  id: string; userId: string; type: string; amount: number; delta?: number; balanceAfter?: number | null;
  description: string; createdAt: number; roomCode?: string; matchId?: string | null; roundId?: string; pot?: string; game?: string; test?: boolean;
};
export type LedgerSource = "slot" | "tongits" | "color" | "reef" | "event" | "reward" | "admin" | "other";
export function ledgerSource(type: string): LedgerSource {
  if (type.startsWith("slot_")) return "slot";
  if (type.startsWith("challenge_")) return "tongits";
  if (type.startsWith("color_")) return "color";
  if (type.startsWith("reef_")) return "reef";
  if (type === "spin_won") return "event";
  if (type === "reward_redeem") return "reward";
  if (type === "admin_set") return "admin";
  return "other";
}
export const SOURCE_LABEL: Record<LedgerSource, string> = { slot: "Dragon Spire", tongits: "Tongits", color: "Color Game", reef: "Reef", event: "Event spin", reward: "Reward", admin: "Admin", other: "Other" };
/** Signed movement. Lines written before the ledger carried `delta` get their sign from the type. */
export function ledgerDelta(l: LedgerLine): number {
  if (typeof l.delta === "number") return l.delta;
  const neg = /lost|locked|redeem|_bet$/.test(l.type);
  return neg ? -Math.abs(l.amount) : Math.abs(l.amount);
}
export async function loadLedger(db: Firestore, uid: string, max = 300): Promise<LedgerLine[]> {
  const snap = await getDocs(query(collection(db, "game_point_transactions"), where("userId", "==", uid), orderBy("createdAt", "desc"), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LedgerLine, "id">) }));
}

export async function adminSetPoints(uid: string, points: number, note: string): Promise<{ before: number; after: number; delta: number }> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  const res = await httpsCallable<{ uid: string; points: number; note: string }, { before: number; after: number; delta: number }>(functions, "adminSetPoints")({ uid, points, note });
  return res.data;
}

// ===== export =====
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type ExportColumn<T> = { header: string; width: number; get: (r: T) => string | number; money?: boolean };
/** Download rows as CSV or Excel (the Excel writer loads only when used). */
export async function exportRows<T>(rows: T[], columns: ExportColumn<T>[], baseName: string, format: "csv" | "xlsx", sheet = "Sheet1"): Promise<void> {
  const stamp = new Date(Date.now() + HOUR_MS * 8).toISOString().slice(0, 16).replace("T", "_").replace(":", "");
  if (format === "csv") {
    const esc = (v: string | number) => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [columns.map((c) => esc(c.header)).join(","), ...rows.map((r) => columns.map((c) => esc(c.get(r))).join(","))];
    download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" }), `${baseName}_${stamp}.csv`);
    return;
  }
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const header = columns.map((c) => ({ value: c.header, fontWeight: "bold" as const, backgroundColor: "#E8F5EE" }));
  const body = rows.map((r) => columns.map((c) => { const v = c.get(r); return typeof v === "number" ? { value: v, type: Number, ...(c.money ? { format: "#,##0" } : {}) } : { value: String(v ?? ""), type: String }; }));
  const blob = await writeExcelFile([header, ...body], { sheet, columns: columns.map((c) => ({ width: c.width })), stickyRowsCount: 1 }).toBlob();
  download(blob, `${baseName}_${stamp}.xlsx`);
}
