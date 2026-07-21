"use client";

import { useCallback, useEffect, useState } from "react";
import {
  collection,
  collectionGroup,
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
export type Rarity = {
  id: string;
  label: string;
  color: string;
  weight: number;
  points: number;
  completionBonus?: number; // one-time points for collecting every fish of this rarity
  frame?: string; // optional uploaded rarity frame image
};

/** Uploaded art/audio assets that skin the game (all optional). */
export type GameAssets = {
  // Background
  bgFull?: string;
  bgVideo?: string;
  bgSky?: string;
  bgSea?: string;
  bgWater?: string;
  bgForeground?: string;
  hud?: string; // full HUD overlay skin
  // Gear + rod animation states
  rod?: string;
  lure?: string;
  rodIdle?: string;
  rodCasting?: string;
  rodBendLight?: string;
  rodBendMedium?: string;
  rodBendExtreme?: string;
  lineSnap?: string;
  // Fishing line states
  lineNormal?: string;
  lineTight?: string;
  lineDanger?: string;
  lineBroken?: string;
  // Bite / hook FX
  fxNibble?: string;
  fxBigBite?: string;
  fxBobberPull?: string;
  fxPerfectHook?: string;
  fxFishEscaped?: string;
  // Reeling challenge UI
  uiTensionMeter?: string;
  uiStaminaBar?: string;
  uiReelButton?: string;
  uiPullLeft?: string;
  uiPullRight?: string;
  uiDangerWarning?: string;
  uiPerfectZone?: string;
  // Reveal FX
  revealRays?: string;
  fxSparkle?: string;
  splash?: string;
  // Environment / weather
  envSunny?: string;
  envSunset?: string;
  envNight?: string;
  envRain?: string;
  envStorm?: string;
  envFog?: string;
  envGoldenOcean?: string;
  // Live events
  eventFothBanner?: string;
  eventLegendaryAlert?: string;
  eventTournament?: string;
  eventWorldBoss?: string;
  eventWinnerScreen?: string;
  // Progression icons
  iconCoins?: string;
  iconGems?: string;
  iconXp?: string;
  iconChest?: string;
  iconBait?: string;
  iconRodUpgrade?: string;
  iconCollectionBook?: string;
  // Identity
  logo?: string;
  appIcon?: string;
  loadingArt?: string;
  // Audio
  ambientAudio?: string;
  castSfx?: string;
  biteSfx?: string;
  catchSfx?: string;
  uiClick?: string;
  music?: string;
};
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
  treasureChance: number;
  treasureMin: number;
  treasureMax: number;
  dailyBudgetMin: number;
  dailyBudgetMax: number;
  assets?: GameAssets;
};
export type Fish = {
  id: string;
  name: string;
  rarity: string;
  emoji?: string;
  image?: string;
  active?: boolean;
};
export type DailyCatch = {
  fishId: string;
  name: string;
  rarity: string;
  image?: string;
  gained: number;
  weight: number;
  at: number;
};
export type GameState = {
  points: number;
  weeklyScore: number;
  energy: number;
  lastDay: string;
  streak: number;
  totalCasts: number;
  collection: Record<string, { count: number; firstAt: number }>;
  completedRarities?: Record<string, number>; // rarityId → bonus points already awarded
  quests: { day: string; progress: Record<string, number>; claimed: Record<string, boolean> };
  dailyBudget?: number;
  dailyPointsEarned?: number;
  dailyCatches?: DailyCatch[];
  energyClaimedDay?: string;
  // Shared economy fields used by Community Tongits (Function-written).
  lockedPoints?: number; // points escrowed in an active/ready Tongits challenge
  rankingPoints?: number; // competitive ranking score (leaderboards)
  tongitsGames?: number;
  tongitsWins?: number;
  tongitsLosses?: number;
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
  treasure?: number;
  completionBonus?: { rarity: string; label: string; points: number };
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
  dailyEnergy: 10,
  rarities: [
    { id: "common", label: "Common", color: "#9CA3AF", weight: 51, points: 11, completionBonus: 10 },
    { id: "uncommon", label: "Uncommon", color: "#4ADE80", weight: 20, points: 13, completionBonus: 15 },
    { id: "rare", label: "Rare", color: "#4F8EF7", weight: 12, points: 19, completionBonus: 25 },
    { id: "epic", label: "Epic", color: "#A78BFA", weight: 8, points: 24, completionBonus: 40 },
    { id: "legendary", label: "Legendary", color: "#F5C66B", weight: 5, points: 32, completionBonus: 60 },
    { id: "mythic", label: "Mythic", color: "#FB7185", weight: 2.9, points: 43, completionBonus: 80 },
    { id: "divine", label: "Divine Secret", color: "#E879F9", weight: 1.1, points: 54, completionBonus: 100 },
  ],
  streakBonus: [0, 1, 1, 2, 2, 2, 2, 2],
  fothEnabled: true,
  fothChance: 0.15,
  quests: [
    { id: "cast5", label: "Cast 5 times", type: "casts", target: 5, reward: 3 },
    { id: "rare1", label: "Catch a Rare or better", type: "rarity", rarity: "rare", target: 1, reward: 5 },
    { id: "catch10", label: "Catch 10 fish", type: "catch", target: 10, reward: 5 },
  ],
  leaderboardPrizes: [500, 300, 150, 75, 50],
  treasureChance: 0,
  treasureMin: 0,
  treasureMax: 0,
  dailyBudgetMin: 150,
  dailyBudgetMax: 165,
  assets: {
    bgFull: "/reef/bg-fishing-spots.webp",
    hud: "/reef/hud.webp",
    rod: "/reef/rod.webp",
    lure: "/reef/bobber.webp",
    splash: "/reef/splash-medium.webp",
    fxPerfectHook: "/reef/perfect-hook.webp",
    eventLegendaryAlert: "/reef/legendary-catch-bg.webp",
    iconChest: "/reef/treasure-chest.webp",
    iconCollectionBook: "/reef/fish-collection.webp",
  },
};

/** Starter sea-creature catalog — the generated art set in /public/reef/fish. */
export const DEFAULT_FISH: Omit<Fish, "id">[] = [
  { name: "Anchovy", rarity: "common", image: "/reef/fish/common/anchovy.webp", active: true },
  { name: "Bluegill", rarity: "common", image: "/reef/fish/common/bluegill.webp", active: true },
  { name: "Carp", rarity: "common", image: "/reef/fish/common/carp.webp", active: true },
  { name: "Catfish", rarity: "common", image: "/reef/fish/common/catfish.webp", active: true },
  { name: "Goby", rarity: "common", image: "/reef/fish/common/goby.webp", active: true },
  { name: "Herring", rarity: "common", image: "/reef/fish/common/herring.webp", active: true },
  { name: "Mackerel", rarity: "common", image: "/reef/fish/common/mackerel.webp", active: true },
  { name: "Milkfish", rarity: "common", image: "/reef/fish/common/milkfish.webp", active: true },
  { name: "Perch", rarity: "common", image: "/reef/fish/common/perch.webp", active: true },
  { name: "Snapper", rarity: "common", image: "/reef/fish/common/snapper.webp", active: true },
  { name: "Sardines", rarity: "common", image: "/reef/fish/common/sardines.webp", active: true },
  { name: "Tilapia", rarity: "common", image: "/reef/fish/common/tilapia.webp", active: true },
  { name: "Barracuda", rarity: "uncommon", image: "/reef/fish/uncommon/barracuda.webp", active: true },
  { name: "Butterflyfish", rarity: "uncommon", image: "/reef/fish/uncommon/butterflyfish.webp", active: true },
  { name: "Lionfish", rarity: "uncommon", image: "/reef/fish/uncommon/lionfish.webp", active: true },
  { name: "Pufferfish", rarity: "uncommon", image: "/reef/fish/uncommon/pufferfish.webp", active: true },
  { name: "Red Snapper", rarity: "uncommon", image: "/reef/fish/uncommon/red-snapper.webp", active: true },
  { name: "Salmon", rarity: "uncommon", image: "/reef/fish/uncommon/salmon.webp", active: true },
  { name: "Surgeonfish", rarity: "uncommon", image: "/reef/fish/uncommon/surgeonfish.webp", active: true },
  { name: "Trout", rarity: "uncommon", image: "/reef/fish/uncommon/trout.webp", active: true },
  { name: "Tuna", rarity: "uncommon", image: "/reef/fish/uncommon/tuna.webp", active: true },
  { name: "Yellowtail", rarity: "uncommon", image: "/reef/fish/uncommon/yellowtail.webp", active: true },
  { name: "Angelfish", rarity: "rare", image: "/reef/fish/rare/angelfish.webp", active: true },
  { name: "Arowana", rarity: "rare", image: "/reef/fish/rare/arowana.webp", active: true },
  { name: "Clownfish", rarity: "rare", image: "/reef/fish/rare/clownfish.webp", active: true },
  { name: "Electric Eel", rarity: "rare", image: "/reef/fish/rare/electric-eel.webp", active: true },
  { name: "Flying Fish", rarity: "rare", image: "/reef/fish/rare/flying-fish.webp", active: true },
  { name: "Koi", rarity: "rare", image: "/reef/fish/rare/koi.webp", active: true },
  { name: "Mandarin Fish", rarity: "rare", image: "/reef/fish/rare/mandarin-fish.webp", active: true },
  { name: "Moorish Idol", rarity: "rare", image: "/reef/fish/rare/moorish-idol.webp", active: true },
  { name: "Seahorse", rarity: "rare", image: "/reef/fish/rare/seahorse.webp", active: true },
  { name: "Triggerfish", rarity: "rare", image: "/reef/fish/rare/triggerfish.webp", active: true },
  { name: "Giant Grouper", rarity: "epic", image: "/reef/fish/epic/giant-grouper.webp", active: true },
  { name: "Giant Octopus", rarity: "epic", image: "/reef/fish/epic/giant-octopus.webp", active: true },
  { name: "Giant Stingray", rarity: "epic", image: "/reef/fish/epic/giant-stingray.webp", active: true },
  { name: "Giant Trevally", rarity: "epic", image: "/reef/fish/epic/giant-trevally.webp", active: true },
  { name: "Marlin", rarity: "epic", image: "/reef/fish/epic/marlin.webp", active: true },
  { name: "Napoleon Wrasse", rarity: "epic", image: "/reef/fish/epic/napoleon-wrasse.webp", active: true },
  { name: "Sailfish", rarity: "epic", image: "/reef/fish/epic/sailfish.webp", active: true },
  { name: "Sword fish", rarity: "epic", image: "/reef/fish/epic/sword-fish.webp", active: true },
  { name: "Coelacanth", rarity: "legendary", image: "/reef/fish/legendary/coelacanth.webp", active: true },
  { name: "Manta Ray", rarity: "legendary", image: "/reef/fish/legendary/manta-ray.webp", active: true },
  { name: "Oarfish", rarity: "legendary", image: "/reef/fish/legendary/oarfish.webp", active: true },
  { name: "Sunfish (Mola Mola)", rarity: "legendary", image: "/reef/fish/legendary/sunfish-mola-mola.webp", active: true },
  { name: "Whale Shark", rarity: "legendary", image: "/reef/fish/legendary/whale-shark.webp", active: true },
  { name: "Celestial Whale", rarity: "mythic", image: "/reef/fish/mythic/celestial-whale.webp", active: true },
  { name: "Crystal Koi", rarity: "mythic", image: "/reef/fish/mythic/crystal-koi.webp", active: true },
  { name: "Golden Dragonfish", rarity: "mythic", image: "/reef/fish/mythic/golden-dragonfish.webp", active: true },
  { name: "Leviathan Eel", rarity: "mythic", image: "/reef/fish/mythic/leviathan-eel.webp", active: true },
  { name: "Phantom Shark", rarity: "mythic", image: "/reef/fish/mythic/phantom-shark.webp", active: true },
  { name: "Ancient Ocean Dragon", rarity: "divine", image: "/reef/fish/divine/ancient-ocean-dragon.webp", active: true },
  { name: "Poseidon's Guardian", rarity: "divine", image: "/reef/fish/divine/poseidon-s-guardian.webp", active: true },
  { name: "Sea Phoenix", rarity: "divine", image: "/reef/fish/divine/sea-phoenix.webp", active: true },
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
          const data = snap.data() as Partial<GameConfig>;
          setConfig({
            ...DEFAULT_GAME_CONFIG,
            ...data,
            // Deep-merge assets so newly-added default assets (e.g. hud) always
            // fill in even when Firestore has an older saved assets object.
            assets: { ...DEFAULT_GAME_CONFIG.assets, ...(data.assets ?? {}) },
            // Fall back to the 7-tier default rarities if none were saved.
            rarities: data.rarities?.length ? data.rarities : DEFAULT_GAME_CONFIG.rarities,
          });
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

// ===== General (cross-game) settings =====
// Universal knobs that apply to every game (Reef today, more later). Stored in
// settings/games — separate from the Reef-specific settings/game config.
export type GamesSettings = {
  universalDailyCredits: number;
};
export const DEFAULT_GAMES_SETTINGS: GamesSettings = {
  universalDailyCredits: 20,
};

/** A game's effective daily credits: its own value if it overrides (>0), else universal. */
export function effectiveDailyCredits(gameDailyEnergy: number | undefined, universal: number): number {
  return gameDailyEnergy && gameDailyEnergy > 0 ? gameDailyEnergy : universal;
}

export function useGamesSettings() {
  const [settings, setSettings] = useState<GamesSettings>(DEFAULT_GAMES_SETTINGS);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const { db } = getFirebase();
    if (!db) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "settings", "games"),
      (snap) => {
        setSettings(
          snap.exists()
            ? { ...DEFAULT_GAMES_SETTINGS, ...(snap.data() as Partial<GamesSettings>) }
            : DEFAULT_GAMES_SETTINGS
        );
        setLoading(false);
      },
      () => {
        setSettings(DEFAULT_GAMES_SETTINGS);
        setLoading(false);
      }
    );
    return unsub;
  }, []);
  return { settings, loading };
}

export async function saveGamesSettings(db: Firestore, patch: Partial<GamesSettings>): Promise<void> {
  await setDoc(doc(db, "settings", "games"), patch, { merge: true });
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
  const patchState = useCallback(
    (patch: Partial<GameState>) =>
      setState((prev) => (prev ? { ...prev, ...patch } : prev)),
    []
  );
  return { state, loading, patchState };
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

/** Delete all fish, then load the generated art set. Used to replace old test data. */
export async function reseedFish(db: Firestore): Promise<number> {
  const snap = await getDocs(collection(db, "fish"));
  const del = writeBatch(db);
  snap.docs.forEach((d) => del.delete(d.ref));
  await del.commit();
  const add = writeBatch(db);
  for (const f of DEFAULT_FISH) {
    add.set(doc(collection(db, "fish")), f);
  }
  await add.commit();
  return DEFAULT_FISH.length;
}

export async function saveFish(db: Firestore, id: string | null, data: Omit<Fish, "id">): Promise<void> {
  const ref = id ? doc(db, "fish", id) : doc(collection(db, "fish"));
  await setDoc(ref, data, { merge: true });
}

export async function deleteFish(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, "fish", id));
}

// ===== Admin: per-investor game state (admin has read/write per Firestore rules) =====
export type AdminGameRow = {
  uid: string;
  points: number;
  energy: number;
  streak: number;
  weeklyScore: number;
  totalCasts: number;
  collectionCount: number;
};

/** Read every investor's game state in one collection-group query. Admin only. */
export async function adminListGameStates(db: Firestore): Promise<AdminGameRow[]> {
  const snap = await getDocs(collectionGroup(db, "game"));
  const rows: AdminGameRow[] = [];
  snap.docs.forEach((d) => {
    if (d.id !== "state") return;
    const uid = d.ref.parent.parent?.id;
    if (!uid) return;
    const g = d.data() as Partial<GameState>;
    rows.push({
      uid,
      points: g.points ?? 0,
      energy: g.energy ?? 0,
      streak: g.streak ?? 0,
      weeklyScore: g.weeklyScore ?? 0,
      totalCasts: g.totalCasts ?? 0,
      collectionCount: g.collection ? Object.keys(g.collection).length : 0,
    });
  });
  return rows;
}

/** Patch an investor's game state (e.g. credits/streak/weekly). Admin only. */
export async function adminSaveGameState(
  db: Firestore,
  uid: string,
  patch: Partial<GameState>
): Promise<void> {
  await setDoc(doc(db, "users", uid, "game", "state"), patch, { merge: true });
}

/** Reset an investor's game state to a fresh default. Admin only. */
export async function adminResetGameState(db: Firestore, uid: string, dailyEnergy: number): Promise<void> {
  const fresh: GameState = {
    points: 0,
    weeklyScore: 0,
    energy: dailyEnergy,
    lastDay: "",
    streak: 0,
    totalCasts: 0,
    collection: {},
    quests: { day: "", progress: {}, claimed: {} },
  };
  await setDoc(doc(db, "users", uid, "game", "state"), fresh);
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
export async function castLine(power = 0): Promise<CastResult> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  const call = httpsCallable<{ power: number }, CastResult>(functions, "castLine");
  const res = await call({ power });
  return res.data;
}

export async function claimDailyEnergy(): Promise<{ energy: number }> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  const call = httpsCallable<Record<string, never>, { energy: number }>(functions, "claimDailyEnergy");
  const res = await call({});
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
