import { randomInt } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten, onDocumentCreated } from "firebase-functions/v2/firestore";
import { getDatabase } from "firebase-admin/database";
import { getStorage } from "firebase-admin/storage";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { db } from "./init";

// Community chat lives entirely in Realtime Database (bandwidth-priced) and
// clients write directly under security rules — no function on the send path.
// History is kept FOREVER (nothing is pruned); the app pages back through it.
// Server pieces:
//   * ensureCommunityAdmin  mirrors the Firestore `isAdmin` flag into RTDB
//     (`admins/{uid}`) so RTDB rules can grant moderator powers.
//   * ensureCommunityMember mirrors the sign-up date so rules can hide history
//     from before a member joined.
//   * updateCommunityStats / refreshCommunityStats keep message + media totals
//     at `community/stats` so the admin can watch storage grow.

export const ensureCommunityAdmin = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const uid = request.auth.uid;
  const snap = await db.collection("users").doc(uid).get();
  const isAdmin = snap.exists && snap.data()?.isAdmin === true;
  const ref = getDatabase().ref(`admins/${uid}`);
  if (isAdmin) await ref.set(true);
  else await ref.remove();
  return { ok: true, isAdmin };
});

/**
 * Mirror the member's sign-up date into RTDB (`members/{uid}/joinedAt`) so the
 * room rules can hide messages posted before they joined. Server-written so a
 * member can't backdate themselves; never overwrites an existing value.
 */
export const ensureCommunityMember = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const uid = request.auth.uid;
  const ref = getDatabase().ref(`members/${uid}/joinedAt`);
  const existing = (await ref.once("value")).val();
  if (typeof existing === "number") return { ok: true, joinedAt: existing };
  const snap = await db.collection("users").doc(uid).get();
  const joinedAt = snap.data()?.profile?.joinedAt;
  const value = typeof joinedAt === "number" && joinedAt > 0 ? joinedAt : Date.now();
  await ref.set(value);
  return { ok: true, joinedAt: value };
});

// ===== Storage stats =====

type CommunityStats = {
  roomMessages: number;
  lastRoomKey: string | null;
  mediaFiles: number | null;
  mediaBytes: number | null;
  updatedAt: number;
};

/** Below this, recount from scratch (also corrects for deletions); above it, count only new keys. */
const FULL_RECOUNT_LIMIT = 20_000;

async function computeCommunityStats(): Promise<CommunityStats> {
  const rtdb = getDatabase();
  const prev = ((await rtdb.ref("community/stats").once("value")).val() ?? null) as CommunityStats | null;

  let roomMessages = 0;
  let lastRoomKey: string | null = null;
  if (prev && prev.roomMessages >= FULL_RECOUNT_LIMIT && prev.lastRoomKey) {
    // Push keys are chronological, so everything after the last counted key is new.
    const snap = await rtdb.ref("community/room").orderByKey().startAfter(prev.lastRoomKey).once("value");
    roomMessages = prev.roomMessages + snap.numChildren();
    lastRoomKey = prev.lastRoomKey;
    snap.forEach((c) => { lastRoomKey = c.key; });
  } else {
    const snap = await rtdb.ref("community/room").orderByKey().once("value");
    roomMessages = snap.numChildren();
    snap.forEach((c) => { lastRoomKey = c.key; });
  }

  // Media: metadata-only listing of everything under community/ in Storage.
  let mediaFiles: number | null = null;
  let mediaBytes: number | null = null;
  try {
    const bucketName = (JSON.parse(process.env.FIREBASE_CONFIG || "{}") as { storageBucket?: string }).storageBucket;
    if (bucketName) {
      const [files] = await getStorage().bucket(bucketName).getFiles({ prefix: "community/" });
      mediaFiles = files.length;
      mediaBytes = files.reduce((s, f) => s + Number(f.metadata.size ?? 0), 0);
    }
  } catch (err) {
    logger.warn("community media listing failed", err);
  }

  const stats: CommunityStats = { roomMessages, lastRoomKey, mediaFiles, mediaBytes, updatedAt: Date.now() };
  await rtdb.ref("community/stats").set(stats);
  return stats;
}

/**
 * "N active now": count distinct members with a live presence connection
 * (`community/presence/{uid}/{conn}`, removed by onDisconnect) into
 * `community/online`. Clients read the single number, never the whole node.
 * Entries older than 12 h are dropped as leftovers of connections that died
 * without a clean disconnect.
 */
export const updateOnlineCount = onSchedule("every 1 minutes", async () => {
  await recomputeOnline(false);
});

/**
 * Admin-set starting number for "N active now". When switched on, the number
 * members see is a "starting number" PLUS the members really connected. The
 * starting number follows the admin's time windows (Manila time): each window
 * has its own lowest / highest and "change every N minutes". At each change
 * the number drifts a few steps up or down and stays inside the window's
 * range; when a new window begins it eases toward the new range over the next
 * few changes instead of jumping. The settings and the real count live in
 * `admin_private` (admins only); members only ever get the final number at
 * `community/online`.
 */
export type ActiveWindow = { start: string; end: string; min: number; max: number; everyMin: number };
type ActiveBase = {
  enabled: boolean;
  windows?: ActiveWindow[];
  /** Older one-range setting; read as one all-day window when `windows` is missing. */
  min?: number;
  max?: number;
  base: number;
  baseAt: number;
};
const ACTIVE_BASE_DOC = "admin_private/communityActive";
const MAX_ACTIVE_BASE = 100_000;
const MAX_WINDOWS = 12;
const LEGACY_EVERY_MIN = 15;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export function minuteOf(hhmm: string): number {
  const m = HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}
/** Minute of the day in Manila (UTC+8), 0..1439. */
export function manilaMinute(now: number): number {
  return Math.floor(((now + 8 * 3_600_000) % 86_400_000) / 60_000);
}
/** Does the window cover this minute? `end` is inclusive (5:59 means up to 5:59:59); end < start wraps past midnight. */
export function windowCovers(w: ActiveWindow, minute: number): boolean {
  const s = minuteOf(w.start), e = minuteOf(w.end);
  if (s < 0 || e < 0) return false;
  return s <= e ? minute >= s && minute <= e : minute >= s || minute <= e;
}
export function windowsOf(cfg: Partial<ActiveBase>): ActiveWindow[] {
  if (Array.isArray(cfg.windows) && cfg.windows.length) return cfg.windows;
  if (Number.isFinite(Number(cfg.min)) && Number.isFinite(Number(cfg.max))) {
    const min = Math.max(0, Math.floor(Number(cfg.min)));
    return [{ start: "00:00", end: "23:59", min, max: Math.max(min, Math.floor(Number(cfg.max))), everyMin: LEGACY_EVERY_MIN }];
  }
  return [];
}
/**
 * One drift step: a few steps up or down inside the range; from outside, ease
 * toward it. The easing step is half the remaining distance (at least a fifth
 * of the range), so a busy-evening → quiet-night hand-over takes about six
 * changes however far apart the two ranges are.
 */
export function driftStep(current: number, min: number, max: number): number {
  const span = Math.max(0, max - min);
  if (current < min || current > max) {
    const dist = current < min ? min - current : current - max;
    const step = Math.min(dist, Math.max(1, Math.ceil(dist * 0.5), Math.round(span * 0.2)));
    return current < min ? current + step : current - step;
  }
  const step = Math.max(1, Math.round(span * 0.1));
  const next = current + randomInt(-step, step + 1);
  return Math.min(max, Math.max(min, next));
}

async function recomputeOnline(forceRedraw: boolean): Promise<{ real: number; base: number; shown: number }> {
  const rtdb = getDatabase();
  const now = Date.now();
  const snap = await rtdb.ref("community/presence").once("value");
  const cutoff = now - 12 * 3_600_000;
  const stale: Record<string, null> = {};
  let real = 0;
  snap.forEach((user) => {
    let live = false;
    user.forEach((conn) => {
      const at = conn.val();
      if (typeof at === "number" && at > cutoff) live = true;
      else stale[`community/presence/${user.key}/${conn.key}`] = null;
    });
    if (live) real++;
  });

  const cfgSnap = await db.doc(ACTIVE_BASE_DOC).get();
  const cfg = (cfgSnap.exists ? cfgSnap.data() : {}) as Partial<ActiveBase>;
  let base = 0;
  let baseAt = cfg.baseAt ?? 0;
  let window: ActiveWindow | null = null;
  if (cfg.enabled === true) {
    const minute = manilaMinute(now);
    window = windowsOf(cfg).find((w) => windowCovers(w, minute)) ?? null;
  }
  if (window) {
    const min = Math.max(0, Math.floor(Number(window.min) || 0));
    const max = Math.max(min, Math.floor(Number(window.max) || 0));
    const everyMs = Math.max(1, Math.floor(Number(window.everyMin) || LEGACY_EVERY_MIN)) * 60_000;
    const current = Number(cfg.base);
    // Keep the number until the window's interval has passed (a few seconds of
    // slack for the scheduler). A fresh switch-on or an admin save draws anew.
    const due = now - baseAt >= everyMs - 20_000;
    if (forceRedraw || !Number.isFinite(current) || current <= 0) {
      base = randomInt(min, max + 1);
      baseAt = now;
    } else if (due) {
      base = driftStep(current, min, max);
      baseAt = now;
    } else {
      base = current;
    }
  }
  const shown = real + base;
  await rtdb.ref().update({ ...stale, "community/online": shown });
  await db.doc(ACTIVE_BASE_DOC).set({ base, baseAt, real, shown, updatedAt: now, window }, { merge: true });
  return { real, base, shown };
}

/** Check a windows list from the admin; returns the clean list or a message for them. */
function cleanWindows(raw: unknown): { windows?: ActiveWindow[]; error?: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "Add at least one time window." };
  if (raw.length > MAX_WINDOWS) return { error: `Up to ${MAX_WINDOWS} windows.` };
  const windows: ActiveWindow[] = [];
  for (const [i, r] of (raw as Record<string, unknown>[]).entries()) {
    const start = String(r?.start ?? ""), end = String(r?.end ?? "");
    const min = Math.floor(Number(r?.min)), max = Math.floor(Number(r?.max)), everyMin = Math.floor(Number(r?.everyMin));
    const n = `Window ${i + 1}`;
    if (minuteOf(start) < 0 || minuteOf(end) < 0) return { error: `${n}: choose a start and an end time.` };
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > MAX_ACTIVE_BASE) return { error: `${n}: enter a range between 0 and ${MAX_ACTIVE_BASE.toLocaleString()}.` };
    if (max < min) return { error: `${n}: the highest number must not be lower than the lowest.` };
    if (!Number.isFinite(everyMin) || everyMin < 1 || everyMin > 1440) return { error: `${n}: "change every" is 1 to 1440 minutes.` };
    windows.push({ start, end, min, max, everyMin });
  }
  // Two windows must not cover the same minute — the number could not know which range to follow.
  for (let m = 0; m < 1440; m += 1) {
    const hits = windows.filter((w) => windowCovers(w, m));
    if (hits.length > 1) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0"), mm = String(m % 60).padStart(2, "0");
      return { error: `Two windows overlap at ${hh}:${mm}. Make each minute belong to one window.` };
    }
  }
  return { windows };
}

/**
 * The admin's Community Room permissions live in Firestore `settings/platform.community`
 * (Storage rules read them there). The Realtime Database rules that guard the
 * room can't read Firestore, so the five toggles are mirrored to
 * `community/settings` whenever the settings change.
 */
const COMMUNITY_DEFAULTS = { membersImages: true, membersVideo: false, membersLinks: false, modsVideo: true, modsLinks: true };
export function communitySettingsOf(data: FirebaseFirestore.DocumentData | undefined): typeof COMMUNITY_DEFAULTS {
  const c = (data?.community ?? {}) as Partial<Record<keyof typeof COMMUNITY_DEFAULTS, unknown>>;
  const out = { ...COMMUNITY_DEFAULTS };
  for (const k of Object.keys(COMMUNITY_DEFAULTS) as (keyof typeof COMMUNITY_DEFAULTS)[]) {
    if (typeof c[k] === "boolean") out[k] = c[k] as boolean;
  }
  return out;
}
export const onPlatformSettingsWritten = onDocumentWritten("settings/platform", async (event) => {
  const after = event.data?.after.exists ? event.data.after.data() : undefined;
  await getDatabase().ref("community/settings").set(communitySettingsOf(after));
});

/**
 * New sign-up → the admin's welcome message goes into their private chat, the
 * thread is marked "new member" for the inbox, and the member's record is
 * stamped so the app shows the welcome pop-up once. Nothing is sent when the
 * admin has switched the welcome off. Test sign-ups (example.com) are skipped.
 */
const DEFAULT_WELCOME_TEXT =
  "Welcome to Investure, {{name}}!\n\nCongratulations on joining — we're glad to have you. If you have any question, big or small, just message us and we'll reply right here in the app.";
export const onUserCreatedWelcome = onDocumentCreated("users/{uid}", async (event) => {
  const uid = event.params.uid;
  const u = event.data?.data() as { profile?: { name?: string; email?: string; joinedAt?: number }; isAdmin?: boolean } | undefined;
  if (!u || u.isAdmin === true) return;
  const email = String(u.profile?.email ?? "").toLowerCase();
  if (email.endsWith("@example.com")) return; // throwaway test accounts
  const settings = (await db.doc("settings/platform").get()).data() as { welcome?: { enabled?: boolean; text?: string } } | undefined;
  const w = settings?.welcome ?? {};
  if (w.enabled === false) return;
  const text = String(w.text || DEFAULT_WELCOME_TEXT).slice(0, 600);
  const name = String(u.profile?.name ?? "").trim();
  const first = name.split(/\s+/)[0] || "there";
  const filled = text.replace(/\{\{\s*name\s*\}\}/gi, first);
  const now = Date.now();
  const rtdb = getDatabase();
  const id = rtdb.ref(`community/inbox/${uid}`).push().key as string;
  await rtdb.ref().update({
    [`community/inbox/${uid}/${id}`]: { from: "admin", name: "Admin", kind: "text", text: filled, at: now },
    [`community/inboxMeta/${uid}`]: {
      name: (name || email.split("@")[0] || "Member").slice(0, 40),
      ...(email ? { email } : {}),
      lastAt: now,
      lastText: filled.replace(/\s+/g, " ").slice(0, 120),
      lastFrom: "admin",
      newMember: true,
      joinedAt: u.profile?.joinedAt ?? now,
    },
  });
  await db.collection("users").doc(uid).set({ welcomeSentAt: now }, { merge: true });
  logger.info("welcome sent", { uid });
});

/**
 * Admin: set (or switch off) the time windows behind "N active now". Applies at
 * once. Also accepts the older `{ min, max }` shape as one all-day window.
 */
export const adminSetCommunityActive = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const caller = await db.collection("users").doc(request.auth.uid).get();
  if (caller.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
  const d = (request.data ?? {}) as { enabled?: unknown; windows?: unknown; min?: unknown; max?: unknown };
  const enabled = d.enabled === true;
  const raw = Array.isArray(d.windows)
    ? d.windows
    : d.min !== undefined || d.max !== undefined
      ? [{ start: "00:00", end: "23:59", min: d.min, max: d.max, everyMin: LEGACY_EVERY_MIN }]
      : undefined;
  let windows: ActiveWindow[] | undefined;
  if (raw !== undefined) {
    const c = cleanWindows(raw);
    if (c.error) {
      if (enabled) throw new HttpsError("invalid-argument", c.error);
    } else {
      windows = c.windows;
    }
  } else if (enabled && windowsOf((await db.doc(ACTIVE_BASE_DOC).get()).data() ?? {}).length === 0) {
    throw new HttpsError("invalid-argument", "Add at least one time window.");
  }
  await db.doc(ACTIVE_BASE_DOC).set(
    { enabled, ...(windows ? { windows, min: FieldValue.delete(), max: FieldValue.delete() } : {}) },
    { merge: true },
  );
  return { ok: true, enabled, ...(await recomputeOnline(true)) };
});

export const updateCommunityStats = onSchedule("every 24 hours", async () => {
  const s = await computeCommunityStats();
  logger.info("community stats", s);
});

/** Admin-triggered recount for the "Refresh" button. */
export const refreshCommunityStats = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const caller = await db.collection("users").doc(request.auth.uid).get();
  if (caller.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
  return computeCommunityStats();
});
