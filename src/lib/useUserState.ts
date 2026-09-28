"use client";

import { useEffect, useRef, useState } from "react";
import type { Unsubscribe } from "firebase/firestore";
import { useAuth } from "./auth";
import { getFirebase } from "./firebase";
import { subscribeToUserState, ensureUserDoc, type UserState } from "./userState";
import { mockActivePlans, mockBalances, mockUser } from "./mock-data";

/** Sample data for DEMO MODE only (the app running with no Firebase keys). */
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

const RETRY_MS = 3000;

/**
 * The signed-in member's own record, live.
 *
 * A real member is NEVER shown sample data: if the record is slow, missing or
 * the connection drops, the hook keeps `loading` true (pages show their
 * spinner) and retries until the real record arrives. Sample balances and a
 * sample name on a real account would be read as the member's own money.
 */
export function useUserState() {
  const { user, demoMode } = useAuth();
  const [state, setState] = useState<UserState | null>(null);
  const [loading, setLoading] = useState(true);
  const hasStateRef = useRef(false);

  useEffect(() => {
    if (demoMode) {
      setState(MOCK_STATE);
      setLoading(false);
      return;
    }
    if (!user) {
      hasStateRef.current = false;
      setState(null);
      setLoading(false);
      return;
    }
    const { db } = getFirebase();
    if (!db) {
      setState(null);
      setLoading(true);
      return;
    }

    // Only show the loading state before the FIRST snapshot. A re-subscribe
    // (auth object refreshed) keeps the current state on screen instead of
    // flashing a spinner and unmounting whatever the member had open.
    if (!hasStateRef.current) setLoading(true);
    let unsubscribe: Unsubscribe | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const connect = async () => {
      try {
        await ensureUserDoc(db, user.uid, user.name, user.email);
        if (cancelled) return;
        unsubscribe?.();
        unsubscribe = subscribeToUserState(db, user.uid, (s) => {
          if (cancelled) return;
          if (!s) {
            // Record missing or the listener was refused: keep waiting and try again.
            retryTimer = setTimeout(connect, RETRY_MS);
            return;
          }
          setState(s);
          hasStateRef.current = true;
          setLoading(false);
        });
      } catch (err) {
        console.error("Could not load the member record, retrying:", err);
        if (!cancelled) retryTimer = setTimeout(connect, RETRY_MS);
      }
    };
    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      unsubscribe?.();
    };
  }, [user, demoMode]);

  return { state, loading };
}
