import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { db } from "./init";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// ===== Types =====
type Rarity = { id: string; label: string; color: string; weight: number; points: number; completionBonus?: number };
type Quest = {
  id: string;
  label: string;
  type: "casts" | "catch" | "rarity";
  target: number;
  reward: number;
  rarity?: string;
};
type GameConfig = {
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
};
type FishDoc = { id: string; name: string; rarity: string; image?: string };
type Quests = { day: string; progress: Record<string, number>; claimed: Record<string, boolean> };
type DailyCatch = {
  fishId: string;
  name: string;
  rarity: string;
  image?: string;
  gained: number;
  weight: number;
  at: number;
};
type GameState = {
  points: number;
  weeklyScore: number;
  energy: number;
  lastDay: string;
  streak: number;
  totalCasts: number;
  collection: Record<string, { count: number; firstAt: number }>;
  completedRarities?: Record<string, number>;
  quests: Quests;
  dailyBudget?: number;
  dailyPointsEarned?: number;
  dailyCatches?: DailyCatch[];
  energyClaimedDay?: string;
};

// Defaults used when settings/game is missing or partial. Keep in sync with the
// client defaults in src/lib/game.ts.
const DEFAULT_CONFIG: GameConfig = {
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
};

// ===== Helpers =====
/** Manila (UTC+8) calendar day key, e.g. "2026-07-01". */
function dayKey(ts: number): string {
  return new Date(ts + 8 * HOUR_MS).toISOString().slice(0, 10);
}

/** Universal daily credits (settings/games) — the cross-game baseline. */
async function loadUniversalDailyCredits(): Promise<number> {
  const snap = await db.doc("settings/games").get();
  const d = snap.exists ? (snap.data() as { universalDailyCredits?: number }) : {};
  return d.universalDailyCredits ?? DEFAULT_CONFIG.dailyEnergy;
}

async function loadConfig(): Promise<GameConfig> {
  const snap = await db.doc("settings/game").get();
  if (!snap.exists) return DEFAULT_CONFIG;
  const d = snap.data() as Partial<GameConfig>;
  return {
    // Keep 0/unset as-is so it can inherit the universal default at cast time.
    dailyEnergy: d.dailyEnergy ?? DEFAULT_CONFIG.dailyEnergy,
    rarities: d.rarities?.length ? d.rarities : DEFAULT_CONFIG.rarities,
    streakBonus: d.streakBonus?.length ? d.streakBonus : DEFAULT_CONFIG.streakBonus,
    fothEnabled: d.fothEnabled ?? DEFAULT_CONFIG.fothEnabled,
    fothChance: d.fothChance ?? DEFAULT_CONFIG.fothChance,
    quests: d.quests?.length ? d.quests : DEFAULT_CONFIG.quests,
    leaderboardPrizes: d.leaderboardPrizes?.length ? d.leaderboardPrizes : DEFAULT_CONFIG.leaderboardPrizes,
    treasureChance: d.treasureChance ?? DEFAULT_CONFIG.treasureChance,
    treasureMin: d.treasureMin ?? DEFAULT_CONFIG.treasureMin,
    treasureMax: d.treasureMax ?? DEFAULT_CONFIG.treasureMax,
    dailyBudgetMin: d.dailyBudgetMin ?? DEFAULT_CONFIG.dailyBudgetMin,
    dailyBudgetMax: d.dailyBudgetMax ?? DEFAULT_CONFIG.dailyBudgetMax,
  };
}

async function loadFish(): Promise<FishDoc[]> {
  const snap = await db.collection("fish").get();
  return snap.docs
    .map((doc) => {
      const data = doc.data() as {
        active?: boolean;
        name?: string;
        rarity?: string;
        image?: string;
      };
      return { id: doc.id, ...data };
    })
    .filter((f) => f.active !== false)
    .map((f) => ({ id: f.id, name: f.name ?? f.id, rarity: f.rarity ?? "common", image: f.image }));
}

function rarityRank(rarityId: string, config: GameConfig): number {
  const i = config.rarities.findIndex((r) => r.id === rarityId);
  return i < 0 ? 0 : i;
}

/**
 * Effective rarity weight given cast power (0..1). A stronger cast reaches
 * deeper water: the common tier (index 0) is dampened and rarer tiers are
 * boosted. The multipliers are bounded so power can only tilt the odds
 * modestly — it can never guarantee a rare catch.
 */
function effWeight(r: Rarity, index: number, power: number): number {
  if (index === 0) return r.weight * (1 - 0.4 * power);
  return r.weight * (1 + 0.8 * power);
}

function pickFish(fish: FishDoc[], config: GameConfig, power = 0): FishDoc {
  const p = Math.max(0, Math.min(1, power));
  const weights = config.rarities.map((r, i) => effWeight(r, i, p));
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  let chosen = config.rarities[0];
  for (let i = 0; i < config.rarities.length; i++) {
    if (roll < weights[i]) {
      chosen = config.rarities[i];
      break;
    }
    roll -= weights[i];
  }
  const pool = fish.filter((f) => f.rarity === chosen.id);
  const from = pool.length ? pool : fish;
  return from[Math.floor(Math.random() * from.length)];
}

function bumpQuests(
  quests: Quests | undefined,
  config: GameConfig,
  ev: { casts: number; catches: number; rarity: string },
  today: string
): Quests {
  const base: Quests =
    quests && quests.day === today
      ? { day: today, progress: { ...quests.progress }, claimed: { ...quests.claimed } }
      : { day: today, progress: {}, claimed: {} };
  for (const quest of config.quests) {
    let inc = 0;
    if (quest.type === "casts") inc = ev.casts;
    else if (quest.type === "catch") inc = ev.catches;
    else if (quest.type === "rarity" && quest.rarity) {
      if (rarityRank(ev.rarity, config) >= rarityRank(quest.rarity, config)) inc = 1;
    }
    if (inc) base.progress[quest.id] = (base.progress[quest.id] ?? 0) + inc;
  }
  return base;
}

async function readName(uid: string): Promise<{ name: string; email: string }> {
  const snap = await db.doc(`users/${uid}`).get();
  return {
    name: (snap.get("profile.name") as string) ?? "Angler",
    email: (snap.get("profile.email") as string) ?? "",
  };
}

// ===== Callable: cast a line =====
export const castLine = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

  const [config, fish] = await Promise.all([
    loadConfig(),
    loadFish(),
  ]);
  if (fish.length === 0) throw new HttpsError("failed-precondition", "No fish configured yet.");

  const power = Math.max(0, Math.min(1, (request.data as { power?: number })?.power ?? 0));
  const now = Date.now();
  const today = dayKey(now);
  const yesterday = dayKey(now - DAY_MS);
  const { name } = await readName(uid);

  const fothSnap = await db.doc("games/fishOfHour").get();
  const foth = fothSnap.exists ? (fothSnap.data() as { fishId: string; endsAt: number }) : null;
  const fothActive = !!foth && foth.endsAt > now && fish.some((f) => f.id === foth.fishId);

  const stateRef = db.doc(`users/${uid}/game/state`);
  const lbRef = db.doc(`leaderboard/${uid}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(stateRef);
    const cur = (snap.exists ? snap.data() : {}) as Partial<GameState>;

    let energy = cur.energy ?? 0;
    let streak = cur.streak ?? 0;
    let points = cur.points ?? 0;
    let weeklyScore = cur.weeklyScore ?? 0;
    let totalCasts = cur.totalCasts ?? 0;
    const collection = { ...(cur.collection ?? {}) };
    let streakBonus = 0;
    let dailyCatches: DailyCatch[] = cur.lastDay === today ? [...(cur.dailyCatches ?? [])] : [];

    if (cur.lastDay !== today) {
      streak = cur.lastDay === yesterday ? (cur.streak ?? 0) + 1 : 1;
      streakBonus = config.streakBonus[Math.min(streak - 1, config.streakBonus.length - 1)] ?? 0;
    }

    if (energy <= 0) {
      throw new HttpsError("failed-precondition", "Out of energy — claim your daily login bonus!");
    }
    energy -= 1;

    let caught: FishDoc;
    if (fothActive && Math.random() < config.fothChance) {
      caught = fish.find((f) => f.id === foth!.fishId)!;
    } else {
      caught = pickFish(fish, config, power);
    }
    const rarity = config.rarities.find((r) => r.id === caught.rarity) ?? config.rarities[0];

    const useBudget = config.dailyBudgetMin > 0 && config.dailyBudgetMax > 0;
    let dailyBudget = cur.dailyBudget ?? 0;
    let dailyPointsEarned = cur.dailyPointsEarned ?? 0;

    if (useBudget) {
      if (cur.lastDay !== today) {
        const span = config.dailyBudgetMax - config.dailyBudgetMin;
        dailyBudget = config.dailyBudgetMin + Math.round(Math.random() * span);
        dailyPointsEarned = 0;
      }
    }

    let gained: number;
    if (useBudget) {
      const MULT = [0.8, 1.0, 1.4, 1.8, 2.4, 3.2, 4.0];
      const rarityIdx = config.rarities.findIndex((r) => r.id === caught.rarity);
      const mult = MULT[Math.min(Math.max(rarityIdx, 0), MULT.length - 1)];
      const totalWeight = config.rarities.reduce((s, r) => s + r.weight, 0);
      const expectedAvgMult = config.rarities.reduce((s, r, i) => {
        const m = MULT[Math.min(i, MULT.length - 1)];
        return s + (r.weight / totalWeight) * m;
      }, 0);

      const budgetRemaining = Math.max(0, dailyBudget - dailyPointsEarned);
      const castsLeft = energy + 1;

      if (energy === 0) {
        gained = Math.round(budgetRemaining);
      } else {
        const baseShare = budgetRemaining / castsLeft;
        let rawPoints = baseShare * (mult / expectedAvgMult);
        const jitter = 0.85 + Math.random() * 0.3;
        rawPoints *= jitter;
        gained = Math.max(1, Math.round(rawPoints));
        gained = Math.min(gained, Math.round(budgetRemaining));
      }
      dailyPointsEarned += gained;
      gained += streakBonus;
    } else {
      gained = rarity.points + streakBonus;
    }

    let treasure = 0;
    if (config.treasureChance > 0 && Math.random() < config.treasureChance) {
      const span = Math.max(0, config.treasureMax - config.treasureMin);
      treasure = config.treasureMin + Math.floor(Math.random() * (span + 1));
    }

    points += gained + treasure;
    weeklyScore += gained + treasure;
    totalCasts += 1;
    const prev = collection[caught.id];
    collection[caught.id] = { count: (prev?.count ?? 0) + 1, firstAt: prev?.firstAt ?? now };

    // Category completion bonus: awarded once when every catchable fish of this
    // rarity is collected (server-side so points can't be forged client-side).
    const completedRarities: Record<string, number> = { ...(cur.completedRarities ?? {}) };
    let completionBonus: { rarity: string; label: string; points: number } | undefined;
    const bonus = rarity.completionBonus ?? 0;
    if (bonus > 0 && !completedRarities[caught.rarity]) {
      const rarityFish = fish.filter((f) => f.rarity === caught.rarity);
      const allCaught = rarityFish.length > 0 && rarityFish.every((f) => collection[f.id]);
      if (allCaught) {
        points += bonus;
        weeklyScore += bonus;
        completedRarities[caught.rarity] = bonus;
        completionBonus = { rarity: caught.rarity, label: rarity.label, points: bonus };
      }
    }

    const quests = bumpQuests(cur.quests, config, { casts: 1, catches: 1, rarity: caught.rarity }, today);

    const rarityIdx = config.rarities.findIndex((r) => r.id === caught.rarity);
    const baseKg = [1.5, 3, 6, 10, 18, 30, 50][Math.min(Math.max(rarityIdx, 0), 6)];
    const cosmeticWeight = Math.round(baseKg * (0.6 + Math.random() * 0.9) * 10) / 10;
    dailyCatches.push({
      fishId: caught.id,
      name: caught.name,
      rarity: caught.rarity,
      image: caught.image,
      gained,
      weight: cosmeticWeight,
      at: now,
    });

    tx.set(
      stateRef,
      { points, weeklyScore, energy, streak, totalCasts, collection, completedRarities, quests, lastDay: today, dailyBudget, dailyPointsEarned, dailyCatches },
      { merge: true }
    );
    tx.set(lbRef, { uid, name, weeklyScore, updatedAt: now }, { merge: true });

    return {
      fish: caught,
      rarity,
      gained,
      streakBonus,
      energy,
      streak,
      points,
      isFoth: fothActive && caught.id === foth!.fishId,
      treasure,
      ...(completionBonus ? { completionBonus } : {}),
    };
  });
});

// ===== Callable: claim a completed daily quest =====
export const claimQuest = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const questId = (request.data as { questId?: string })?.questId;
  if (!questId) throw new HttpsError("invalid-argument", "questId required.");

  const config = await loadConfig();
  const quest = config.quests.find((q) => q.id === questId);
  if (!quest) throw new HttpsError("not-found", "Quest not found.");

  const today = dayKey(Date.now());
  const { name } = await readName(uid);
  const stateRef = db.doc(`users/${uid}/game/state`);
  const lbRef = db.doc(`leaderboard/${uid}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(stateRef);
    const cur = (snap.exists ? snap.data() : {}) as Partial<GameState>;
    const quests = cur.quests;
    if (!quests || quests.day !== today) {
      throw new HttpsError("failed-precondition", "No quest progress today.");
    }
    if (quests.claimed?.[questId]) throw new HttpsError("failed-precondition", "Already claimed.");
    if ((quests.progress?.[questId] ?? 0) < quest.target) {
      throw new HttpsError("failed-precondition", "Quest not complete yet.");
    }
    const points = (cur.points ?? 0) + quest.reward;
    const weeklyScore = (cur.weeklyScore ?? 0) + quest.reward;
    const claimed = { ...(quests.claimed ?? {}), [questId]: true };

    tx.set(stateRef, { points, weeklyScore, quests: { ...quests, claimed } }, { merge: true });
    tx.set(lbRef, { uid, name, weeklyScore, updatedAt: Date.now() }, { merge: true });
    return { reward: quest.reward, points };
  });
});

// ===== Callable: redeem a reward =====
export const redeemReward = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const data = request.data as { rewardId?: string; note?: string };
  if (!data?.rewardId) throw new HttpsError("invalid-argument", "rewardId required.");
  const note = typeof data.note === "string" ? data.note : "";

  const rewardRef = db.doc(`rewards/${data.rewardId}`);
  const stateRef = db.doc(`users/${uid}/game/state`);
  const userRef = db.doc(`users/${uid}`);

  return db.runTransaction(async (tx) => {
    const [rSnap, sSnap, uSnap] = await Promise.all([
      tx.get(rewardRef),
      tx.get(stateRef),
      tx.get(userRef),
    ]);
    if (!rSnap.exists) throw new HttpsError("not-found", "Reward not found.");
    const reward = rSnap.data() as {
      name?: string;
      cost?: number;
      type?: string;
      stock?: number;
      walletAmount?: number;
      active?: boolean;
    };
    if (reward.active === false) throw new HttpsError("failed-precondition", "Reward unavailable.");
    const cost = reward.cost ?? 0;
    if (typeof reward.stock === "number" && reward.stock <= 0) {
      throw new HttpsError("failed-precondition", "Out of stock.");
    }
    const cur = (sSnap.exists ? sSnap.data() : {}) as Partial<GameState>;
    const points = cur.points ?? 0;
    if (points < cost) throw new HttpsError("failed-precondition", "Not enough points.");

    const isWallet = reward.type === "wallet";
    const name = (uSnap.get("profile.name") as string) ?? "Angler";
    const email = (uSnap.get("profile.email") as string) ?? "";

    tx.set(stateRef, { points: points - cost }, { merge: true });
    if (typeof reward.stock === "number") tx.update(rewardRef, { stock: reward.stock - 1 });

    const redemptionRef = db.collection("redemptions").doc();
    tx.set(redemptionRef, {
      userId: uid,
      userName: name,
      userEmail: email,
      rewardId: data.rewardId,
      rewardName: reward.name ?? data.rewardId,
      type: reward.type ?? "gadget",
      cost,
      walletAmount: reward.walletAmount ?? 0,
      status: isWallet ? "fulfilled" : "pending",
      note: note || null,
      createdAt: Date.now(),
      ...(isWallet ? { processedAt: Date.now() } : {}),
    });

    if (isWallet) {
      const amt = reward.walletAmount ?? 0;
      const wallet = (uSnap.get("balances.wallet") as number) ?? 0;
      tx.update(userRef, { "balances.wallet": wallet + amt });
      const actRef = db.collection("users").doc(uid).collection("activity").doc();
      tx.set(actRef, {
        type: "deposit",
        title: "Reward redeemed — wallet credit",
        subtitle: `${reward.name ?? "Reward"} · ${cost} pts`,
        amount: amt,
        amountKind: "in",
        at: FieldValue.serverTimestamp(),
      });
    }

    return { status: isWallet ? "fulfilled" : "pending", pointsLeft: points - cost };
  });
});

// ===== Scheduled: Fish of the Hour =====
export const fishOfTheHour = onSchedule("every 60 minutes", async () => {
  const config = await loadConfig();
  if (!config.fothEnabled) return;
  const fish = await loadFish();
  if (fish.length === 0) return;
  const rarePool = fish.filter((f) => ["epic", "legendary", "mythic"].includes(f.rarity));
  const pool = rarePool.length ? rarePool : fish;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const now = Date.now();
  await db.doc("games/fishOfHour").set({
    fishId: pick.id,
    fishName: pick.name,
    rarity: pick.rarity,
    startsAt: now,
    endsAt: now + HOUR_MS,
  });
  logger.info("Fish of the hour set", { fishId: pick.id });
});

// ===== Callable: claim daily login energy bonus =====
export const claimDailyEnergy = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

  const [config, universalCredits] = await Promise.all([loadConfig(), loadUniversalDailyCredits()]);
  const dailyEnergy = config.dailyEnergy && config.dailyEnergy > 0 ? config.dailyEnergy : universalCredits;

  const now = Date.now();
  const today = dayKey(now);
  const stateRef = db.doc(`users/${uid}/game/state`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(stateRef);
    const cur = (snap.exists ? snap.data() : {}) as Partial<GameState>;

    if (cur.energyClaimedDay === today) {
      throw new HttpsError("failed-precondition", "Already claimed today.");
    }

    tx.set(stateRef, { energy: dailyEnergy, energyClaimedDay: today }, { merge: true });
    return { energy: dailyEnergy };
  });
});

// ===== Scheduled: weekly leaderboard prizes + reset (Mondays 00:00 Manila) =====
export const weeklyReef = onSchedule(
  { schedule: "0 0 * * 1", timeZone: "Asia/Manila" },
  async () => {
    const config = await loadConfig();
    const prizes = config.leaderboardPrizes ?? [];
    const lbSnap = await db.collection("leaderboard").orderBy("weeklyScore", "desc").get();
    const batch = db.batch();
    let rank = 0;
    for (const d0 of lbSnap.docs) {
      const data = d0.data() as { uid: string; weeklyScore?: number };
      const stateRef = db.doc(`users/${data.uid}/game/state`);
      if (rank < prizes.length && (data.weeklyScore ?? 0) > 0) {
        const prize = prizes[rank];
        batch.set(stateRef, { points: FieldValue.increment(prize) }, { merge: true });
        const actRef = db.collection("users").doc(data.uid).collection("activity").doc();
        batch.set(actRef, {
          type: "reinvest",
          title: `Weekly Reef prize — rank #${rank + 1}`,
          subtitle: `${prize} points awarded`,
          amount: prize,
          amountKind: "in",
          at: FieldValue.serverTimestamp(),
        });
      }
      batch.set(d0.ref, { weeklyScore: 0 }, { merge: true });
      batch.set(stateRef, { weeklyScore: 0 }, { merge: true });
      rank++;
    }
    await batch.commit();
    logger.info("Weekly Reef reset complete", { players: lbSnap.size });
  }
);
