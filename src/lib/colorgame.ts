"use client";

import { useEffect, useRef, useState } from "react";
import { collection, doc, query as fsQuery, orderBy, limit, onSnapshot, type Firestore } from "firebase/firestore";
import { ref, onValue, query as rtdbQuery, orderByKey, limitToLast } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";
import { useAuth } from "./auth";

// ===== Types (mirror functions/src/colorgame-types.ts) =====

export type DieColor = "red" | "blue" | "yellow" | "pink" | "white" | "green";
export const ALL_COLORS: DieColor[] = ["red", "blue", "yellow", "pink", "white", "green"];

export type ColorBet = {
  uid: string;
  name: string;
  color: DieColor;
  amount: number;
  placedAt: number;
};

export type RoundPhase = "betting" | "rolling" | "result" | "expired";

export type ColorRound = {
  roundId: string;
  phase: RoundPhase;
  bettingDeadline: number;
  bets: Record<string, ColorBet>;
  dice?: [DieColor, DieColor, DieColor];
  resolvedAt?: number;
  totalPool?: number;
  jackpotTriggered?: boolean;
  jackpotColor?: DieColor;
  jackpotAmount?: number;
};

export type ColorGameState = {
  jackpotPool: number;
  totalRounds: number;
  totalWagered: number;
  jackpotColor: DieColor;
  history: Array<{ roundId: string; dice: [DieColor, DieColor, DieColor]; at: number }>;
};

export type ColorLeaderboardEntry = {
  uid: string;
  name: string;
  totalWon: number;
  totalBet: number;
  roundsPlayed: number;
  biggestWin: number;
  updatedAt: number;
};

// ===== Constants =====

export const ROUND_MS = 29_000;
export const BET_MS = 15_000;
export const ROLL_MS = 9_000; // long enough for the dice to fully settle before the result window
export const RESULT_MS = ROUND_MS - BET_MS - ROLL_MS; // 5000

export const COLOR_HEX: Record<DieColor, string> = {
  red: "#EF4444",
  blue: "#3B82F6",
  yellow: "#EAB308",
  pink: "#EC4899",
  white: "#F8FAFC",
  green: "#22C55E",
};

export const COLOR_LABELS: Record<DieColor, string> = {
  red: "Red",
  blue: "Blue",
  yellow: "Yellow",
  pink: "Pink",
  white: "White",
  green: "Green",
};

// ===== Round timer logic =====

export function currentRoundId(now = Date.now()): string {
  return String(Math.floor(now / ROUND_MS));
}

export function roundPhase(now = Date.now()): { phase: RoundPhase; remaining: number; elapsed: number } {
  const elapsed = now % ROUND_MS;
  if (elapsed < BET_MS) return { phase: "betting", remaining: BET_MS - elapsed, elapsed };
  if (elapsed < BET_MS + ROLL_MS) return { phase: "rolling", remaining: BET_MS + ROLL_MS - elapsed, elapsed };
  return { phase: "result", remaining: ROUND_MS - elapsed, elapsed };
}

// ===== Hooks =====

export function useRoundTimer(fps = 20) {
  const [state, setState] = useState(() => {
    const now = Date.now();
    return { ...roundPhase(now), roundId: currentRoundId(now), now };
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setState({ ...roundPhase(now), roundId: currentRoundId(now), now });
    }, 1000 / fps);
    return () => clearInterval(interval);
  }, [fps]);

  return state;
}

// Aggregated live round, read from Realtime Database (bandwidth-priced, not per-read).
export type ColorLive = {
  roundId: string;
  betAmounts: Partial<Record<DieColor, number>>;
  totalBettors: number;
  dice?: [DieColor, DieColor, DieColor];
  jackpotTriggered?: boolean;
  jackpotColor?: DieColor | null;
  jackpotAmount?: number;
};

type RtdbLive = {
  totals?: Partial<Record<DieColor, number>>;
  bettors?: number;
  dice?: [DieColor, DieColor, DieColor];
  jackpotTriggered?: boolean;
  jackpotColor?: DieColor | null;
  jackpotAmount?: number;
};

export function useCurrentRound() {
  const { user } = useAuth();
  const [live, setLive] = useState<ColorLive | null>(null);
  const [loading, setLoading] = useState(true);
  const prevRoundIdRef = useRef<string>("");

  const timer = useRoundTimer(4);

  useEffect(() => {
    if (!user || timer.roundId === prevRoundIdRef.current) return;
    prevRoundIdRef.current = timer.roundId;

    const { rtdb } = getFirebase();
    if (!rtdb) { setLoading(false); return; }
    setLoading(true);

    const node = ref(rtdb, `color/live/${timer.roundId}`);
    const unsub = onValue(
      node,
      (snap) => {
        const v = (snap.val() as RtdbLive | null) ?? {};
        setLive({
          roundId: timer.roundId,
          betAmounts: v.totals ?? {},
          totalBettors: v.bettors ?? 0,
          dice: v.dice,
          jackpotTriggered: v.jackpotTriggered,
          jackpotColor: v.jackpotColor,
          jackpotAmount: v.jackpotAmount,
        });
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [user, timer.roundId]);

  return { live, loading, roundId: timer.roundId, timer };
}

export function useColorGameState() {
  const { user } = useAuth();
  const [gs, setGs] = useState<ColorGameState>({ jackpotPool: 0, totalRounds: 0, totalWagered: 0, jackpotColor: "blue", history: [] });

  useEffect(() => {
    if (!user) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;

    let state: { jackpotPool?: number; totalRounds?: number; totalWagered?: number; jackpotColor?: DieColor } = {};
    let history: ColorGameState["history"] = [];
    const merge = () => setGs({
      jackpotPool: state.jackpotPool ?? 0,
      totalRounds: state.totalRounds ?? 0,
      totalWagered: state.totalWagered ?? 0,
      jackpotColor: state.jackpotColor ?? "blue",
      history,
    });

    const u1 = onValue(ref(rtdb, "color/state"), (s) => { state = s.val() ?? {}; merge(); });
    const u2 = onValue(
      rtdbQuery(ref(rtdb, "color/history"), orderByKey(), limitToLast(10)),
      (s) => {
        const val = (s.val() as Record<string, { dice: [DieColor, DieColor, DieColor]; at: number }> | null) ?? {};
        history = Object.entries(val)
          .map(([roundId, v]) => ({ roundId, dice: v.dice, at: v.at }))
          .sort((a, b) => b.at - a.at);
        merge();
      },
    );
    return () => { u1(); u2(); };
  }, [user]);

  return gs;
}

export function useColorLeaderboard(max = 20) {
  const { user } = useAuth();
  const [leaders, setLeaders] = useState<ColorLeaderboardEntry[]>([]);

  useEffect(() => {
    if (!user) return;
    const { gameDb } = getFirebase();
    if (!gameDb) return;

    const q = fsQuery(
      collection(gameDb as Firestore, "color_game_leaderboard"),
      orderBy("totalWon", "desc"),
      limit(max),
    );
    return onSnapshot(q, (snap) => {
      setLeaders(snap.docs.map((d) => d.data() as ColorLeaderboardEntry));
    });
  }, [user, max]);

  return leaders;
}

// ===== Callable wrappers =====

function gameCall<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const { gameFunctions } = getFirebase();
  if (!gameFunctions) throw new Error("Firebase not initialized");
  const fn = httpsCallable(gameFunctions, name);
  return fn(data).then((r) => r.data as T);
}

export function placeColorBet(color: DieColor, amount: number) {
  return gameCall<{ ok: boolean; roundId: string; bet: ColorBet }>("placeColorBet", { color, amount });
}

export function resolveColorRound(roundId: string) {
  return gameCall<{
    ok: boolean;
    dice: [DieColor, DieColor, DieColor];
    payouts: Record<string, number>;
    jackpotTriggered?: boolean;
    cached?: boolean;
  }>("resolveColorRound", { roundId });
}

export function adminAdjustJackpot(amount: number) {
  return gameCall<{ ok: boolean; newJackpot: number }>("adminAdjustColorJackpot", { amount });
}

export function adminSetJackpotColor(color: DieColor) {
  return gameCall<{ ok: boolean; jackpotColor: DieColor }>("adminSetColorJackpotColor", { color });
}

// ── Jackpot config (admin arming) ──

export type ColorJackpotConfig = {
  jackpotColor: DieColor;
  jackpotActive: boolean;
  jackpotTargetUid: string;
  jackpotTargetName: string;
  jackpotDefault: number;
  jackpotContribution: number;
};

const DEFAULT_JACKPOT_CFG: ColorJackpotConfig = {
  jackpotColor: "blue",
  jackpotActive: false,
  jackpotTargetUid: "",
  jackpotTargetName: "",
  jackpotDefault: 100_000,
  jackpotContribution: 0.02,
};

export function useColorJackpotConfig() {
  const { user } = useAuth();
  const [config, setConfig] = useState<ColorJackpotConfig>(DEFAULT_JACKPOT_CFG);

  useEffect(() => {
    if (!user) return;
    const { gameDb } = getFirebase();
    if (!gameDb) return;
    return onSnapshot(doc(gameDb as Firestore, "color_game", "config"), (snap) => {
      setConfig({ ...DEFAULT_JACKPOT_CFG, ...(snap.exists() ? (snap.data() as Partial<ColorJackpotConfig>) : {}) });
    });
  }, [user]);

  return config;
}

export function adminSetJackpotConfig(patch: Partial<ColorJackpotConfig>) {
  return gameCall<{ ok: boolean }>("adminSetColorJackpotConfig", patch);
}
