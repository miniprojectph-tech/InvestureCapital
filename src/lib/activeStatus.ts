"use client";

import { useEffect, useMemo, useState } from "react";
import { ref, onValue, onDisconnect, set, remove, serverTimestamp } from "firebase/database";
import { getFirebase } from "./firebase";
import { useAuth } from "./auth";

/**
 * Active status ("Active now" / "Away" / "Active 3h ago"), seen only by admins,
 * moderators with inbox access, and a Team Leader for members in their own
 * chats — the RTDB rules enforce that. Members never see anyone's status.
 *
 *   community/status/{uid}/conns/{conn} = { away, at }   one per open app, removed on disconnect
 *   community/status/{uid}/lastSeen     = ms              set when the last app closes
 *   community/statusPrefs/{uid}/hidden  = true            "Show my active status" switched off
 *
 * Separate from community/presence, which only feeds the "N active now" count.
 */

/** No touch, key or scroll for this long (or the app in the background) = away. */
export const AWAY_AFTER_MS = 10 * 60_000;

export type MemberStatus = { state: "active" | "away" | "offline"; since: number };
type RawStatus = { conns?: Record<string, { away?: boolean; at?: number }>; lastSeen?: number } | null;

export function statusFrom(raw: RawStatus): MemberStatus | null {
  if (!raw) return null;
  const conns = Object.values(raw.conns ?? {}).filter((c) => c && typeof c.at === "number");
  const live = conns.filter((c) => !c.away);
  if (live.length) return { state: "active", since: Math.max(...live.map((c) => c.at as number)) };
  if (conns.length) return { state: "away", since: Math.min(...conns.map((c) => c.at as number)) };
  if (typeof raw.lastSeen === "number") return { state: "offline", since: raw.lastSeen };
  return null;
}

/** Short line for lists: "Active now" · "Away · 12m" · "Active 3h ago" · "Active yesterday". */
export function statusText(s: MemberStatus | null | undefined, now: number, long = false): string {
  if (!s) return "";
  if (s.state === "active") return "Active now";
  const mins = Math.max(0, Math.floor((now - s.since) / 60_000));
  if (s.state === "away") return long ? `Away · last active ${mins < 1 ? "just now" : `${mins} minute${mins === 1 ? "" : "s"} ago`}` : mins < 1 ? "Away" : `Away · ${ago(mins)}`;
  if (mins < 1) return "Active just now";
  if (mins >= 60 * 24 && mins < 60 * 48) return "Active yesterday";
  if (mins >= 60 * 48) {
    return `Active ${new Date(s.since).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" })}`;
  }
  return long ? `Active ${longAgo(mins)} ago` : `Active ${ago(mins)} ago`;
}
const ago = (mins: number) => (mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`);
const longAgo = (mins: number) => (mins < 60 ? `${mins} minute${mins === 1 ? "" : "s"}` : `${Math.floor(mins / 60)} hour${Math.floor(mins / 60) === 1 ? "" : "s"}`);

/**
 * Member app: report this device as active or away. Mounted once in the member
 * layout. Writes only when the state changes; removes itself when the app
 * closes (and stamps lastSeen). Does nothing while the member has hidden it.
 */
export function useActiveStatusReporter() {
  const { user, demoMode } = useAuth();
  const uid = user && !demoMode ? user.uid : null;
  const hidden = useStatusHidden(uid);

  useEffect(() => {
    if (!uid || hidden === null) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    const base = `community/status/${uid}`;
    if (hidden) {
      // hidden: nothing about this member stays readable
      remove(ref(rtdb, base)).catch(() => {});
      return;
    }
    const conn = Math.random().toString(36).slice(2, 10);
    const connRef = ref(rtdb, `${base}/conns/${conn}`);
    const lastRef = ref(rtdb, `${base}/lastSeen`);
    let lastInput = Date.now();
    let away: boolean | null = null;
    let connected = false;

    const isAway = () => document.visibilityState === "hidden" || Date.now() - lastInput > AWAY_AFTER_MS;
    const publish = (force = false) => {
      const next = isAway();
      if (!connected || (!force && next === away)) return;
      away = next;
      set(connRef, { away: next, at: serverTimestamp() }).catch(() => {});
    };
    const onInput = () => {
      lastInput = Date.now();
      if (away) publish();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") lastInput = Date.now();
      publish();
    };

    const unsub = onValue(ref(rtdb, ".info/connected"), (s) => {
      connected = s.val() === true;
      if (!connected) return;
      onDisconnect(connRef).remove().catch(() => {});
      onDisconnect(lastRef).set(serverTimestamp()).catch(() => {});
      publish(true);
    });
    const tick = setInterval(() => publish(), 30_000);
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener("pointerdown", onInput, opts);
    window.addEventListener("keydown", onInput, opts);
    window.addEventListener("scroll", onInput, opts);
    window.addEventListener("touchstart", onInput, opts);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      unsub();
      clearInterval(tick);
      window.removeEventListener("pointerdown", onInput);
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("scroll", onInput);
      window.removeEventListener("touchstart", onInput);
      document.removeEventListener("visibilitychange", onVisible);
      remove(connRef).catch(() => {});
      set(lastRef, serverTimestamp()).catch(() => {});
    };
  }, [uid, hidden]);
}

/** The member's own "Show my active status" switch (null while loading). */
export function useStatusHidden(uid: string | null): boolean | null {
  const [state, setState] = useState<{ uid: string; hidden: boolean } | null>(null);
  useEffect(() => {
    if (!uid) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    return onValue(ref(rtdb, `community/statusPrefs/${uid}/hidden`), (s) => setState({ uid, hidden: s.val() === true }), () => setState({ uid, hidden: false }));
  }, [uid]);
  return uid && state?.uid === uid ? state.hidden : null;
}
export function setStatusHidden(uid: string, hidden: boolean) {
  const { rtdb } = getFirebase();
  if (!rtdb) return Promise.reject(new Error("Not connected."));
  return hidden ? set(ref(rtdb, `community/statusPrefs/${uid}`), { hidden: true }) : remove(ref(rtdb, `community/statusPrefs/${uid}`));
}

/** Admins and inbox moderators: everyone's status, one listener (only while the Inbox is open). */
export function useAllMemberStatuses(enabled: boolean): Record<string, MemberStatus> {
  const [map, setMap] = useState<Record<string, MemberStatus>>({});
  useEffect(() => {
    if (!enabled) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    return onValue(ref(rtdb, "community/status"), (s) => {
      const v = (s.val() as Record<string, RawStatus> | null) ?? {};
      const next: Record<string, MemberStatus> = {};
      for (const [uid, raw] of Object.entries(v)) { const st = statusFrom(raw); if (st) next[uid] = st; }
      setMap(next);
    }, () => setMap({}));
  }, [enabled]);
  return enabled ? map : {};
}

/** Team Leaders: the status of the members they chat with, one listener each. */
export function useMemberStatuses(uids: string[]): Record<string, MemberStatus> {
  const key = [...new Set(uids)].sort().join(",");
  const [map, setMap] = useState<Record<string, MemberStatus>>({});
  useEffect(() => {
    if (!key) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    const unsubs = key.split(",").map((uid) =>
      onValue(ref(rtdb, `community/status/${uid}`), (s) => {
        const st = statusFrom(s.val() as RawStatus);
        setMap((prev) => {
          if (!st) { if (!(uid in prev)) return prev; const n = { ...prev }; delete n[uid]; return n; }
          const cur = prev[uid];
          return cur && cur.state === st.state && cur.since === st.since ? prev : { ...prev, [uid]: st };
        });
      }, () => {}),
    );
    return () => { for (const u of unsubs) u(); };
  }, [key]);
  return useMemo(() => {
    if (!key) return {};
    const allowed = new Set(key.split(","));
    return Object.fromEntries(Object.entries(map).filter(([uid]) => allowed.has(uid)));
  }, [map, key]);
}
