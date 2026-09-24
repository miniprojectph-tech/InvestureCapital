import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { db } from "./init";
import { loadCompPlan, processPlacementsForUser } from "./compplan";

// Game functions live in their own module.
export { castLine, claimQuest, claimDailyEnergy, redeemReward, fishOfTheHour, weeklyReef } from "./game";

// Color Game callables.
export { placeColorBet, resolveColorRound, adminAdjustColorJackpot, adminSetColorJackpotColor, adminSetColorJackpotConfig } from "./colorgame";

// Community chat: admin + join-date mirrors for RTDB rules, and storage stats.
// (History is kept forever — there is no pruning job.)
export { ensureCommunityAdmin, ensureCommunityMember, updateCommunityStats, refreshCommunityStats } from "./community";

// Compensation plan: placement activation (commissions + Fast-Start) and
// read-only downline stats for the Referrals page.
export {
  activatePlacement,
  adminAdvancePlacement,
  adminSetPlacementStart,
  adminResetMember,
  adminPaySkippedCommission,
  adminResetEconomy,
  adminSetTestClock,
  tickTestClocks,
} from "./compplan";
export { getReferralStats } from "./referral-stats";
export { onWithdrawalWritten } from "./withdrawals";
export { adminSaveEvent, adminSetEventStatus, adminAddEventSlots, claimEventSlots, onPlanRequestWritten } from "./events";

// Community Tongits (Phase 1): room + economy callables + stale-room reaper.
import { reapStaleTongitsRooms } from "./tongits";
import { expireEventReservations } from "./events";
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

/**
 * Hourly economy tick: credits every completed payout cycle on each member's
 * placements (capital + Locked-In Bonus on the final one), pays Leadership
 * Bonuses, posts daily accrual notices, and reaps stale Tongits rooms.
 */
async function runMaintenance(): Promise<{
  usersScanned: number;
  usersUpdated: number;
  payouts: number;
  plansCompleted: number;
}> {
  const now = Date.now();
  const cfg = await loadCompPlan();

  // Reap abandoned Tongits rooms (refunding any locked stakes).
  try {
    const reaped = await reapStaleTongitsRooms(now);
    if (reaped > 0) logger.info(`reaped ${reaped} stale Tongits room(s)`);
  } catch (err) {
    logger.error("reapStaleTongitsRooms failed", err);
  }

  // Event slot reservations whose hold ran out go back to the pool.
  try {
    const expired = await expireEventReservations(now);
    if (expired > 0) logger.info(`released ${expired} expired event reservation(s)`);
  } catch (err) {
    logger.error("expireEventReservations failed", err);
  }

  const usersSnap = await db.collection("users").get();
  let usersUpdated = 0;
  let payouts = 0;
  let plansCompleted = 0;

  for (const userDoc of usersSnap.docs) {
    const placements = userDoc.data().placements as unknown[] | undefined;
    if (!placements || placements.length === 0) continue;
    try {
      const r = await processPlacementsForUser(userDoc.id, cfg, now);
      if (r.payouts > 0 || r.completed > 0 || r.notified) usersUpdated++;
      payouts += r.payouts;
      plansCompleted += r.completed;
    } catch (err) {
      logger.error(`maintenance failed for user ${userDoc.id}`, err);
    }
  }

  logger.info("maintenance run complete", { usersScanned: usersSnap.size, usersUpdated, payouts, plansCompleted });
  return { usersScanned: usersSnap.size, usersUpdated, payouts, plansCompleted };
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
