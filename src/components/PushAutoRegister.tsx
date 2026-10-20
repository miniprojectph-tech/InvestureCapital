"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { enablePush, getPushStatus, needsInstall, pushSupported, isPushCardDismissed } from "@/lib/push";

const ASKED_KEY = "investure.pushAskedAt";
const ASK_AGAIN_DAYS = 7;

/**
 * Registers the device for push without the member having to find a setting:
 *   * if the phone already allows notifications, the device registers itself
 *     every time the app opens (covers reinstalls and new browsers);
 *   * otherwise the phone's own prompt opens on the member's first tap in the
 *     app (browsers only allow it from a tap). Declined or dismissed → the
 *     "Turn on notifications" card remains, and we ask again after a week.
 */
export function PushAutoRegister() {
  const { user, demoMode } = useAuth();
  const uid = user && !demoMode ? user.uid : null;

  useEffect(() => {
    if (!uid || !pushSupported() || needsInstall()) return;
    let cancelled = false;

    // already allowed: register quietly
    if (Notification.permission === "granted") {
      getPushStatus(uid).then((s) => { if (!cancelled && s === "off") enablePush(uid).catch(() => {}); });
      return () => { cancelled = true; };
    }
    if (Notification.permission !== "default") return;

    // not asked yet: ask on the first tap, at most once a week
    let asked = 0;
    try { asked = Number(localStorage.getItem(ASKED_KEY) || 0); } catch { /* private mode */ }
    if (Date.now() - asked < ASK_AGAIN_DAYS * 86_400_000 || isPushCardDismissed()) return;

    // "click" (not pointerdown): a touch pointerdown does not count as a user activation
    const onTap = () => {
      document.removeEventListener("click", onTap, true);
      try { localStorage.setItem(ASKED_KEY, String(Date.now())); } catch { /* private mode */ }
      // enablePush calls Notification.requestPermission() first, inside this tap
      enablePush(uid).catch(() => {});
    };
    document.addEventListener("click", onTap, true);
    return () => { cancelled = true; document.removeEventListener("click", onTap, true); };
  }, [uid]);

  return null;
}
