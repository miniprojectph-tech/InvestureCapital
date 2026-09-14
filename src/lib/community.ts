"use client";

import { useEffect, useState } from "react";
import {
  ref,
  onValue,
  query as rtdbQuery,
  orderByChild,
  limitToLast,
  push,
  update,
  remove,
  set,
  get,
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

export type ChatKind = "text" | "image" | "video";

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
export type SendPayload = { kind: ChatKind; text?: string; media?: ChatMedia };

type RawRoom = { uid: string; name: string; kind: ChatKind; text?: string; media?: ChatMedia; at: number; admin?: boolean; mod?: boolean };
type RawInbox = { from: string; name: string; kind: ChatKind; text?: string; media?: ChatMedia; at: number };

// ===== Hooks =====

export function useCommunityRoom(max = 100) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const { rtdb } = getFirebase();
    if (!rtdb) { setLoading(false); return; }
    const q = rtdbQuery(ref(rtdb, "community/room"), orderByChild("at"), limitToLast(max));
    return onValue(
      q,
      (snap) => {
        const val = (snap.val() as Record<string, RawRoom> | null) ?? {};
        setMessages(
          Object.entries(val)
            .map(([id, m]) => ({
              id,
              senderId: m.uid,
              name: m.name,
              kind: m.kind,
              text: m.text,
              media: m.media,
              at: m.at,
              admin: !!m.admin,
              mod: !!m.mod,
            }))
            .sort((a, b) => a.at - b.at),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user, max]);

  return { messages, loading };
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

export function useInbox(threadUid: string | null, max = 100) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !threadUid) return;
    const { rtdb } = getFirebase();
    if (!rtdb) { setLoading(false); return; }
    setLoading(true);
    const q = rtdbQuery(ref(rtdb, `community/inbox/${threadUid}`), orderByChild("at"), limitToLast(max));
    return onValue(
      q,
      (snap) => {
        const val = (snap.val() as Record<string, RawInbox> | null) ?? {};
        setMessages(
          Object.entries(val)
            .map(([id, m]) => ({
              id,
              senderId: m.from,
              name: m.name,
              kind: m.kind,
              text: m.text,
              media: m.media,
              at: m.at,
              admin: m.from === "admin",
            }))
            .sort((a, b) => a.at - b.at),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user, threadUid, max]);

  return { messages, loading };
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
  return p.kind === "image" ? "📷 Photo" : p.kind === "video" ? "🎬 Video" : "";
}

export async function sendRoomMessage(sender: Sender, payload: SendPayload): Promise<void> {
  const rtdb = needRtdb();
  const id = push(ref(rtdb, "community/room")).key;
  if (!id) throw new Error("Couldn't create message");
  const text = payload.text?.trim();
  const msg: Record<string, unknown> = {
    uid: sender.uid,
    name: sender.name.slice(0, 40),
    kind: payload.kind,
    at: serverTimestamp(),
  };
  if (text) msg.text = text.slice(0, MAX_TEXT);
  if (payload.media) msg.media = payload.media;
  if (sender.isAdmin || sender.isMod) msg.admin = true;
  if (sender.isMod && !sender.isAdmin) msg.mod = true;
  await update(ref(rtdb), {
    [`community/room/${id}`]: msg,
    [`community/lastPost/${sender.uid}`]: serverTimestamp(),
  });
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
  const text = payload.text?.trim();
  const msg: Record<string, unknown> = {
    from,
    name: (sender.isAdmin ? "Admin" : sender.isMod ? "Moderator" : sender.name).slice(0, 40),
    kind: payload.kind,
    at: serverTimestamp(),
  };
  if (text) msg.text = text.slice(0, 1000);
  if (payload.media) msg.media = payload.media;

  const metaBase = `community/inboxMeta/${threadUid}`;
  const upd: Record<string, unknown> = {
    [`community/inbox/${threadUid}/${id}`]: msg,
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
  opts: { keepOriginal: boolean },
): Promise<ChatMedia> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Only PNG, JPG, WebP, or GIF images are allowed");
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`Image too large (max ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`);
  const base = `community/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

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
export async function uploadChatVideo(storage: FirebaseStorage, uid: string, file: File): Promise<ChatMedia> {
  if (!VIDEO_TYPES.includes(file.type)) throw new Error("Only MP4, WebM, or MOV videos are allowed");
  if (file.size > MAX_VIDEO_BYTES) throw new Error(`Video too large (max ${MAX_VIDEO_BYTES / 1024 / 1024} MB)`);

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
    if (!isFinite(duration) || duration > MAX_VIDEO_SECONDS + 0.5) {
      throw new Error(`Videos must be ${MAX_VIDEO_SECONDS} seconds or shorter`);
    }
    const w = v.videoWidth;
    const h = v.videoHeight;
    await new Promise<void>((res) => {
      v.onseeked = () => res();
      v.currentTime = Math.min(0.5, Math.max(0, duration / 2));
    });
    const poster = await encodeResized(v, w, h, 800, 0.8, false);
    const base = `community/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
