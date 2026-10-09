"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";
import { useAuth } from "./auth";
import { useGamesSettings } from "./game";

/**
 * Dragon Spire — client side. Types mirror functions/src/slot-engine.ts; the
 * phone never decides an outcome, it animates what `slotSpin` returns.
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
export type SpinResponse = { result: SpinResult; points: number; freeSpinsLeft: number; freeTotal: number; pots: Record<PotKey, number>; testing: boolean; win: number };

export type SlotStatus = "off" | "testers" | "everyone";
export type SlotSettings = {
  status: SlotStatus;
  testing: boolean;
  testers: string[];
  engine?: {
    bets?: number[];
    pots?: { seed?: Partial<Record<PotKey, number>>; feed?: Partial<Record<PotKey, number>>; refBet?: number };
    holdWin?: { landChance?: number; minCoins?: number; respins?: number };
    freeSpins?: [number, number, number];
    maxWinMultiple?: number;
  };
};
export const DEFAULT_SLOT_SETTINGS: SlotSettings = { status: "off", testing: true, testers: [] };
export const DEFAULT_BETS = [5, 10, 25, 50, 100, 250, 500];
export const DEFAULT_POT_SEED: Record<PotKey, number> = { mini: 200, minor: 1000, major: 5000, grand: 25000 };
export const DEFAULT_POT_FEED: Record<PotKey, number> = { mini: 0.01, minor: 0.007, major: 0.004, grand: 0.003 };

/** Which games appear on the hub (admin switches). Dragon Spire is governed by its own status. */
export type HubGames = { reef: boolean; tongits: boolean; color: boolean };
export const DEFAULT_HUB_GAMES: HubGames = { reef: true, tongits: true, color: true };

export function useSlotSettings(): { slot: SlotSettings; hub: HubGames; loading: boolean } {
  const { settings, loading } = useGamesSettings();
  const s = settings as typeof settings & { slot?: Partial<SlotSettings>; hub?: Partial<HubGames> };
  const slot: SlotSettings = {
    ...DEFAULT_SLOT_SETTINGS,
    ...(s.slot ?? {}),
    status: s.slot?.status === "testers" || s.slot?.status === "everyone" ? s.slot.status : "off",
    testers: Array.isArray(s.slot?.testers) ? s.slot!.testers.map(String) : [],
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

export type SlotPots = { pots: Record<PotKey, number>; updatedAt?: number; lastHit?: { uid: string; pots: PotKey[]; at: number; bet: number } };
export function useSlotPots(): SlotPots {
  const [v, setV] = useState<SlotPots>({ pots: DEFAULT_POT_SEED });
  useEffect(() => {
    const { db } = getFirebase();
    if (!db) return;
    return onSnapshot(doc(db, "games", "dragonSpire"), (s) => {
      const d = (s.data() ?? {}) as Partial<SlotPots>;
      setV({ pots: { ...DEFAULT_POT_SEED, ...(d.pots ?? {}) }, updatedAt: d.updatedAt, lastHit: d.lastHit });
    }, () => {});
  }, []);
  return v;
}

export type SlotPlayerState = { freeSpinsLeft: number; freeBet?: number; freeTotal?: number; spins?: number; wagered?: number; paid?: number; biggestWin?: number; lastBet?: number };
export function useSlotPlayerState(): { state: SlotPlayerState; loading: boolean } {
  const { user } = useAuth();
  const [state, setState] = useState<SlotPlayerState>({ freeSpinsLeft: 0 });
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  useEffect(() => {
    const { db } = getFirebase();
    if (!db || !user) return;
    const uid = user.uid;
    return onSnapshot(doc(db, "users", uid, "game", "slot"), (s) => {
      const d = (s.data() ?? {}) as Partial<SlotPlayerState>;
      setState({ freeSpinsLeft: Math.max(0, Number(d.freeSpinsLeft ?? 0)), freeBet: d.freeBet, freeTotal: d.freeTotal, spins: d.spins, wagered: d.wagered, paid: d.paid, biggestWin: d.biggestWin, lastBet: d.lastBet });
      setLoadedFor(uid);
    }, () => setLoadedFor(uid));
  }, [user]);
  // loading only while a signed-in member's record hasn't arrived yet
  const loading = !!user && !!getFirebase().db && loadedFor !== user.uid;
  return { state, loading };
}

export async function slotSpin(bet: number): Promise<SpinResponse> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  const res = await httpsCallable<{ bet: number }, SpinResponse>(functions, "slotSpin")({ bet });
  return res.data;
}

export type SimResult = { spins: number; rtp: number; hitRate: number; freeSpinRate: number; holdWinRate: number; maxWin: number; parts: { lines: number; freeSpins: number; holdWin: number; potsFeed: number } };
export async function slotSimulate(spins = 50000): Promise<SimResult> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  const res = await httpsCallable<{ spins: number }, SimResult>(functions, "slotSimulate")({ spins });
  return res.data;
}
export async function adminSetSlotPots(pots: Partial<Record<PotKey, number>>): Promise<Record<PotKey, number>> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  const res = await httpsCallable<{ pots: Partial<Record<PotKey, number>> }, { pots: Record<PotKey, number> }>(functions, "adminSetSlotPots")({ pots });
  return res.data.pots;
}

export type SlotDayStats = { spins: number; wagered: number; paid: number; freeSpins: number; holdWins: number; testSpins: number };
export function useSlotStatsToday(): SlotDayStats | null {
  const [v, setV] = useState<SlotDayStats | null>(null);
  useEffect(() => {
    const { db } = getFirebase();
    if (!db) return;
    const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
    return onSnapshot(doc(db, "games", "dragonSpireStats"), (s) => {
      const d = (s.data() as { days?: Record<string, Partial<SlotDayStats>> } | undefined)?.days?.[today] ?? {};
      setV({ spins: d.spins ?? 0, wagered: d.wagered ?? 0, paid: d.paid ?? 0, freeSpins: d.freeSpins ?? 0, holdWins: d.holdWins ?? 0, testSpins: d.testSpins ?? 0 });
    }, () => setV(null));
  }, []);
  return v;
}

// ===== Art =====
export const ART = "/games/dragon-spire";
export const SYMBOL_IMAGE: Record<Sym, string> = {
  L1: `${ART}/rune-fire.png`,
  L2: `${ART}/rune-ice.png`,
  L3: `${ART}/rune-lightning.png`,
  L4: `${ART}/rune-earth.png`,
  H1: `${ART}/dragon-egg.png`,
  H2: `${ART}/spellbook.png`,
  H3: `${ART}/crystal-staff.png`,
  H4: `${ART}/dragon-claw-gem.png`,
  W: `${ART}/wild-dragon.png`,
  S: `${ART}/scatter-eye.png`,
  O: `${ART}/orb-x2.png`,
  C: `${ART}/coin-blank.png`,
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
export function potCoinImage(pot: PotKey): string {
  return `${ART}/coin-${pot}.png`;
}
export const POT_LABEL: Record<PotKey, string> = { mini: "MINI", minor: "MINOR", major: "MAJOR", grand: "GRAND" };
export const POT_COLOR: Record<PotKey, string> = { mini: "#9CC6FF", minor: "#7FE8C4", major: "#FFB38A", grand: "#C9B5FF" };
