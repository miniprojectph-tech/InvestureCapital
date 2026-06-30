"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";
import { getFirebase } from "./firebase";

export type PaymentMethodConfig = {
  enabled: boolean;
  accountName: string;
  accountNumber: string; // generic field — can be card no, phone, account no
  extra?: string; // bank name (for bank transfer), notes, etc.
  qrCodeUrl?: string; // Firebase Storage download URL for the QR image
  qrCodePath?: string; // Storage path, kept so we can delete the old file on re-upload
};

export type PaymentMethodsConfig = {
  gotyme: PaymentMethodConfig;
  gcash: PaymentMethodConfig;
  bankTransfer: PaymentMethodConfig;
};

export type PlatformSettings = {
  vaultDailyRate: number; // percent, e.g. 1.0
  vaultLockDays: number;
  starterBalance: number;
  autoSeed: boolean;
  maintenanceMode: boolean;
  paymentMethods?: PaymentMethodsConfig;
  updatedAt?: number;
  updatedBy?: string;
};

export const DEFAULT_PAYMENT_METHODS: PaymentMethodsConfig = {
  gotyme: { enabled: false, accountName: "", accountNumber: "" },
  gcash: { enabled: false, accountName: "", accountNumber: "" },
  bankTransfer: { enabled: false, accountName: "", accountNumber: "", extra: "" },
};

// 2 MB cap so we don't accidentally store giant photos in the QR slot.
export const MAX_QR_BYTES = 2 * 1024 * 1024;

export const DEFAULT_SETTINGS: PlatformSettings = {
  vaultDailyRate: 1.0,
  vaultLockDays: 365,
  starterBalance: 0,
  autoSeed: false,
  maintenanceMode: false,
  paymentMethods: DEFAULT_PAYMENT_METHODS,
};

export type PaymentMethodId = "gotyme" | "gcash" | "bankTransfer";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodId, string> = {
  gotyme: "GoTyme",
  gcash: "GCash",
  bankTransfer: "Bank transfer",
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
