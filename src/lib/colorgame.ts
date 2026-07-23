"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { doc, onSnapshot, collection, query, orderBy, limit, getDocs, type Firestore } from "firebase/firestore";
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

export const ROUND_MS = 23_000;
export const BET_MS = 15_000;
export const ROLL_MS = 3_000;
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

export function useCurrentRound() {
  const { user } = useAuth();
  const [round, setRound] = useState<ColorRound | null>(null);
  const [loading, setLoading] = useState(true);
  const prevRoundIdRef = useRef<string>("");

  const timer = useRoundTimer(4);

  useEffect(() => {
    if (!user || timer.roundId === prevRoundIdRef.current) return;
    prevRoundIdRef.current = timer.roundId;

    const { gameDb } = getFirebase();
    if (!gameDb) { setLoading(false); return; }

    setLoading(true);
    const unsub = onSnapshot(
      doc(gameDb as Firestore, "color_rounds", timer.roundId),
      (snap) => {
        if (snap.exists()) {
          setRound(snap.data() as ColorRound);
        } else {
          setRound(null);
        }
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [user, timer.roundId]);

  return { round, loading, roundId: timer.roundId, timer };
}

export function useColorGameState() {
  const { user } = useAuth();
  const [gs, setGs] = useState<ColorGameState>({ jackpotPool: 0, totalRounds: 0, totalWagered: 0, history: [] });

  useEffect(() => {
    if (!user) return;
    const { gameDb } = getFirebase();
    if (!gameDb) return;

    return onSnapshot(
      doc(gameDb as Firestore, "color_game", "state"),
      (snap) => {
        if (snap.exists()) setGs(snap.data() as ColorGameState);
      },
    );
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

    const q = query(
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
