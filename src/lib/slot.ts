"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";
import { useAuth } from "./auth";
import { useGamesSettings } from "./game";

/**
 * Dragon Spire — client side. Types mirror functions/src/slot-engine.ts and
 * slot-daily.ts; the phone never decides an outcome, it animates what the
 * server returns. Daily model: free spins from active placements, a planned
 * day drawn from an admin band, pots dropping per player, an admin-armed Grand.
 */
export type Sym = "L1" | "L2" | "L3" | "L4" | "H1" | "H2" | "H3" | "H4" | "W" | "S" | "O" | "C";
export type PotKey = "mini" | "minor" | "major" | "grand";
export const POT_KEYS: PotKey[] = ["mini", "minor", "major", "grand"];
export const REELS = 5;
export const ROWS = 4;

export type Cell = { sym: Sym; orb?: number };
export type Grid = Cell[][];
export type Win = { sym: Sym; reels: number; ways: number; pay: number; cells: [number, number][] };
export type Step = { grid: Grid; wins: Win[]; mult: number; stepWin: number; removed: [number, number][] };
export type HoldWinResult = {
  coins: { reel: number; row: number; value: number | PotKey }[];
  rounds: { landed: [number, number][]; respinsLeft: number }[];
  total: number;
  potsHit: PotKey[];
  grandFilled: boolean;
};
export type SpinResult = {
  bet: number;
  mode: "base" | "free";
  steps: Step[];
  orbs: { reel: number; row: number; value: number }[];
  orbSum: number;
  lineWin: number;
  scatters: [number, number][];
  freeSpinsAwarded: number;
  holdWin: HoldWinResult | null;
  totalWin: number;
  capped: boolean;
};
export type SpinResponse = {
  result: SpinResult; win: number; points: number; testing: boolean;
  spinsTotal: number; spinsUsed: number; wonToday: number;
  drop: { pot: PotKey; amount: number } | null;
  freeSpinsLeft: number; freeTotal: number; pots: Record<PotKey, number>;
};
export type DayState = { day: string; spinsTotal: number; spinsUsed: number; wonToday: number; capital: number; resetAt: number; minActive: number; testing: boolean };

export type SlotStatus = "off" | "testers" | "everyone";
export type DailySettings = { baseSpins: number; minActive: number; perThousand: number; cap: number; bandMin: number; bandMax: number; spinValue: number; everydayHwOneIn: number };
export type PotPlan = { amount: number; count: number; weeks: number };
export type PotSettings = Record<Exclude<PotKey, "grand">, PotPlan>;
export type GrandSettings = { amount: number; minActive: number; armedUid: string | null; armedAt: number | null; armedBy?: string | null; lastWinner?: { uid: string; amount: number; at: number } };
export type SlotSettings = {
  status: SlotStatus;
  testing: boolean;
  testers: string[];
  paidSpins: boolean;
  daily: DailySettings;
  pots: PotSettings;
  grand: GrandSettings;
  /** Games Central pop-up copy (admin-edited). */
  popupText: string;
  engine?: { bets?: number[] };
};
export const DEFAULT_POPUP_TEXT = "Your active placement gives you free spins in Dragon Spire every day. Spin for Game Points, Hold & Win rounds and the jackpots.";
export const DEFAULT_DAILY: DailySettings = { baseSpins: 10, minActive: 1000, perThousand: 5, cap: 50, bandMin: 200, bandMax: 400, spinValue: 20, everydayHwOneIn: 60 };
export const DEFAULT_POTS: PotSettings = { mini: { amount: 200, count: 2, weeks: 1 }, minor: { amount: 500, count: 1, weeks: 1 }, major: { amount: 1000, count: 1, weeks: 2 } };
export const DEFAULT_GRAND: GrandSettings = { amount: 50000, minActive: 5000, armedUid: null, armedAt: null };
export const DEFAULT_SLOT_SETTINGS: SlotSettings = { status: "off", testing: true, testers: [], paidSpins: false, daily: DEFAULT_DAILY, pots: DEFAULT_POTS, grand: DEFAULT_GRAND, popupText: DEFAULT_POPUP_TEXT };
export const DEFAULT_BETS = [5, 10, 25, 50, 100, 250, 500];

/** Same rule as the server: none below the minimum, then base + per extra ₱1,000, capped. */
export function spinsFor(activeCapital: number, d: DailySettings): number {
  if (activeCapital < d.minActive || (d.minActive <= 0 && activeCapital <= 0)) return 0;
  const extra = Math.max(0, Math.floor((activeCapital - Math.max(1000, d.minActive)) / 1000));
  return Math.min(d.cap, d.baseSpins + extra * d.perThousand);
}
/** Pot points a player receives per week on average, for the admin's sanity line. */
export function potPointsPerWeek(p: PotSettings): number {
  return (["mini", "minor", "major"] as const).reduce((s, k) => s + (p[k].amount * p[k].count) / Math.max(1, p[k].weeks), 0);
}

/** Which games appear on the hub (admin switches). Dragon Spire is governed by its own status. */
export type HubGames = { reef: boolean; tongits: boolean; color: boolean };
export const DEFAULT_HUB_GAMES: HubGames = { reef: true, tongits: true, color: true };

export function useSlotSettings(): { slot: SlotSettings; hub: HubGames; loading: boolean } {
  const { settings, loading } = useGamesSettings();
  const s = settings as typeof settings & { slot?: Partial<SlotSettings>; hub?: Partial<HubGames> };
  const raw = s.slot ?? {};
  const slot: SlotSettings = {
    status: raw.status === "testers" || raw.status === "everyone" ? raw.status : "off",
    testing: raw.testing === true,
    testers: Array.isArray(raw.testers) ? raw.testers.map(String) : [],
    paidSpins: raw.paidSpins === true,
    daily: { ...DEFAULT_DAILY, ...(raw.daily ?? {}) },
    pots: { mini: { ...DEFAULT_POTS.mini, ...(raw.pots?.mini ?? {}) }, minor: { ...DEFAULT_POTS.minor, ...(raw.pots?.minor ?? {}) }, major: { ...DEFAULT_POTS.major, ...(raw.pots?.major ?? {}) } },
    grand: { ...DEFAULT_GRAND, ...(raw.grand ?? {}) },
    popupText: typeof raw.popupText === "string" && raw.popupText.trim() ? raw.popupText : DEFAULT_POPUP_TEXT,
    engine: raw.engine,
  };
  return { slot, hub: { ...DEFAULT_HUB_GAMES, ...(s.hub ?? {}) }, loading };
}

/** Can this member see / play Dragon Spire right now? */
export function slotOpenFor(slot: SlotSettings, uid: string | undefined, isAdmin: boolean): boolean {
  if (slot.status === "everyone") return true;
  if (slot.status === "testers") return isAdmin || (!!uid && slot.testers.includes(uid));
  return false;
}

export async function saveSlotSettings(patch: Partial<SlotSettings>): Promise<void> {
  const { db } = getFirebase();
  if (!db) throw new Error("Firebase not initialized");
  await setDoc(doc(db, "settings", "games"), { slot: patch }, { merge: true });
}
export async function saveHubGames(hub: HubGames): Promise<void> {
  const { db } = getFirebase();
  if (!db) throw new Error("Firebase not initialized");
  await setDoc(doc(db, "settings", "games"), { hub }, { merge: true });
}

export type SlotPlayerState = {
  day?: string; spinsTotal: number; spinsUsed: number; wonToday: number;
  potHistory?: { pot: PotKey; amount: number; at: number }[];
  spins?: number; paid?: number; biggestWin?: number; lastAt?: number;
  freeSpinsLeft: number; freeBet?: number; freeTotal?: number; lastBet?: number;
};
export function useSlotPlayerState(): { state: SlotPlayerState; loading: boolean } {
  const { user } = useAuth();
  const [state, setState] = useState<SlotPlayerState>({ spinsTotal: 0, spinsUsed: 0, wonToday: 0, freeSpinsLeft: 0 });
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  useEffect(() => {
    const { db } = getFirebase();
    if (!db || !user) return;
    const uid = user.uid;
    return onSnapshot(doc(db, "users", uid, "game", "slot"), (s) => {
      const d = (s.data() ?? {}) as Partial<SlotPlayerState>;
      setState({
        day: d.day, spinsTotal: Number(d.spinsTotal ?? 0), spinsUsed: Number(d.spinsUsed ?? 0), wonToday: Number(d.wonToday ?? 0),
        potHistory: d.potHistory, spins: d.spins, paid: d.paid, biggestWin: d.biggestWin, lastAt: d.lastAt,
        freeSpinsLeft: Math.max(0, Number(d.freeSpinsLeft ?? 0)), freeBet: d.freeBet, freeTotal: d.freeTotal, lastBet: d.lastBet,
      });
      setLoadedFor(uid);
    }, () => setLoadedFor(uid));
  }, [user]);
  const loading = !!user && !!getFirebase().db && loadedFor !== user.uid;
  return { state, loading };
}

export async function slotDayStart(): Promise<DayState> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  const res = await httpsCallable<Record<string, never>, DayState>(functions, "slotDayStart")({});
  return res.data;
}
export async function slotSpin(paid?: { bet: number }): Promise<SpinResponse> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  const res = await httpsCallable<{ paid?: boolean; bet?: number }, SpinResponse>(functions, "slotSpin")(paid ? { paid: true, bet: paid.bet } : {});
  return res.data;
}
export async function adminArmGrand(uid: string | null): Promise<{ armedUid: string | null }> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  const res = await httpsCallable<{ uid: string | null }, { armedUid: string | null }>(functions, "adminArmGrand")({ uid });
  return res.data;
}

export type SimResult = { spins: number; rtp: number; hitRate: number; freeSpinRate: number; holdWinRate: number; maxWin: number; parts: { lines: number; freeSpins: number; holdWin: number; potsFeed: number } };
export async function slotSimulate(spins = 50000): Promise<SimResult> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  const res = await httpsCallable<{ spins: number }, SimResult>(functions, "slotSimulate")({ spins });
  return res.data;
}

export type SlotDayStats = { spins: number; paid: number; holdWins: number; pots: number; potPoints: number; testSpins: number; wagered: number };
export function useSlotStatsToday(): SlotDayStats | null {
  const [v, setV] = useState<SlotDayStats | null>(null);
  useEffect(() => {
    const { db } = getFirebase();
    if (!db) return;
    const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
    return onSnapshot(doc(db, "games", "dragonSpireStats"), (s) => {
      const d = (s.data() as { days?: Record<string, Partial<SlotDayStats>> } | undefined)?.days?.[today] ?? {};
      setV({ spins: d.spins ?? 0, paid: d.paid ?? 0, holdWins: d.holdWins ?? 0, pots: d.pots ?? 0, potPoints: d.potPoints ?? 0, testSpins: d.testSpins ?? 0, wagered: d.wagered ?? 0 });
    }, () => setV(null));
  }, []);
  return v;
}
export type GrandWinner = { uid: string; amount: number; at: number; armedBy?: string | null };
export function useGrandHistory(): GrandWinner[] {
  const [v, setV] = useState<GrandWinner[]>([]);
  useEffect(() => {
    const { db } = getFirebase();
    if (!db) return;
    return onSnapshot(doc(db, "games", "dragonSpireGrand"), (s) => setV(((s.data() as { winners?: GrandWinner[] } | undefined)?.winners ?? []).slice().sort((a, b) => b.at - a.at)), () => setV([]));
  }, []);
  return v;
}

// ===== Art =====
export const ART = "/games/dragon-spire";
export const SYMBOL_IMAGE: Record<Sym, string> = {
  L1: `${ART}/rune-fire.png`, L2: `${ART}/rune-ice.png`, L3: `${ART}/rune-lightning.png`, L4: `${ART}/rune-earth.png`,
  H1: `${ART}/dragon-egg.png`, H2: `${ART}/spellbook.png`, H3: `${ART}/crystal-staff.png`, H4: `${ART}/dragon-claw-gem.png`,
  W: `${ART}/wild-dragon.png`, S: `${ART}/scatter-eye.png`, O: `${ART}/orb-x2.png`, C: `${ART}/coin-blank.png`,
};
export const SYMBOL_NAME: Record<Sym, string> = {
  L1: "Fire rune", L2: "Ice rune", L3: "Lightning rune", L4: "Earth rune",
  H1: "Dragon egg", H2: "Spellbook", H3: "Crystal staff", H4: "Dragon's claw",
  W: "Wild", S: "Dragon's eye", O: "Multiplier orb", C: "Medallion",
};
export function orbImage(value: number): string {
  const known = [2, 3, 5, 10, 25];
  const v = known.includes(value) ? value : known.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a));
  return `${ART}/orb-x${v}.png`;
}
export function potCoinImage(pot: PotKey): string { return `${ART}/coin-${pot}.png`; }
export const POT_LABEL: Record<PotKey, string> = { mini: "MINI", minor: "MINOR", major: "MAJOR", grand: "GRAND" };
export const POT_COLOR: Record<PotKey, string> = { mini: "#9CC6FF", minor: "#7FE8C4", major: "#FFB38A", grand: "#C9B5FF" };
