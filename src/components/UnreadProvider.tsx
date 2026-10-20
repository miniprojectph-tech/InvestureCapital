"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useNotifications } from "@/lib/compplan";
import {
  useRoomUnread,
  useInboxMeta,
  isInboxUnread,
  useMemberDmThreads,
  useLeaderDmThreads,
  useTeamLeaderRole,
  useChatModRole,
  useInboxNeedsReply,
  isDmUnread,
  UNREAD_CAP,
} from "@/lib/community";

export type Unread = {
  /** Community Room messages + direct messages + conversations waiting on you. */
  community: number;
  /** Unread bell notifications: payouts, withdrawals, events. */
  system: number;
  /** What the app icon and the tab title show. */
  total: number;
};

export const UnreadContext = createContext<Unread>({ community: 0, system: 0, total: 0 });

/** Counts for the badges anywhere in the member app. Zero outside the provider (admin pages). */
export function useUnread(): Unread {
  return useContext(UnreadContext);
}

/** "99+" style label for a badge. */
export function badgeLabel(n: number): string {
  return n > UNREAD_CAP ? `${UNREAD_CAP}+` : String(n);
}

/**
 * One place that knows what is unread, so the menu, the launcher, the chat
 * button, the tab title and the installed app's icon all show the same number.
 */
export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const { user, demoMode } = useAuth();
  const pathname = usePathname();
  const uid = user && !demoMode ? user.uid : null;

  const room = useRoomUnread(!!uid);
  const adminMeta = useInboxMeta(uid);
  const adminThread = isInboxUnread(adminMeta, "user") ? 1 : 0;
  const dmThreads = useMemberDmThreads(uid);
  const dms = dmThreads.filter((t) => isDmUnread(t, "member")).length;
  const tl = useTeamLeaderRole();
  const leaderThreads = useLeaderDmThreads(tl.isTL ? uid : null);
  const teamDms = leaderThreads.filter((t) => isDmUnread(t, "tl")).length;
  const mod = useChatModRole();
  const waiting = useInboxNeedsReply(!!uid && (!!user?.isAdmin || (mod.isMod && mod.inbox)));
  const { unread: system } = useNotifications(50);

  const value = useMemo<Unread>(() => {
    const community = room + adminThread + dms + teamDms + waiting;
    return { community, system, total: community + system };
  }, [room, adminThread, dms, teamDms, waiting, system]);

  // Tab title: "(3) Investure Capital"
  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = document.title.replace(/^\(\d+\+?\)\s*/, "");
    document.title = value.total > 0 ? `(${badgeLabel(value.total)}) ${base}` : base;
  }, [value.total, pathname]);

  // Installed app icon (Android, desktop, iPhone home-screen app with notifications allowed)
  useEffect(() => {
    const nav = typeof navigator === "undefined" ? null : (navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> });
    if (!nav?.setAppBadge) return;
    const apply = () => {
      try {
        (value.total > 0 ? nav.setAppBadge(value.total) : nav.clearAppBadge?.() ?? nav.setAppBadge(0))?.catch(() => {});
      } catch { /* not allowed here */ }
    };
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, [value.total]);

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}
