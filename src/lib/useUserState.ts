"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./auth";
import { getFirebase } from "./firebase";
import { subscribeToUserState, ensureUserDoc, type UserState } from "./userState";
import {
  mockActivePlans,
  mockBalances,
  mockUser,
} from "./mock-data";

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

    // Make sure the doc exists, then subscribe
    ensureUserDoc(db, user.uid, user.name, user.email).catch((err) =>
      console.error("ensureUserDoc failed", err)
    );

    setLoading(true);
    const unsub = subscribeToUserState(db, user.uid, (s) => {
      setState(s);
      setLoading(false);
    });
    return unsub;
  }, [user, demoMode]);

  return { state, loading };
}
