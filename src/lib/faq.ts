"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { FirebaseStorage } from "firebase/storage";
import { getFirebase } from "./firebase";
import { useAuth } from "./auth";
import { uploadChatImage, uploadChatVideo, youtubeId } from "./community";

/**
 * Help & FAQ. Everything lives in ONE Firestore document (`content/faq`) so a
 * member's visit costs a single read; votes are a second small document
 * (`content/faqVotes`, written only by the `faqVote` function) plus the
 * member's own `faq_voters/{uid}`.
 */

export type FaqMediaKind = "image" | "video" | "youtube";

export type FaqMedia = {
  kind: FaqMediaKind;
  /** Display URL (image / video file), or the watch URL for YouTube. */
  url: string;
  thumb?: string;
  poster?: string;
  caption?: string;
  duration?: number;
  w?: number;
  h?: number;
  bytes?: number;
  /** YouTube only. */
  videoId?: string;
};

export type FaqStatus = "published" | "draft";

export type FaqItem = {
  id: string;
  question: string;
  category: string;
  /** Lightweight markup: blank line = paragraph, "- " = bullet, **bold**, URLs auto-link. */
  answer: string;
  media: FaqMedia[];
  status: FaqStatus;
  createdAt: number;
  updatedAt: number;
};

export type FaqDoc = { items: FaqItem[]; updatedAt?: number; updatedBy?: string };
export type FaqVotes = Record<string, { up: number; down: number }>;
export type MyFaqVotes = Record<string, boolean>;

export const FAQ_MAX_MEDIA = 3;
export const FAQ_MAX_QUESTION = 160;
export const FAQ_MAX_ANSWER = 4000;
export const FAQ_MAX_CAPTION = 80;
export const FAQ_VIDEO_MAX_BYTES = 40 * 1024 * 1024;
export const FAQ_VIDEO_MAX_SECONDS = 120;
export const DEFAULT_CATEGORY = "Getting started";

export function newFaqItem(category = DEFAULT_CATEGORY): FaqItem {
  const now = Date.now();
  return { id: `faq-${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, question: "", category, answer: "", media: [], status: "draft", createdAt: now, updatedAt: now };
}

/** Categories in the order they first appear in the list (admin controls order by moving items). */
export function faqCategories(items: FaqItem[]): string[] {
  const out: string[] = [];
  for (const it of items) if (!out.includes(it.category)) out.push(it.category);
  return out;
}

// ===== Hooks =====

export function useFaq(): { faq: FaqDoc; loading: boolean } {
  const { user } = useAuth();
  const [faq, setFaq] = useState<FaqDoc>({ items: [] });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    const { db } = getFirebase();
    if (!db) { setLoading(false); return; }
    return onSnapshot(
      doc(db, "content", "faq"),
      (s) => {
        const d = (s.data() as Partial<FaqDoc> | undefined) ?? {};
        setFaq({ items: Array.isArray(d.items) ? d.items : [], updatedAt: d.updatedAt, updatedBy: d.updatedBy });
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user]);
  return { faq, loading };
}

export function useFaqVotes(): FaqVotes {
  const { user } = useAuth();
  const [votes, setVotes] = useState<FaqVotes>({});
  useEffect(() => {
    if (!user) return;
    const { db } = getFirebase();
    if (!db) return;
    return onSnapshot(doc(db, "content", "faqVotes"), (s) => setVotes((s.data() as FaqVotes | undefined) ?? {}), () => setVotes({}));
  }, [user]);
  return votes;
}

export function useMyFaqVotes(): MyFaqVotes {
  const { user } = useAuth();
  const [mine, setMine] = useState<MyFaqVotes>({});
  useEffect(() => {
    if (!user) return;
    const { db } = getFirebase();
    if (!db) return;
    return onSnapshot(doc(db, "faq_voters", user.uid), (s) => setMine((s.data() as MyFaqVotes | undefined) ?? {}), () => setMine({}));
  }, [user]);
  return mine;
}

// ===== Actions =====

/** Admin: write the whole FAQ document. */
export async function saveFaq(items: FaqItem[], uid: string): Promise<void> {
  const { db } = getFirebase();
  if (!db) throw new Error("Firebase not initialized");
  const clean = items.map((it) => ({
    ...it,
    question: it.question.trim().slice(0, FAQ_MAX_QUESTION),
    category: it.category.trim().slice(0, 40) || DEFAULT_CATEGORY,
    answer: it.answer.slice(0, FAQ_MAX_ANSWER),
    media: it.media.slice(0, FAQ_MAX_MEDIA).map((m) => stripUndefined({ ...m, caption: m.caption?.trim().slice(0, FAQ_MAX_CAPTION) || undefined })),
  }));
  await setDoc(doc(db, "content", "faq"), { items: clean, updatedAt: Date.now(), updatedBy: uid, serverUpdatedAt: serverTimestamp() });
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Member: thumbs up (true), thumbs down (false), or clear (null). One vote per member per question. */
export function voteFaq(id: string, helpful: boolean | null): Promise<void> {
  const { functions } = getFirebase();
  if (!functions) return Promise.reject(new Error("Firebase not initialized"));
  return httpsCallable<{ id: string; helpful: boolean | null }, { ok: boolean }>(functions, "faqVote")({ id, helpful }).then(() => undefined);
}

// ===== Media (admin) =====

export async function uploadFaqImage(storage: FirebaseStorage, uid: string, file: File): Promise<FaqMedia> {
  const m = await uploadChatImage(storage, uid, file, { keepOriginal: false, folder: "faq" });
  return { kind: "image", url: m.url, thumb: m.thumb, w: m.w, h: m.h, bytes: file.size };
}

export async function uploadFaqVideo(storage: FirebaseStorage, uid: string, file: File): Promise<FaqMedia> {
  const m = await uploadChatVideo(storage, uid, file, { folder: "faq", maxBytes: FAQ_VIDEO_MAX_BYTES, maxSeconds: FAQ_VIDEO_MAX_SECONDS });
  return { kind: "video", url: m.url, poster: m.poster, w: m.w, h: m.h, duration: m.duration, bytes: file.size };
}

export function youtubeMedia(url: string): FaqMedia | null {
  const id = youtubeId(url.trim());
  return id ? { kind: "youtube", url: url.trim(), videoId: id } : null;
}

// ===== Answer markup =====

export type FaqBlock = { type: "p"; text: string } | { type: "ul"; items: string[] };

/** Blank line = paragraph; consecutive "- " lines = a bullet list. */
export function parseFaqAnswer(text: string): FaqBlock[] {
  const blocks: FaqBlock[] = [];
  for (const chunk of text.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    const lines = chunk.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim().length);
    if (!lines.length) continue;
    let para: string[] = [];
    let list: string[] = [];
    const flushPara = () => { if (para.length) { blocks.push({ type: "p", text: para.join("\n") }); para = []; } };
    const flushList = () => { if (list.length) { blocks.push({ type: "ul", items: list }); list = []; } };
    for (const line of lines) {
      const bullet = /^\s*[-•*]\s+(.*)$/.exec(line);
      if (bullet) { flushPara(); list.push(bullet[1]); }
      else { flushList(); para.push(line.trim()); }
    }
    flushPara();
    flushList();
  }
  return blocks;
}

export type FaqInline = { type: "text"; text: string } | { type: "bold"; text: string } | { type: "link"; href: string; text: string };

/** **bold** and bare URLs. */
export function parseFaqInline(text: string): FaqInline[] {
  const out: FaqInline[] = [];
  const re = /(\*\*([^*]+)\*\*)|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: "text", text: text.slice(last, m.index) });
    if (m[2] !== undefined) out.push({ type: "bold", text: m[2] });
    else out.push({ type: "link", href: m[3], text: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

/** Plain text of an answer, for search and previews. */
export function faqPlainText(answer: string): string {
  return answer.replace(/\*\*/g, "").replace(/^\s*[-•*]\s+/gm, "").replace(/\s+/g, " ").trim();
}

export function formatDuration(s: number | undefined): string {
  if (!s || !isFinite(s)) return "";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}
