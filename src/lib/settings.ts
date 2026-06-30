"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";
import { getFirebase } from "./firebase";

export type PlatformSettings = {
  vaultDailyRate: number; // percent, e.g. 1.0
  vaultLockDays: number;
  starterBalance: number;
  autoSeed: boolean;
  maintenanceMode: boolean;
  updatedAt?: number;
  updatedBy?: string;
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  vaultDailyRate: 1.0,
  vaultLockDays: 365,
  starterBalance: 10000,
  autoSeed: true,
  maintenanceMode: false,
};

export function settingsRef(db: Firestore) {
  return doc(db, "settings", "platform");
}

export async function saveSettings(
  db: Firestore,
  patch: Partial<PlatformSettings>,
  uid?: string
): Promise<void> {
  await setDoc(
    settingsRef(db),
    { ...patch, updatedAt: Date.now(), updatedBy: uid ?? null },
    { merge: true }
  );
}

export function useSettings() {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { db } = getFirebase();
    if (!db) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      settingsRef(db),
      (snap) => {
        if (snap.exists()) {
          setSettings({ ...DEFAULT_SETTINGS, ...(snap.data() as PlatformSettings) });
        } else {
          setSettings(DEFAULT_SETTINGS);
        }
        setLoading(false);
      },
      (err) => {
        console.warn("settings subscription error, using defaults:", err);
        setSettings(DEFAULT_SETTINGS);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  return { settings, loading };
}
