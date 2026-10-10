import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./init";
import { recordPoints } from "./points-ledger";

/**
 * Admin: set a player's Game Points by hand. Goes through the ledger like
 * every other movement (type admin_set, signed by the difference) and is
 * written to admin_audit, so a manual edit is never mistaken for a game win.
 */
export const adminSetPoints = onCall(async (request) => {
  const adminUid = request.auth?.uid;
  if (!adminUid) throw new HttpsError("unauthenticated", "Sign in required.");
  const caller = await db.collection("users").doc(adminUid).get();
  if (caller.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
  const d = (request.data ?? {}) as { uid?: unknown; points?: unknown; note?: unknown };
  const uid = typeof d.uid === "string" ? d.uid : "";
  if (!uid) throw new HttpsError("invalid-argument", "Pick a member.");
  const target = Math.round(Number(d.points));
  if (!Number.isFinite(target) || target < 0 || target > 100_000_000) throw new HttpsError("invalid-argument", "Enter a number of points from 0 to 100,000,000.");
  const note = typeof d.note === "string" ? d.note.trim().slice(0, 200) : "";
  const member = await db.collection("users").doc(uid).get();
  if (!member.exists) throw new HttpsError("not-found", "That member no longer exists.");
  const name = (member.data()?.profile as { name?: string } | undefined)?.name ?? uid;
  const now = Date.now();
  const stateRef = db.doc(`users/${uid}/game/state`);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(stateRef);
    const before = Number((snap.data() as { points?: number } | undefined)?.points ?? 0);
    const delta = target - before;
    tx.set(stateRef, { points: target }, { merge: true });
    recordPoints(tx, {
      uid, name, at: now, type: "admin_set", delta, balanceAfter: target,
      description: note ? `Set by admin: ${note}` : "Set by admin",
      ref: { by: adminUid },
      stats: { "admin.edits": 1, "admin.up": Math.max(0, delta), "admin.down": Math.max(0, -delta) },
      daily: { adminUp: Math.max(0, delta), adminDown: Math.max(0, -delta) },
    });
    return { before, after: target, delta };
  });
  await db.collection("admin_audit").add({
    type: "points_set", uid, userName: name,
    title: `Game Points set to ${target.toLocaleString()} for ${name}`,
    subtitle: `${result.before.toLocaleString()} → ${target.toLocaleString()} (${result.delta >= 0 ? "+" : ""}${result.delta.toLocaleString()})${note ? ` · ${note}` : ""}`,
    before: result.before, after: target, note, by: adminUid, at: now,
  });
  return result;
});
