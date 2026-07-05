"use client";

import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useAuth } from "./auth";
import { getFirebase } from "./firebase";
import {
  ensureReferralCode,
  getReferralLink,
  referralTxnCollection,
  type ReferralTransaction,
} from "./referrals";

/**
 * Ensure & return the signed-in user's referral code + shareable link. Backfills
 * a code for older accounts on first call. Returns a demo placeholder in demo mode.
 */
export function useReferralCode() {
  const { user, demoMode } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (demoMode) {
      setCode("DEMO24");
      setLoading(false);
      return;
    }
    if (!user) {
      setCode(null);
      setLoading(false);
      return;
    }
    const { db } = getFirebase();
    if (!db) {
      setCode(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    ensureReferralCode(db, user.uid)
      .then((c) => {
        if (!cancelled) setCode(c);
      })
      .catch((err) => console.error("ensureReferralCode failed", err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, demoMode]);

  return { code, link: code ? getReferralLink(code) : null, loading };
}

type Scope = "me" | "all";

/**
 * Live referral transactions. "me" = bonuses I earned as a referrer;
 * "all" = every transaction (admin). Sorted newest-first client-side.
 */
export function useReferralTransactions(scope: Scope = "me") {
  const { user, demoMode } = useAuth();
  const [rows, setRows] = useState<ReferralTransaction[]>([]);
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

    // "me" filters by referrerUserId with no orderBy (client-side sort) to avoid
    // a composite index — same convention as useWithdrawals.
    const q =
      scope === "me"
        ? query(referralTxnCollection(db), where("referrerUserId", "==", user.uid))
        : query(referralTxnCollection(db), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ReferralTransaction, "id">),
        }));
        next.sort((a, b) => b.createdAt - a.createdAt);
        setRows(next);
        setLoading(false);
      },
      (err) => {
        console.warn("referral transactions subscription error:", err);
        setRows([]);
        setLoading(false);
      }
    );
    return unsub;
  }, [user, demoMode, scope]);

  return { rows, loading };
}

/** Distinct referred users among a set of (non-cancelled) transactions. */
export function countReferredUsers(rows: ReferralTransaction[]): number {
  const ids = new Set<string>();
  for (const r of rows) if (r.status !== "cancelled") ids.add(r.referredUserId);
  return ids.size;
}
