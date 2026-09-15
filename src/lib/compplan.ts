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
  source?: "wallet";
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

const DAY_MS = 86_400_000;

export function nextPayoutAt(p: Placement): number {
  return p.startedAt + (p.cyclesPaid + 1) * p.cycleDays * DAY_MS;
}

export function placementPerCycle(p: Placement): number {
  return (p.capital * p.cycleRate) / 100;
}

export function placementDailyAccrual(p: Placement): number {
  return placementPerCycle(p) / p.cycleDays;
}

/** What the final payout will add on top of the regular cycle income. */
export function placementFinalExtra(p: Placement): number {
  return p.capital + p.lockedBonus;
}

export function placedCapital(placements: Placement[] | undefined): number {
  return (placements ?? []).reduce((s, p) => s + p.capital, 0);
}

export function dailyAccrualTotal(placements: Placement[] | undefined): number {
  return (placements ?? []).reduce((s, p) => s + placementDailyAccrual(p), 0);
}

export function upcomingBonuses(placements: Placement[] | undefined): number {
  return (placements ?? []).reduce((s, p) => s + p.lockedBonus, 0);
}

/** Income earned so far: cycle payouts on active + everything paid on completed. */
export function totalEarned(active: Placement[] | undefined, done: CompletedPlacement[] | undefined): number {
  const a = (active ?? []).reduce((s, p) => s + (p.totalPaid ?? 0), 0);
  const d = (done ?? []).reduce((s, p) => s + (p.totalPaid ?? 0) + (p.lockedBonusPaid ?? 0), 0);
  return a + d;
}

/** The soonest upcoming payout across all placements, or null. */
export function nextPayout(placements: Placement[] | undefined, now = Date.now()) {
  let best: { at: number; amount: number; placement: Placement } | null = null;
  for (const p of placements ?? []) {
    if (p.cyclesPaid >= p.cycles) continue;
    const at = nextPayoutAt(p);
    const final = p.cyclesPaid + 1 === p.cycles;
    const amount = placementPerCycle(p) + (final ? placementFinalExtra(p) : 0);
    if (!best || at < best.at) best = { at, amount, placement: p };
  }
  if (!best) return null;
  return { ...best, msLeft: Math.max(0, best.at - now) };
}

/** Wallet-in projection: cumulative scheduled payouts over the next `days` days. */
export function projectedPayouts(placements: Placement[] | undefined, days: number, now = Date.now()): number[] {
  const out = new Array<number>(days + 1).fill(0);
  for (const p of placements ?? []) {
    for (let k = p.cyclesPaid + 1; k <= p.cycles; k++) {
      const at = p.startedAt + k * p.cycleDays * DAY_MS;
      const dayIdx = Math.ceil((at - now) / DAY_MS);
      if (dayIdx < 0 || dayIdx > days) continue;
      out[Math.max(0, dayIdx)] += placementPerCycle(p) + (k === p.cycles ? placementFinalExtra(p) : 0);
    }
  }
  for (let i = 1; i <= days; i++) out[i] += out[i - 1];
  return out;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "due now";
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d >= 1) return `${d}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

/** Re-renders every `everyMs` so countdowns tick. */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

// ===== Callables =====

export type ActivatePlacementArgs = {
  requestId?: string;
  userId?: string;
  amount?: number;
  termMonths?: number;
  note?: string;
  /** Member self-service reinvest: pays from the caller's own wallet. */
  fromWallet?: boolean;
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

// ===== Referral stats (server-computed downline) =====

export type ReferralLevelStat = { level: number; pct: number; members: number; active: number; placed: number };
export type DirectStat = { uid: string; name: string; joinedAt: number; activePlaced: number; placements: number; pendingLockedBonus: number };
export type FastStartTierStat = { minPlacement: number; bonus: number; qualifying: number; paidAt: number | null };
export type ReferralStats = {
  rootUid: string;
  levels: ReferralLevelStat[];
  directs: DirectStat[];
  totals: { members: number; active: number; placed: number };
  fastStart: { directsRequired: number; tiers: FastStartTierStat[] };
  leadershipPct: number;
  uplineMinActive: number;
  selfActive: boolean;
  truncated: boolean;
};

export function getReferralStats(userId?: string): Promise<ReferralStats> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Firebase not initialized");
  return httpsCallable<{ userId?: string }, ReferralStats>(functions, "getReferralStats")(userId ? { userId } : {}).then((r) => r.data);
}

/** Loads the downline once per mount (it's a server walk, not a live listener). */
export function useReferralStats(userId?: string) {
  const { user, demoMode } = useAuth();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || demoMode) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    getReferralStats(userId)
      .then((s) => { if (!cancelled) setStats(s); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load referral stats"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, demoMode, userId, tick]);

  return { stats, loading, error, refresh: () => setTick((t) => t + 1) };
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
