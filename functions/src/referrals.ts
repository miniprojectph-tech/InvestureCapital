import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { db } from "./init";

const DAY_MS = 86_400_000;

type ReferralBonusType = "percentage" | "fixed";
type ReferralReleaseType = "instant" | "pending" | "afterClearing";
type ReferralStatus = "queued" | "released" | "pending" | "locked" | "cancelled";

type ReferralClaim = {
  referrerUserId: string;
  referredUserId: string;
  referredUserName?: string;
  planId: string;
  planName?: string;
  planAmount: number;
  referralBonusType?: ReferralBonusType;
  referralBonusValue?: number;
  referralReleaseType?: ReferralReleaseType;
  clearingPeriodDays?: number;
  status: ReferralStatus;
};

type PlanReferral = {
  referralEnabled?: boolean;
  referralBonusType?: ReferralBonusType;
  referralBonusValue?: number;
  referralReleaseType?: ReferralReleaseType;
  clearingPeriodDays?: number;
};

function computeBonus(cfg: PlanReferral, planAmount: number): number {
  if (!cfg.referralEnabled) return 0;
  const value = cfg.referralBonusValue ?? 0;
  if (cfg.referralBonusType === "fixed") return Math.max(0, value);
  return Math.max(0, planAmount * (value / 100));
}

/**
 * Validate a filed referral claim and credit the referrer. Runs with admin
 * privileges so it can write the referrer's user doc (the referred user can't).
 * Idempotent: only acts while the claim is still 'queued', inside a transaction.
 */
export const onReferralClaim = onDocumentCreated(
  "referral_transactions/{txnId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data() as ReferralClaim;
    if (claim.status !== "queued") return;

    const txnRef = snap.ref;

    // Prefer the live plan's settings over the client-sent snapshot so a user
    // can't inflate the bonus. Fall back to the snapshot only if the plan is gone.
    let cfg: PlanReferral;
    try {
      const planSnap = await db.collection("plans").doc(claim.planId).get();
      cfg = planSnap.exists
        ? (planSnap.data() as PlanReferral)
        : {
            referralEnabled: true,
            referralBonusType: claim.referralBonusType,
            referralBonusValue: claim.referralBonusValue,
            referralReleaseType: claim.referralReleaseType,
            clearingPeriodDays: claim.clearingPeriodDays,
          };
    } catch (err) {
      logger.error("onReferralClaim: plan load failed", err);
      cfg = {
        referralEnabled: true,
        referralBonusType: claim.referralBonusType,
        referralBonusValue: claim.referralBonusValue,
        referralReleaseType: claim.referralReleaseType,
        clearingPeriodDays: claim.clearingPeriodDays,
      };
    }

    // Security: no self-referral, referrer must exist, plan must pay a bonus.
    const invalid =
      !claim.referrerUserId ||
      claim.referrerUserId === claim.referredUserId ||
      !cfg.referralEnabled;

    const amount = computeBonus(cfg, claim.planAmount);
    if (invalid || amount <= 0) {
      await txnRef.update({
        status: "cancelled" as ReferralStatus,
        referralBonusAmount: 0,
        processedAt: Date.now(),
        updatedAt: Date.now(),
      });
      return;
    }

    const releaseType: ReferralReleaseType = cfg.referralReleaseType ?? "instant";
    const clearingDays = cfg.clearingPeriodDays ?? 0;
    const now = Date.now();

    let finalStatus: ReferralStatus;
    let bucket: "available" | "pending" | "locked";
    let releaseDate: number | null = null;
    if (releaseType === "pending") {
      finalStatus = "pending";
      bucket = "pending";
    } else if (releaseType === "afterClearing") {
      finalStatus = "locked";
      bucket = "locked";
      releaseDate = now + clearingDays * DAY_MS;
    } else {
      finalStatus = "released";
      bucket = "available";
    }

    const referrerRef = db.collection("users").doc(claim.referrerUserId);

    try {
      await db.runTransaction(async (tx: Transaction) => {
        // Re-read the claim to guarantee idempotency across retries.
        const fresh = await tx.get(txnRef);
        if (!fresh.exists || (fresh.data() as ReferralClaim).status !== "queued") return;

        const rSnap = await tx.get(referrerRef);
        if (!rSnap.exists) {
          tx.update(txnRef, {
            status: "cancelled" as ReferralStatus,
            referralBonusAmount: 0,
            processedAt: now,
            updatedAt: now,
          });
          return;
        }

        tx.update(referrerRef, {
          [`referralWallet.${bucket}`]: FieldValue.increment(amount),
          "referralWallet.totalEarned": FieldValue.increment(amount),
        });

        tx.update(txnRef, {
          status: finalStatus,
          referralBonusAmount: amount,
          referralBonusType: cfg.referralBonusType ?? claim.referralBonusType ?? "percentage",
          referralBonusValue: cfg.referralBonusValue ?? claim.referralBonusValue ?? 0,
          referralReleaseType: releaseType,
          clearingPeriodDays: clearingDays,
          ...(releaseDate != null ? { releaseDate } : {}),
          processedAt: now,
          updatedAt: now,
        });

        // Activity entry on the referrer's feed.
        const actRef = referrerRef.collection("activity").doc();
        tx.set(actRef, {
          type: "deposit",
          title: "Referral bonus earned",
          subtitle: `${claim.referredUserName || "A referral"} activated ${claim.planName || "a plan"} · ${finalStatus}`,
          amount,
          amountKind: "in",
          at: FieldValue.serverTimestamp(),
        });
      });
    } catch (err) {
      logger.error("onReferralClaim: crediting failed", err);
    }
  }
);

/**
 * Flip locked referral bonuses to available once their clearing period has
 * passed. Called from the scheduled maintenance run. Queries by status only
 * (single-field index) and filters releaseDate in memory to avoid a composite
 * index. Each release runs in its own idempotent transaction.
 */
export async function releaseLockedReferrals(now: number): Promise<number> {
  const snap = await db
    .collection("referral_transactions")
    .where("status", "==", "locked")
    .get();

  let released = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const releaseDate = typeof data.releaseDate === "number" ? data.releaseDate : null;
    if (releaseDate == null || releaseDate > now) continue;

    const amount = typeof data.referralBonusAmount === "number" ? data.referralBonusAmount : 0;
    const referrerId = data.referrerUserId as string | undefined;
    if (!referrerId || amount <= 0) continue;

    try {
      await db.runTransaction(async (tx: Transaction) => {
        const fresh = await tx.get(docSnap.ref);
        if (!fresh.exists || (fresh.data() as { status: string }).status !== "locked") return;
        const referrerRef = db.collection("users").doc(referrerId);
        tx.update(referrerRef, {
          "referralWallet.locked": FieldValue.increment(-amount),
          "referralWallet.available": FieldValue.increment(amount),
        });
        tx.update(docSnap.ref, { status: "released", updatedAt: now });
      });
      released++;
    } catch (err) {
      logger.error(`releaseLockedReferrals: failed for ${docSnap.id}`, err);
    }
  }
  return released;
}
