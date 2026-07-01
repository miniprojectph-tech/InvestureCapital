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
import { PAYMENT_METHOD_LABELS, type PaymentMethodId } from "./settings";
import type { UserState } from "./userState";

export type TopUpStatus = "pending" | "approved" | "rejected";

export type TopUpRequest = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number;
  method: PaymentMethodId;
  methodLabel: string;
  referenceNumber?: string;
  receiptUrl?: string;
  receiptPath?: string;
  status: TopUpStatus;
  createdAt: number;
  processedAt?: number;
  processedBy?: string;
  note?: string;
};

export function topupsCollection(db: Firestore) {
  return collection(db, "topups");
}

/** Investor submits a top-up request. Wallet is NOT credited yet — admin must approve. */
export async function requestTopUp(
  db: Firestore,
  args: {
    userId: string;
    userName: string;
    userEmail: string;
    amount: number;
    method: PaymentMethodId;
    referenceNumber?: string;
    receiptUrl?: string;
    receiptPath?: string;
  }
): Promise<string> {
  const { userId, userName, userEmail, amount, method, referenceNumber, receiptUrl, receiptPath } = args;
  if (amount <= 0) throw new Error("Amount must be greater than zero");
  const ref = await addDoc(topupsCollection(db), {
    userId,
    userName,
    userEmail,
    amount,
    method,
    methodLabel: PAYMENT_METHOD_LABELS[method],
    ...(referenceNumber ? { referenceNumber } : {}),
    ...(receiptUrl ? { receiptUrl } : {}),
    ...(receiptPath ? { receiptPath } : {}),
    status: "pending",
    createdAt: Date.now(),
  });
  return ref.id;
}

/** Admin approves a top-up — credits the user's wallet and logs a deposit activity. */
export async function approveTopUp(
  db: Firestore,
  id: string,
  adminUid: string,
  note?: string
): Promise<void> {
  const tRef = doc(db, "topups", id);
  const tSnap = await getDoc(tRef);
  if (!tSnap.exists()) throw new Error("Top-up request not found");
  const t = tSnap.data() as TopUpRequest;
  if (t.status !== "pending") throw new Error(`Already ${t.status}`);

  // Credit wallet
  const userRef = doc(db, "users", t.userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) throw new Error("User doc not found");
  const u = userSnap.data() as UserState;
  await updateDoc(userRef, {
    "balances.wallet": (u.balances.wallet ?? 0) + t.amount,
  });

  // Log deposit activity
  await addDoc(collection(db, "users", t.userId, "activity"), {
    type: "deposit",
    title: "Top-up approved",
    subtitle: `${t.methodLabel}${t.referenceNumber ? ` · ref ${t.referenceNumber}` : ""}`,
    amount: t.amount,
    amountKind: "in",
    at: Date.now(),
  });

  // Update the request
  await updateDoc(tRef, {
    status: "approved",
    processedAt: Date.now(),
    processedBy: adminUid,
    ...(note ? { note } : {}),
  });
}

/** Admin rejects a top-up — no wallet change. Optional rejection note. */
export async function rejectTopUp(
  db: Firestore,
  id: string,
  adminUid: string,
  note?: string
): Promise<void> {
  const tRef = doc(db, "topups", id);
  const tSnap = await getDoc(tRef);
  if (!tSnap.exists()) throw new Error("Top-up request not found");
  const t = tSnap.data() as TopUpRequest;
  if (t.status !== "pending") throw new Error(`Already ${t.status}`);
  await updateDoc(tRef, {
    status: "rejected",
    processedAt: Date.now(),
    processedBy: adminUid,
    ...(note ? { note } : {}),
  });
}

type Scope = "me" | "all";

export function useTopUps(scope: Scope = "me") {
  const { user, demoMode } = useAuth();
  const [rows, setRows] = useState<TopUpRequest[]>([]);
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
    const q =
      scope === "me"
        ? query(
            topupsCollection(db),
            where("userId", "==", user.uid),
            orderBy("createdAt", "desc")
          )
        : query(topupsCollection(db), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TopUpRequest, "id">) })));
        setLoading(false);
      },
      (err) => {
        console.warn("topups subscription error:", err);
        setRows([]);
        setLoading(false);
      }
    );
    return unsub;
  }, [user, demoMode, scope]);

  return { rows, loading };
}
