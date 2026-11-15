"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useUserState } from "@/lib/useUserState";
import { deviceId, recordSession } from "@/lib/moderation";

/**
 * Member app, renders nothing:
 *  - once a day per device, notes this session (IP + device) so admins can spot a
 *    banned person's new accounts;
 *  - when an admin bans this account, signs it out at once (the sign-in screen then
 *    shows the suspended message).
 */
export function AccountGuard() {
  const { user, demoMode, signOut } = useAuth();
  const { state } = useUserState();
  const uid = user && !demoMode ? user.uid : null;
  const banned = !!(state as { banned?: unknown } | null)?.banned;

  useEffect(() => {
    if (!uid) return;
    try {
      const key = `investure.session.${uid}`;
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(key) === today) return;
      recordSession(deviceId()).then(() => localStorage.setItem(key, today)).catch(() => {});
    } catch {
      /* private mode: skip */
    }
  }, [uid]);

  useEffect(() => {
    if (!uid || !banned || !user) return;
    try { sessionStorage.setItem("investure.bannedEmail", user.email); } catch { /* ignore */ }
    signOut().catch(() => {});
  }, [uid, banned, user, signOut]);

  return null;
}
