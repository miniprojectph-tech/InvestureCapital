"use client";

import { useCallback, useEffect, useState } from "react";
import { ref, set, remove, onValue, get, update } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";

/**
 * Web Push on the member's device: permission, the browser subscription, and
 * its copy on the account (`push/subs/{uid}/{id}`) that the server sends to.
 * Member switches live at `push/prefs/{uid}`.
 */

/** Public half of the VAPID pair; the private half is a Functions secret. */
export const VAPID_PUBLIC_KEY = "BIpttrtsFzyDYFr-lxkSOi4rMk_Qb3b36VIOXbhDTDJXI82XQ6FLICywpISHg4azH_q8DXt5xtu2TV_NuypZsGw";

export type PushStatus = "loading" | "unsupported" | "needs-install" | "blocked" | "off" | "on";
export type PushKind = "community" | "dm" | "account";
export type PushPrefs = Record<PushKind, boolean>;
export const DEFAULT_PREFS: PushPrefs = { community: true, dm: true, account: true };

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
/** iPhone: Safari only allows push for apps added to the Home Screen. */
export function needsInstall(): boolean {
  return typeof window !== "undefined" && isIOS() && !isStandalone();
}

function keyBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subId(endpoint: string): Promise<string> {
  try {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
    return Array.from(new Uint8Array(d)).slice(0, 10).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 5381;
    for (let i = 0; i < endpoint.length; i++) h = ((h << 5) + h + endpoint.charCodeAt(i)) | 0;
    return `h${(h >>> 0).toString(16)}`;
  }
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  // dev builds don't register the worker on load
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export async function getPushStatus(uid: string): Promise<PushStatus> {
  if (needsInstall()) return "needs-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return "off";
    const { rtdb } = getFirebase();
    if (!rtdb) return "off";
    const snap = await get(ref(rtdb, `push/subs/${uid}/${await subId(sub.endpoint)}/at`));
    return snap.exists() ? "on" : "off";
  } catch {
    return "off";
  }
}

/** Ask the phone, subscribe this browser, and store the subscription on the account. Call from a tap. */
export async function enablePush(uid: string): Promise<PushStatus> {
  if (needsInstall()) return "needs-install";
  if (!pushSupported()) return "unsupported";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "blocked" : "off";
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) as BufferSource });
  const keys = sub.toJSON().keys ?? {};
  const { rtdb } = getFirebase();
  if (!rtdb) throw new Error("Not connected");
  await set(ref(rtdb, `push/subs/${uid}/${await subId(sub.endpoint)}`), {
    endpoint: sub.endpoint, p256dh: keys.p256dh ?? "", auth: keys.auth ?? "", at: Date.now(), ua: navigator.userAgent.slice(0, 120),
  });
  return "on";
}

/** Forget this device: drop the account copy and the browser subscription. */
export async function disablePush(uid: string): Promise<PushStatus> {
  if (!pushSupported()) return "unsupported";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    const { rtdb } = getFirebase();
    if (rtdb) await remove(ref(rtdb, `push/subs/${uid}/${await subId(sub.endpoint)}`)).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return "off";
}

export function usePushStatus(uid: string | null) {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    if (!uid) return;
    getPushStatus(uid).then(setStatus);
  }, [uid]);
  useEffect(() => { refresh(); }, [refresh]);
  const enable = useCallback(async () => {
    if (!uid) return;
    setBusy(true); setError(null);
    try { setStatus(await enablePush(uid)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not turn notifications on."); }
    finally { setBusy(false); }
  }, [uid]);
  const disable = useCallback(async () => {
    if (!uid) return;
    setBusy(true); setError(null);
    try { setStatus(await disablePush(uid)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not turn notifications off."); }
    finally { setBusy(false); }
  }, [uid]);
  // no signed-in member (demo mode): nothing to register
  return { status: uid ? status : "off", busy, error, enable, disable, refresh };
}

export function usePushPrefs(uid: string | null): { prefs: PushPrefs; setPref: (k: PushKind, v: boolean) => Promise<void> } {
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT_PREFS);
  useEffect(() => {
    if (!uid) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    return onValue(ref(rtdb, `push/prefs/${uid}`), (s) => {
      const v = (s.val() as Partial<PushPrefs> | null) ?? {};
      setPrefs({ community: v.community !== false, dm: v.dm !== false, account: v.account !== false });
    }, () => {});
  }, [uid]);
  const setPref = useCallback(async (k: PushKind, v: boolean) => {
    if (!uid) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    await update(ref(rtdb, `push/prefs/${uid}`), { [k]: v });
  }, [uid]);
  return { prefs, setPref };
}

export async function pushTestSelf(): Promise<{ sent: number; removed: number }> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  const r = await httpsCallable<unknown, { sent: number; removed: number }>(functions, "pushTestSelf")({});
  return r.data;
}

// ── the "Turn on notifications" card: shown until turned on, "Not now" hides it for a week ──
const CARD_KEY = "investure.pushCardDismissedAt";
export function isPushCardDismissed(): boolean {
  try { return Date.now() - Number(localStorage.getItem(CARD_KEY) || 0) < 7 * 86_400_000; } catch { return false; }
}
export function dismissPushCard() {
  try { localStorage.setItem(CARD_KEY, String(Date.now())); } catch { /* private mode */ }
}
