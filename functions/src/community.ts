import { randomInt } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten, onDocumentCreated } from "firebase-functions/v2/firestore";
import { getDatabase } from "firebase-admin/database";
import { getStorage } from "firebase-admin/storage";
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
export const updateOnlineCount = onSchedule("every 5 minutes", async () => {
  await recomputeOnline(false);
});

/**
 * Admin-set starting number for "N active now". When switched on, the number
 * members see is a base drawn at random from [min, max] — redrawn every 15
 * minutes — PLUS the members really connected. The settings and the real count
 * live in `admin_private` (admins only); members only ever get the final number
 * at `community/online`.
 */
type ActiveBase = { enabled: boolean; min: number; max: number; base: number; baseAt: number };
const ACTIVE_BASE_DOC = "admin_private/communityActive";
const BASE_REDRAW_MS = 15 * 60_000;
const MAX_ACTIVE_BASE = 100_000;

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
  if (cfg.enabled === true) {
    const min = Math.max(0, Math.floor(Number(cfg.min) || 0));
    const max = Math.max(min, Math.floor(Number(cfg.max) || 0));
    const current = Number(cfg.base);
    // Keep the number for the full 15 minutes (a few seconds of slack for the
    // scheduler), unless the range was just changed or it no longer fits.
    const due = now - baseAt >= BASE_REDRAW_MS - 20_000;
    if (forceRedraw || due || !Number.isFinite(current) || current < min || current > max) {
      base = randomInt(min, max + 1);
      baseAt = now;
    } else {
      base = current;
    }
  }
  const shown = real + base;
  await rtdb.ref().update({ ...stale, "community/online": shown });
  await db.doc(ACTIVE_BASE_DOC).set({ base, baseAt, real, shown, updatedAt: now }, { merge: true });
  return { real, base, shown };
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

/** Admin: set (or switch off) the starting range for "N active now". Applies at once. */
export const adminSetCommunityActive = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const caller = await db.collection("users").doc(request.auth.uid).get();
  if (caller.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
  const d = (request.data ?? {}) as { enabled?: unknown; min?: unknown; max?: unknown };
  const enabled = d.enabled === true;
  const min = Math.floor(Number(d.min));
  const max = Math.floor(Number(d.max));
  if (enabled) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > MAX_ACTIVE_BASE) {
      throw new HttpsError("invalid-argument", `Enter a range between 0 and ${MAX_ACTIVE_BASE.toLocaleString()}.`);
    }
    if (max < min) throw new HttpsError("invalid-argument", "The highest number must not be lower than the lowest.");
  }
  await db.doc(ACTIVE_BASE_DOC).set(
    { enabled, ...(Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max >= min && max <= MAX_ACTIVE_BASE ? { min, max } : {}) },
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
