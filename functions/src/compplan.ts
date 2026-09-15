import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, type DocumentReference, type Transaction } from "firebase-admin/firestore";
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
//  * processPlacementsForUser (called hourly from runMaintenance) — credits
//    every completed 5-day cycle as a numbered payout, adds capital + the
//    Locked-In Bonus to the final payout, pays the sponsor's Leadership Bonus,
//    and posts the daily "Earning +₱x today" accrual notification.
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
  startedAt: number;
  cyclesPaid: number;
  totalPaid: number; // cycle income paid so far (excludes capital/bonus)
  lastAccrualDay?: string; // "YYYY-MM-DD" (Asia/Manila) of the last accrual notice
  requestId?: string;
};

export type CompletedPlacement = Placement & {
  completedAt: number;
  capitalReturned: number;
  lockedBonusPaid: number;
};

type UserDoc = {
  profile?: { name?: string; email?: string };
  balances?: { wallet?: number };
  placements?: Placement[];
  completedPlacements?: CompletedPlacement[];
  referredByUserId?: string;
  fastStart?: { paidTiers?: Record<string, number> };
  isAdmin?: boolean;
};

type Write = { ref: DocumentReference; data: Record<string, unknown> };

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

function activeCapital(u: UserDoc | undefined): number {
  return (u?.placements ?? []).reduce((s, p) => s + (p.capital ?? 0), 0);
}

function isActiveUpline(u: UserDoc | undefined, cfg: CompPlanConfig): boolean {
  if (cfg.uplineMinActive <= 0) return true;
  return activeCapital(u) >= cfg.uplineMinActive;
}

function displayName(u: UserDoc | undefined, uid: string): string {
  return u?.profile?.name || u?.profile?.email?.split("@")[0] || uid.slice(0, 6);
}

/** Calendar day in Asia/Manila (UTC+8) — members are Filipino. */
function manilaDayKey(now: number): string {
  return new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
}

const userRef = (uid: string) => db.collection("users").doc(uid);
const activityRef = (uid: string) => userRef(uid).collection("activity").doc();
const notificationRef = (uid: string) => userRef(uid).collection("notifications").doc();
const commissionRef = () => db.collection("commissions").doc();

function activity(
  writes: Write[],
  uid: string,
  data: { type: string; title: string; subtitle?: string; amount?: number; amountKind: "in" | "out" | "neutral" },
) {
  writes.push({ ref: activityRef(uid), data: { ...data, at: FieldValue.serverTimestamp() } });
}

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

// ============================================================================
// Activation
// ============================================================================

type ActivateArgs = {
  requestId?: string;
  userId?: string;
  amount?: number;
  termMonths?: number;
  note?: string;
};

export const activatePlacement = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const callerSnap = await userRef(request.auth.uid).get();
  if (!callerSnap.exists || callerSnap.data()?.isAdmin !== true) {
    throw new HttpsError("permission-denied", "Admin role required.");
  }
  const args = (request.data ?? {}) as ActivateArgs;
  const cfg = await loadCompPlan();
  const now = Date.now();
  return db.runTransaction((tx) => activateInTx(tx, cfg, args, request.auth!.uid, now));
});

async function activateInTx(tx: Transaction, cfg: CompPlanConfig, args: ActivateArgs, adminUid: string, now: number) {
  // ---------- reads (all before any write) ----------
  let reqRef: DocumentReference | null = null;
  let userId = args.userId;
  let amount = args.amount;
  let termMonths = args.termMonths;

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
    startedAt: now,
    cyclesPaid: 0,
    totalPaid: 0,
  };
  if (args.requestId) placement.requestId = args.requestId;
  const perCycle = (amount * cfg.cycleRate) / 100;
  const memberName = displayName(member, userId);

  const writes: Write[] = [];
  const patches = new UserPatches();

  // ---------- member ----------
  patches.set(userId, { placements: [...(member.placements ?? []), placement] });
  activity(writes, userId, {
    type: "placement-activate",
    title: `Placement activated — ${placement.id}`,
    subtitle: `${peso(amount)} · ${term.months}-month term · ${cycles} payouts of ${peso(perCycle)}`,
    amount,
    amountKind: "out",
  });
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
      processedBy: adminUid,
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
        createdAt: now,
      },
    });
    if (!paid) return;
    commissionsPaid++;
    patches.credit(up.uid, commission);
    activity(writes, up.uid, {
      type: "referral-commission",
      title: `Level ${i + 1} commission — ${memberName}`,
      subtitle: `${pct}% of ${peso(amount)} placement ${placement.id}`,
      amount: commission,
      amountKind: "in",
    });
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
          createdAt: now,
        },
      });
      if (!sponsorActive) continue; // stays unpaid → re-evaluated on the next qualifying placement
      fastStartPaid.push(key);
      patches.credit(sponsor.uid, tier.bonus);
      patches.set(sponsor.uid, { [`fastStart.paidTiers.${key}`]: now });
      activity(writes, sponsor.uid, {
        type: "fast-start",
        title: `Fast-Start Bonus — ${peso(tier.minPlacement)} tier`,
        subtitle: `${cfg.fastStartDirects} direct referrals with ${peso(tier.minPlacement)}+ placed`,
        amount: tier.bonus,
        amountKind: "in",
      });
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
// Payout engine (hourly)
// ============================================================================

export async function processPlacementsForUser(
  uid: string,
  cfg: CompPlanConfig,
  now: number,
): Promise<{ payouts: number; completed: number; notified: boolean }> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef(uid));
    if (!snap.exists) return { payouts: 0, completed: 0, notified: false };
    const user = snap.data() as UserDoc;
    const placements = user.placements ?? [];
    if (placements.length === 0) return { payouts: 0, completed: 0, notified: false };

    const writes: Write[] = [];
    const patches = new UserPatches();
    const remaining: Placement[] = [];
    const completed: CompletedPlacement[] = [...(user.completedPlacements ?? [])];
    const finished: Placement[] = [];
    let payouts = 0;
    let notified = false;
    let changed = false;
    const dayKey = manilaDayKey(now);

    for (const p of placements) {
      const cur: Placement = { ...p };
      const cycleMs = p.cycleDays * DAY_MS;
      const eligible = Math.min(Math.floor((now - p.startedAt) / cycleMs), p.cycles);
      const perCycle = (p.capital * p.cycleRate) / 100;

      for (let k = (p.cyclesPaid ?? 0) + 1; k <= eligible; k++) {
        const final = k === p.cycles;
        const title = `${p.id}, ${k} out of ${p.cycles} payouts has been credited`;
        patches.credit(uid, perCycle);
        cur.cyclesPaid = k;
        cur.totalPaid = (cur.totalPaid ?? 0) + perCycle;
        payouts++;
        changed = true;

        activity(writes, uid, {
          type: "payout",
          title,
          subtitle: `${p.cycleRate}% of ${peso(p.capital)}${final ? " · final payout" : ""}`,
          amount: perCycle,
          amountKind: "in",
        });

        let body = `${peso(perCycle)} added to your wallet.`;
        if (final) {
          patches.credit(uid, p.capital + p.lockedBonus);
          activity(writes, uid, {
            type: "capital-return",
            title: `${p.id} capital returned`,
            subtitle: `${p.termMonths}-month term completed`,
            amount: p.capital,
            amountKind: "in",
          });
          if (p.lockedBonus > 0) {
            activity(writes, uid, {
              type: "locked-bonus",
              title: `${p.id} Locked-In Bonus`,
              subtitle: `${p.units} unit${p.units > 1 ? "s" : ""} × ${p.termMonths}-month term`,
              amount: p.lockedBonus,
              amountKind: "in",
            });
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
        completed.push({ ...cur, completedAt: now, capitalReturned: p.capital, lockedBonusPaid: p.lockedBonus });
        finished.push(cur);
        continue;
      }

      // Daily accrual notice between payouts (once per Manila calendar day).
      if (cfg.dailyAccrualNotifications && now > p.startedAt && cur.lastAccrualDay !== dayKey) {
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

    if (!changed) return { payouts: 0, completed: 0, notified: false };

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
            createdAt: now,
          },
        });
        if (!sponsorActive) continue;
        patches.credit(sponsorUid, bonus);
        activity(writes, sponsorUid, {
          type: "leadership",
          title: `Leadership Bonus — ${memberName}`,
          subtitle: `${cfg.leadershipPct}% of ${peso(p.lockedBonus)} Locked-In Bonus (${p.id})`,
          amount: bonus,
          amountKind: "in",
        });
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
    return { payouts, completed: finished.length, notified };
  });
}
