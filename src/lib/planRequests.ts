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
import { activatePlanFor, type UserState } from "./userState";
import type { ReferralPlanConfig } from "./referrals";

export type PlanRequestStatus = "pending" | "approved" | "rejected";

export type PlanRequest = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  planId: string;
  planName: string;
  amount: number;
  dailyRate: number;
  durationDays: number;
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
  referralConfig?: ReferralPlanConfig;
};

function planRequestsCollection(db: Firestore) {
  return collection(db, "plan_requests");
}

export async function requestPlanActivation(
  db: Firestore,
  args: {
    userId: string;
    userName: string;
    userEmail: string;
    planId: string;
    planName: string;
    amount: number;
    dailyRate: number;
    durationDays: number;
    method: PaymentMethodId;
    referenceNumber?: string;
    receiptUrl?: string;
    receiptPath?: string;
    referralConfig?: ReferralPlanConfig;
  }
): Promise<string> {
  const {
    userId, userName, userEmail, planId, planName, amount,
    dailyRate, durationDays, method, referenceNumber,
    receiptUrl, receiptPath, referralConfig,
  } = args;
  if (amount <= 0) throw new Error("Amount must be greater than zero");
  const ref = await addDoc(planRequestsCollection(db), {
    userId,
    userName,
    userEmail,
    planId,
    planName,
    amount,
    dailyRate,
    durationDays,
    method,
    methodLabel: PAYMENT_METHOD_LABELS[method],
    ...(referenceNumber ? { referenceNumber } : {}),
    ...(receiptUrl ? { receiptUrl } : {}),
    ...(receiptPath ? { receiptPath } : {}),
    ...(referralConfig ? { referralConfig } : {}),
    status: "pending",
    createdAt: Date.now(),
  });
  return ref.id;
}

export async function approvePlanRequest(
  db: Firestore,
  id: string,
  adminUid: string,
  note?: string
): Promise<void> {
  const rRef = doc(db, "plan_requests", id);
  const rSnap = await getDoc(rRef);
  if (!rSnap.exists()) throw new Error("Plan request not found");
  const r = rSnap.data() as PlanRequest;
  if (r.status !== "pending") throw new Error(`Already ${r.status}`);

  await activatePlanFor(
    db,
    r.userId,
    r.planId,
    r.planName,
    r.amount,
    r.dailyRate,
    r.durationDays,
    r.referralConfig
  );

  await updateDoc(rRef, {
    status: "approved",
    processedAt: Date.now(),
    processedBy: adminUid,
    ...(note ? { note } : {}),
  });
}

export async function rejectPlanRequest(
  db: Firestore,
  id: string,
  adminUid: string,
  note?: string
): Promise<void> {
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

export async function adminActivatePlan(
  db: Firestore,
  adminUid: string,
  args: {
    userId: string;
    planId: string;
    planName: string;
    amount: number;
    dailyRate: number;
    durationDays: number;
    referralConfig?: ReferralPlanConfig;
  }
): Promise<void> {
  await activatePlanFor(
    db,
    args.userId,
    args.planId,
    args.planName,
    args.amount,
    args.dailyRate,
    args.durationDays,
    args.referralConfig
  );
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
        ? query(
            planRequestsCollection(db),
            where("userId", "==", user.uid),
            orderBy("createdAt", "desc")
          )
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
      }
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
