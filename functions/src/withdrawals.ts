import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { db } from "./init";
import { grantBonusSpins } from "./events";
import { mergeWithdrawalSchedule, releaseDateFor, formatReleaseDate, type WithdrawalScheduleConfig } from "./withdrawalSchedule";

type Withdrawal = {
  userId: string;
  amount: number;
  destination?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  scheduledReleaseAt?: number | null;
  note?: string;
};

const peso = (n: number) => `₱${(Number.isFinite(n) ? n : 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAYOUT_LABEL: Record<string, string> = { gotyme: "GoTyme", gcash: "GCash", bankTransfer: "Bank transfer" };
const MIN_WITHDRAWAL = 1;
const MAX_WITHDRAWAL = 100_000_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

type PayoutMethod = { type?: string; accountName?: string; accountNumber?: string; bankName?: string };

/** "GCash · Juan Dela Cruz · ···· 4567" — built from the member's SAVED payout method. */
function destinationOf(m: PayoutMethod): string {
  const provider = m.type === "bankTransfer" && m.bankName ? m.bankName : PAYOUT_LABEL[m.type ?? ""] ?? "Payout";
  const num = String(m.accountNumber ?? "").replace(/\s+/g, "");
  const tail = num.length <= 4 ? num : `···· ${num.slice(-4)}`;
  return `${provider} · ${String(m.accountName ?? "").slice(0, 80)} · ${tail}`.slice(0, 200);
}

/**
 * A member asks to withdraw from their wallet. The wallet debit and the request
 * are ONE transaction, so money can't leave the wallet without a request, and a
 * request can't exist without the debit behind it. Name, email, destination and
 * release date all come from the server's copy — nothing the caller sends is
 * trusted except the amount.
 */
export const requestWithdrawal = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const uid = request.auth.uid;
  const raw = (request.data as { amount?: unknown } | undefined)?.amount;
  if (typeof raw !== "number" || !Number.isFinite(raw)) throw new HttpsError("invalid-argument", "Enter an amount.");
  const amount = round2(raw);
  if (amount < MIN_WITHDRAWAL) throw new HttpsError("invalid-argument", `The minimum withdrawal is ${peso(MIN_WITHDRAWAL)}.`);
  if (amount > MAX_WITHDRAWAL) throw new HttpsError("invalid-argument", "That amount is too large.");

  const settings = await db.doc("settings/platform").get();
  const schedule: WithdrawalScheduleConfig = mergeWithdrawalSchedule(
    settings.exists ? (settings.data()?.withdrawalSchedule as Partial<WithdrawalScheduleConfig>) : null,
  );
  const now = Date.now();
  const userRef = db.collection("users").doc(uid);
  const wRef = db.collection("withdrawals").doc();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpsError("not-found", "Account not found.");
    const u = snap.data() as { profile?: { name?: string; email?: string }; balances?: { wallet?: number }; payoutMethod?: PayoutMethod };
    const method = u.payoutMethod;
    if (!method || !method.type || !method.accountNumber) {
      throw new HttpsError("failed-precondition", "Set up your mode of payout first.");
    }
    const wallet = Number(u.balances?.wallet ?? 0);
    if (!Number.isFinite(wallet) || wallet < amount) throw new HttpsError("failed-precondition", "Insufficient wallet balance.");
    tx.update(userRef, { "balances.wallet": round2(wallet - amount) });
    tx.set(wRef, {
      userId: uid,
      userName: String(u.profile?.name ?? "").slice(0, 80),
      userEmail: String(u.profile?.email ?? request.auth?.token.email ?? "").slice(0, 120),
      amount,
      type: "short-term",
      destination: destinationOf(method),
      status: "pending",
      createdAt: now,
      scheduledReleaseAt: releaseDateFor(now, schedule),
    });
  });
  return { ok: true, id: wRef.id, amount };
});

/**
 * Bell notifications for the withdrawal lifecycle. Members can't write their
 * own notifications (rules), so this runs server-side on every change to a
 * withdrawals doc:
 *   created            → "request received" with the scheduled release date
 *   pending → approved → "released"
 *   pending → rejected → "rejected" (wallet refunded by the admin action)
 */
export const onWithdrawalWritten = onDocumentWritten("withdrawals/{id}", async (event) => {
  const before = event.data?.before.exists ? (event.data.before.data() as Withdrawal) : null;
  const after = event.data?.after.exists ? (event.data.after.data() as Withdrawal) : null;
  if (!after || !after.userId) return;

  const now = Date.now();
  const write = (data: { type: string; title: string; body: string; amount: number }) =>
    db.collection("users").doc(after.userId).collection("notifications").add({ ...data, withdrawalId: event.params.id, at: now, read: false });

  if (!before) {
    // Fill in the release date if the client didn't (older app bundle).
    let releaseAt = after.scheduledReleaseAt ?? null;
    if (releaseAt == null) {
      const s = await db.doc("settings/platform").get();
      const cfg: WithdrawalScheduleConfig = mergeWithdrawalSchedule(s.exists ? (s.data()?.withdrawalSchedule as Partial<WithdrawalScheduleConfig>) : null);
      releaseAt = releaseDateFor(after.createdAt ?? now, cfg);
      if (releaseAt != null) await event.data!.after.ref.update({ scheduledReleaseAt: releaseAt }).catch(() => {});
    }
    await write({
      type: "withdrawal",
      title: `Withdrawal request received — ${peso(after.amount)}`,
      body: releaseAt != null
        ? `Scheduled for release on ${formatReleaseDate(releaseAt, { withYear: true })}${after.destination ? ` to ${after.destination}` : ""}. Funds are held until then.`
        : `Pending admin approval${after.destination ? ` · ${after.destination}` : ""}.`,
      amount: after.amount,
    });
    return;
  }

  if (before.status === after.status) return;
  if (after.status === "approved") {
    grantBonusSpins(after.userId, "withdrawal").catch(() => {});
    await write({
      type: "withdrawal",
      title: `Withdrawal released — ${peso(after.amount)}`,
      body: `Sent${after.destination ? ` to ${after.destination}` : ""}.${after.note ? ` ${after.note}` : ""}`,
      amount: after.amount,
    });
  } else if (after.status === "rejected") {
    await write({
      type: "withdrawal",
      title: `Withdrawal rejected — ${peso(after.amount)} returned to your wallet`,
      body: after.note ? `Reason: ${after.note}` : "The amount is back in your wallet.",
      amount: after.amount,
    });
  }
  logger.info("withdrawal notification", { id: event.params.id, status: after.status });
});
