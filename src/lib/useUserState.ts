"use client";

import { useEffect, useState } from "react";
import type { Unsubscribe } from "firebase/firestore";
import { useAuth } from "./auth";
import { getFirebase } from "./firebase";
import { subscribeToUserState, ensureUserDoc, type UserState } from "./userState";
import { mockActivePlans, mockBalances, mockUser } from "./mock-data";

const MOCK_STATE: UserState = {
  profile: {
    name: mockUser.name,
    email: mockUser.email,
    joinedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
    demoSeeded: true,
  },
  balances: {
    wallet: mockBalances.wallet,
    vault: mockBalances.vault,
    vaultLockStartedAt: Date.now() - mockBalances.vaultLockDay * 24 * 60 * 60 * 1000,
  },
  activePlans: mockActivePlans.map((ap, i) => ({
    id: `mock-${i}`,
    planId: ap.planId,
    capital: ap.capital,
    startedAt: ap.startedAt.getTime(),
  })),
};

export function useUserState() {
  const { user, demoMode } = useAuth();
  const [state, setState] = useState<UserState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (demoMode) {
      setState(MOCK_STATE);
      setLoading(false);
      return;
    }
    if (!user) {
      setState(null);
      setLoading(false);
      return;
    }
    const { db } = getFirebase();
    if (!db) {
      setState(MOCK_STATE);
      setLoading(false);
      return;
    }

    setLoading(true);
    let unsubscribe: Unsubscribe | undefined;
    let cancelled = false;

    // Safety net: if Firestore is unreachable (database not yet created,
    // permission denied, network), fall back to mock data after 4s.
    const fallbackTimer = setTimeout(() => {
      if (!cancelled) {
        console.warn("Firestore appears unavailable — using mock state");
        setState(MOCK_STATE);
        setLoading(false);
      }
    }, 4000);

    (async () => {
      try {
        await ensureUserDoc(db, user.uid, user.name, user.email);
        if (cancelled) return;
        unsubscribe = subscribeToUserState(db, user.uid, (s) => {
          if (cancelled) return;
          clearTimeout(fallbackTimer);
          // If doc somehow still missing (race), keep mock until it lands.
          setState(s ?? MOCK_STATE);
          setLoading(false);
        });
      } catch (err) {
        console.error("Firestore unavailable, falling back to mock state:", err);
        clearTimeout(fallbackTimer);
        if (!cancelled) {
          setState(MOCK_STATE);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      unsubscribe?.();
    };
  }, [user, demoMode]);

  return { state, loading };
}
