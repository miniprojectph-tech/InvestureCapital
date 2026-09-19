"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
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
import { activatePlacement, type ActivatePlacementResult } from "./compplan";

export type PlanRequestStatus = "pending" | "approved" | "rejected";

/** A member's request to place capital (paid off-platform, admin verifies the receipt). */
export type PlanRequest = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number;
  /** Chosen term. Missing only on legacy requests from the old plan system. */
  termMonths?: number;
  method: PaymentMethodId;
  methodLabel: string;
  referenceNumber?: string;
  receiptUrl?: string;
  receiptPath?: string;
  status: PlanRequestStatus;
  createdAt: number;
  processedAt?: number;
  processedBy?: string;
  note?: string;
  /** Set by activatePlacement on approval. */
  placementId?: string;
  // Legacy fields (old plan templates) — display only.
  planId?: string;
  planName?: string;
  dailyRate?: number;
  durationDays?: number;
};

function planRequestsCollection(db: Firestore) {
  return collection(db, "plan_requests");
}

export async function requestPlacement(
  db: Firestore,
  args: {
    userId: string;
    userName: string;
    userEmail: string;
    amount: number;
    termMonths: number;
    method: PaymentMethodId;
    referenceNumber?: string;
    receiptUrl?: string;
    receiptPath?: string;
  },
): Promise<string> {
  const { userId, userName, userEmail, amount, termMonths, method, referenceNumber, receiptUrl, receiptPath } = args;
  if (amount <= 0) throw new Error("Amount must be greater than zero");
  const ref = await addDoc(planRequestsCollection(db), {
    userId,
    userName,
    userEmail,
    amount,
    termMonths,
    planName: `${termMonths}-month placement`,
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

/**
 * Admin: activates the placement via Cloud Function (pays commissions) and marks
 * the request approved. `startedAt` backdates the start (e.g. to the payment date).
 */
export function approvePlanRequest(id: string, note?: string, startedAt?: number): Promise<ActivatePlacementResult> {
  return activatePlacement({ requestId: id, note, ...(startedAt !== undefined ? { startedAt } : {}) });
}

export async function rejectPlanRequest(db: Firestore, id: string, adminUid: string, note?: string): Promise<void> {
  const rRef = doc(db, "plan_requests", id);
  const rSnap = await getDoc(rRef);
  if (!rSnap.exists()) throw new Error("Plan request not found");
  const r = rSnap.data() as PlanRequest;
  if (r.status !== "pending") throw new Error(`Already ${r.status}`);
  await updateDoc(rRef, {
    status: "rejected",
    processedAt: Date.now(),
    processedBy: adminUid,
    ...(note ? { note } : {}),
  });
}

type Scope = "me" | "all";

export function usePlanRequests(scope: Scope = "me") {
  const { user, demoMode } = useAuth();
  const [rows, setRows] = useState<PlanRequest[]>([]);
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
        ? query(planRequestsCollection(db), where("userId", "==", user.uid), orderBy("createdAt", "desc"))
        : query(planRequestsCollection(db), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PlanRequest, "id">) })));
        setLoading(false);
      },
      (err) => {
        console.warn("plan_requests subscription error:", err);
        setRows([]);
        setLoading(false);
      },
    );
    return unsub;
  }, [user, demoMode, scope]);

  return { rows, loading };
}

export async function listAllUsers(db: Firestore): Promise<Array<{ uid: string; name: string; email: string }>> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => {
    const data = d.data() as UserState;
    return {
      uid: d.id,
      name: data.profile?.name ?? d.id,
      email: data.profile?.email ?? "",
    };
  });
}
