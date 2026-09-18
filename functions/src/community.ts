import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
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
