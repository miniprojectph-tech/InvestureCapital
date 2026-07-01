"use client";

import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";
import { useAuth } from "./auth";
import type { GameState } from "./game";

export type RewardType = "wallet" | "gadget" | "activity";

export type Reward = {
  id: string;
  name: string;
  description?: string;
  image?: string;
  cost: number;
  type: RewardType;
  walletAmount?: number; // for type === "wallet"
  stock?: number | null; // null/undefined = unlimited
  active: boolean;
  sort?: number;
};

export type RedemptionStatus = "pending" | "fulfilled" | "rejected";

export type Redemption = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  rewardId: string;
  rewardName: string;
  type: RewardType;
  cost: number;
  walletAmount?: number;
  status: RedemptionStatus;
  note?: string | null;
  createdAt: number;
  processedAt?: number;
  processedBy?: string;
};

export const REWARD_TYPE_LABELS: Record<RewardType, string> = {
  wallet: "Wallet credit",
  gadget: "Gadget",
  activity: "Activity",
};

export const DEFAULT_REWARDS: Omit<Reward, "id">[] = [
  { name: "₱50 wallet credit", type: "wallet", walletAmount: 50, cost: 2500, active: true, sort: 1 },
  { name: "₱100 wallet credit", type: "wallet", walletAmount: 100, cost: 4800, active: true, sort: 2 },
  { name: "₱500 wallet credit", type: "wallet", walletAmount: 500, cost: 22000, active: true, sort: 3 },
  {
    name: "Investure cap",
    type: "gadget",
    cost: 8000,
    stock: 20,
    active: true,
    sort: 4,
    description: "Branded merch, shipped to you.",
  },
  {
    name: "1-on-1 strategy call",
    type: "activity",
    cost: 5000,
    stock: 5,
    active: true,
    sort: 5,
    description: "30-min portfolio session.",
  },
];

export function useRewards() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const { db } = getFirebase();
    if (!db) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      collection(db, "rewards"),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Reward, "id">) }));
        rows.sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999));
        setRewards(rows);
        setLoading(false);
      },
      () => {
        setRewards([]);
        setLoading(false);
      }
    );
    return unsub;
  }, []);
  return { rewards, loading };
}

export async function seedRewardsIfEmpty(db: Firestore): Promise<number> {
  const snap = await getDocs(collection(db, "rewards"));
  if (snap.size > 0) return 0;
  const batch = writeBatch(db);
  for (const r of DEFAULT_REWARDS) batch.set(doc(collection(db, "rewards")), r);
  await batch.commit();
  return DEFAULT_REWARDS.length;
}

export async function saveReward(
  db: Firestore,
  id: string | null,
  data: Omit<Reward, "id">
): Promise<void> {
  const ref = id ? doc(db, "rewards", id) : doc(collection(db, "rewards"));
  await setDoc(ref, data, { merge: true });
}

export async function deleteReward(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, "rewards", id));
}

/** Redeem a reward via the Cloud Function (server validates points + stock). */
export async function redeemReward(
  rewardId: string,
  note?: string
): Promise<{ status: RedemptionStatus; pointsLeft: number }> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  const call = httpsCallable<
    { rewardId: string; note?: string },
    { status: RedemptionStatus; pointsLeft: number }
  >(functions, "redeemReward");
  const res = await call({ rewardId, note });
  return res.data;
}

type Scope = "me" | "all";

export function useRedemptions(scope: Scope = "me") {
  const { user, demoMode } = useAuth();
  const [rows, setRows] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (demoMode || !user) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { db } = getFirebase();
    if (!db) {
      setRows([]);
      setLoading(false);
      return;
    }
    // "me" filters by userId (no orderBy → no composite index; sorted client-side).
    const q =
      scope === "me"
        ? query(collection(db, "redemptions"), where("userId", "==", user.uid))
        : query(collection(db, "redemptions"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const r = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Redemption, "id">) }));
        r.sort((a, b) => b.createdAt - a.createdAt);
        setRows(r);
        setLoading(false);
      },
      (err) => {
        console.warn("redemptions subscription error:", err);
        setRows([]);
        setLoading(false);
      }
    );
    return unsub;
  }, [user, demoMode, scope]);
  return { rows, loading };
}

/** Admin marks a physical/activity redemption as fulfilled (shipped/done). */
export async function fulfillRedemption(db: Firestore, id: string, adminUid: string): Promise<void> {
  await updateDoc(doc(db, "redemptions", id), {
    status: "fulfilled",
    processedAt: Date.now(),
    processedBy: adminUid,
  });
}

/**
 * Admin rejects a redemption — refunds the points and restores stock.
 * (Admins may write game state per Firestore rules.)
 */
export async function rejectRedemption(
  db: Firestore,
  id: string,
  adminUid: string,
  note?: string
): Promise<void> {
  const rRef = doc(db, "redemptions", id);
  const rSnap = await getDoc(rRef);
  if (!rSnap.exists()) throw new Error("Redemption not found");
  const r = rSnap.data() as Redemption;
  if (r.status !== "pending") throw new Error(`Already ${r.status}`);

  // Refund points
  const stateRef = doc(db, "users", r.userId, "game", "state");
  const sSnap = await getDoc(stateRef);
  if (sSnap.exists()) {
    const cur = sSnap.data() as GameState;
    await updateDoc(stateRef, { points: (cur.points ?? 0) + r.cost });
  }
  // Restore stock if tracked
  const rewardRef = doc(db, "rewards", r.rewardId);
  const rewardSnap = await getDoc(rewardRef);
  if (rewardSnap.exists()) {
    const reward = rewardSnap.data() as Reward;
    if (typeof reward.stock === "number") {
      await updateDoc(rewardRef, { stock: reward.stock + 1 });
    }
  }
  await updateDoc(rRef, {
    status: "rejected",
    processedAt: Date.now(),
    processedBy: adminUid,
    ...(note ? { note } : {}),
  });
}
