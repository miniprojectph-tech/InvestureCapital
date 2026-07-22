import {
  FieldValue,
  type DocumentReference,
  type Transaction,
} from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { db } from "./init";

// Game functions live in their own module.
export { castLine, claimQuest, claimDailyEnergy, redeemReward, fishOfTheHour, weeklyReef } from "./game";

// Referral system: claim processor + locked-bonus release helper.
import { onReferralClaim, releaseLockedReferrals } from "./referrals";
export { onReferralClaim };

// Community Tongits (Phase 1): room + economy callables + stale-room reaper.
import { reapStaleTongitsRooms } from "./tongits";
export {
  createTongitsRoom,
  joinTongitsRoom,
  setTongitsReady,
  confirmTongitsChallenge,
  leaveTongitsRoom,
  cancelTongitsRoom,
} from "./tongits";

// Community Tongits (Phase 2): the game engine callables.
export {
  startTongitsGame,
  tongitsDraw,
  tongitsTakeDiscard,
  tongitsMeld,
  tongitsSapaw,
  tongitsDiscard,
  tongitsCall,
  tongitsFightRespond,
  enforceTongitsTimeout,
  tongitsPlayAgain,
  splitTongitsJackpot,
  tongitsPostGameRespond,
  tongitsResolvePostGame,
  tongitsIdleAction,
} from "./tongits-game";

const DAY_MS = 86_400_000;

type StoredActivePlan = {
  id: string;
  planId: string;
  capital: number;
  startedAt: number;
  // Snapshot of terms at activation — used if the template is later deleted.
  dailyRate?: number;
  durationDays?: number;
  planName?: string;
  daysCredited?: number;
};

type CompletedPlan = StoredActivePlan & {
  completedAt: number;
  vaultCredited: number;
  capitalReturned: number;
};

type UserState = {
  profile?: { name?: string; email?: string };
  balances: {
    wallet: number;
    vault: number;
    vaultLockStartedAt: number | null;
    vaultLastCompoundedAt?: number | null;
  };
  activePlans: StoredActivePlan[];
  completedPlans?: CompletedPlan[];
};

type PlanTemplate = {
  id: string;
  name: string;
  dailyRate: number; // percent
  durationDays: number;
};

async function loadPlanTemplates(): Promise<Map<string, PlanTemplate>> {
  const snap = await db.collection("plans").get();
  const map = new Map<string, PlanTemplate>();
  for (const doc of snap.docs) {
    const data = doc.data();
    map.set(doc.id, {
      id: doc.id,
      name: data.name ?? doc.id,
      dailyRate: data.dailyRate ?? 0,
      durationDays: data.durationDays ?? 0,
    });
  }
  return map;
}

async function loadVaultDailyRate(): Promise<number> {
  const snap = await db.doc("settings/platform").get();
  const rate = snap.exists ? snap.data()?.vaultDailyRate : undefined;
  return typeof rate === "number" ? rate : 1.0;
}

function activityRef(uid: string): DocumentReference {
  return db.collection("users").doc(uid).collection("activity").doc();
}

/**
 * Processes one user inside a transaction:
 * 1. Credits daily plan earnings to the wallet for each elapsed day.
 * 2. Completes plans whose full duration has been credited.
 * 3. Compounds the vault balance for each full day elapsed.
 */
async function processUser(
  uid: string,
  templates: Map<string, PlanTemplate>,
  vaultDailyRate: number,
  now: number
): Promise<{ completed: number; compounded: boolean }> {
  const ref = db.collection("users").doc(uid);

  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { completed: 0, compounded: false };
    const cur = snap.data() as UserState;

    let wallet = cur.balances?.wallet ?? 0;
    let vault = cur.balances?.vault ?? 0;
    let vaultLockStartedAt = cur.balances?.vaultLockStartedAt ?? null;
    const completedPlans = [...(cur.completedPlans ?? [])];
    const remaining: StoredActivePlan[] = [];
    const activityWrites: { ref: DocumentReference; data: Record<string, unknown> }[] = [];

    let completedCount = 0;
    let earned = false;

    for (const plan of (cur.activePlans ?? [])) {
      const tpl = templates.get(plan.planId);
      const dailyRate = plan.dailyRate ?? tpl?.dailyRate;
      const durationDays = plan.durationDays ?? tpl?.durationDays;
      const name = tpl?.name ?? plan.planName ?? plan.planId;
      if (dailyRate == null || durationDays == null) {
        remaining.push(plan);
        continue;
      }

      const daysCredited = plan.daysCredited ?? 0;
      const daysEligible = Math.min(
        Math.floor((now - plan.startedAt) / DAY_MS),
        durationDays
      );
      const newDays = daysEligible - daysCredited;
      const dailyEarning = plan.capital * (dailyRate / 100);

      if (newDays > 0) {
        const earning = dailyEarning * newDays;
        wallet += earning;
        earned = true;

        activityWrites.push({
          ref: activityRef(uid),
          data: {
            type: "plan-earning",
            title: `Daily income — ${name}`,
            subtitle: `${dailyRate}% × ${newDays} day${newDays > 1 ? "s" : ""} on ${plan.capital.toLocaleString()}`,
            amount: earning,
            amountKind: "in",
            at: FieldValue.serverTimestamp(),
          },
        });
      }

      if (daysEligible >= durationDays) {
        const totalEarnings = dailyEarning * durationDays;
        completedPlans.push({
          ...plan,
          completedAt: now,
          vaultCredited: totalEarnings,
          capitalReturned: plan.capital,
        });
        wallet += plan.capital;
        if (!vaultLockStartedAt) vaultLockStartedAt = now;

        activityWrites.push({
          ref: activityRef(uid),
          data: {
            type: "plan-complete",
            title: `Plan completed — ${name}`,
            subtitle: `Capital ${plan.capital.toLocaleString()} returned · total earned ${totalEarnings.toLocaleString()}`,
            amount: plan.capital,
            amountKind: "in",
            at: FieldValue.serverTimestamp(),
          },
        });
        completedCount++;
      } else {
        remaining.push({ ...plan, daysCredited: daysEligible });
      }
    }

    let vaultLastCompoundedAt = cur.balances?.vaultLastCompoundedAt ?? null;
    let compounded = false;

    if (vault > 0 && !vaultLastCompoundedAt) {
      vaultLastCompoundedAt = now;
    }

    if (vault > 0 && vaultLastCompoundedAt) {
      const daysElapsed = Math.floor((now - vaultLastCompoundedAt) / DAY_MS);
      if (daysElapsed >= 1) {
        const rate = vaultDailyRate / 100;
        const grown = vault * Math.pow(1 + rate, daysElapsed);
        const growth = grown - vault;
        vault = grown;
        compounded = true;
        vaultLastCompoundedAt = vaultLastCompoundedAt + daysElapsed * DAY_MS;

        activityWrites.push({
          ref: activityRef(uid),
          data: {
            type: "vault-growth",
            title: "Vault compounded",
            subtitle: `${vaultDailyRate}% daily × ${daysElapsed} day${daysElapsed > 1 ? "s" : ""}`,
            amount: growth,
            amountKind: "in",
            at: FieldValue.serverTimestamp(),
          },
        });
      }
    }

    const changed = completedCount > 0 || earned || compounded ||
      vaultLastCompoundedAt !== (cur.balances?.vaultLastCompoundedAt ?? null);

    if (changed) {
      tx.update(ref, {
        activePlans: remaining,
        completedPlans,
        "balances.wallet": wallet,
        "balances.vault": vault,
        "balances.vaultLockStartedAt": vaultLockStartedAt,
        "balances.vaultLastCompoundedAt": vaultLastCompoundedAt,
      });
      for (const write of activityWrites) {
        tx.set(write.ref, write.data);
      }
    }

    return { completed: completedCount, compounded: compounded || earned };
  });
}

async function runMaintenance(): Promise<{ usersScanned: number; usersUpdated: number; plansCompleted: number }> {
  const now = Date.now();
  const [templates, vaultDailyRate] = await Promise.all([
    loadPlanTemplates(),
    loadVaultDailyRate(),
  ]);

  // Release any locked referral bonuses whose clearing period has elapsed.
  try {
    const released = await releaseLockedReferrals(now);
    if (released > 0) logger.info(`released ${released} locked referral bonus(es)`);
  } catch (err) {
    logger.error("releaseLockedReferrals failed", err);
  }

  // Reap abandoned Tongits rooms (refunding any locked stakes).
  try {
    const reaped = await reapStaleTongitsRooms(now);
    if (reaped > 0) logger.info(`reaped ${reaped} stale Tongits room(s)`);
  } catch (err) {
    logger.error("reapStaleTongitsRooms failed", err);
  }

  const usersSnap = await db.collection("users").get();
  let usersUpdated = 0;
  let plansCompleted = 0;

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data() as UserState;
    const hasActivePlans = (data.activePlans?.length ?? 0) > 0;
    const hasVault = (data.balances?.vault ?? 0) > 0;
    if (!hasActivePlans && !hasVault) continue;

    try {
      const result = await processUser(userDoc.id, templates, vaultDailyRate, now);
      if (result.completed > 0 || result.compounded) usersUpdated++;
      plansCompleted += result.completed;
    } catch (err) {
      logger.error(`maintenance failed for user ${userDoc.id}`, err);
    }
  }

  logger.info("maintenance run complete", {
    usersScanned: usersSnap.size,
    usersUpdated,
    plansCompleted,
  });

  return { usersScanned: usersSnap.size, usersUpdated, plansCompleted };
}

export const dailyMaintenance = onSchedule("every 60 minutes", async () => {
  await runMaintenance();
});

/** Admin-triggered manual run — same logic as the schedule, for testing without waiting an hour. */
export const runMaintenanceNow = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const callerSnap = await db.collection("users").doc(request.auth.uid).get();
  if (!callerSnap.exists || callerSnap.data()?.isAdmin !== true) {
    throw new HttpsError("permission-denied", "Admin role required.");
  }
  return runMaintenance();
});
