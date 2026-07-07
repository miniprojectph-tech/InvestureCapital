"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";
import { getFirebase } from "./firebase";

// Admin-uploadable Tongits art. Each slot has a bundled default (public/tongits)
// that an uploaded image (stored in settings/tongits.assets) overrides live.
export type TongitsAssetKey =
  | "lobbyFull"
  | "waitingRoom"
  | "seatOccupied"
  | "seatEmpty"
  | "logo"
  | "lobbyBg";

export const TONGITS_ASSET_SLOTS: {
  key: TongitsAssetKey;
  label: string;
  def: string;
  hint?: string;
}[] = [
  { key: "lobbyFull", label: "Lobby — full art", def: "/tongits/lobby-full.png", hint: "16:9, whole lobby; controls overlaid on top" },
  { key: "waitingRoom", label: "Waiting room — base", def: "/tongits/waiting-room.png", hint: "16:9 plain table (no seats)" },
  { key: "seatOccupied", label: "Seat — occupied", def: "/tongits/seat-occupied.png", hint: "transparent PNG (ring + panel + READY/AGREED)" },
  { key: "seatEmpty", label: "Seat — waiting", def: "/tongits/seat-empty.png", hint: "transparent PNG (ring + WAITING FOR PLAYER)" },
  { key: "logo", label: "Logo", def: "/tongits/logo.png", hint: "transparent PNG wordmark" },
  { key: "lobbyBg", label: "Lobby background", def: "/tongits/lobby-bg.webp", hint: "wide background behind the lobby" },
];

export type TongitsAssets = Record<TongitsAssetKey, string>;
const DEFAULTS = Object.fromEntries(TONGITS_ASSET_SLOTS.map((s) => [s.key, s.def])) as TongitsAssets;

/** Live asset map: uploaded URL when present, else the bundled default. */
export function useTongitsAssets(): TongitsAssets {
  const [uploaded, setUploaded] = useState<Partial<TongitsAssets>>({});
  useEffect(() => {
    const { db } = getFirebase();
    if (!db) return;
    return onSnapshot(
      doc(db, "settings", "tongits"),
      (s) => setUploaded((s.exists() ? (s.data().assets as Partial<TongitsAssets>) : {}) || {}),
      () => setUploaded({})
    );
  }, []);
  const merged = { ...DEFAULTS };
  for (const [k, v] of Object.entries(uploaded)) if (v) merged[k as TongitsAssetKey] = v;
  return merged;
}

export async function saveTongitsAsset(db: Firestore, key: TongitsAssetKey, url: string): Promise<void> {
  await setDoc(doc(db, "settings", "tongits"), { assets: { [key]: url } }, { merge: true });
}

/** Clear an override (empty string → default wins in the merge). */
export async function resetTongitsAsset(db: Firestore, key: TongitsAssetKey): Promise<void> {
  await setDoc(doc(db, "settings", "tongits"), { assets: { [key]: "" } }, { merge: true });
}
