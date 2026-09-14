import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDatabase } from "firebase-admin/database";
import { logger } from "firebase-functions";
import { db } from "./init";

// Community chat lives entirely in Realtime Database (bandwidth-priced) and
// clients write directly under security rules — no function on the send path.
// These two helpers are the only server pieces:
//   * ensureCommunityAdmin mirrors the Firestore `isAdmin` flag into RTDB
//     (`admins/{uid}`) so RTDB rules can grant moderator powers.
//   * pruneCommunityRoom keeps the public room bounded so storage never grows.

const ROOM_KEEP = 500;

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

export const pruneCommunityRoom = onSchedule("every 24 hours", async () => {
  const rtdb = getDatabase();
  const snap = await rtdb.ref("community/room").orderByChild("at").once("value");
  const keys: string[] = [];
  snap.forEach((child) => {
    keys.push(child.key as string);
  });
  const excess = keys.length - ROOM_KEEP;
  if (excess <= 0) return;
  const updates: Record<string, null> = {};
  for (const key of keys.slice(0, excess)) updates[`community/room/${key}`] = null;
  await rtdb.ref().update(updates);
  logger.info("pruned community room", { removed: excess, kept: ROOM_KEEP });
});
