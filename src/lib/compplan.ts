"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";
import { useAuth } from "./auth";
import { useSettings } from "./settings";
import { mergeCompPlan, type CompPlanConfig } from "./compplan-config";

export * from "./compplan-config";

// Mirrors functions/src/compplan.ts — placements are written only by Cloud Functions.
export type Placement = {
  id: string;
  capital: number;
  units: number;
  termMonths: number;
  cycles: number;
  cycleDays: number;
  cycleRate: number;
  lockedBonus: number;
  startedAt: number;
  cyclesPaid: number;
  totalPaid: number;
  lastAccrualDay?: string;
  requestId?: string;
};

export type CompletedPlacement = Placement & {
  completedAt: number;
  capitalReturned: number;
  lockedBonusPaid: number;
};

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body?: string;
  amount?: number;
  planId?: string;
  at: number;
  read: boolean;
};

export type Commission = {
  id: string;
  type: "level" | "fastStart" | "leadership";
  level?: number;
  tier?: number;
  toUserId: string;
  toUserName: string;
  fromUserId: string;
  fromUserName: string;
  placementId: string;
  placementAmount?: number;
  pct?: number;
  amount: number;
  status: "paid" | "skipped";
  reason?: string | null;
  createdAt: number;
};

/** The live, admin-editable compensation plan (defaults until settings load). */
export function useCompPlan(): { cfg: CompPlanConfig; loading: boolean } {
  const { settings, loading } = useSettings();
  const cfg = useMemo(() => mergeCompPlan(settings.compPlan), [settings.compPlan]);
  return { cfg, loading };
}

// ===== Placement helpers =====

export function nextPayoutAt(p: Placement): number {
  return p.startedAt + (p.cyclesPaid + 1) * p.cycleDays * 86_400_000;
}

export function placementPerCycle(p: Placement): number {
  return (p.capital * p.cycleRate) / 100;
}

// ===== Callables (admin) =====

export type ActivatePlacementArgs = {
  requestId?: string;
  userId?: string;
  amount?: number;
  termMonths?: number;
  note?: string;
};

export type ActivatePlacementResult = {
  ok: boolean;
  placementId: string;
  cycles: number;
  perCycle: number;
  lockedBonus: number;
  commissionsPaid: number;
  uplinesFound: number;
  fastStartPaid: string[];
};

export function activatePlacement(args: ActivatePlacementArgs): Promise<ActivatePlacementResult> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Firebase not initialized");
  return httpsCallable<ActivatePlacementArgs, ActivatePlacementResult>(functions, "activatePlacement")(args).then((r) => r.data);
}

export type MaintenanceResult = { usersScanned: number; usersUpdated: number; payouts: number; plansCompleted: number };

export function runPayoutsNow(): Promise<MaintenanceResult> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Firebase not initialized");
  return httpsCallable<unknown, MaintenanceResult>(functions, "runMaintenanceNow")({}).then((r) => r.data);
}

// ===== Notifications =====

export function useNotifications(max = 30) {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const { db } = getFirebase();
    if (!db) { setLoading(false); return; }
    const q = query(collection(db, "users", user.uid, "notifications"), orderBy("at", "desc"), limit(max));
    return onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AppNotification, "id">) })));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user, max]);

  const unread = items.filter((n) => !n.read).length;
  return { items, unread, loading };
}

export async function markNotificationsRead(uid: string, ids: string[]): Promise<void> {
  const { db } = getFirebase();
  if (!db || ids.length === 0) return;
  const batch = writeBatch(db);
  for (const id of ids) batch.update(doc(db, "users", uid, "notifications", id), { read: true });
  await batch.commit();
}

// ===== Commission ledger =====

/** Commissions and bonuses paid (or skipped) TO the signed-in user. */
export function useMyCommissions(max = 100) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Commission[]>([]);
  useEffect(() => {
    if (!user) return;
    const { db } = getFirebase();
    if (!db) return;
    // Single-field filter + client sort avoids needing a composite index.
    const q = query(collection(db, "commissions"), where("toUserId", "==", user.uid), limit(max));
    return onSnapshot(q, (snap) => {
      setRows(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Commission, "id">) }))
          .sort((a, b) => b.createdAt - a.createdAt),
      );
    });
  }, [user, max]);
  return rows;
}

/** Admin: the newest commission/bonus records across all members. */
export function useAllCommissions(max = 50) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Commission[]>([]);
  useEffect(() => {
    if (!user?.isAdmin) return;
    const { db } = getFirebase();
    if (!db) return;
    const q = query(collection(db, "commissions"), orderBy("createdAt", "desc"), limit(max));
    return onSnapshot(q, (snap) => {
      setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Commission, "id">) })));
    });
  }, [user, max]);
  return rows;
}
