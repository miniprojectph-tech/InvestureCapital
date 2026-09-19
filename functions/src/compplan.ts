import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue, Timestamp, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { db } from "./init";
import {
  mergeCompPlan,
  cyclesForTerm,
  unitsFor,
  validatePlacementAmount,
  peso,
  type CompPlanConfig,
} from "./compplan-config";

// ============================================================================
// Compensation plan engine.
//
//  * activatePlacement (admin callable) — turns an approved request (or a
//    direct admin grant) into a Placement, pays six-level referral commissions
//    and checks the sponsor's Fast-Start tiers. One Firestore transaction.
//  * processPlacementsForUser (hourly, and every minute for test-clock
//    accounts) — credits every completed 5-day cycle as a numbered payout, adds
//    capital + the Locked-In Bonus to the final payout, pays the sponsor's
//    Leadership Bonus, and posts the daily accrual notification.
//
// TIMEKEEPING. A placement keeps two separate things:
//    startedAt        the TRUE start date — admin-editable
//    clockAdvanceMs   virtual time added by the test clock / fast-forward
//  Payout k is due when  now + clockAdvanceMs >= startedAt + k·cycle, and its
//  history date is ALWAYS its scheduled date  startedAt + k·cycle. Every
//  record stores `planId` + `schedOffsetMs` (its offset from startedAt) and the
//  real `creditedAt`, so when an admin changes the start date every history
//  date of that placement follows (adminSetPlacementStart), while the real
//  credited time is never touched.
//
// All money moves happen here (admin SDK); the client never credits itself.
// ============================================================================

const DAY_MS = 86_400_000;

export type Placement = {
  id: string; // "IC-XXXXX" — the member-facing Plan ID
  capital: number;
  units: number;
  termMonths: number;
  cycles: number;
  cycleDays: number;
  cycleRate: number; // percent per cycle (snapshot)
  lockedBonus: number; // total, already multiplied by units
  startedAt: number; // true start date (admin-editable)
  originalStartedAt?: number; // kept the first time startedAt is edited
  clockAdvanceMs?: number; // virtual time from test clock / fast-forward
  cyclesPaid: number;
  totalPaid: number; // cycle income paid so far (excludes capital/bonus)
  lastAccrualDay?: string; // "YYYY-MM-DD" (Asia/Manila, virtual) of the last accrual notice
  requestId?: string;
  source?: "wallet"; // reinvested from the member's wallet (no payment proof)
};

export type CompletedPlacement = Placement & {
  completedAt: number; // scheduled completion date (follows startedAt)
  completedRealAt?: number; // when it actually completed
  capitalReturned: number;
  lockedBonusPaid: number;
};

export type UserDoc = {
  profile?: { name?: string; email?: string; joinedAt?: number };
  balances?: { wallet?: number };
  placements?: Placement[];
  completedPlacements?: CompletedPlacement[];
  referredByUserId?: string;
  fastStart?: { paidTiers?: Record<string, number> };
  isAdmin?: boolean;
};

type Write = { ref: DocumentReference; data: Record<string, unknown> };

/** Ties a record to a placement's schedule so its date can follow the start date. */
type Sched = { planId: string; startedAt: number; offsetMs: number };

export async function loadCompPlan(): Promise<CompPlanConfig> {
  const snap = await db.doc("settings/platform").get();
  return mergeCompPlan(snap.exists ? (snap.data()?.compPlan as Partial<CompPlanConfig> | undefined) : undefined);
}

const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genPlacementId(): string {
  let s = "IC-";
  for (let i = 0; i < 5; i++) s += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  return s;
}

export function activeCapital(u: UserDoc | undefined): number {
  return (u?.placements ?? []).reduce((s, p) => s + (p.capital ?? 0), 0);
}

export function isActiveUpline(u: UserDoc | undefined, cfg: CompPlanConfig): boolean {
  if (cfg.uplineMinActive <= 0) return true;
  return activeCapital(u) >= cfg.uplineMinActive;
}

export function displayName(u: UserDoc | undefined, uid: string): string {
  return u?.profile?.name || u?.profile?.email?.split("@")[0] || uid.slice(0, 6);
}

/** Calendar day in Asia/Manila (UTC+8) — members are Filipino. */
function manilaDayKey(ms: number): string {
  return new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);
}

const cycleMsOf = (p: Placement) => p.cycleDays * DAY_MS;

const userRef = (uid: string) => db.collection("users").doc(uid);
const activityRef = (uid: string) => userRef(uid).collection("activity").doc();
const notificationRef = (uid: string) => userRef(uid).collection("notifications").doc();
const commissionRef = () => db.collection("commissions").doc();

/** History entry. With `sched` its date is the scheduled date and follows the placement's start. */
function activity(
  writes: Write[],
  uid: string,
  data: { type: string; title: string; subtitle?: string; amount?: number; amountKind: "in" | "out" | "neutral" },
  sched?: Sched,
) {
  writes.push({
    ref: activityRef(uid),
    data: sched
      ? {
          ...data,
          planId: sched.planId,
          schedOffsetMs: sched.offsetMs,
          at: Timestamp.fromMillis(sched.startedAt + sched.offsetMs),
          creditedAt: FieldValue.serverTimestamp(),
        }
      : { ...data, at: FieldValue.serverTimestamp() },
  });
}

/** Bell notifications are reminders, not history — they always carry the real time. */
function notify(
  writes: Write[],
  uid: string,
  now: number,
  data: { type: string; title: string; body?: string; amount?: number; planId?: string },
) {
  writes.push({ ref: notificationRef(uid), data: { ...data, at: now, read: false } });
}

/** Accumulates wallet deltas + field patches per user so each doc gets ONE update. */
class UserPatches {
  private map = new Map<string, { wallet: number; fields: Record<string, unknown> }>();
  credit(uid: string, amount: number) {
    const e = this.get(uid);
    e.wallet += amount;
  }
  set(uid: string, fields: Record<string, unknown>) {
    Object.assign(this.get(uid).fields, fields);
  }
  private get(uid: string) {
    let e = this.map.get(uid);
    if (!e) {
      e = { wallet: 0, fields: {} };
      this.map.set(uid, e);
    }
    return e;
  }
  flush(tx: Transaction) {
    for (const [uid, e] of this.map) {
      const patch: Record<string, unknown> = { ...e.fields };
      if (e.wallet !== 0) patch["balances.wallet"] = FieldValue.increment(e.wallet);
      if (Object.keys(patch).length > 0) tx.update(userRef(uid), patch);
    }
  }
}

async function assertAdmin(uid: string) {
  const snap = await userRef(uid).get();
  if (!snap.exists || snap.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
}

// ============================================================================
// Activation
// ============================================================================

type ActivateArgs = {
  requestId?: string;
  userId?: string;
  amount?: number;
  termMonths?: number;
  note?: string;
  /** Admin only: the placement's true start (e.g. the payment date). Defaults to now. */
  startedAt?: number;
  /** Member self-service: pay for the placement from their own wallet. */
  fromWallet?: boolean;
};

const MIN_START = Date.UTC(2020, 0, 1);

function validStart(ms: unknown, now: number): ms is number {
  return typeof ms === "number" && Number.isFinite(ms) && ms >= MIN_START && ms <= now + 366 * DAY_MS;
}

export const activatePlacement = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const args = (request.data ?? {}) as ActivateArgs;
  const callerUid = request.auth.uid;
  if (!args.fromWallet) await assertAdmin(callerUid);
  const cfg = await loadCompPlan();
  const now = Date.now();
  if (args.startedAt !== undefined) {
    if (args.fromWallet) throw new HttpsError("invalid-argument", "A wallet reinvest always starts now.");
    if (!validStart(args.startedAt, now)) throw new HttpsError("invalid-argument", "Invalid start date.");
  }
  const result = await db.runTransaction((tx) => activateInTx(tx, cfg, args, callerUid, now));
  // A backdated start may already have payouts due — credit them right away.
  if (args.startedAt !== undefined && args.startedAt < now) {
    try {
      await processPlacementsForUser(result.userId, cfg, Date.now());
    } catch (err) {
      logger.error("post-activation payout run failed", err);
    }
  }
  return result;
});

async function activateInTx(tx: Transaction, cfg: CompPlanConfig, args: ActivateArgs, callerUid: string, now: number) {
  // ---------- reads (all before any write) ----------
  let reqRef: DocumentReference | null = null;
  let userId = args.userId;
  let amount = args.amount;
  let termMonths = args.termMonths;

  if (args.fromWallet) {
    // Reinvest: the caller places for themselves and pays from their wallet.
    userId = callerUid;
    if (args.requestId) throw new HttpsError("invalid-argument", "Wallet reinvest can't reference a request.");
  }

  if (args.requestId) {
    reqRef = db.collection("plan_requests").doc(args.requestId);
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists) throw new HttpsError("not-found", "Request not found.");
    const req = reqSnap.data() as { userId: string; amount: number; termMonths?: number; status: string };
    if (req.status !== "pending") throw new HttpsError("failed-precondition", `Request is already ${req.status}.`);
    userId = req.userId;
    amount = req.amount;
    termMonths = req.termMonths ?? termMonths;
  }

  if (!userId) throw new HttpsError("invalid-argument", "userId is required.");
  if (typeof amount !== "number") throw new HttpsError("invalid-argument", "amount is required.");
  const amountError = validatePlacementAmount(cfg, amount);
  if (amountError) throw new HttpsError("invalid-argument", amountError);
  const term = cfg.terms.find((t) => t.months === termMonths);
  if (!term) throw new HttpsError("invalid-argument", "Choose a valid term (months).");

  const memberSnap = await tx.get(userRef(userId));
  if (!memberSnap.exists) throw new HttpsError("not-found", "Member not found.");
  const member = memberSnap.data() as UserDoc;
  if (args.fromWallet && (member.balances?.wallet ?? 0) < amount) {
    throw new HttpsError("failed-precondition", `Wallet balance is below ${peso(amount)}.`);
  }

  // Walk the sponsor chain up to N levels (cycle-safe).
  const uplines: { uid: string; data: UserDoc }[] = [];
  const seen = new Set<string>([userId]);
  let cursor = member.referredByUserId;
  while (cursor && !seen.has(cursor) && uplines.length < cfg.referralLevels.length) {
    seen.add(cursor);
    const snap = await tx.get(userRef(cursor));
    if (!snap.exists) break;
    const data = snap.data() as UserDoc;
    uplines.push({ uid: cursor, data });
    cursor = data.referredByUserId;
  }

  // Sponsor's direct referrals (for Fast-Start), only when it can matter.
  const sponsor = uplines[0];
  let directs: { id: string; data: UserDoc }[] = [];
  if (sponsor && cfg.fastStartDirects > 0 && cfg.fastStartTiers.length > 0) {
    const ds = await tx.get(db.collection("users").where("referredByUserId", "==", sponsor.uid));
    directs = ds.docs.map((d) => ({ id: d.id, data: d.data() as UserDoc }));
  }

  // ---------- compute ----------
  const startedAt = args.startedAt ?? now;
  const units = unitsFor(cfg, amount);
  const cycles = cyclesForTerm(cfg, term.months);
  const placement: Placement = {
    id: genPlacementId(),
    capital: amount,
    units,
    termMonths: term.months,
    cycles,
    cycleDays: cfg.cycleDays,
    cycleRate: cfg.cycleRate,
    lockedBonus: units * term.lockedBonusPerUnit,
    startedAt,
    cyclesPaid: 0,
    totalPaid: 0,
  };
  if (args.requestId) placement.requestId = args.requestId;
  if (args.fromWallet) placement.source = "wallet";
  const perCycle = (amount * cfg.cycleRate) / 100;
  const memberName = displayName(member, userId);
  // Everything created at activation is dated to the placement's start.
  const atStart: Sched = { planId: placement.id, startedAt, offsetMs: 0 };

  const writes: Write[] = [];
  const patches = new UserPatches();

  // ---------- member ----------
  patches.set(userId, { placements: [...(member.placements ?? []), placement] });
  if (args.fromWallet) patches.credit(userId, -amount);
  activity(
    writes,
    userId,
    {
      type: args.fromWallet ? "reinvest" : "placement-activate",
      title: `${args.fromWallet ? "Reinvested into" : "Placement activated —"} ${placement.id}`,
      subtitle: `${peso(amount)} · ${term.months}-month term · ${cycles} payouts of ${peso(perCycle)}`,
      amount,
      amountKind: "out",
    },
    atStart,
  );
  notify(writes, userId, now, {
    type: "placement",
    title: `${placement.id} is active`,
    body: `${peso(perCycle)} every ${cfg.cycleDays} days for ${cycles} payouts${placement.lockedBonus > 0 ? ` · Locked-In Bonus ${peso(placement.lockedBonus)} on the final payout` : ""}.`,
    amount,
    planId: placement.id,
  });
  if (reqRef) {
    tx.update(reqRef, {
      status: "approved",
      processedAt: now,
      processedBy: callerUid,
      placementId: placement.id,
      ...(args.note ? { note: args.note } : {}),
    });
  }

  // ---------- six-level referral commission ----------
  let commissionsPaid = 0;
  uplines.forEach((up, i) => {
    const pct = cfg.referralLevels[i] ?? 0;
    const commission = Math.round(((amount * pct) / 100) * 100) / 100;
    const active = isActiveUpline(up.data, cfg);
    const paid = active && commission > 0;
    writes.push({
      ref: commissionRef(),
      data: {
        type: "level",
        level: i + 1,
        toUserId: up.uid,
        toUserName: displayName(up.data, up.uid),
        fromUserId: userId,
        fromUserName: memberName,
        placementId: placement.id,
        placementAmount: amount,
        pct,
        amount: commission,
        status: paid ? "paid" : "skipped",
        reason: paid ? null : active ? "zero commission" : `upline has no active placement of ${peso(cfg.uplineMinActive)}`,
        schedOffsetMs: 0,
        createdAt: startedAt,
        creditedAt: now,
      },
    });
    if (!paid) return;
    commissionsPaid++;
    patches.credit(up.uid, commission);
    activity(
      writes,
      up.uid,
      {
        type: "referral-commission",
        title: `Level ${i + 1} commission — ${memberName}`,
        subtitle: `${pct}% of ${peso(amount)} placement ${placement.id}`,
        amount: commission,
        amountKind: "in",
      },
      atStart,
    );
    notify(writes, up.uid, now, {
      type: "commission",
      title: `Level ${i + 1} commission +${peso(commission)}`,
      body: `${memberName} placed ${peso(amount)} (${placement.id}).`,
      amount: commission,
      planId: placement.id,
    });
  });

  // ---------- Fast-Start (sponsor, one-time per tier) ----------
  const fastStartPaid: string[] = [];
  if (sponsor) {
    // The new placement counts for the member even though it isn't stored yet.
    const totals = directs.map((d) => activeCapital(d.data) + (d.id === userId ? amount : 0));
    if (!directs.some((d) => d.id === userId)) totals.push(activeCapital(member) + amount);
    const paidTiers = sponsor.data.fastStart?.paidTiers ?? {};
    const sponsorActive = isActiveUpline(sponsor.data, cfg);
    const sponsorName = displayName(sponsor.data, sponsor.uid);

    for (const tier of cfg.fastStartTiers) {
      const key = String(tier.minPlacement);
      if (paidTiers[key]) continue;
      const qualifying = totals.filter((t) => t >= tier.minPlacement).length;
      if (qualifying < cfg.fastStartDirects) continue;

      writes.push({
        ref: commissionRef(),
        data: {
          type: "fastStart",
          toUserId: sponsor.uid,
          toUserName: sponsorName,
          fromUserId: userId,
          fromUserName: memberName,
          placementId: placement.id,
          tier: tier.minPlacement,
          amount: tier.bonus,
          status: sponsorActive ? "paid" : "skipped",
          reason: sponsorActive ? null : `sponsor has no active placement of ${peso(cfg.uplineMinActive)}`,
          schedOffsetMs: 0,
          createdAt: startedAt,
          creditedAt: now,
        },
      });
      if (!sponsorActive) continue; // stays unpaid → re-evaluated on the next qualifying placement
      fastStartPaid.push(key);
      patches.credit(sponsor.uid, tier.bonus);
      patches.set(sponsor.uid, { [`fastStart.paidTiers.${key}`]: now });
      activity(
        writes,
        sponsor.uid,
        {
          type: "fast-start",
          title: `Fast-Start Bonus — ${peso(tier.minPlacement)} tier`,
          subtitle: `${cfg.fastStartDirects} direct referrals with ${peso(tier.minPlacement)}+ placed`,
          amount: tier.bonus,
          amountKind: "in",
        },
        atStart,
      );
      notify(writes, sponsor.uid, now, {
        type: "fastStart",
        title: `Fast-Start Bonus +${peso(tier.bonus)}`,
        body: `You now have ${cfg.fastStartDirects} direct referrals with ${peso(tier.minPlacement)} or more placed.`,
        amount: tier.bonus,
      });
    }
  }

  // ---------- writes ----------
  patches.flush(tx);
  for (const w of writes) tx.set(w.ref, w.data);

  return {
    ok: true,
    userId,
    placementId: placement.id,
    cycles,
    perCycle,
    lockedBonus: placement.lockedBonus,
    commissionsPaid,
    uplinesFound: uplines.length,
    fastStartPaid,
  };
}

// ============================================================================
// Payout engine
// ============================================================================

/** Test-clock tick: how much real time passed, and how long one payout cycle takes in real time. */
type ClockTick = { realDeltaMs: number; cycleRealMs: number };

export async function processPlacementsForUser(
  uid: string,
  cfg: CompPlanConfig,
  now: number,
  tick?: ClockTick,
): Promise<{ payouts: number; completed: number; notified: boolean; active: number }> {
  return db.runTransaction(async (tx) => {
    const none = { payouts: 0, completed: 0, notified: false, active: 0 };
    const snap = await tx.get(userRef(uid));
    if (!snap.exists) return none;
    const user = snap.data() as UserDoc;
    const placements = user.placements ?? [];
    if (placements.length === 0) return none;

    const writes: Write[] = [];
    const patches = new UserPatches();
    const remaining: Placement[] = [];
    const completed: CompletedPlacement[] = [...(user.completedPlacements ?? [])];
    const finished: Placement[] = [];
    let payouts = 0;
    let notified = false;
    let changed = false;

    for (const p of placements) {
      const cur: Placement = { ...p };
      const cycleMs = cycleMsOf(p);

      // Test clock: one real `cycleRealMs` should feel like one full cycle.
      if (tick && tick.realDeltaMs > 0 && tick.cycleRealMs > 0) {
        const factor = cycleMs / tick.cycleRealMs;
        cur.clockAdvanceMs = (cur.clockAdvanceMs ?? 0) + Math.round(tick.realDeltaMs * Math.max(0, factor - 1));
        changed = true;
      }

      const virtualNow = now + (cur.clockAdvanceMs ?? 0);
      const eligible = Math.min(Math.floor((virtualNow - p.startedAt) / cycleMs), p.cycles);
      const perCycle = (p.capital * p.cycleRate) / 100;

      for (let k = (p.cyclesPaid ?? 0) + 1; k <= eligible; k++) {
        const final = k === p.cycles;
        const title = `${p.id}, ${k} out of ${p.cycles} payouts has been credited`;
        const onSchedule: Sched = { planId: p.id, startedAt: p.startedAt, offsetMs: k * cycleMs };
        patches.credit(uid, perCycle);
        cur.cyclesPaid = k;
        cur.totalPaid = (cur.totalPaid ?? 0) + perCycle;
        payouts++;
        changed = true;

        activity(
          writes,
          uid,
          {
            type: "payout",
            title,
            subtitle: `${p.cycleRate}% of ${peso(p.capital)}${final ? " · final payout" : ""}`,
            amount: perCycle,
            amountKind: "in",
          },
          onSchedule,
        );

        let body = `${peso(perCycle)} added to your wallet.`;
        if (final) {
          patches.credit(uid, p.capital + p.lockedBonus);
          activity(
            writes,
            uid,
            {
              type: "capital-return",
              title: `${p.id} capital returned`,
              subtitle: `${p.termMonths}-month term completed`,
              amount: p.capital,
              amountKind: "in",
            },
            onSchedule,
          );
          if (p.lockedBonus > 0) {
            activity(
              writes,
              uid,
              {
                type: "locked-bonus",
                title: `${p.id} Locked-In Bonus`,
                subtitle: `${p.units} unit${p.units > 1 ? "s" : ""} × ${p.termMonths}-month term`,
                amount: p.lockedBonus,
                amountKind: "in",
              },
              onSchedule,
            );
          }
          body = `Final payout: ${peso(perCycle)} + capital ${peso(p.capital)}${p.lockedBonus > 0 ? ` + Locked-In Bonus ${peso(p.lockedBonus)}` : ""} = ${peso(perCycle + p.capital + p.lockedBonus)} added to your wallet.`;
        }
        notify(writes, uid, now, {
          type: "payout",
          title,
          body,
          amount: final ? perCycle + p.capital + p.lockedBonus : perCycle,
          planId: p.id,
        });
      }

      if (cur.cyclesPaid >= p.cycles) {
        completed.push({
          ...cur,
          completedAt: p.startedAt + p.cycles * cycleMs,
          completedRealAt: now,
          capitalReturned: p.capital,
          lockedBonusPaid: p.lockedBonus,
        });
        finished.push(cur);
        continue;
      }

      // Daily accrual notice between payouts — once per (virtual) Manila day, so an
      // accelerated account gets at most one per tick instead of five a minute.
      const dayKey = manilaDayKey(virtualNow);
      if (cfg.dailyAccrualNotifications && virtualNow > p.startedAt && cur.lastAccrualDay !== dayKey) {
        cur.lastAccrualDay = dayKey;
        notified = true;
        changed = true;
        notify(writes, uid, now, {
          type: "accrual",
          title: `Earning +${peso(perCycle / p.cycleDays)} today, ${p.id}`,
          body: `Credited with payout ${cur.cyclesPaid + 1} of ${p.cycles}.`,
          amount: perCycle / p.cycleDays,
          planId: p.id,
        });
      }
      remaining.push(cur);
    }

    if (!changed) return { ...none, active: placements.length };

    // Leadership Bonus for the sponsor of any placement that just finished with a bonus.
    const leadershipDue = finished.filter((p) => p.lockedBonus > 0);
    let sponsorUid: string | undefined;
    let sponsorData: UserDoc | undefined;
    if (leadershipDue.length > 0 && user.referredByUserId && cfg.leadershipPct > 0) {
      const sSnap = await tx.get(userRef(user.referredByUserId)); // still before writes
      if (sSnap.exists) {
        sponsorUid = user.referredByUserId;
        sponsorData = sSnap.data() as UserDoc;
      }
    }

    patches.set(uid, { placements: remaining, completedPlacements: completed });

    if (sponsorUid && sponsorData) {
      const memberName = displayName(user, uid);
      const sponsorActive = isActiveUpline(sponsorData, cfg);
      for (const p of leadershipDue) {
        const bonus = Math.round(((p.lockedBonus * cfg.leadershipPct) / 100) * 100) / 100;
        const atCompletion: Sched = { planId: p.id, startedAt: p.startedAt, offsetMs: p.cycles * cycleMsOf(p) };
        writes.push({
          ref: commissionRef(),
          data: {
            type: "leadership",
            toUserId: sponsorUid,
            toUserName: displayName(sponsorData, sponsorUid),
            fromUserId: uid,
            fromUserName: memberName,
            placementId: p.id,
            placementAmount: p.capital,
            pct: cfg.leadershipPct,
            amount: bonus,
            status: sponsorActive ? "paid" : "skipped",
            reason: sponsorActive ? null : `sponsor has no active placement of ${peso(cfg.uplineMinActive)}`,
            schedOffsetMs: atCompletion.offsetMs,
            createdAt: atCompletion.startedAt + atCompletion.offsetMs,
            creditedAt: now,
          },
        });
        if (!sponsorActive) continue;
        patches.credit(sponsorUid, bonus);
        activity(
          writes,
          sponsorUid,
          {
            type: "leadership",
            title: `Leadership Bonus — ${memberName}`,
            subtitle: `${cfg.leadershipPct}% of ${peso(p.lockedBonus)} Locked-In Bonus (${p.id})`,
            amount: bonus,
            amountKind: "in",
          },
          atCompletion,
        );
        notify(writes, sponsorUid, now, {
          type: "leadership",
          title: `Leadership Bonus +${peso(bonus)}`,
          body: `${memberName} completed their ${p.termMonths}-month placement ${p.id}.`,
          amount: bonus,
          planId: p.id,
        });
      }
    }

    patches.flush(tx);
    for (const w of writes) tx.set(w.ref, w.data);
    return { payouts, completed: finished.length, notified, active: remaining.length };
  });
}

// ============================================================================
// Admin: fast-forward, start date, per-member reset
// ============================================================================

/**
 * Push a placement's clock forward and run its payouts — for testing without
 * waiting. Never touches the start date, so history dates stay on schedule.
 *   days: N          advance N days
 *   mode: "next"     advance just enough for the next payout
 *   mode: "complete" advance to the final payout
 */
export const adminAdvancePlacement = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  await assertAdmin(request.auth.uid);
  const { userId, placementId, days, mode } = (request.data ?? {}) as {
    userId?: string;
    placementId?: string;
    days?: number;
    mode?: "next" | "complete";
  };
  if (!userId || !placementId) throw new HttpsError("invalid-argument", "userId and placementId are required.");
  if (!mode && (typeof days !== "number" || !Number.isFinite(days) || days <= 0 || days > 400)) {
    throw new HttpsError("invalid-argument", "days must be between 1 and 400.");
  }
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef(userId));
    if (!snap.exists) throw new HttpsError("not-found", "Member not found.");
    const placements = (snap.data() as UserDoc).placements ?? [];
    if (!placements.some((p) => p.id === placementId)) throw new HttpsError("not-found", "Placement is not active.");
    tx.update(userRef(userId), {
      placements: placements.map((p) => {
        if (p.id !== placementId) return p;
        const adv = p.clockAdvanceMs ?? 0;
        let add = (days ?? 0) * DAY_MS;
        if (mode) {
          const targetCycle = mode === "complete" ? p.cycles : Math.min(p.cycles, (p.cyclesPaid ?? 0) + 1);
          add = Math.max(0, p.startedAt + targetCycle * cycleMsOf(p) - (now + adv));
        }
        return { ...p, clockAdvanceMs: adv + add };
      }),
    });
  });
  const cfg = await loadCompPlan();
  const r = await processPlacementsForUser(userId, cfg, Date.now());
  return { ok: true, ...r };
});

async function commitInChunks(ops: Array<(b: FirebaseFirestore.WriteBatch) => void>) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + 400)) op(batch);
    await batch.commit();
  }
}

/**
 * Change a placement's true start date (active or completed). The remaining
 * schedule shifts with it and EVERY history date tied to the placement follows
 * — the member's entries, the uplines' commissions and the sponsor's Leadership
 * entry. Credited payouts are never reversed; the real credited time is kept.
 */
export const adminSetPlacementStart = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const adminUid = request.auth.uid;
  await assertAdmin(adminUid);
  const { userId, placementId, startedAt } = (request.data ?? {}) as { userId?: string; placementId?: string; startedAt?: number };
  if (!userId || !placementId) throw new HttpsError("invalid-argument", "userId and placementId are required.");
  const now = Date.now();
  if (!validStart(startedAt, now)) throw new HttpsError("invalid-argument", "Invalid start date.");

  const info = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef(userId));
    if (!snap.exists) throw new HttpsError("not-found", "Member not found.");
    const u = snap.data() as UserDoc;
    const active = u.placements ?? [];
    const done = u.completedPlacements ?? [];
    const target = active.find((p) => p.id === placementId) ?? done.find((p) => p.id === placementId);
    if (!target) throw new HttpsError("not-found", "Placement not found.");
    const oldStart = target.startedAt;

    const move = <T extends Placement>(p: T): T => {
      if (p.id !== placementId) return p;
      const next: T = { ...p, startedAt, originalStartedAt: p.originalStartedAt ?? p.startedAt };
      delete next.lastAccrualDay;
      return next;
    };
    tx.update(userRef(userId), {
      placements: active.map(move),
      completedPlacements: done.map((p) => {
        const m = move(p);
        return m.id === placementId ? { ...m, completedAt: startedAt + m.cycles * cycleMsOf(m) } : m;
      }),
    });
    // The audit entry itself keeps the real date.
    const fmt = (ms: number) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);
    tx.set(activityRef(userId), {
      type: "start-date-change",
      title: `${placementId} start date changed`,
      subtitle: `${fmt(oldStart)} → ${fmt(startedAt)} by admin`,
      amountKind: "neutral",
      at: FieldValue.serverTimestamp(),
      changedBy: adminUid,
    });
    return { oldStart, cycles: target.cycles, cycleMs: cycleMsOf(target) };
  });

  // Re-date every record tied to this placement.
  const ops: Array<(b: FirebaseFirestore.WriteBatch) => void> = [];
  const owners = new Set<string>([userId]);
  const comms = await db.collection("commissions").where("placementId", "==", placementId).get();
  for (const c of comms.docs) {
    const data = c.data() as { toUserId?: string; type?: string; schedOffsetMs?: number };
    if (data.toUserId) owners.add(data.toUserId);
    // Older records have no offset — infer it from the type.
    const offset = data.schedOffsetMs ?? (data.type === "leadership" ? info.cycles * info.cycleMs : 0);
    ops.push((b) => b.update(c.ref, { createdAt: startedAt + offset, schedOffsetMs: offset }));
  }
  for (const owner of owners) {
    const acts = await userRef(owner).collection("activity").where("planId", "==", placementId).get();
    for (const a of acts.docs) {
      const offset = (a.data().schedOffsetMs as number | undefined) ?? 0;
      ops.push((b) => b.update(a.ref, { at: Timestamp.fromMillis(startedAt + offset) }));
    }
  }
  await commitInChunks(ops);

  // An earlier start may make payouts due right now.
  const cfg = await loadCompPlan();
  const r = await processPlacementsForUser(userId, cfg, Date.now());
  return { ok: true, redated: ops.length, oldStart: info.oldStart, ...r };
});

/**
 * Wipe ONE member's economy so a test can be rerun cleanly: wallet, placements,
 * history, notifications, requests — and reverse what their placements paid to
 * uplines (commissions, Fast-Start, Leadership). Keeps the account, referral
 * link and game data.
 */
export const adminResetMember = onCall({ timeoutSeconds: 300 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  await assertAdmin(request.auth.uid);
  const { userId } = (request.data ?? {}) as { userId?: string };
  if (!userId) throw new HttpsError("invalid-argument", "userId is required.");
  const member = await userRef(userId).get();
  if (!member.exists) throw new HttpsError("not-found", "Member not found.");

  // 1) Reverse everything this member's placements paid upward.
  const ops: Array<(b: FirebaseFirestore.WriteBatch) => void> = [];
  const upward = await db.collection("commissions").where("fromUserId", "==", userId).get();
  const uplinePlans = new Map<string, Set<string>>();
  for (const c of upward.docs) {
    const d = c.data() as { toUserId: string; status: string; amount: number; type: string; tier?: number; placementId: string };
    if (d.status === "paid" && d.amount > 0) {
      const patch: Record<string, unknown> = { "balances.wallet": FieldValue.increment(-d.amount) };
      if (d.type === "fastStart" && d.tier !== undefined) patch[`fastStart.paidTiers.${d.tier}`] = FieldValue.delete();
      ops.push((b) => b.update(userRef(d.toUserId), patch));
      if (!uplinePlans.has(d.toUserId)) uplinePlans.set(d.toUserId, new Set());
      uplinePlans.get(d.toUserId)!.add(d.placementId);
    }
    ops.push((b) => b.delete(c.ref));
  }
  for (const [upUid, plans] of uplinePlans) {
    for (const planId of plans) {
      const acts = await userRef(upUid).collection("activity").where("planId", "==", planId).get();
      for (const a of acts.docs) ops.push((b) => b.delete(a.ref));
    }
  }
  // 2) What they earned from others, and their own requests.
  for (const [coll, field] of [["commissions", "toUserId"], ["plan_requests", "userId"], ["withdrawals", "userId"], ["topups", "userId"]] as const) {
    const s = await db.collection(coll).where(field, "==", userId).get();
    for (const d of s.docs) ops.push((b) => b.delete(d.ref));
  }
  await commitInChunks(ops);

  // 3) Their own records and balances.
  await db.recursiveDelete(userRef(userId).collection("activity"));
  await db.recursiveDelete(userRef(userId).collection("notifications"));
  await userRef(userId).update({
    "balances.wallet": 0,
    "balances.vault": 0,
    "balances.vaultLockStartedAt": null,
    "balances.vaultLastCompoundedAt": FieldValue.delete(),
    activePlans: [],
    completedPlans: [],
    placements: [],
    completedPlacements: [],
    fastStart: FieldValue.delete(),
    referralWallet: { available: 0, pending: 0, locked: 0, totalEarned: 0, totalWithdrawn: 0 },
  });
  await db.collection("test_clocks").doc(userId).delete();
  return { ok: true, reversedCommissions: upward.size };
});

const RESET_COLLECTIONS = ["plan_requests", "commissions", "referral_transactions", "withdrawals", "topups", "test_clocks"];

/**
 * Wipe the test economy: every member's wallet, placements, old plans/vault,
 * activity and notifications, plus the request/commission ledgers. Keeps
 * accounts, referral links and game data. Requires confirm === "RESET".
 */
export const adminResetEconomy = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  await assertAdmin(request.auth.uid);
  if ((request.data as { confirm?: string } | undefined)?.confirm !== "RESET") {
    throw new HttpsError("invalid-argument", "Type RESET to confirm.");
  }
  const users = await db.collection("users").get();
  let count = 0;
  for (const u of users.docs) {
    await db.recursiveDelete(u.ref.collection("activity"));
    await db.recursiveDelete(u.ref.collection("notifications"));
    await u.ref.update({
      "balances.wallet": 0,
      "balances.vault": 0,
      "balances.vaultLockStartedAt": null,
      "balances.vaultLastCompoundedAt": FieldValue.delete(),
      activePlans: [],
      completedPlans: [],
      placements: [],
      completedPlacements: [],
      fastStart: FieldValue.delete(),
      referralWallet: { available: 0, pending: 0, locked: 0, totalEarned: 0, totalWithdrawn: 0 },
    });
    count++;
  }
  for (const name of RESET_COLLECTIONS) await db.recursiveDelete(db.collection(name));
  return { ok: true, users: count, collections: RESET_COLLECTIONS };
});

// ============================================================================
// Test clock — accelerated time for accounts an admin marks as test
// ============================================================================
//
// `test_clocks/{uid}` is admin-only (NOT on the user doc, which members can
// edit — otherwise anyone could speed up their own payouts). A per-minute job
// advances only those accounts. It stops by itself once the account's last
// placement has paid its final payout, and after 24 h as a backstop.

const TEST_CLOCK_SPEEDS = { fast: 60_000, medium: 300_000 } as const; // real ms per payout cycle
const TEST_CLOCK_MAX_MS = 24 * 3_600_000;
const MAX_TICK_MS = 10 * 60_000; // never jump more than 10 real minutes in one tick

type TestClock = {
  speed: keyof typeof TEST_CLOCK_SPEEDS;
  cycleRealMs: number;
  enabledAt: number;
  lastTickAt: number;
  enabledBy: string;
  name: string;
  /** True once this clock has seen a running placement — so "none left" means "finished", not "not started yet". */
  sawActive: boolean;
};

export const adminSetTestClock = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  await assertAdmin(request.auth.uid);
  const { userId, speed } = (request.data ?? {}) as { userId?: string; speed?: keyof typeof TEST_CLOCK_SPEEDS | null };
  if (!userId) throw new HttpsError("invalid-argument", "userId is required.");
  const ref = db.collection("test_clocks").doc(userId);
  if (!speed) {
    await ref.delete();
    return { ok: true, enabled: false };
  }
  if (!(speed in TEST_CLOCK_SPEEDS)) throw new HttpsError("invalid-argument", "speed must be fast or medium.");
  const member = await userRef(userId).get();
  if (!member.exists) throw new HttpsError("not-found", "Member not found.");
  const now = Date.now();
  const clock: TestClock = {
    speed,
    cycleRealMs: TEST_CLOCK_SPEEDS[speed],
    enabledAt: now,
    lastTickAt: now,
    enabledBy: request.auth.uid,
    name: displayName(member.data() as UserDoc, userId),
    sawActive: ((member.data() as UserDoc).placements ?? []).length > 0,
  };
  await ref.set(clock);
  return { ok: true, enabled: true, speed };
});

export const tickTestClocks = onSchedule("every 1 minutes", async () => {
  const snap = await db.collection("test_clocks").get();
  if (snap.empty) return;
  const cfg = await loadCompPlan();
  for (const d of snap.docs) {
    const clock = d.data() as TestClock;
    const now = Date.now();
    try {
      if (now - clock.enabledAt > TEST_CLOCK_MAX_MS) {
        await d.ref.delete();
        continue;
      }
      const realDeltaMs = Math.min(Math.max(0, now - (clock.lastTickAt ?? now)), MAX_TICK_MS);
      const r = await processPlacementsForUser(d.id, cfg, now, { realDeltaMs, cycleRealMs: clock.cycleRealMs });
      // Done: the final payout (capital back) has been credited and nothing is left
      // running — whether this tick completed it or an admin pressed "Complete now".
      const sawActive = clock.sawActive || r.active > 0 || r.completed > 0;
      if (sawActive && r.active === 0) await d.ref.delete();
      else await d.ref.update({ lastTickAt: now, sawActive });
    } catch (err) {
      logger.error(`test clock tick failed for ${d.id}`, err);
    }
  }
});
