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
  processedAt?: number;
  processedBy?: string;
  note?: string;
};

export function withdrawalsCollection(db: Firestore) {
  return collection(db, "withdrawals");
}

/**
 * Investor requests a withdrawal: creates a pending /withdrawals doc AND
 * decrements wallet balance in the same flow. If admin later rejects,
 * the wallet is refunded via `rejectWithdrawal`.
 */
export async function requestWithdrawal(
  db: Firestore,
  args: {
    userId: string;
    userName: string;
    userEmail: string;
    amount: number;
    type?: WithdrawalKind;
    destination?: string;
  }
): Promise<string> {
  const { userId, amount } = args;
  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error("User document not found");
  const cur = snap.data() as UserState;
  if (cur.balances.wallet < amount) {
    throw new Error("Insufficient wallet balance");
  }
  // Decrement wallet immediately (held in escrow until approve/reject)
  await updateDoc(userRef, {
    "balances.wallet": cur.balances.wallet - amount,
  });
  const ref = await addDoc(withdrawalsCollection(db), {
    userId,
    userName: args.userName,
    userEmail: args.userEmail,
    amount,
    type: args.type ?? "short-term",
    destination: args.destination ?? "BPI ···· 3421",
    status: "pending",
    createdAt: Date.now(),
  });
  return ref.id;
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
