"use client";

import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import { getFirebase } from "./firebase";
import { useAuth } from "./auth";

// ===== leaderboard =====
export type LbPeriod = "day" | "week" | "month" | "all";

export type TongitsLeaderRow = {
  uid: string;
  name: string;
  allTimeRP: number;
  wins: number;
  games: number;
  dayKey?: string;
  dayRP?: number;
  weekKey?: string;
  weekRP?: number;
  monthKey?: string;
  monthRP?: number;
};

const HOUR_MS = 3_600_000;
/** Manila (UTC+8) period keys — must match functions/src/tongits-game.ts. */
export function currentPeriodKeys(ts = Date.now()): { day: string; week: string; month: string } {
  const d = new Date(ts + 8 * HOUR_MS);
  const day = d.toISOString().slice(0, 10);
  const month = d.toISOString().slice(0, 7);
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7;
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThu = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const week = `${tmp.getUTCFullYear()}-W${String(
    1 +
      Math.round(
        ((tmp.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7
      )
  ).padStart(2, "0")}`;
  return { day, week, month };
}

const PERIOD_FIELD: Record<LbPeriod, { rp: keyof TongitsLeaderRow; key?: keyof TongitsLeaderRow }> = {
  all: { rp: "allTimeRP" },
  day: { rp: "dayRP", key: "dayKey" },
  week: { rp: "weekRP", key: "weekKey" },
  month: { rp: "monthRP", key: "monthKey" },
};

export function rowPoints(r: TongitsLeaderRow, period: LbPeriod): number {
  return (r[PERIOD_FIELD[period].rp] as number) ?? 0;
}

/** Live leaderboard for a period. Stale period buckets are filtered client-side. */
export function useTongitsLeaderboard(period: LbPeriod, top = 50) {
  const { demoMode } = useAuth();
  const [rows, setRows] = useState<TongitsLeaderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (demoMode) {
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
    const field = PERIOD_FIELD[period];
    const q = query(collection(db, "tongits_leaderboard"), orderBy(field.rp as string, "desc"), limit(top + 50));
    const keys = currentPeriodKeys();
    const curKey = period === "day" ? keys.day : period === "week" ? keys.week : keys.month;
    const unsub = onSnapshot(
      q,
      (snap) => {
        let list = snap.docs.map((d) => d.data() as TongitsLeaderRow);
        if (field.key) list = list.filter((r) => r[field.key!] === curKey);
        list = list.filter((r) => rowPoints(r, period) > 0).slice(0, top);
        setRows(list);
        setLoading(false);
      },
      (err) => {
        console.warn("leaderboard subscription error:", err);
        setRows([]);
        setLoading(false);
      }
    );
    return unsub;
  }, [demoMode, period, top]);

  return { rows, loading };
}

// ===== match history =====
export type TongitsMatchResult = {
  id: string;
  matchId: string;
  userId: string;
  finalPosition: number;
  finalHandValue: number;
  pointsEarned: number;
  pointsLost: number;
  rankingPointsEarned: number;
  createdAt: number;
};

/** Current user's recent Tongits results (no orderBy → no composite index). */
export function useMyMatchHistory(top = 20) {
  const { user, demoMode } = useAuth();
  const [rows, setRows] = useState<TongitsMatchResult[]>([]);
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
    const q = query(collection(db, "game_match_results"), where("userId", "==", user.uid), limit(100));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TongitsMatchResult, "id">) }));
        list.sort((a, b) => b.createdAt - a.createdAt);
        setRows(list.slice(0, top));
        setLoading(false);
      },
      (err) => {
        console.warn("match history subscription error:", err);
        setRows([]);
        setLoading(false);
      }
    );
    return unsub;
  }, [user, demoMode, top]);

  return { rows, loading };
}

// ===== admin =====
export type AdminMatch = {
  id: string;
  roomCode: string;
  winnerUserId: string;
  resultType: string;
  matchStatus: string;
  matchDurationSeconds: number;
  createdAt: number;
  completedAt: number;
};

export type ChatReport = {
  id: string;
  reporterUserId: string;
  roomCode: string;
  messageId: string;
  reason: string;
  createdAt: number;
};

export type PointTxn = {
  id: string;
  userId: string;
  type: string;
  amount: number;
  roomCode?: string;
  matchId?: string | null;
  description?: string;
  createdAt: number;
};

function useAdminCollection<T>(
  path: string,
  build: (db: Firestore) => import("firebase/firestore").Query,
  enabled: boolean
) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!enabled) {
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
    const unsub = onSnapshot(
      build(db),
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as T[]);
        setLoading(false);
      },
      (err) => {
        console.warn(`${path} subscription error:`, err);
        setRows([]);
        setLoading(false);
      }
    );
    return unsub;
  }, [path, build, enabled]);
  return { rows, loading };
}

export function useAdminActiveRooms(enabled: boolean) {
  return useAdminCollection<import("./tongits").TongitsRoom>(
    "game_rooms",
    (db) =>
      query(
        collection(db, "game_rooms"),
        where("status", "in", ["open", "full", "ready", "in_game", "post_game"])
      ),
    enabled
  );
}

export function useAdminRecentMatches(enabled: boolean, top = 50) {
  return useAdminCollection<AdminMatch>(
    "game_matches",
    (db) => query(collection(db, "game_matches"), orderBy("createdAt", "desc"), limit(top)),
    enabled
  );
}

export function useAdminChatReports(enabled: boolean) {
  return useAdminCollection<ChatReport>(
    "game_chat_reports",
    (db) => query(collection(db, "game_chat_reports"), orderBy("createdAt", "desc"), limit(100)),
    enabled
  );
}

export function useAdminPointTxns(enabled: boolean, top = 100) {
  return useAdminCollection<PointTxn>(
    "game_point_transactions",
    (db) => query(collection(db, "game_point_transactions"), orderBy("createdAt", "desc"), limit(top)),
    enabled
  );
}

export async function adminDeleteChatMessage(db: Firestore, roomCode: string, messageId: string) {
  await deleteDoc(doc(db, "game_rooms", roomCode, "chat", messageId));
}

export async function adminDismissReport(db: Firestore, reportId: string) {
  await deleteDoc(doc(db, "game_chat_reports", reportId));
}
