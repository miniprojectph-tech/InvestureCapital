"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ref,
  onValue,
  query as rtdbQuery,
  orderByChild,
  limitToLast,
  startAt,
  endBefore,
  push,
  update,
  remove,
  set,
  get,
  onDisconnect,
  serverTimestamp,
} from "firebase/database";
import { httpsCallable } from "firebase/functions";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  type FirebaseStorage,
} from "firebase/storage";
import { getFirebase } from "./firebase";
import { useAuth } from "./auth";

// Community chat lives in Realtime Database (bandwidth-priced, not per-read).
// Clients write directly under rules — see database.rules.json — and media goes
// to Storage under /community/{uid}/ after being compressed on-device.

export type ChatKind = "text" | "image" | "video" | "sticker";

/** Quoted message a reply points at (a snapshot, so it survives deletion). */
export type ReplyRef = { id: string; name: string; text?: string };

/** One reaction per member per message, keyed by uid → emoji (Messenger style). */
export type Reactions = Record<string, string>;

export type ChatMedia = {
  url: string;
  thumb?: string;
  poster?: string;
  original?: string;
  w?: number;
  h?: number;
  duration?: number;
};

/** Normalised message used by the chat UI for both the room and inboxes. */
export type ChatItem = {
  id: string;
  senderId: string; // uid, or "admin" for admin replies in an inbox
  name: string;
  kind: ChatKind;
  text?: string;
  media?: ChatMedia;
  at: number;
  admin: boolean;
  /** Posted by a chat moderator (shows a "Mod" tag instead of "Admin"). */
  mod?: boolean;
  /** "<pack>/<id>" for kind "sticker" — see lib/stickers.ts. */
  sticker?: string;
  replyTo?: ReplyRef;
  reactions?: Reactions;
};

/** A member granted chat-only moderator powers by a full admin. */
export type ChatMod = { uid: string; name: string; at: number; inbox: boolean };

export type InboxMeta = {
  uid: string;
  name: string;
  email?: string;
  lastAt: number;
  lastText: string;
  lastFrom: string;
  userReadAt?: number;
  adminReadAt?: number;
};

export type MutedUser = { uid: string; name: string; at: number };

export const MAX_TEXT = 500;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 30;
export const MAX_GIF_BYTES = 3 * 1024 * 1024;

/** isAdmin = full app admin; isMod = chat-only moderator (see ChatMod). */
export type Sender = { uid: string; name: string; isAdmin: boolean; isMod?: boolean };
export type SendPayload = { kind: ChatKind; text?: string; media?: ChatMedia; sticker?: string; replyTo?: ReplyRef };

type RawCommon = { kind: ChatKind; text?: string; media?: ChatMedia; at: number; sticker?: string; replyTo?: ReplyRef; re?: Reactions };
type RawRoom = RawCommon & { uid: string; name: string; admin?: boolean; mod?: boolean };
type RawInbox = RawCommon & { from: string; name: string };

// ===== Hooks =====

const roomToItem = (id: string, raw: unknown): ChatItem => {
  const m = raw as RawRoom;
  return { id, senderId: m.uid, name: m.name, kind: m.kind, text: m.text, media: m.media, at: m.at, admin: !!m.admin, mod: !!m.mod, sticker: m.sticker, replyTo: m.replyTo, reactions: m.re };
};

const inboxToItem = (id: string, raw: unknown): ChatItem => {
  const m = raw as RawInbox;
  return { id, senderId: m.from, name: m.name, kind: m.kind, text: m.text, media: m.media, at: m.at, admin: m.from === "admin", sticker: m.sticker, replyTo: m.replyTo, reactions: m.re };
};

const byTime = (a: ChatItem, b: ChatItem) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** How many messages the live listener holds, and how many each scroll-back fetches. */
const LIVE_WINDOW = 50;
const PAGE_SIZE = 50;

export type PagedMessages = {
  messages: ChatItem[];
  loading: boolean;
  /** True while older history exists beyond what's loaded. */
  hasMore: boolean;
  loadingOlder: boolean;
  loadOlder: () => void;
};

/**
 * History is kept forever, so nothing loads it all: a live listener holds the
 * newest LIVE_WINDOW messages and `loadOlder` pages further back on demand.
 *
 * `since`: undefined = not ready yet, null = no lower bound (staff / private
 * threads), number = the member's join date. Room rules only support EQUALITY
 * on query.startAt, so a member's every query starts exactly at that date.
 */
function usePagedMessages(
  path: string | null,
  since: number | null | undefined,
  toItem: (id: string, raw: unknown) => ChatItem,
): PagedMessages {
  const store = useRef(new Map<string, ChatItem>());
  const busy = useRef(false);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // A denied read cancels the listener for good, so re-subscribe a few times —
  // covers an admin/moderator whose RTDB flag lands just after the first try.
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    store.current = new Map();
    setVersion((v) => v + 1);
    setHasMore(false);
    if (!path || since === undefined) return;
    const { rtdb } = getFirebase();
    if (!rtdb) { setLoading(false); return; }
    setLoading(true);

    const bounds = since === null ? [] : [startAt(since)];
    const q = rtdbQuery(ref(rtdb, path), orderByChild("at"), ...bounds, limitToLast(LIVE_WINDOW));
    let first = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const unsub = onValue(
      q,
      (snap) => {
        const val = (snap.val() as Record<string, unknown> | null) ?? {};
        const items = Object.entries(val).map(([id, raw]) => toItem(id, raw));
        const ids = new Set(items.map((i) => i.id));
        if (items.length === 0) {
          store.current.clear();
        } else {
          // Inside the live window, anything missing from the snapshot was
          // deleted. Older entries (paged in, or scrolled out) are kept.
          const minAt = Math.min(...items.map((i) => i.at));
          for (const [id, it] of store.current) if (it.at >= minAt && !ids.has(id)) store.current.delete(id);
          for (const it of items) store.current.set(it.id, it);
        }
        if (first) {
          setHasMore(items.length >= LIVE_WINDOW);
          first = false;
        }
        setVersion((v) => v + 1);
        setLoading(false);
      },
      () => {
        setLoading(false);
        if (retry < 3) retryTimer = setTimeout(() => setRetry((r) => r + 1), 1500);
      },
    );
    return () => {
      unsub();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [path, since, toItem, retry]);

  const loadOlder = useCallback(() => {
    if (!path || since === undefined || busy.current || !hasMore) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    const oldest = [...store.current.values()].sort(byTime)[0];
    if (!oldest) return;
    busy.current = true;
    setLoadingOlder(true);
    const bounds = since === null ? [] : [startAt(since)];
    const q = rtdbQuery(ref(rtdb, path), orderByChild("at"), ...bounds, endBefore(oldest.at, oldest.id), limitToLast(PAGE_SIZE));
    get(q)
      .then((snap) => {
        const val = (snap.val() as Record<string, unknown> | null) ?? {};
        const items = Object.entries(val).map(([id, raw]) => toItem(id, raw));
        for (const it of items) store.current.set(it.id, it);
        setHasMore(items.length >= PAGE_SIZE);
        setVersion((v) => v + 1);
      })
      .catch(() => setHasMore(false))
      .finally(() => {
        busy.current = false;
        setLoadingOlder(false);
      });
  }, [path, since, hasMore, toItem]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const messages = useMemo(() => [...store.current.values()].sort(byTime), [version]);
  return { messages, loading, hasMore, loadingOlder, loadOlder };
}

/**
 * The Community Room. Members only see messages posted on or after the day
 * they signed up (enforced by rules via `members/{uid}/joinedAt`); pass
 * `all = true` for staff, who may read the full history.
 */
export function useCommunityRoom(all = false): PagedMessages {
  const { user } = useAuth();
  const [joined, setJoined] = useState<number | null>(null);
  const [mirrorFailed, setMirrorFailed] = useState(false);

  // Resolve the member's join date (server-mirrored) before querying.
  useEffect(() => {
    if (!user || all) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    return onValue(ref(rtdb, `members/${user.uid}/joinedAt`), (s) => {
      const v = s.val();
      if (typeof v === "number") setJoined(v);
      // First visit — the mirror write re-fires this listener. If the mirror
      // can't be created, stop the spinner rather than hang.
      else ensureCommunityMember().then((j) => { if (j === null) setMirrorFailed(true); });
    });
  }, [user, all]);

  const since = !user ? undefined : all ? null : joined ?? undefined;
  const paged = usePagedMessages(user ? "community/room" : null, since, roomToItem);
  return { ...paged, loading: paged.loading && !mirrorFailed };
}

/** Mirrors the member's sign-up date into RTDB so the room can hide older history. */
export function ensureCommunityMember(): Promise<number | null> {
  const { functions } = getFirebase();
  if (!functions) return Promise.resolve(null);
  return httpsCallable<unknown, { ok: boolean; joinedAt: number }>(functions, "ensureCommunityMember")({})
    .then((r) => r.data.joinedAt)
    .catch(() => null);
}

/** The signed-in user's chat-moderator grant, if any. */
export function useChatModRole(): { isMod: boolean; inbox: boolean } {
  const { user } = useAuth();
  const [role, setRole] = useState({ isMod: false, inbox: false });
  useEffect(() => {
    if (!user) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    return onValue(ref(rtdb, `chatMods/${user.uid}`), (s) => {
      const v = s.val() as { inbox?: boolean } | null;
      setRole({ isMod: !!v, inbox: !!v?.inbox });
    });
  }, [user]);
  return role;
}

/** Admin only — every chat moderator. */
export function useChatMods(enabled: boolean): ChatMod[] {
  const { user } = useAuth();
  const [list, setList] = useState<ChatMod[]>([]);
  useEffect(() => {
    if (!user || !enabled) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    return onValue(ref(rtdb, "chatMods"), (s) => {
      const val = (s.val() as Record<string, { name?: string; at?: number; inbox?: boolean }> | null) ?? {};
      setList(
        Object.entries(val)
          .map(([uid, v]) => ({ uid, name: v.name ?? uid, at: v.at ?? 0, inbox: !!v.inbox }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    });
  }, [user, enabled]);
  return list;
}

export function addChatMod(uid: string, name: string, inbox: boolean) {
  return set(ref(needRtdb(), `chatMods/${uid}`), { name: name.slice(0, 40), at: serverTimestamp(), inbox });
}

export function setChatModInbox(uid: string, inbox: boolean) {
  return set(ref(needRtdb(), `chatMods/${uid}/inbox`), inbox);
}

export function removeChatMod(uid: string) {
  return remove(ref(needRtdb(), `chatMods/${uid}`));
}

/** The admin-pinned room message (fetched directly if it scrolled out of the window). */
export function usePinnedMessage(messages: ChatItem[]): ChatItem | null {
  const { user } = useAuth();
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [fetched, setFetched] = useState<ChatItem | null>(null);

  useEffect(() => {
    if (!user) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    return onValue(ref(rtdb, "community/pinned"), (s) => setPinnedId((s.val() as string | null) ?? null));
  }, [user]);

  const inList = pinnedId ? messages.find((m) => m.id === pinnedId) ?? null : null;

  useEffect(() => {
    if (!pinnedId || inList) { setFetched(null); return; }
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    let cancelled = false;
    get(ref(rtdb, `community/room/${pinnedId}`)).then((s) => {
      if (cancelled) return;
      const m = s.val() as RawRoom | null;
      setFetched(
        m
          ? { id: pinnedId, senderId: m.uid, name: m.name, kind: m.kind, text: m.text, media: m.media, at: m.at, admin: !!m.admin }
          : null,
      );
    });
    return () => { cancelled = true; };
  }, [pinnedId, inList]);

  return inList ?? fetched;
}

export function useIsMuted(): boolean {
  const { user } = useAuth();
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    if (!user) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    return onValue(ref(rtdb, `community/muted/${user.uid}`), (s) => setMuted(s.exists()));
  }, [user]);
  return muted;
}

/** Staff only — everyone currently muted in the room. */
export function useMutedUsers(enabled: boolean): MutedUser[] {
  const { user } = useAuth();
  const [list, setList] = useState<MutedUser[]>([]);
  useEffect(() => {
    if (!user || !enabled) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    return onValue(ref(rtdb, "community/muted"), (s) => {
      const val = (s.val() as Record<string, { name?: string; at?: number }> | null) ?? {};
      setList(
        Object.entries(val)
          .map(([uid, v]) => ({ uid, name: v.name ?? uid, at: v.at ?? 0 }))
          .sort((a, b) => b.at - a.at),
      );
    });
  }, [user, enabled]);
  return list;
}

/** A member ↔ admin private thread. Kept forever; pages back like the room. */
export function useInbox(threadUid: string | null): PagedMessages {
  const { user } = useAuth();
  return usePagedMessages(user && threadUid ? `community/inbox/${threadUid}` : null, null, inboxToItem);
}

// ===== Storage stats (admin) =====

export type CommunityStats = {
  roomMessages: number;
  mediaFiles: number | null;
  mediaBytes: number | null;
  updatedAt: number;
};

/** Staff only — message/media totals maintained by a daily Cloud Function. */
export function useCommunityStats(enabled: boolean): CommunityStats | null {
  const { user } = useAuth();
  const [stats, setStats] = useState<CommunityStats | null>(null);
  useEffect(() => {
    if (!user || !enabled) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    return onValue(ref(rtdb, "community/stats"), (s) => setStats((s.val() as CommunityStats | null) ?? null), () => {});
  }, [user, enabled]);
  return stats;
}

export function refreshCommunityStats(): Promise<CommunityStats> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Firebase not initialized");
  return httpsCallable<unknown, CommunityStats>(functions, "refreshCommunityStats")({}).then((r) => r.data);
}

export function useInboxMeta(threadUid: string | null): InboxMeta | null {
  const { user } = useAuth();
  const [meta, setMeta] = useState<InboxMeta | null>(null);
  useEffect(() => {
    if (!user || !threadUid) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    return onValue(ref(rtdb, `community/inboxMeta/${threadUid}`), (s) => {
      const v = s.val() as Omit<InboxMeta, "uid"> | null;
      setMeta(v && v.lastAt ? { ...v, uid: threadUid } : null);
    });
  }, [user, threadUid]);
  return meta;
}

/** Inbox staff only — every member thread, newest activity first. */
export function useInboxList(enabled: boolean): InboxMeta[] {
  const { user } = useAuth();
  const [list, setList] = useState<InboxMeta[]>([]);
  useEffect(() => {
    if (!user || !enabled) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    return onValue(ref(rtdb, "community/inboxMeta"), (s) => {
      const val = (s.val() as Record<string, Omit<InboxMeta, "uid">> | null) ?? {};
      setList(
        Object.entries(val)
          .filter(([, v]) => !!v.lastAt)
          .map(([uid, v]) => ({ ...v, uid }))
          .sort((a, b) => b.lastAt - a.lastAt),
      );
    });
  }, [user, enabled]);
  return list;
}

export function isInboxUnread(meta: InboxMeta | null, who: "user" | "admin"): boolean {
  if (!meta) return false;
  const readAt = (who === "user" ? meta.userReadAt : meta.adminReadAt) ?? 0;
  const fromOther = who === "user" ? meta.lastFrom === "admin" : meta.lastFrom !== "admin";
  return fromOther && meta.lastAt > readAt;
}

// ===== Actions =====

function needRtdb() {
  const { rtdb } = getFirebase();
  if (!rtdb) throw new Error("Chat is unavailable in demo mode.");
  return rtdb;
}

function previewText(p: SendPayload): string {
  if (p.text?.trim()) return p.text.trim().slice(0, 120);
  return p.kind === "image" ? "📷 Photo" : p.kind === "video" ? "🎬 Video" : p.kind === "sticker" ? "Sticker" : "";
}

/** The optional fields shared by room and inbox messages. */
function optionalFields(payload: SendPayload, maxText: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const text = payload.text?.trim();
  if (text) out.text = text.slice(0, maxText);
  if (payload.media) out.media = payload.media;
  if (payload.kind === "sticker" && payload.sticker) out.sticker = payload.sticker;
  if (payload.replyTo) {
    const r: ReplyRef = { id: payload.replyTo.id.slice(0, 40), name: payload.replyTo.name.slice(0, 40) };
    if (payload.replyTo.text) r.text = payload.replyTo.text.slice(0, 120);
    out.replyTo = r;
  }
  return out;
}

export async function sendRoomMessage(sender: Sender, payload: SendPayload): Promise<void> {
  const rtdb = needRtdb();
  const id = push(ref(rtdb, "community/room")).key;
  if (!id) throw new Error("Couldn't create message");
  const msg: Record<string, unknown> = {
    uid: sender.uid,
    name: sender.name.slice(0, 40),
    kind: payload.kind,
    at: serverTimestamp(),
    ...optionalFields(payload, MAX_TEXT),
  };
  if (sender.isAdmin || sender.isMod) msg.admin = true;
  if (sender.isMod && !sender.isAdmin) msg.mod = true;
  await update(ref(rtdb), {
    [`community/room/${id}`]: msg,
    [`community/lastPost/${sender.uid}`]: serverTimestamp(),
    [`community/typing/${sender.uid}`]: null,
  });
}

/** Add, change, or clear (emoji = null) the caller's reaction on a room message. */
export function reactToRoomMessage(msgId: string, uid: string, emoji: string | null) {
  const r = ref(needRtdb(), `community/room/${msgId}/re/${uid}`);
  return emoji ? set(r, emoji) : remove(r);
}

export function reactToInboxMessage(threadUid: string, msgId: string, uid: string, emoji: string | null) {
  const r = ref(needRtdb(), `community/inbox/${threadUid}/${msgId}/re/${uid}`);
  return emoji ? set(r, emoji) : remove(r);
}

/** Summarise reactions for display: emoji → count, plus the caller's own. */
export function summarizeReactions(reactions: Reactions | undefined, meUid: string): { list: { emoji: string; count: number }[]; mine: string | undefined; total: number } {
  const counts = new Map<string, number>();
  for (const e of Object.values(reactions ?? {})) counts.set(e, (counts.get(e) ?? 0) + 1);
  const list = [...counts.entries()].map(([emoji, count]) => ({ emoji, count })).sort((a, b) => b.count - a.count);
  return { list, mine: reactions?.[meUid], total: Object.keys(reactions ?? {}).length };
}

/** "Today 9:15 AM", "Yesterday 3:02 PM", "Sep 21, 10:00 AM" — the separator between gaps. */
export function formatChatStamp(at: number): string {
  const day = formatChatDay(at);
  const time = formatChatTime(at);
  return day === "Today" || day === "Yesterday" ? `${day} ${time}` : `${day}, ${time}`;
}

// ===== Typing indicators & presence =====

const TYPING_TTL = 5_000;

/** Path for who-is-typing: the room, or a private thread (who = uid or "admin"). */
function typingPath(scope: { room: true } | { thread: string }): string {
  return "room" in scope ? "community/typing" : `community/inboxTyping/${scope.thread}`;
}

/**
 * Write "I'm typing" at most every 2 s while the composer is active and clear
 * it on send/blur. Tiny writes (name + timestamp); readers drop stale entries.
 */
export function useTypingSignal(scope: { room: true } | { thread: string } | null, who: string, name: string) {
  const last = useRef(0);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useCallback(() => {
    if (!scope) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    if (clearTimer.current) clearTimeout(clearTimer.current);
    last.current = 0;
    remove(ref(rtdb, `${typingPath(scope)}/${who}`)).catch(() => {});
  }, [scope, who]);
  const ping = useCallback(() => {
    if (!scope) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    const now = Date.now();
    if (now - last.current > 2_000) {
      last.current = now;
      set(ref(rtdb, `${typingPath(scope)}/${who}`), { name: name.slice(0, 40), at: serverTimestamp() }).catch(() => {});
    }
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(stop, TYPING_TTL);
  }, [scope, who, name, stop]);
  useEffect(() => stop, [stop]);
  return { ping, stop };
}

/** Names of the other people typing right now (stale entries ignored). */
export function useTypingNames(scope: { room: true } | { thread: string } | null, exclude: string): string[] {
  const { user } = useAuth();
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (!user || !scope) { setNames([]); return; }
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    let tick: ReturnType<typeof setInterval> | null = null;
    let latest: Record<string, { name?: string; at?: number }> = {};
    const compute = () => {
      const cutoff = Date.now() - TYPING_TTL - 1_000;
      setNames(
        Object.entries(latest)
          .filter(([who, v]) => who !== exclude && typeof v?.at === "number" && v.at > cutoff)
          .map(([, v]) => v.name ?? "Someone")
          .slice(0, 3),
      );
    };
    const unsub = onValue(
      ref(rtdb, typingPath(scope)),
      (s) => { latest = (s.val() as typeof latest | null) ?? {}; compute(); },
      () => setNames([]),
    );
    tick = setInterval(compute, 2_000);
    return () => { unsub(); if (tick) clearInterval(tick); };
  }, [user, scope, exclude]);
  return names;
}

/**
 * Presence: `community/presence/{uid}/{connectionId} = timestamp`, removed by
 * the server when the socket drops. A 5-minute Cloud Function counts distinct
 * uids into `community/online` so clients never download the whole node.
 */
export function usePresence(enabled: boolean) {
  const { user } = useAuth();
  useEffect(() => {
    if (!user || !enabled) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    const conn = Math.random().toString(36).slice(2, 10);
    const mine = ref(rtdb, `community/presence/${user.uid}/${conn}`);
    const unsub = onValue(ref(rtdb, ".info/connected"), (s) => {
      if (s.val() !== true) return;
      onDisconnect(mine).remove().then(() => set(mine, serverTimestamp())).catch(() => {});
    });
    return () => {
      unsub();
      remove(mine).catch(() => {});
    };
  }, [user, enabled]);
}

export function useOnlineCount(): number | null {
  const { user } = useAuth();
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (!user) return;
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    return onValue(ref(rtdb, "community/online"), (s) => setN(typeof s.val() === "number" ? s.val() : null), () => setN(null));
  }, [user]);
  return n;
}

export function deleteRoomMessage(id: string) {
  return remove(ref(needRtdb(), `community/room/${id}`));
}

export function setPinnedMessage(id: string | null) {
  const rtdb = needRtdb();
  return id ? set(ref(rtdb, "community/pinned"), id) : remove(ref(rtdb, "community/pinned"));
}

export function muteUser(uid: string, name: string) {
  return set(ref(needRtdb(), `community/muted/${uid}`), { name: name.slice(0, 40), at: serverTimestamp() });
}

export function unmuteUser(uid: string) {
  return remove(ref(needRtdb(), `community/muted/${uid}`));
}

export async function sendInboxMessage(
  threadUid: string,
  sender: Sender,
  payload: SendPayload,
  threadOwner?: { name: string; email?: string },
): Promise<void> {
  const rtdb = needRtdb();
  const id = push(ref(rtdb, `community/inbox/${threadUid}`)).key;
  if (!id) throw new Error("Couldn't create message");
  const staff = sender.isAdmin || !!sender.isMod;
  const from = staff ? "admin" : sender.uid;
  const msg: Record<string, unknown> = {
    from,
    name: (sender.isAdmin ? "Admin" : sender.isMod ? "Moderator" : sender.name).slice(0, 40),
    kind: payload.kind,
    at: serverTimestamp(),
    ...optionalFields(payload, 1000),
  };

  const metaBase = `community/inboxMeta/${threadUid}`;
  const upd: Record<string, unknown> = {
    [`community/inbox/${threadUid}/${id}`]: msg,
    [`community/inboxTyping/${threadUid}/${from}`]: null,
    [`${metaBase}/lastAt`]: serverTimestamp(),
    [`${metaBase}/lastText`]: previewText(payload),
    [`${metaBase}/lastFrom`]: from,
  };
  // The member owns the thread's display name; staff replies never overwrite it.
  if (!staff) {
    upd[`${metaBase}/name`] = sender.name.slice(0, 40);
    if (threadOwner?.email) upd[`${metaBase}/email`] = threadOwner.email;
    upd[`${metaBase}/userReadAt`] = serverTimestamp();
  } else {
    upd[`${metaBase}/adminReadAt`] = serverTimestamp();
  }
  await update(ref(rtdb), upd);
}

export function deleteInboxMessage(threadUid: string, id: string) {
  return remove(ref(needRtdb(), `community/inbox/${threadUid}/${id}`));
}

export function markInboxRead(threadUid: string, who: "user" | "admin") {
  const { rtdb } = getFirebase();
  if (!rtdb) return Promise.resolve();
  return set(ref(rtdb, `community/inboxMeta/${threadUid}/${who}ReadAt`), serverTimestamp());
}

/** Mirrors the caller's Firestore isAdmin flag into RTDB so rules grant moderator powers. */
export function ensureCommunityAdmin(): Promise<boolean> {
  const { functions } = getFirebase();
  if (!functions) return Promise.resolve(false);
  return httpsCallable<unknown, { ok: boolean; isAdmin: boolean }>(functions, "ensureCommunityAdmin")({})
    .then((r) => r.data.isAdmin)
    .catch(() => false);
}

// ===== Media (compressed on-device before upload) =====

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality));
}

async function decodeImage(file: File) {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
      return { src: bmp as CanvasImageSource, w: bmp.width, h: bmp.height, cleanup: () => bmp.close() };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Couldn't read this image"));
    i.src = url;
  });
  return { src: img as CanvasImageSource, w: img.naturalWidth, h: img.naturalHeight, cleanup: () => URL.revokeObjectURL(url) };
}

async function encodeResized(
  src: CanvasImageSource,
  w: number,
  h: number,
  maxEdge: number,
  quality: number,
  preferPng: boolean,
) {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(src, 0, 0, tw, th);
  let blob = await toBlob(canvas, "image/webp", quality);
  let ext = "webp";
  if (!blob || blob.type !== "image/webp") {
    // Safari can't encode WebP — fall back without losing transparency for PNGs.
    blob = preferPng ? await toBlob(canvas, "image/png", 1) : await toBlob(canvas, "image/jpeg", Math.min(1, quality + 0.05));
    ext = preferPng ? "png" : "jpg";
  }
  if (!blob) throw new Error("Couldn't process image");
  return { blob, w: tw, h: th, ext };
}

async function putBlob(storage: FirebaseStorage, path: string, blob: Blob, contentType: string) {
  const r = storageRef(storage, path);
  await uploadBytes(r, blob, { contentType });
  return getDownloadURL(r);
}

/**
 * Compress an image on-device (≈400 KB display + ≈30 KB thumbnail) and upload.
 * `keepOriginal` (admin) also stores the untouched file for "view full quality".
 */
export async function uploadChatImage(
  storage: FirebaseStorage,
  uid: string,
  file: File,
  opts: { keepOriginal: boolean; folder?: string },
): Promise<ChatMedia> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Only PNG, JPG, WebP, or GIF images are allowed");
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`Image too large (max ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`);
  const base = `${opts.folder ?? `community/${uid}`}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // GIFs stay as-is so they keep animating (small cap since they aren't compressed).
  if (file.type === "image/gif") {
    if (file.size > MAX_GIF_BYTES) throw new Error(`GIFs must be under ${MAX_GIF_BYTES / 1024 / 1024} MB`);
    const url = await putBlob(storage, `${base}.gif`, file, "image/gif");
    return { url, thumb: url };
  }

  const img = await decodeImage(file);
  try {
    const preferPng = file.type === "image/png";
    const [display, thumb] = await Promise.all([
      encodeResized(img.src, img.w, img.h, 1600, 0.82, preferPng),
      encodeResized(img.src, img.w, img.h, 480, 0.72, preferPng),
    ]);
    const [url, thumbUrl] = await Promise.all([
      putBlob(storage, `${base}-d.${display.ext}`, display.blob, display.blob.type),
      putBlob(storage, `${base}-t.${thumb.ext}`, thumb.blob, thumb.blob.type),
    ]);
    const media: ChatMedia = { url, thumb: thumbUrl, w: display.w, h: display.h };
    if (opts.keepOriginal) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      media.original = await putBlob(storage, `${base}-o.${ext}`, file, file.type);
    }
    return media;
  } finally {
    img.cleanup();
  }
}

/** Admin-only: short video (≤15 MB, ≤30 s) with a generated poster frame. */
export async function uploadChatVideo(
  storage: FirebaseStorage,
  uid: string,
  file: File,
  opts: { folder?: string; maxBytes?: number; maxSeconds?: number } = {},
): Promise<ChatMedia> {
  const maxBytes = opts.maxBytes ?? MAX_VIDEO_BYTES;
  const maxSeconds = opts.maxSeconds ?? MAX_VIDEO_SECONDS;
  if (!VIDEO_TYPES.includes(file.type)) throw new Error("Only MP4, WebM, or MOV videos are allowed");
  if (file.size > maxBytes) throw new Error(`Video too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)`);

  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.preload = "metadata";
  v.muted = true;
  v.playsInline = true;
  v.src = url;
  try {
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => rej(new Error("Couldn't read this video"));
    });
    const duration = v.duration;
    if (!isFinite(duration) || duration > maxSeconds + 0.5) {
      throw new Error(maxSeconds >= 60 ? `Videos must be ${Math.round(maxSeconds / 60)} minute${maxSeconds >= 120 ? "s" : ""} or shorter` : `Videos must be ${maxSeconds} seconds or shorter`);
    }
    const w = v.videoWidth;
    const h = v.videoHeight;
    await new Promise<void>((res) => {
      v.onseeked = () => res();
      v.currentTime = Math.min(0.5, Math.max(0, duration / 2));
    });
    const poster = await encodeResized(v, w, h, 800, 0.8, false);
    const base = `${opts.folder ?? `community/${uid}`}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const ext = file.type === "video/webm" ? "webm" : file.type === "video/quicktime" ? "mov" : "mp4";
    const [videoUrl, posterUrl] = await Promise.all([
      putBlob(storage, `${base}.${ext}`, file, file.type),
      putBlob(storage, `${base}-p.${poster.ext}`, poster.blob, poster.blob.type),
    ]);
    return { url: videoUrl, poster: posterUrl, w, h, duration: Math.round(duration) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ===== Helpers =====

const YT_RE = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

// Mirrors the link check in database.rules.json — members can't post links in
// the public room; this gives them a friendly error before the rules reject it.
const LINK_RE = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|me|ly|co|ph|app|xyz|link|site|online|shop|gl|to|tv|info|biz))/i;

export function containsLink(text: string | undefined): boolean {
  return !!text && LINK_RE.test(text);
}

export function youtubeId(text: string | undefined): string | null {
  if (!text) return null;
  const m = text.match(YT_RE);
  return m ? m[1] : null;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function formatChatTime(at: number): string {
  const d = new Date(at);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatChatDay(at: number): string {
  const d = new Date(at);
  const now = new Date();
  if (sameDay(d, now)) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

export function formatRelative(at: number): string {
  const diff = Date.now() - at;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}
