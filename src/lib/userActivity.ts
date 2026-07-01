"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { getFirebase } from "./firebase";
import { useAuth } from "./auth";

export type UserActivityRow = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  amount?: number;
  amountKind?: "in" | "out" | "neutral";
  at: number;
};

function toMs(v: unknown): number {
  if (v && typeof (v as { toMillis?: () => number }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === "number") return v;
  return Date.now();
}

/**
 * Live subscription to the signed-in user's own activity subcollection,
 * sorted newest-first. No orderBy on the query (so no composite index is
 * needed); sorting is done client-side. Optionally filter by event type.
 */
export function useUserActivity(typeFilter?: string) {
  const { user, demoMode } = useAuth();
  const [rows, setRows] = useState<UserActivityRow[]>([]);
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
    const unsub = onSnapshot(
      collection(db, "users", user.uid, "activity"),
      (snap) => {
        let r = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            type: data.type ?? "",
            title: data.title ?? "",
            subtitle: data.subtitle ?? "",
            amount: typeof data.amount === "number" ? data.amount : undefined,
            amountKind: data.amountKind,
            at: toMs(data.at),
          } as UserActivityRow;
        });
        if (typeFilter) r = r.filter((x) => x.type === typeFilter);
        r.sort((a, b) => b.at - a.at);
        setRows(r);
        setLoading(false);
      },
      (err) => {
        console.warn("user activity subscription error:", err);
        setRows([]);
        setLoading(false);
      }
    );
    return unsub;
  }, [user, demoMode, typeFilter]);

  return { rows, loading };
}
