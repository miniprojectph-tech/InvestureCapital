"use client";

import { useEffect, useState } from "react";
import { ref, onValue, set, remove } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";

/** Admin side of push: the tester list (RTDB push/testers), a member's devices, a test push. */

export function useTesters(): string[] {
  const [uids, setUids] = useState<string[]>([]);
  useEffect(() => {
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    return onValue(ref(rtdb, "push/testers"), (s) => {
      const v = (s.val() as Record<string, boolean> | null) ?? {};
      setUids(Object.keys(v).filter((k) => v[k] === true));
    }, () => setUids([]));
  }, []);
  return uids;
}

export function setTester(uid: string, on: boolean): Promise<void> {
  const { rtdb } = getFirebase();
  if (!rtdb) return Promise.resolve();
  return on ? set(ref(rtdb, `push/testers/${uid}`), true) : remove(ref(rtdb, `push/testers/${uid}`));
}

export type PushDevice = { id: string; at: number; platform: string; browser: string };
export type MemberPushInfo = { devices: PushDevice[]; prefs: { community: boolean; dm: boolean; account: boolean }; lastDigestPush: number | null };

export async function adminPushDevices(uid: string): Promise<MemberPushInfo> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  return (await httpsCallable<{ uid: string }, MemberPushInfo>(functions, "adminPushDevices")({ uid })).data;
}

export async function adminPushTest(uid: string): Promise<{ sent: number; removed: number }> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  return (await httpsCallable<{ uid: string }, { sent: number; removed: number }>(functions, "adminPushTest")({ uid })).data;
}
