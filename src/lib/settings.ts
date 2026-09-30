"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";
import { getFirebase } from "./firebase";
import { DEFAULT_COMP_PLAN, type CompPlanConfig } from "./compplan-config";
import { DEFAULT_WITHDRAWAL_SCHEDULE, type WithdrawalScheduleConfig } from "./withdrawalSchedule";

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

export type AiTradingProvider = "binance" | "okx" | "kraken" | "custom";

export type AiTradingConfig = {
  enabled: boolean;
  provider: AiTradingProvider;
  apiEndpoint: string;
  apiKey: string;
  apiSecret: string;
  unlockThreshold: number; // wallet balance required to unlock (default ₱100,000)
  supportedPairs: string[]; // e.g. ["BTC/USDT", "ETH/USDT"]
};

export const DEFAULT_AI_TRADING: AiTradingConfig = {
  enabled: false,
  provider: "binance",
  apiEndpoint: "",
  apiKey: "",
  apiSecret: "",
  unlockThreshold: 100000,
  supportedPairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
};

export type GameAccessRequirement = {
  enabled: boolean;
  requiredPlanId: string;
  requiredPlanName: string;
  minInvestment: number;
};

export const DEFAULT_GAME_ACCESS: GameAccessRequirement = {
  enabled: false,
  requiredPlanId: "",
  requiredPlanName: "",
  minInvestment: 0,
};

/** What members and moderators may post in the Community Room (admin toggles). */
export type CommunityConfig = {
  membersImages: boolean;
  membersVideo: boolean;
  membersLinks: boolean;
  modsVideo: boolean;
  modsLinks: boolean;
};
export const DEFAULT_COMMUNITY: CommunityConfig = {
  membersImages: true,
  membersVideo: false,
  membersLinks: false,
  modsVideo: true,
  modsLinks: true,
};

/** Upload caps for one chat (admin-set). Sizes in MB, length in seconds. */
export type UploadLimits = { imageMB: number; videoMB: number; videoSeconds: number };
export type UploadsConfig = { room: UploadLimits; inbox: UploadLimits };
export const DEFAULT_UPLOAD_LIMITS: UploadLimits = { imageMB: 15, videoMB: 15, videoSeconds: 30 };
export const DEFAULT_UPLOADS: UploadsConfig = { room: DEFAULT_UPLOAD_LIMITS, inbox: DEFAULT_UPLOAD_LIMITS };
/** Hard ceilings the admin cannot exceed (mobile uploads fail and bandwidth costs climb above this). */
export const MAX_UPLOAD_MB = 200;
export const MAX_VIDEO_SECONDS_CAP = 600;
/** Clean one set of limits: whole MB within 1–200, seconds within 5–600, defaults for anything odd. */
export function cleanUploadLimits(v: Partial<UploadLimits> | null | undefined): UploadLimits {
  const mb = (x: unknown, d: number) => { const n = Math.round(Number(x)); return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_UPLOAD_MB) : d; };
  const sec = (x: unknown, d: number) => { const n = Math.round(Number(x)); return Number.isFinite(n) && n >= 5 ? Math.min(n, MAX_VIDEO_SECONDS_CAP) : d; };
  return { imageMB: mb(v?.imageMB, 15), videoMB: mb(v?.videoMB, 15), videoSeconds: sec(v?.videoSeconds, 30) };
}
export function uploadLimitsFor(settings: PlatformSettings, chat: "room" | "inbox"): UploadLimits {
  return cleanUploadLimits(settings.uploads?.[chat]);
}

export type PlatformSettings = {
  vaultDailyRate: number; // percent, e.g. 1.0
  vaultLockDays: number;
  starterBalance: number;
  autoSeed: boolean;
  maintenanceMode: boolean;
  paymentMethods?: PaymentMethodsConfig;
  aiTrading?: AiTradingConfig;
  gameAccess?: GameAccessRequirement;
  /** Compensation plan numbers (rates, terms, bonuses, referral levels). */
  compPlan?: Partial<CompPlanConfig>;
  /** When requested withdrawals are released (e.g. Mon–Thu → Friday, Fri–Sun → Monday). */
  withdrawalSchedule?: WithdrawalScheduleConfig;
  /** Community Room posting permissions (pictures / video / links, per role). */
  community?: Partial<CommunityConfig>;
  /** Upload size / length caps for the Community Room and the admin chat. */
  uploads?: Partial<Record<"room" | "inbox", Partial<UploadLimits>>>;
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
  aiTrading: DEFAULT_AI_TRADING,
  gameAccess: DEFAULT_GAME_ACCESS,
  compPlan: DEFAULT_COMP_PLAN,
  withdrawalSchedule: DEFAULT_WITHDRAWAL_SCHEDULE,
  community: DEFAULT_COMMUNITY,
  uploads: DEFAULT_UPLOADS,
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

/** Admin-only record for exchange credentials (rules: admins read/write, members nothing). */
export function aiSecretsRef(db: Firestore) {
  return doc(db, "admin_private", "aiTrading");
}

export type AiSecrets = { apiKey: string; apiSecret: string };

export async function saveSettings(
  db: Firestore,
  patch: Partial<PlatformSettings>,
  uid?: string
): Promise<void> {
  // `settings/platform` is downloaded by every member's browser, so credentials
  // never go into it: they are split off into the admin-only record and the
  // public copy always carries blanks.
  let publicPatch: Partial<PlatformSettings> = patch;
  if (patch.aiTrading) {
    const { apiKey, apiSecret, ...rest } = patch.aiTrading;
    await setDoc(aiSecretsRef(db), { apiKey: apiKey ?? "", apiSecret: apiSecret ?? "", updatedAt: Date.now(), updatedBy: uid ?? null }, { merge: true });
    publicPatch = { ...patch, aiTrading: { ...rest, apiKey: "", apiSecret: "" } };
  }
  await setDoc(
    settingsRef(db),
    { ...publicPatch, updatedAt: Date.now(), updatedBy: uid ?? null },
    { merge: true }
  );
}

/** Admin settings form only: the stored exchange credentials. */
export function useAiSecrets(enabled: boolean) {
  const [secrets, setSecrets] = useState<Partial<AiSecrets>>({});
  const [loading, setLoading] = useState(enabled);
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const { db } = getFirebase();
    if (!db) {
      setLoading(false);
      return;
    }
    return onSnapshot(
      aiSecretsRef(db),
      (snap) => {
        const d = (snap.data() as Partial<AiSecrets> | undefined) ?? {};
        setSecrets({ ...(d.apiKey ? { apiKey: d.apiKey } : {}), ...(d.apiSecret ? { apiSecret: d.apiSecret } : {}) });
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [enabled]);
  return { secrets, loading };
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
