"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";
import { useAuth } from "./auth";
import type { UserState } from "./userState";

export type WithdrawalStatus = "pending" | "approved" | "rejected";
export type WithdrawalKind = "short-term" | "long-term";

export type WithdrawalRequest = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number;
  type: WithdrawalKind;
  destination: string;
  status: WithdrawalStatus;
  createdAt: number;
  /** Manila midnight of the day this payout is due, per the release schedule at request time. */
  scheduledReleaseAt?: number | null;
  processedAt?: number;
  processedBy?: string;
  note?: string;
};

export function withdrawalsCollection(db: Firestore) {
  return collection(db, "withdrawals");
}

/**
 * Investor requests a withdrawal. Runs on the server (`requestWithdrawal`
 * function): the wallet debit and the pending request are one transaction, and
 * the destination and release date come from the member's saved payout method
 * and the admin schedule — members can't write balances or requests themselves.
 * If admin later rejects, the wallet is refunded via `rejectWithdrawal`.
 */
export async function requestWithdrawal(amount: number): Promise<string> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Withdrawals aren't available right now.");
  const call = httpsCallable<{ amount: number }, { ok: boolean; id: string; amount: number }>(functions, "requestWithdrawal");
  const r = await call({ amount });
  return r.data.id;
}

export async function approveWithdrawal(
  db: Firestore,
  id: string,
  adminUid: string,
  note?: string
): Promise<void> {
  await updateDoc(doc(db, "withdrawals", id), {
    status: "approved",
    processedAt: Date.now(),
    processedBy: adminUid,
    ...(note ? { note } : {}),
  });
}

/**
 * Admin rejects: marks doc rejected AND refunds the user's wallet.
 */
export async function rejectWithdrawal(
  db: Firestore,
  id: string,
  adminUid: string,
  note?: string
): Promise<void> {
  const wRef = doc(db, "withdrawals", id);
  const wSnap = await getDoc(wRef);
  if (!wSnap.exists()) throw new Error("Withdrawal not found");
  const w = wSnap.data() as WithdrawalRequest;
  // Refund wallet
  const userRef = doc(db, "users", w.userId);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    const u = userSnap.data() as UserState;
    await updateDoc(userRef, {
      "balances.wallet": u.balances.wallet + w.amount,
    });
  }
  await updateDoc(wRef, {
    status: "rejected",
    processedAt: Date.now(),
    processedBy: adminUid,
    ...(note ? { note } : {}),
  });
}

const HOUR_MS = 3_600_000;
/** Midnight Manila for a yyyy-mm-dd string (the same instant the schedule stamps). */
export function manilaDayStart(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - 8 * HOUR_MS;
}
/** A yyyy-mm-ddThh:mm string typed as Manila time → epoch ms. */
export function manilaDateTime(local: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) - 8 * HOUR_MS;
}
/** Epoch ms → the yyyy-mm-dd / yyyy-mm-ddThh:mm a Manila admin expects in a date input. */
export const toManilaInput = (ms: number, withTime = false) => {
  const iso = new Date(ms + 8 * HOUR_MS).toISOString();
  return withTime ? iso.slice(0, 16) : iso.slice(0, 10);
};
async function audit(db: Firestore, entry: Record<string, unknown>) {
  await addDoc(collection(db, "admin_audit"), { ...entry, at: Date.now() });
}
/** Admin: move a pending withdrawal's release date (the member is told by the server trigger). */
export async function setWithdrawalReleaseDate(db: Firestore, w: WithdrawalRequest, adminUid: string, releaseAt: number): Promise<void> {
  await updateDoc(doc(db, "withdrawals", w.id), { scheduledReleaseAt: releaseAt, releaseDateChangedAt: Date.now(), releaseDateChangedBy: adminUid });
  await audit(db, { type: "withdrawal_release_date", uid: w.userId, userName: w.userName ?? "", withdrawalId: w.id, title: `Release date changed for ${w.userName ?? "a member"}'s ₱${w.amount.toLocaleString()} withdrawal`, before: w.scheduledReleaseAt ?? null, after: releaseAt, by: adminUid });
}
/** Admin: correct the "Released …" stamp of an approved withdrawal. */
export async function setWithdrawalProcessedAt(db: Firestore, w: WithdrawalRequest, adminUid: string, processedAt: number): Promise<void> {
  await updateDoc(doc(db, "withdrawals", w.id), { processedAt, processedAtEditedBy: adminUid });
  await audit(db, { type: "withdrawal_released_date", uid: w.userId, userName: w.userName ?? "", withdrawalId: w.id, title: `Released date corrected for ${w.userName ?? "a member"}'s ₱${w.amount.toLocaleString()} withdrawal`, before: w.processedAt ?? null, after: processedAt, by: adminUid });
}

type Scope = "me" | "all";

/** Hook — live withdrawals for current user, or all (admin). */
export function useWithdrawals(scope: Scope = "me") {
  const { user, demoMode } = useAuth();
  const [rows, setRows] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (demoMode) {
      setRows([]);
      setLoading(false);
      return;
    }
    if (!user) {
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

    // The "me" scope filters by userId; we deliberately omit orderBy so the
    // query needs no composite index (userId + createdAt). Rows are sorted
    // client-side below — same convention as fetchAllActivity in adminQueries.
    // The "all" scope has no filter, so a single-field orderBy index suffices.
    const q =
      scope === "me"
        ? query(withdrawalsCollection(db), where("userId", "==", user.uid))
        : query(withdrawalsCollection(db), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<WithdrawalRequest, "id">),
        }));
        rows.sort((a, b) => b.createdAt - a.createdAt);
        setRows(rows);
        setLoading(false);
      },
      (err) => {
        console.warn("withdrawals subscription error:", err);
        setRows([]);
        setLoading(false);
      }
    );
    return unsub;
  }, [user, demoMode, scope]);

  return { rows, loading };
}
