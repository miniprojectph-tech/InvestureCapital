import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { createHash } from "node:crypto";
import { db } from "./init";
import { maskName } from "./maskName";

// Masterlist — every placement by month, from three sources:
//
//   portal   members' real placements (read from their records; never edited here)
//   offline  investors with no portal account, entered by the admin
//   old      records from before the portal, entered or imported by the admin
//
// What members see is PREPARED on the server, one document per month
// (`masterlist_public/{YYYY-MM}`), with names already masked — so nobody's real
// name, and no "source", ever reaches another member's phone. Members may open
// only the most recent months; Firestore rules enforce that with each
// document's `visibleUntil`, so an archived month cannot be fetched at all.
//
// The admin's copy (`masterlist_admin/{YYYY-MM}`) has full names and sources.
// Offline and old rows are RECORDS ONLY: no payouts, wallet or referral effect.

const HOUR = 3_600_000;
const META = "masterlist_meta/state";
const INDEX = "masterlist_public/_index";
const MAX_ROWS_PER_MONTH = 4000; // keeps a month's document well under Firestore's 1 MB cap
const MAX_WINDOW = 6; // the furthest back (in months) a member may choose a date
const MAX_NAME = 80;
const MAX_NOTE = 200;
const MAX_AMOUNT = 1_000_000_000;

export type MasterSource = "portal" | "offline" | "old";
type Entry = { name: string; placedAt: number; amount: number; termMonths: number; source: "offline" | "old"; note?: string };
type FullRow = { k: string; name: string; d: number; a: number; t: number; s: MasterSource; note?: string; id?: string; uid?: string };

/** "2026-10" for a moment in time, on the Manila calendar. */
export function monthKeyOf(ms: number): string {
  return new Date(ms + 8 * HOUR).toISOString().slice(0, 7);
}
/** First instant (Manila) of the month `offset` months after `key`. */
function monthStart(key: string, offset = 0): number {
  const [y, m] = key.split("-").map(Number);
  return Date.UTC(y, m - 1 + offset, 1) - 8 * HOUR;
}
/** The same short hash the app computes to find the member's OWN rows. */
export const ownKey = (uid: string, placementId: string) => createHash("sha256").update(`${uid}:${placementId}`).digest("hex").slice(0, 16);

type Settings = { windowMonths: number };
function settingsOf(data: FirebaseFirestore.DocumentData | undefined): Settings {
  const m = (data?.masterlist ?? {}) as { windowMonths?: unknown };
  const w = Math.round(Number(m.windowMonths));
  // Default and ceiling are both MAX_WINDOW; a larger saved value is treated as the ceiling.
  return { windowMonths: Number.isFinite(w) && w >= 1 ? Math.min(w, MAX_WINDOW) : MAX_WINDOW };
}

async function requireAdmin(request: CallableRequest): Promise<{ uid: string; name: string }> {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const snap = await db.collection("users").doc(request.auth.uid).get();
  if (snap.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
  return { uid: request.auth.uid, name: String(snap.data()?.profile?.name ?? "") };
}

/**
 * Rebuild every month's prepared documents from the members' placements and the
 * admin's entries. Whole-list rebuild: it is simple, always consistent, and cheap
 * at this size (one read per member record and per entry).
 */
export async function rebuildMasterlist(): Promise<{ months: number; rows: number }> {
  const now = Date.now();
  const [usersSnap, entriesSnap, settingsSnap] = await Promise.all([
    db.collection("users").select("profile", "placements", "completedPlacements").get(),
    db.collection("masterlist_entries").get(),
    db.doc("settings/platform").get(),
  ]);
  const cfg = settingsOf(settingsSnap.data());
  const byMonth = new Map<string, FullRow[]>();
  const add = (r: FullRow) => {
    if (!Number.isFinite(r.d) || r.d <= 0 || !Number.isFinite(r.a) || r.a <= 0) return;
    const key = monthKeyOf(r.d);
    let list = byMonth.get(key);
    if (!list) byMonth.set(key, (list = []));
    list.push(r);
  };

  for (const d of usersSnap.docs) {
    const u = d.data() as { profile?: { name?: string; email?: string }; placements?: unknown[]; completedPlacements?: unknown[] };
    const name = String(u.profile?.name || u.profile?.email?.split("@")[0] || "Member").slice(0, MAX_NAME);
    const all = [...(Array.isArray(u.placements) ? u.placements : []), ...(Array.isArray(u.completedPlacements) ? u.completedPlacements : [])] as { id?: string; capital?: number; termMonths?: number; startedAt?: number }[];
    const seen = new Set<string>();
    for (const p of all) {
      const id = String(p?.id ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      add({ k: ownKey(d.id, id), name, d: Number(p.startedAt), a: Number(p.capital), t: Number(p.termMonths) || 0, s: "portal", uid: d.id });
    }
  }
  for (const d of entriesSnap.docs) {
    const e = d.data() as Partial<Entry>;
    add({ k: `e${d.id.slice(0, 15)}`, name: String(e.name ?? "").slice(0, MAX_NAME), d: Number(e.placedAt), a: Number(e.amount), t: Number(e.termMonths) || 0, s: e.source === "offline" ? "offline" : "old", note: e.note ? String(e.note).slice(0, MAX_NOTE) : undefined, id: d.id });
  }

  const keys = [...byMonth.keys()].sort().reverse(); // newest month first
  const existing = await db.collection("masterlist_public").select().get();
  const stale = existing.docs.map((d) => d.id).filter((id) => id !== "_index" && !byMonth.has(id));

  let batch = db.batch();
  let ops = 0;
  const flush = async () => { if (ops > 0) { await batch.commit(); batch = db.batch(); ops = 0; } };
  const queue = async (fn: (b: FirebaseFirestore.WriteBatch) => void) => { fn(batch); if (++ops >= 200) await flush(); };

  let rows = 0;
  // For members: which months exist and which days in them have placements (so the page can
  // step from day to day without loading every month). No amounts, no totals.
  const index: { month: string; count: number; days: number[] }[] = [];
  for (const key of keys) {
    const list = (byMonth.get(key) as FullRow[]).sort((x, y) => y.d - x.d).slice(0, MAX_ROWS_PER_MONTH);
    const total = Math.round(list.reduce((s, r) => s + r.a, 0) * 100) / 100;
    rows += list.length;
    const days = [...new Set(list.map((r) => new Date(r.d + 8 * HOUR).getUTCDate()))].sort((x, y) => x - y);
    index.push({ month: key, count: list.length, days });
    // A month is open to members until the start of the month `windowMonths` after it.
    const visibleUntil = Timestamp.fromMillis(monthStart(key, cfg.windowMonths));
    await queue((b) => b.set(db.doc(`masterlist_public/${key}`), {
      month: key, count: list.length, visibleUntil, updatedAt: now,
      // masked name, date, amount, term — and the key a member uses to spot their own row
      rows: list.map((r) => ({ k: r.k, n: maskName(r.name), d: r.d, a: r.a, t: r.t })),
    }));
    await queue((b) => b.set(db.doc(`masterlist_admin/${key}`), {
      month: key, count: list.length, total, updatedAt: now,
      rows: list.map((r) => ({ k: r.k, n: r.name, d: r.d, a: r.a, t: r.t, s: r.s, ...(r.note ? { note: r.note } : {}), ...(r.id ? { id: r.id } : {}), ...(r.uid ? { uid: r.uid } : {}) })),
    }));
  }
  for (const id of stale) {
    await queue((b) => b.delete(db.doc(`masterlist_public/${id}`)));
    await queue((b) => b.delete(db.doc(`masterlist_admin/${id}`)));
  }
  // The index lists which months exist (never their rows), so the page can show the archive notice.
  await queue((b) => b.set(db.doc(INDEX), { open: true, months: index, windowMonths: cfg.windowMonths, updatedAt: now }));
  await queue((b) => b.set(db.doc(META), { dirty: false, rebuiltAt: now, rows, months: keys.length }, { merge: true }));
  await flush();
  return { months: keys.length, rows };
}

/** Flag the list for a rebuild (cheap; the sync job below picks it up within minutes). */
export async function markMasterlistDirty(): Promise<void> {
  await db.doc(META).set({ dirty: true, dirtyAt: Date.now() }, { merge: true });
}

// Rebuild when something changed (a new placement, an edited start date), and at least hourly.
export const masterlistSync = onSchedule("every 10 minutes", async () => {
  const meta = (await db.doc(META).get()).data() as { dirty?: boolean; rebuiltAt?: number } | undefined;
  const due = !meta?.rebuiltAt || Date.now() - meta.rebuiltAt > HOUR - 60_000;
  if (!meta?.dirty && !due) return;
  const r = await rebuildMasterlist();
  logger.info("masterlist rebuilt", r);
});

function cleanEntry(raw: unknown, i: number): Entry {
  const r = (raw ?? {}) as Record<string, unknown>;
  const where = `Row ${i + 1}`;
  const name = String(r.name ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > MAX_NAME) throw new HttpsError("invalid-argument", `${where}: enter the person's full name.`);
  const placedAt = Number(r.placedAt);
  if (!Number.isFinite(placedAt) || placedAt < Date.UTC(1990, 0, 1) || placedAt > Date.now() + 366 * 24 * HOUR) throw new HttpsError("invalid-argument", `${where}: the date placed is missing or not a real date.`);
  const amount = Math.round(Number(r.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) throw new HttpsError("invalid-argument", `${where}: the amount must be more than 0.`);
  const termMonths = Math.round(Number(r.termMonths));
  if (!Number.isFinite(termMonths) || termMonths < 1 || termMonths > 120) throw new HttpsError("invalid-argument", `${where}: the term must be 1 to 120 months.`);
  if (r.source !== "offline" && r.source !== "old") throw new HttpsError("invalid-argument", `${where}: the type must be Offline or Old record.`);
  const note = String(r.note ?? "").trim().slice(0, MAX_NOTE);
  return { name, placedAt, amount, termMonths, source: r.source, ...(note ? { note } : {}) };
}

// ── Admin: add entries (one from the form, or many from an Excel upload), or edit one ──
export const adminMasterlistSave = onCall({ timeoutSeconds: 300 }, async (request) => {
  const admin = await requireAdmin(request);
  const data = (request.data ?? {}) as { entries?: unknown[]; id?: unknown; rebuild?: unknown };
  const list = Array.isArray(data.entries) ? data.entries : [];
  if (list.length === 0) throw new HttpsError("invalid-argument", "Nothing to save.");
  if (list.length > 400) throw new HttpsError("invalid-argument", "Send at most 400 rows at a time.");
  const clean = list.map(cleanEntry); // everything is checked before anything is written
  const now = Date.now();

  if (typeof data.id === "string" && data.id) {
    if (clean.length !== 1 || !/^[A-Za-z0-9]{6,40}$/.test(data.id)) throw new HttpsError("invalid-argument", "Edit one entry at a time.");
    const ref = db.doc(`masterlist_entries/${data.id}`);
    if (!(await ref.get()).exists) throw new HttpsError("not-found", "That entry no longer exists.");
    await ref.set({ ...clean[0], updatedAt: now, updatedBy: admin.uid }, { merge: false });
  } else {
    const batch = db.batch();
    for (const e of clean) batch.set(db.collection("masterlist_entries").doc(), { ...e, createdAt: now, createdBy: admin.uid });
    await batch.commit();
  }
  await db.collection("admin_audit").add({
    type: "masterlist_entries_saved", title: data.id ? "Masterlist entry edited" : `Masterlist: ${clean.length} entr${clean.length === 1 ? "y" : "ies"} added`,
    subtitle: `${clean.filter((e) => e.source === "offline").length} offline · ${clean.filter((e) => e.source === "old").length} old record`, by: admin.uid, at: now,
  });
  // A large import arrives in several calls; only the last one asks for the rebuild.
  if (data.rebuild === false) { await markMasterlistDirty(); return { ok: true, saved: clean.length, rebuilt: false }; }
  return { ok: true, saved: clean.length, rebuilt: true, ...(await rebuildMasterlist()) };
});

// ── Admin: remove offline / old entries (portal rows are real placements and can't be removed here) ──
export const adminMasterlistDelete = onCall(async (request) => {
  const admin = await requireAdmin(request);
  const ids = ((request.data as { ids?: unknown[] })?.ids ?? []).filter((x): x is string => typeof x === "string" && /^[A-Za-z0-9]{6,40}$/.test(x));
  if (ids.length === 0 || ids.length > 400) throw new HttpsError("invalid-argument", "Choose 1 to 400 entries to remove.");
  const batch = db.batch();
  for (const id of ids) batch.delete(db.doc(`masterlist_entries/${id}`));
  await batch.commit();
  await db.collection("admin_audit").add({ type: "masterlist_entries_removed", title: `Masterlist: ${ids.length} entr${ids.length === 1 ? "y" : "ies"} removed`, subtitle: "", by: admin.uid, at: Date.now() });
  return { ok: true, removed: ids.length, ...(await rebuildMasterlist()) };
});

// ── Admin: rebuild now (after changing how many months members see, or just to refresh) ──
export const adminMasterlistRebuild = onCall({ timeoutSeconds: 300 }, async (request) => {
  await requireAdmin(request);
  return { ok: true, ...(await rebuildMasterlist()) };
});
