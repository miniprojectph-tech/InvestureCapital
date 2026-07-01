import { initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  FieldValue,
  type Firestore,
  type DocumentReference,
  type Transaction,
} from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

initializeApp();
const db: Firestore = getFirestore();

const DAY_MS = 86_400_000;

type StoredActivePlan = {
  id: string;
  planId: string;
  capital: number;
  startedAt: number;
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
 * Processes one user inside a transaction: completes any active plans whose
 * duration has elapsed, then compounds the vault balance for each full day
 * elapsed since it was last compounded. Mirrors the math in
 * src/lib/userState.ts (completePlanForUser) so scheduled runs and the
 * admin's manual "Push to complete" stay consistent.
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
    const activePlans = [...(cur.activePlans ?? [])];
    const completedPlans = [...(cur.completedPlans ?? [])];
    const remaining: StoredActivePlan[] = [];
    const activityWrites: { ref: DocumentReference; data: Record<string, unknown> }[] = [];

    let completedCount = 0;
    for (const plan of activePlans) {
      const tpl = templates.get(plan.planId);
      if (!tpl) {
        remaining.push(plan);
        continue;
      }
      const completionTime = plan.startedAt + tpl.durationDays * DAY_MS;
      if (now < completionTime) {
        remaining.push(plan);
        continue;
      }

      const vaultCredit = plan.capital * (tpl.dailyRate / 100) * tpl.durationDays;
      completedPlans.push({
        ...plan,
        completedAt: now,
        vaultCredited: vaultCredit,
        capitalReturned: plan.capital,
      });
      vault += vaultCredit;
      wallet += plan.capital;
      if (!vaultLockStartedAt) vaultLockStartedAt = now;

      activityWrites.push({
        ref: activityRef(uid),
        data: {
          type: "plan-complete",
          title: `Plan completed — ${tpl.name}`,
          subtitle: `Vault credited ${vaultCredit.toFixed(2)} · capital ${plan.capital} returned`,
          amount: vaultCredit,
          amountKind: "neutral",
          at: FieldValue.serverTimestamp(),
        },
      });
      completedCount++;
    }

    let compounded = false;
    const baseline = cur.balances?.vaultLastCompoundedAt ?? vaultLockStartedAt;
    if (vault > 0 && baseline) {
      const daysElapsed = Math.floor((now - baseline) / DAY_MS);
      if (daysElapsed >= 1) {
        const rate = vaultDailyRate / 100;
        const grown = vault * Math.pow(1 + rate, daysElapsed);
        const growth = grown - vault;
        vault = grown;
        compounded = true;

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

        tx.update(ref, {
          "balances.vaultLastCompoundedAt": baseline + daysElapsed * DAY_MS,
        });
      }
    }

    if (completedCount > 0 || compounded) {
      tx.update(ref, {
        activePlans: remaining,
        completedPlans,
        "balances.wallet": wallet,
        "balances.vault": vault,
        "balances.vaultLockStartedAt": vaultLockStartedAt,
      });
      for (const write of activityWrites) {
        tx.set(write.ref, write.data);
      }
    }

    return { completed: completedCount, compounded };
  });
}

async function runMaintenance(): Promise<{ usersScanned: number; usersUpdated: number; plansCompleted: number }> {
  const now = Date.now();
  const [templates, vaultDailyRate] = await Promise.all([
    loadPlanTemplates(),
    loadVaultDailyRate(),
  ]);

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
