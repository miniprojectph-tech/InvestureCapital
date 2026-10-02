import { randomInt } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { logger } from "firebase-functions";
import { db, gameDb } from "./init";

/**
 * ADMIN ONLY: delete a member's account. Members cannot delete their own
 * account — there is no member-facing function for it.
 *
 * Two steps, both through this one function:
 *   { uid, check: true }                      → what the member still has (nothing is changed)
 *   { uid, confirm: "DELETE", force?: true }  → delete
 *
 * If the member still has money or anything in flight (wallet, active
 * placements, referral earnings, a pending withdrawal or placement request)
 * the delete is refused unless `force` is set, so an admin can't wipe a
 * funded account by accident. With `force`, pending requests are closed as
 * rejected with a note, so they don't sit in the admin queues.
 *
 * Kept for the books: processed withdrawals, commissions paid to uplines,
 * match history. Removed: profile, history, notifications, game state, chat
 * identity, ranking rows, referral code and the sign-in itself.
 */

type Outstanding = {
  wallet: number;
  activePlacements: number;
  activeCapital: number;
  referralEarnings: number;
  pendingWithdrawals: number;
  pendingWithdrawalAmount: number;
  pendingPlacementRequests: number;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

async function assertAdmin(uid: string) {
  const snap = await db.collection("users").doc(uid).get();
  if (snap.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
}

export const adminDeleteMember = onCall({ timeoutSeconds: 120 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const adminUid = request.auth.uid;
  await assertAdmin(adminUid);

  const { uid, check, confirm, force } = (request.data ?? {}) as { uid?: unknown; check?: unknown; confirm?: unknown; force?: unknown };
  if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw new HttpsError("invalid-argument", "Member id is required.");
  if (uid === adminUid) throw new HttpsError("failed-precondition", "You can't delete your own account.");

  const userRef = db.collection("users").doc(uid);
  const [userSnap, pendingW, pendingP] = await Promise.all([
    userRef.get(),
    db.collection("withdrawals").where("userId", "==", uid).where("status", "==", "pending").get(),
    db.collection("plan_requests").where("userId", "==", uid).where("status", "==", "pending").get(),
  ]);
  if (!userSnap.exists) throw new HttpsError("not-found", "That member no longer exists.");
  const u = userSnap.data() as {
    isAdmin?: boolean;
    referralCode?: string;
    profile?: { name?: string; email?: string };
    balances?: { wallet?: number };
    placements?: { capital?: number }[];
    referralWallet?: { available?: number; pending?: number; locked?: number };
  };
  if (u.isAdmin === true) throw new HttpsError("failed-precondition", "Admin accounts can't be deleted. Remove the admin role first.");

  const placements = Array.isArray(u.placements) ? u.placements : [];
  const outstanding: Outstanding = {
    wallet: round2(num(u.balances?.wallet)),
    activePlacements: placements.length,
    activeCapital: placements.reduce((s, p) => s + num(p?.capital), 0),
    referralEarnings: round2(num(u.referralWallet?.available) + num(u.referralWallet?.pending) + num(u.referralWallet?.locked)),
    pendingWithdrawals: pendingW.size,
    pendingWithdrawalAmount: round2(pendingW.docs.reduce((s, d) => s + num(d.data().amount), 0)),
    pendingPlacementRequests: pendingP.size,
  };
  const hasOutstanding =
    outstanding.wallet >= 0.01 || outstanding.activePlacements > 0 || outstanding.referralEarnings >= 0.01 ||
    outstanding.pendingWithdrawals > 0 || outstanding.pendingPlacementRequests > 0;
  const member = { uid, name: String(u.profile?.name ?? ""), email: String(u.profile?.email ?? "") };

  if (check === true) return { ok: true, deleted: false, member, outstanding, hasOutstanding };

  if (confirm !== "DELETE") throw new HttpsError("invalid-argument", "Type DELETE to confirm.");
  if (hasOutstanding && force !== true) {
    throw new HttpsError("failed-precondition", "This member still has money or pending requests. Review them, then confirm you want to delete anyway.");
  }

  const now = Date.now();
  // Record first, so there is a trace even if a later step fails.
  await db.collection("admin_audit").add({ type: "member_deleted_by_admin", uid, name: member.name, email: member.email, outstanding, forced: hasOutstanding, by: adminUid, at: now });

  // Close anything waiting in the admin queues.
  const batch = db.batch();
  for (const d of pendingW.docs) batch.update(d.ref, { status: "rejected", note: "Account deleted by admin", processedAt: now, processedBy: adminUid });
  for (const d of pendingP.docs) batch.update(d.ref, { status: "rejected", note: "Account deleted by admin", processedAt: now, processedBy: adminUid });
  if (pendingW.size + pendingP.size > 0) await batch.commit();

  // Member record + everything under it (history, notifications, game state).
  await db.recursiveDelete(userRef);

  const cleanups: Promise<unknown>[] = [
    db.collection("faq_voters").doc(uid).delete(),
    db.collection("test_clocks").doc(uid).delete(),
    db.collection("leaderboard").doc(uid).delete(),
    db.collection("tongits_leaderboard").doc(uid).delete(),
    gameDb.collection("color_game_leaderboard").doc(uid).delete(),
    getDatabase().ref().update({
      [`members/${uid}`]: null,
      [`admins/${uid}`]: null,
      [`chatMods/${uid}`]: null,
      [`community/presence/${uid}`]: null,
      [`community/typing/${uid}`]: null,
      [`community/lastPost/${uid}`]: null,
      [`community/muted/${uid}`]: null,
      [`color/leaderboard/${uid}`]: null,
    }),
  ];
  if (typeof u.referralCode === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(u.referralCode)) {
    cleanups.push(db.collection("referralCodes").doc(u.referralCode).delete());
  }
  const results = await Promise.allSettled(cleanups);
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed) logger.warn("adminDeleteMember: some clean-up steps failed", { uid, failed });

  // Last: the sign-in itself. A sign-in that is already gone is fine.
  await getAuth().deleteUser(uid).catch((e: { code?: string }) => {
    if (e?.code !== "auth/user-not-found") throw e;
  });
  logger.info("member deleted by admin", { uid, by: adminUid, forced: hasOutstanding });
  return { ok: true, deleted: true, member, outstanding, hasOutstanding };
});

/**
 * ADMIN ONLY: help a member who is locked out.
 *
 *   { uid, mode: "link" } → a one-time password-reset link the admin can pass to
 *                           the member (chat, SMS). The member picks their own
 *                           new password; nobody else sees it.
 *   { uid, mode: "temp" } → sets a random temporary password and returns it once,
 *                           and signs the member out everywhere else.
 *
 * Other admins' accounts are refused (an admin must not be able to take over
 * another admin). The link and the password are returned to the caller only —
 * they are never written to the audit log or to the server log.
 */
const TEMP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; // no 0/O, 1/l/I
function tempPassword(): string {
  for (;;) {
    let p = "";
    for (let i = 0; i < 10; i++) p += TEMP_ALPHABET[randomInt(0, TEMP_ALPHABET.length)];
    if (/[0-9]/.test(p) && /[a-z]/.test(p) && /[A-Z]/.test(p)) return p;
  }
}

export const adminResetMemberPassword = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const adminUid = request.auth.uid;
  await assertAdmin(adminUid);

  const { uid, mode } = (request.data ?? {}) as { uid?: unknown; mode?: unknown };
  if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw new HttpsError("invalid-argument", "Member id is required.");
  if (mode !== "link" && mode !== "temp") throw new HttpsError("invalid-argument", "Choose a reset link or a temporary password.");
  if (uid === adminUid) throw new HttpsError("failed-precondition", "Use Profile › Change password for your own account.");

  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) throw new HttpsError("not-found", "Member not found.");
  if (snap.data()?.isAdmin === true) throw new HttpsError("failed-precondition", "Another admin's password can't be reset from here.");

  const auth = getAuth();
  const account = await auth.getUser(uid).catch(() => null);
  if (!account) throw new HttpsError("not-found", "This member has no sign-in account.");
  const email = account.email ?? "";
  const hasPassword = account.providerData.some((p) => p.providerId === "password");
  const usesGoogle = account.providerData.some((p) => p.providerId === "google.com");
  const name = String(snap.data()?.profile?.name ?? "");

  let link: string | undefined;
  let password: string | undefined;
  if (mode === "link") {
    if (!email) throw new HttpsError("failed-precondition", "This member has no email address, so a reset link can't be made. Use a temporary password instead.");
    link = await auth.generatePasswordResetLink(email);
  } else {
    password = tempPassword();
    await auth.updateUser(uid, { password });
    // Anyone still signed in with the old password is signed out.
    await auth.revokeRefreshTokens(uid);
  }

  await db.collection("admin_audit").add({
    type: "member_password_reset", uid, userName: name,
    title: `Password reset for ${name || email || uid}`,
    subtitle: mode === "link" ? "Reset link created by admin" : "Temporary password set by admin",
    mode, by: adminUid, at: Date.now(),
  });
  logger.info("member password reset by admin", { uid, by: adminUid, mode });
  return { ok: true, mode, email, name, hasPassword, usesGoogle, ...(link ? { link } : {}), ...(password ? { tempPassword: password } : {}) };
});
