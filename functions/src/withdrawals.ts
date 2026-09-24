import { onDocumentWritten } from "firebase-functions/v2/firestore";
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

const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
