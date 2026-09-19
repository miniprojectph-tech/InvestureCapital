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
  /** True start date — admin-editable; every history date is scheduled from it. */
  startedAt: number;
  /** Kept the first time an admin edits the start date. */
  originalStartedAt?: number;
  /** Virtual time added by the test clock / fast-forward (never moves startedAt). */
  clockAdvanceMs?: number;
  cyclesPaid: number;
  totalPaid: number;
  lastAccrualDay?: string;
  requestId?: string;
  source?: "wallet";
};

export type CompletedPlacement = Placement & {
  /** Scheduled completion date (follows startedAt). */
  completedAt: number;
  completedRealAt?: number;
  capitalReturned: number;
  lockedBonusPaid: number;
};

export type TestClockSpeed = "fast" | "medium";
export type TestClock = { uid: string; speed: TestClockSpeed; cycleRealMs: number; enabledAt: number; lastTickAt: number; name: string };
export const TEST_CLOCK_LABEL: Record<TestClockSpeed, string> = { fast: "1 payout / min", medium: "1 payout / 5 min" };

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

/** The SCHEDULED (history) date of payout k — follows the start date. */
export function scheduledPayoutDate(p: Placement, k: number): number {
  return p.startedAt + k * p.cycleDays * DAY_MS;
}

/** The REAL moment the next payout becomes due (scheduled date minus any clock advance). */
export function nextPayoutAt(p: Placement): number {
  return scheduledPayoutDate(p, p.cyclesPaid + 1) - (p.clockAdvanceMs ?? 0);
}

/** Real moment the final payout (capital + bonus) becomes due. */
export function finalPayoutDueAt(p: Placement): number {
  return scheduledPayoutDate(p, p.cycles) - (p.clockAdvanceMs ?? 0);
}

/** yyyy-mm-dd (local) for <input type="date">. */
export function toDateInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A date-input value → ms, keeping the time of day of `timeFrom` (default: now). */
export function fromDateInput(dateStr: string, timeFrom = Date.now()): number {
  const t = new Date(timeFrom);
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(t.getHours(), t.getMinutes(), t.getSeconds(), 0);
  return d.getTime();
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
      const at = scheduledPayoutDate(p, k) - (p.clockAdvanceMs ?? 0); // real due time
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

export function formatRelativeShort(at: number): string {
  const diff = Date.now() - at;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(at).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
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
  /** Admin only: the placement's true start (e.g. the payment date). Defaults to now. */
  startedAt?: number;
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

type PayoutRun = { ok: boolean; payouts: number; completed: number; notified: boolean; active: number };

function adminCall<A, R>(name: string, args: A): Promise<R> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Firebase not initialized");
  return httpsCallable<A, R>(functions, name)(args).then((r) => r.data);
}

/** Push a placement's clock forward (never its start date) and run its payouts. */
export function adminAdvancePlacement(args: { userId: string; placementId: string; days?: number; mode?: "next" | "complete" }) {
  return adminCall<typeof args, PayoutRun>("adminAdvancePlacement", args);
}

/** Change a placement's true start date — the schedule and every history date follow. */
export function adminSetPlacementStart(args: { userId: string; placementId: string; startedAt: number }) {
  return adminCall<typeof args, PayoutRun & { redated: number; oldStart: number }>("adminSetPlacementStart", args);
}

/** Wipe one member's economy (and reverse what their placements paid to uplines). */
export function adminResetMember(userId: string) {
  return adminCall<{ userId: string }, { ok: boolean; reversedCommissions: number }>("adminResetMember", { userId });
}

/** Pay a commission/bonus the engine skipped (admin release). */
export function adminPaySkippedCommission(commissionId: string) {
  return adminCall<{ commissionId: string }, { ok: boolean; paid: number; toUserId: string }>("adminPaySkippedCommission", { commissionId });
}

/** Which earnings currently require the recipient to be active — for member-facing copy. */
export function earningsRequiringActive(cfg: CompPlanConfig): string[] {
  if (cfg.uplineMinActive <= 0) return [];
  return [
    cfg.requireActiveReferral ? "referral commissions" : null,
    cfg.requireActiveFastStart ? "the Fast-Start Bonus" : null,
    cfg.requireActiveLeadership ? "the Leadership Bonus" : null,
  ].filter((x): x is string => x !== null);
}

/** Put an account on accelerated time (null = off). Stops itself after the final payout. */
export function adminSetTestClock(userId: string, speed: TestClockSpeed | null) {
  return adminCall<{ userId: string; speed: TestClockSpeed | null }, { ok: boolean; enabled: boolean }>("adminSetTestClock", { userId, speed });
}

/** Admin: every account currently on a test clock, keyed by uid. */
export function useTestClocks(enabled: boolean): Map<string, TestClock> {
  const { user } = useAuth();
  const [clocks, setClocks] = useState<Map<string, TestClock>>(new Map());
  useEffect(() => {
    if (!user || !enabled) return;
    const { db } = getFirebase();
    if (!db) return;
    return onSnapshot(
      collection(db, "test_clocks"),
      (snap) => setClocks(new Map(snap.docs.map((d) => [d.id, { uid: d.id, ...(d.data() as Omit<TestClock, "uid">) }]))),
      () => {},
    );
  }, [user, enabled]);
  return clocks;
}

/** The signed-in member's own test clock, if an admin switched one on. */
export function useMyTestClock(): TestClock | null {
  const { user } = useAuth();
  const [clock, setClock] = useState<TestClock | null>(null);
  useEffect(() => {
    if (!user) return;
    const { db } = getFirebase();
    if (!db) return;
    return onSnapshot(
      doc(db, "test_clocks", user.uid),
      (s) => setClock(s.exists() ? { uid: user.uid, ...(s.data() as Omit<TestClock, "uid">) } : null),
      () => setClock(null),
    );
  }, [user]);
  return clock;
}

export function adminResetEconomy(confirm: string) {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Firebase not initialized");
  return httpsCallable<{ confirm: string }, { ok: boolean; users: number; collections: string[] }>(functions, "adminResetEconomy")({ confirm }).then((r) => r.data);
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
