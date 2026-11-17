import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./init";
import { peso } from "./compplan-config";

// ============================================================================
// Admin wallet adjustment — add to or remove from a member's wallet with a
// tag the admin types (Adjustment, Referral, Bonus, Refund, …).
//
//  * The member sees it: one line in their Activity (title = tag, subtitle =
//    the line the admin wrote) and, if ticked, a bell notice.
//  * A removal may take the wallet BELOW ZERO (e.g. the money was already
//    withdrawn). Every wallet debit (withdrawals, wallet placements, event
//    slots) already requires wallet >= amount, so a negative wallet can't be
//    spent, and the member's next earnings pay it back first.
//  * The admin's note, name and the before/after balances go to admin_audit
//    (type "wallet_adjusted"), which is also what Admin › Investors › Wallet ›
//    Adjustments lists.
// ============================================================================

const MAX_AMOUNT = 10_000_000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

type Args = {
  userId?: string;
  direction?: "add" | "remove";
  amount?: number;
  tag?: string;
  message?: string;
  notify?: boolean;
  note?: string;
};

export const adminAdjustWallet = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const adminUid = request.auth.uid;
  const adminSnap = await db.collection("users").doc(adminUid).get();
  if (!adminSnap.exists || adminSnap.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
  const adminName = (adminSnap.data()?.profile?.name as string | undefined) || "Admin";

  const a = (request.data ?? {}) as Args;
  const userId = typeof a.userId === "string" ? a.userId : "";
  if (!userId) throw new HttpsError("invalid-argument", "Choose a member.");
  if (a.direction !== "add" && a.direction !== "remove") throw new HttpsError("invalid-argument", "Choose Add or Remove.");
  const amount = round2(Number(a.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpsError("invalid-argument", "Enter an amount above ₱0.");
  if (amount > MAX_AMOUNT) throw new HttpsError("invalid-argument", `The most one adjustment can move is ${peso(MAX_AMOUNT)}.`);
  const tag = clean(a.tag, 30);
  if (!tag) throw new HttpsError("invalid-argument", "Choose or type a tag.");
  const message = clean(a.message, 160);
  const note = clean(a.note, 300);
  const notify = a.notify !== false;
  const add = a.direction === "add";
  const now = Date.now();

  const result = await db.runTransaction(async (tx) => {
    const ref = db.collection("users").doc(userId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Member not found.");
    const u = snap.data() ?? {};
    const before = round2(Number(u.balances?.wallet ?? 0) || 0);
    const after = round2(before + (add ? amount : -amount));
    const userName = (u.profile?.name as string | undefined) || (u.profile?.email as string | undefined)?.split("@")[0] || userId.slice(0, 6);

    tx.update(ref, { "balances.wallet": after });

    // What the member sees in their history.
    tx.set(ref.collection("activity").doc(), {
      type: "wallet-adjustment",
      title: tag,
      subtitle: message || (add ? "Added to your wallet" : "Removed from your wallet"),
      amount,
      amountKind: add ? "in" : "out",
      tag,
      at: FieldValue.serverTimestamp(),
    });

    if (notify) {
      tx.set(ref.collection("notifications").doc(), {
        type: "wallet-adjustment",
        title: `${tag}: ${add ? "+" : "−"}${peso(amount)}`,
        body: `${message ? `${message.replace(/[.!]+$/, "")}. ` : ""}${add ? "Added to" : "Removed from"} your wallet.`,
        amount,
        at: now,
        read: false,
      });
    }

    // Internal record — the admin note never reaches the member.
    tx.set(db.collection("admin_audit").doc(), {
      type: "wallet_adjusted",
      uid: userId,
      userName,
      direction: add ? "add" : "remove",
      amount,
      tag,
      message,
      note,
      walletBefore: before,
      walletAfter: after,
      notified: notify,
      title: `${tag} ${add ? "+" : "−"}${peso(amount)} for ${userName}`,
      subtitle: `Wallet ${peso(before)} → ${peso(after)}${note ? ` · ${note}` : ""}`,
      by: adminUid,
      byName: adminName,
      at: now,
    });

    return { before, after, userName };
  });

  return { ok: true, walletBefore: result.before, walletAfter: result.after };
});
