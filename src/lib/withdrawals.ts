"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
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
  /** Full payout details, frozen when the member asked. `from: "profile"` = filled in later from their saved method. */
  payout?: { type: string; provider: string; accountName: string; accountNumber: string; bankName?: string; from?: "profile"; /** the saved method no longer matches the one on the request */ changedSince?: boolean };
  status: WithdrawalStatus;
  createdAt: number;
  /** The request date before an admin first corrected it. */
  createdAtOriginal?: number;
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

/**
 * Approve / reject run on the server (`adminDecideWithdrawal`): the "Released"
 * time is the server's clock, never the admin's device, and a rejection's
 * wallet refund happens in the same transaction, once.
 */
async function decide(id: string, decision: "approve" | "reject", note?: string): Promise<void> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  await httpsCallable<{ id: string; decision: string; note?: string }, { ok: boolean }>(functions, "adminDecideWithdrawal")({ id, decision, ...(note ? { note } : {}) });
}

export async function approveWithdrawal(_db: Firestore, id: string, _adminUid: string, note?: string): Promise<void> {
  await decide(id, "approve", note);
}

/** Admin rejects: the server marks it rejected AND refunds the member's wallet. */
export async function rejectWithdrawal(_db: Firestore, id: string, _adminUid: string, note?: string): Promise<void> {
  await decide(id, "reject", note);
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
/** Admin: correct the date a member asked (pending or approved). No notice to the member; audited. */
export async function setWithdrawalRequestedAt(db: Firestore, w: WithdrawalRequest, adminUid: string, requestedAt: number): Promise<void> {
  await updateDoc(doc(db, "withdrawals", w.id), { createdAt: requestedAt, requestedAtEditedBy: adminUid, ...(w.createdAtOriginal == null ? { createdAtOriginal: w.createdAt } : {}) });
  await audit(db, { type: "withdrawal_requested_date", uid: w.userId, userName: w.userName ?? "", withdrawalId: w.id, title: `Request date changed for ${w.userName ?? "a member"}'s ₱${w.amount.toLocaleString()} withdrawal`, before: w.createdAt, after: requestedAt, by: adminUid });
}
/** Admin: delete a rejected withdrawal and its notices (server-side; audited). */
export async function deleteRejectedWithdrawal(id: string): Promise<{ ok: boolean; notices: number }> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  const r = await httpsCallable<{ id: string }, { ok: boolean; notices: number }>(functions, "adminDeleteWithdrawal")({ id });
  return r.data;
}
