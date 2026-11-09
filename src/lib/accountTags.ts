"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, writeBatch, addDoc, type Firestore } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

/**
 * Admin-only account tags: labels an admin puts on member accounts (a team, "Dummy",
 * "VIP"…) to group people in admin reports. Purely a label — nothing about the
 * account changes, and members can never read them (Firestore rules: admin only).
 *
 *   account_tags/{tagId}        { name, color, createdAt, by }
 *   account_tag_links/{uid}     { tags: tagId[], updatedAt, by }
 *
 * Every change is written to admin_audit.
 */

export const TAG_COLORS = {
  gray: { dot: "#9AA3B5", text: "#C4C9D4", bg: "rgba(154,163,181,0.12)", border: "rgba(154,163,181,0.32)" },
  blue: { dot: "#4F8EF7", text: "#8FB6FA", bg: "rgba(79,142,247,0.12)", border: "rgba(79,142,247,0.38)" },
  teal: { dot: "#2DD4BF", text: "#7EE6D8", bg: "rgba(45,212,191,0.12)", border: "rgba(45,212,191,0.36)" },
  violet: { dot: "#A78BFA", text: "#C4B5FD", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.38)" },
  pink: { dot: "#EC6A9C", text: "#F4A3C2", bg: "rgba(236,106,156,0.12)", border: "rgba(236,106,156,0.38)" },
  amber: { dot: "#F5C66B", text: "#F7D48F", bg: "rgba(245,198,107,0.12)", border: "rgba(245,198,107,0.38)" },
  orange: { dot: "#F59E5B", text: "#F8BE93", bg: "rgba(245,158,91,0.12)", border: "rgba(245,158,91,0.38)" },
  red: { dot: "#F87171", text: "#FAA5A5", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.38)" },
} as const;
export type TagColor = keyof typeof TAG_COLORS;
export const TAG_COLOR_KEYS = Object.keys(TAG_COLORS) as TagColor[];
export const MAX_TAG_NAME = 24;
export const MAX_TAGS_PER_ACCOUNT = 20;

export type AccountTag = { id: string; name: string; color: TagColor; createdAt: number };

const colorOf = (c: unknown): TagColor => (typeof c === "string" && c in TAG_COLORS ? (c as TagColor) : "gray");

/** Live tag list and per-account links. Admin pages only (the rules refuse anyone else). */
export function useAccountTags() {
  const { user } = useAuth();
  const [tags, setTags] = useState<AccountTag[]>([]);
  const [links, setLinks] = useState<Map<string, string[]>>(new Map());
  const [ready, setReady] = useState(false);
  const isAdmin = !!user?.isAdmin;

  useEffect(() => {
    if (!isAdmin) return;
    const { db } = getFirebase();
    if (!db) return;
    let gotTags = false, gotLinks = false;
    const done = () => { if (gotTags && gotLinks) setReady(true); };
    const offTags = onSnapshot(collection(db, "account_tags"), (snap) => {
      setTags(
        snap.docs
          .map((d) => {
            const x = d.data() as { name?: unknown; color?: unknown; createdAt?: unknown };
            return { id: d.id, name: typeof x.name === "string" ? x.name : "Tag", color: colorOf(x.color), createdAt: typeof x.createdAt === "number" ? x.createdAt : 0 };
          })
          .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })),
      );
      gotTags = true; done();
    }, () => { gotTags = true; done(); });
    const offLinks = onSnapshot(collection(db, "account_tag_links"), (snap) => {
      const m = new Map<string, string[]>();
      for (const d of snap.docs) {
        const t = (d.data() as { tags?: unknown }).tags;
        if (Array.isArray(t) && t.length) m.set(d.id, t.filter((x): x is string => typeof x === "string"));
      }
      setLinks(m);
      gotLinks = true; done();
    }, () => { gotLinks = true; done(); });
    return () => { offTags(); offLinks(); };
  }, [isAdmin]);

  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  /** The tags on one account, in tag-list order (unknown ids from a deleted tag are skipped). */
  const tagsOf = useMemo(() => (uid: string) => tags.filter((t) => (links.get(uid) ?? []).includes(t.id)), [tags, links]);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const ids of links.values()) for (const id of ids) if (byId.has(id)) c.set(id, (c.get(id) ?? 0) + 1);
    return c;
  }, [links, byId]);

  return { tags, links, byId, tagsOf, counts, ready };
}

function need(): { db: Firestore; uid: string } {
  const { db, auth } = getFirebase();
  const uid = auth?.currentUser?.uid;
  if (!db || !uid) throw new Error("Please sign in again.");
  return { db, uid };
}

const audit = (db: Firestore, by: string, entry: Record<string, unknown>) =>
  addDoc(collection(db, "admin_audit"), { ...entry, by, at: Date.now() });

function cleanName(name: string) {
  const n = name.trim().replace(/\s+/g, " ");
  if (!n) throw new Error("Give the tag a name.");
  if (n.length > MAX_TAG_NAME) throw new Error(`Keep the name to ${MAX_TAG_NAME} characters.`);
  return n;
}

/** Create (no id) or rename / recolor a tag. */
export async function saveAccountTag(input: { id?: string; name: string; color: TagColor }, existing: AccountTag[]) {
  const { db, uid } = need();
  const name = cleanName(input.name);
  if (existing.some((t) => t.id !== input.id && t.name.toLowerCase() === name.toLowerCase())) throw new Error("There is already a tag with that name.");
  const color = colorOf(input.color);
  const batch = writeBatch(db);
  if (input.id) {
    batch.update(doc(db, "account_tags", input.id), { name, color });
  } else {
    batch.set(doc(collection(db, "account_tags")), { name, color, createdAt: Date.now(), by: uid });
  }
  await batch.commit();
  await audit(db, uid, { type: input.id ? "account_tag_edited" : "account_tag_created", title: `${input.id ? "Tag edited" : "Tag created"}: ${name}`, tagId: input.id ?? null, name, color });
}

/** Delete a tag and take it off every account that carries it. */
export async function deleteAccountTag(tag: AccountTag, links: Map<string, string[]>) {
  const { db, uid } = need();
  const holders = [...links.entries()].filter(([, ids]) => ids.includes(tag.id));
  // Small batches: every write re-checks the admin rule.
  for (let i = 0; i < holders.length; i += 8) {
    const batch = writeBatch(db);
    for (const [memberUid, ids] of holders.slice(i, i + 8)) {
      const next = ids.filter((x) => x !== tag.id);
      if (next.length) batch.set(doc(db, "account_tag_links", memberUid), { tags: next, updatedAt: Date.now(), by: uid });
      else batch.delete(doc(db, "account_tag_links", memberUid));
    }
    await batch.commit();
  }
  const b = writeBatch(db);
  b.delete(doc(db, "account_tags", tag.id));
  await b.commit();
  await audit(db, uid, { type: "account_tag_deleted", title: `Tag deleted: ${tag.name}`, tagId: tag.id, name: tag.name, accounts: holders.length });
}

/**
 * Add and/or remove tags on one or more accounts. Accounts are given as
 * { uid, name } so the audit line can say who was tagged.
 */
export async function setAccountTags(
  members: { uid: string; name: string }[],
  change: { add: string[]; remove: string[]; note?: string },
  links: Map<string, string[]>,
  tagNames: Map<string, string>,
) {
  const { db, uid } = need();
  if (!members.length || (!change.add.length && !change.remove.length)) return 0;
  let changed = 0;
  for (let i = 0; i < members.length; i += 8) {
    const batch = writeBatch(db);
    let writes = 0;
    for (const m of members.slice(i, i + 8)) {
      const cur = links.get(m.uid) ?? [];
      const next = [...new Set([...cur.filter((x) => !change.remove.includes(x)), ...change.add])].slice(0, MAX_TAGS_PER_ACCOUNT);
      if (next.length === cur.length && next.every((x) => cur.includes(x))) continue;
      if (next.length) batch.set(doc(db, "account_tag_links", m.uid), { tags: next, updatedAt: Date.now(), by: uid });
      else batch.delete(doc(db, "account_tag_links", m.uid));
      writes++;
    }
    if (writes) { await batch.commit(); changed += writes; }
  }
  if (changed) {
    const names = (ids: string[]) => ids.map((id) => tagNames.get(id) ?? id).join(", ");
    const who = members.length === 1 ? members[0].name : `${members.length} accounts`;
    const parts = [change.add.length ? `added ${names(change.add)}` : "", change.remove.length ? `removed ${names(change.remove)}` : ""].filter(Boolean).join(" · ");
    await audit(db, uid, {
      type: "account_tags_set",
      title: `Tags for ${who}: ${parts}`,
      subtitle: change.note?.trim() ? change.note.trim().slice(0, 200) : null,
      uids: members.slice(0, 200).map((m) => m.uid),
      ...(members.length === 1 ? { uid: members[0].uid, userName: members[0].name } : {}),
      add: change.add,
      remove: change.remove,
    });
  }
  return changed;
}

