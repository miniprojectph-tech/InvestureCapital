import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { logger } from "firebase-functions";
import { db, gameDb } from "./init";

/**
 * A member deletes their own account.
 *
 * Refused while there is anything of value or anything in flight: money in the
 * wallet, running placements, a pending withdrawal or a pending placement
 * request. The member withdraws or waits first, so closing an account can
 * never make money disappear or strand a request the admin is processing.
 *
 * Requires a fresh sign-in (the app re-confirms the password or Google account
 * right before calling). Financial records that belong to the platform's books
 * (processed withdrawals, commissions paid to uplines) are kept; the member's
 * profile, history, chat identity, game state and sign-in are removed.
 */
const FRESH_SIGN_IN_SECONDS = 10 * 60;

export const deleteMyAccount = onCall({ timeoutSeconds: 120 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const uid = request.auth.uid;
  const confirm = (request.data as { confirm?: unknown } | undefined)?.confirm;
  if (confirm !== "DELETE") throw new HttpsError("invalid-argument", "Type DELETE to confirm.");

  const authTime = Number(request.auth.token.auth_time ?? 0);
  if (!authTime || Date.now() / 1000 - authTime > FRESH_SIGN_IN_SECONDS) {
    throw new HttpsError("failed-precondition", "Please confirm your password again, then retry.");
  }

  const userRef = db.collection("users").doc(uid);
  const [userSnap, pendingW, pendingP] = await Promise.all([
    userRef.get(),
    db.collection("withdrawals").where("userId", "==", uid).where("status", "==", "pending").limit(1).get(),
    db.collection("plan_requests").where("userId", "==", uid).where("status", "==", "pending").limit(1).get(),
  ]);
  const u = (userSnap.data() ?? {}) as {
    isAdmin?: boolean;
    referralCode?: string;
    balances?: { wallet?: number };
    placements?: unknown[];
    referralWallet?: { available?: number; pending?: number; locked?: number };
  };

  if (u.isAdmin === true) throw new HttpsError("failed-precondition", "Admin accounts can't be deleted from here.");
  const wallet = Number(u.balances?.wallet ?? 0);
  if (wallet >= 0.01) throw new HttpsError("failed-precondition", "You still have money in your wallet. Withdraw it first, then delete your account.");
  if (Array.isArray(u.placements) && u.placements.length > 0) {
    throw new HttpsError("failed-precondition", "You have active placements. Your account can be deleted after they complete and the balance is withdrawn.");
  }
  const rw = u.referralWallet ?? {};
  if (Number(rw.available ?? 0) + Number(rw.pending ?? 0) + Number(rw.locked ?? 0) >= 0.01) {
    throw new HttpsError("failed-precondition", "You still have referral earnings. Move them to your wallet and withdraw first.");
  }
  if (!pendingW.empty) throw new HttpsError("failed-precondition", "You have a withdrawal waiting to be released. Delete your account after it is sent.");
  if (!pendingP.empty) throw new HttpsError("failed-precondition", "You have a placement request waiting for approval. Delete your account after it is processed.");

  // Record first (no personal details), so there is a trace even if a later step fails.
  await db.collection("admin_audit").add({ type: "account_deleted_by_member", uid, at: Date.now() });

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
  if (failed) logger.warn("deleteMyAccount: some clean-up steps failed", { uid, failed });

  // Last: the sign-in itself. After this the member's session is invalid.
  await getAuth().deleteUser(uid);
  logger.info("account deleted by member", { uid });
  return { ok: true };
});
