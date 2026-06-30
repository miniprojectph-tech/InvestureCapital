"use client";

import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { getFirebase } from "./firebase";
import { mockPlans, type Plan } from "./mock-data";

export type StoredPlan = Plan & {
  active: boolean;
  createdAt?: number;
  updatedAt?: number;
};

export function plansCollection(db: Firestore) {
  return collection(db, "plans");
}

/** Seed the /plans collection from mock data if it's empty. Admin-only operation. */
export async function seedPlansIfEmpty(db: Firestore): Promise<void> {
  const snap = await getDocs(plansCollection(db));
  if (snap.size > 0) return;
  const batch = writeBatch(db);
  for (const p of mockPlans) {
    batch.set(doc(db, "plans", p.id), {
      ...p,
      active: true,
      createdAt: Date.now(),
    });
  }
  await batch.commit();
}

export async function createPlan(
  db: Firestore,
  plan: Omit<StoredPlan, "createdAt" | "updatedAt">
): Promise<void> {
  await setDoc(doc(db, "plans", plan.id), {
    ...plan,
    createdAt: Date.now(),
    updatedAt: serverTimestamp(),
  });
}

export async function updatePlan(
  db: Firestore,
  id: string,
  patch: Partial<StoredPlan>
): Promise<void> {
  await updateDoc(doc(db, "plans", id), { ...patch, updatedAt: Date.now() });
}

export async function deletePlan(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, "plans", id));
}

/** Hook: live plans from Firestore. Falls back to mock when DB unavailable. */
export function usePlans(opts: { onlyActive?: boolean } = {}) {
  const [plans, setPlans] = useState<StoredPlan[]>(() =>
    mockPlans.map((p) => ({ ...p, active: true }))
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { db } = getFirebase();
    if (!db) {
      setLoading(false);
      return;
    }
    const ref = opts.onlyActive
      ? query(plansCollection(db), where("active", "==", true))
      : plansCollection(db);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.empty) {
          // Keep mock fallback if collection hasn't been seeded yet
          setPlans(mockPlans.map((p) => ({ ...p, active: true })));
        } else {
          setPlans(snap.docs.map((d) => d.data() as StoredPlan));
        }
        setLoading(false);
      },
      (err) => {
        console.warn("plans subscription error, using mock:", err);
        setPlans(mockPlans.map((p) => ({ ...p, active: true })));
        setLoading(false);
      }
    );
    return unsub;
  }, [opts.onlyActive]);

  return { plans, loading };
}
