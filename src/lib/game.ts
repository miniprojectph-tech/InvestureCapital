"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  deleteDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";
import { useAuth } from "./auth";

// ===== Types (mirror functions/src/game.ts) =====
export type Rarity = { id: string; label: string; color: string; weight: number; points: number };
export type Quest = {
  id: string;
  label: string;
  type: "casts" | "catch" | "rarity";
  target: number;
  reward: number;
  rarity?: string;
};
export type GameConfig = {
  dailyEnergy: number;
  rarities: Rarity[];
  streakBonus: number[];
  fothEnabled: boolean;
  fothChance: number;
  quests: Quest[];
  leaderboardPrizes: number[];
};
export type Fish = {
  id: string;
  name: string;
  rarity: string;
  emoji?: string;
  image?: string;
  active?: boolean;
};
export type GameState = {
  points: number;
  weeklyScore: number;
  energy: number;
  lastDay: string;
  streak: number;
  totalCasts: number;
  collection: Record<string, { count: number; firstAt: number }>;
  quests: { day: string; progress: Record<string, number>; claimed: Record<string, boolean> };
};
export type CastResult = {
  fish: { id: string; name: string; rarity: string; image?: string };
  rarity: Rarity;
  gained: number;
  streakBonus: number;
  energy: number;
  streak: number;
  points: number;
  isFoth: boolean;
};
export type FishOfHour = {
  fishId: string;
  fishName: string;
  rarity: string;
  startsAt: number;
  endsAt: number;
} | null;
export type LeaderboardEntry = { uid: string; name: string; weeklyScore: number };

export const DEFAULT_GAME_CONFIG: GameConfig = {
  dailyEnergy: 20,
  rarities: [
    { id: "common", label: "Common", color: "#9CA3AF", weight: 60, points: 5 },
    { id: "rare", label: "Rare", color: "#4F8EF7", weight: 25, points: 20 },
    { id: "epic", label: "Epic", color: "#A78BFA", weight: 10, points: 60 },
    { id: "legendary", label: "Legendary", color: "#F5C66B", weight: 4, points: 200 },
    { id: "mythic", label: "Mythic", color: "#3DD598", weight: 1, points: 800 },
  ],
  streakBonus: [0, 5, 10, 15, 25, 40, 60, 100],
  fothEnabled: true,
  fothChance: 0.15,
  quests: [
    { id: "cast5", label: "Cast 5 times", type: "casts", target: 5, reward: 20 },
    { id: "rare1", label: "Catch a Rare or better", type: "rarity", rarity: "rare", target: 1, reward: 15 },
    { id: "catch10", label: "Catch 10 fish", type: "catch", target: 10, reward: 30 },
  ],
  leaderboardPrizes: [500, 300, 150, 75, 50],
};

/** Starter fish catalog seeded on first admin visit. Emoji = zero-asset visuals. */
export const DEFAULT_FISH: Omit<Fish, "id">[] = [
  { name: "Sardine", rarity: "common", emoji: "🐟", active: true },
  { name: "Anchovy", rarity: "common", emoji: "🐠", active: true },
  { name: "Tilapia", rarity: "common", emoji: "🐡", active: true },
  { name: "Mackerel", rarity: "common", emoji: "🐟", active: true },
  { name: "Blue Tang", rarity: "rare", emoji: "🐠", active: true },
  { name: "Clownfish", rarity: "rare", emoji: "🐠", active: true },
  { name: "Pufferfish", rarity: "rare", emoji: "🐡", active: true },
  { name: "Sea Turtle", rarity: "epic", emoji: "🐢", active: true },
  { name: "Octopus", rarity: "epic", emoji: "🐙", active: true },
  { name: "Swordfish", rarity: "epic", emoji: "⚔️", active: true },
  { name: "Great White", rarity: "legendary", emoji: "🦈", active: true },
  { name: "Blue Whale", rarity: "legendary", emoji: "🐋", active: true },
  { name: "Dolphin", rarity: "legendary", emoji: "🐬", active: true },
  { name: "Kraken", rarity: "mythic", emoji: "🦑", active: true },
  { name: "Golden Koi", rarity: "mythic", emoji: "🎏", active: true },
  { name: "Megalodon", rarity: "mythic", emoji: "🦈", active: true },
];

const DEMO_STATE: GameState = {
  points: 1250,
  weeklyScore: 340,
  energy: 14,
  lastDay: "",
  streak: 3,
  totalCasts: 87,
  collection: {},
  quests: { day: "", progress: {}, claimed: {} },
};

// ===== Config =====
export function useGameConfig() {
  const [config, setConfig] = useState<GameConfig>(DEFAULT_GAME_CONFIG);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const { db } = getFirebase();
    if (!db) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "settings", "game"),
      (snap) => {
        if (snap.exists()) {
          setConfig({ ...DEFAULT_GAME_CONFIG, ...(snap.data() as Partial<GameConfig>) });
        } else {
          setConfig(DEFAULT_GAME_CONFIG);
        }
        setLoading(false);
      },
      () => {
        setConfig(DEFAULT_GAME_CONFIG);
        setLoading(false);
      }
    );
    return unsub;
  }, []);
  return { config, loading };
}

export async function saveGameConfig(db: Firestore, patch: Partial<GameConfig>): Promise<void> {
  await setDoc(doc(db, "settings", "game"), patch, { merge: true });
}

// ===== Per-user game state =====
export function useGameState() {
  const { user, demoMode } = useAuth();
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (demoMode) {
      setState(DEMO_STATE);
      setLoading(false);
      return;
    }
    if (!user) {
      setState(null);
      setLoading(false);
      return;
    }
    const { db } = getFirebase();
    if (!db) {
      setState(null);
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "users", user.uid, "game", "state"),
      (snap) => {
        setState(snap.exists() ? (snap.data() as GameState) : null);
        setLoading(false);
      },
      () => {
        setState(null);
        setLoading(false);
      }
    );
    return unsub;
  }, [user, demoMode]);
  return { state, loading };
}

// ===== Fish catalog =====
export function useFish() {
  const [fish, setFish] = useState<Fish[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const { db } = getFirebase();
    if (!db) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      collection(db, "fish"),
      (snap) => {
        setFish(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Fish, "id">) })));
        setLoading(false);
      },
      () => {
        setFish([]);
        setLoading(false);
      }
    );
    return unsub;
  }, []);
  return { fish, loading };
}

export async function seedFishIfEmpty(db: Firestore): Promise<number> {
  const snap = await getDocs(collection(db, "fish"));
  if (snap.size > 0) return 0;
  const batch = writeBatch(db);
  for (const f of DEFAULT_FISH) {
    batch.set(doc(collection(db, "fish")), f);
  }
  await batch.commit();
  return DEFAULT_FISH.length;
}

export async function saveFish(db: Firestore, id: string | null, data: Omit<Fish, "id">): Promise<void> {
  const ref = id ? doc(db, "fish", id) : doc(collection(db, "fish"));
  await setDoc(ref, data, { merge: true });
}

export async function deleteFish(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, "fish", id));
}

// ===== Fish of the hour =====
export function useFishOfHour() {
  const [foth, setFoth] = useState<FishOfHour>(null);
  useEffect(() => {
    const { db } = getFirebase();
    if (!db) return;
    const unsub = onSnapshot(
      doc(db, "games", "fishOfHour"),
      (snap) => setFoth(snap.exists() ? (snap.data() as NonNullable<FishOfHour>) : null),
      () => setFoth(null)
    );
    return unsub;
  }, []);
  return foth;
}

// ===== Leaderboard =====
export function useLeaderboard(top = 20) {
  const { demoMode } = useAuth();
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (demoMode) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { db } = getFirebase();
    if (!db) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, "leaderboard"), orderBy("weeklyScore", "desc"), limit(top));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => d.data() as LeaderboardEntry).filter((r) => r.weeklyScore > 0));
        setLoading(false);
      },
      () => {
        setRows([]);
        setLoading(false);
      }
    );
    return unsub;
  }, [demoMode, top]);
  return { rows, loading };
}

// ===== Callable wrappers =====
export async function castLine(): Promise<CastResult> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  const call = httpsCallable<void, CastResult>(functions, "castLine");
  const res = await call();
  return res.data;
}

export async function claimQuest(questId: string): Promise<{ reward: number; points: number }> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  const call = httpsCallable<{ questId: string }, { reward: number; points: number }>(
    functions,
    "claimQuest"
  );
  const res = await call({ questId });
  return res.data;
}
