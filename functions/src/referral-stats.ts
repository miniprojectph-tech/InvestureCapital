import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./init";
import { loadCompPlan, activeCapital, isActiveUpline, displayName, type UserDoc } from "./compplan";

// Members can only read their own user doc, so downline stats (six levels of
// referrals, Fast-Start progress) are computed here and returned read-only.

const MAX_NODES = 5000;
const IN_CHUNK = 30; // Firestore `in` query limit

export type ReferralLevelStat = { level: number; pct: number; members: number; active: number; placed: number };
export type DirectStat = {
  uid: string;
  name: string;
  joinedAt: number;
  activePlaced: number;
  placements: number;
  /** Locked-In Bonuses still to be paid on their active placements (drives Leadership). */
  pendingLockedBonus: number;
};

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const getReferralStats = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const callerUid = request.auth.uid;

  // Admins may inspect any member's tree; members only their own.
  let rootUid = callerUid;
  const wanted = (request.data as { userId?: string } | undefined)?.userId;
  if (wanted && wanted !== callerUid) {
    const caller = await db.collection("users").doc(callerUid).get();
    if (caller.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
    rootUid = wanted;
  }

  const cfg = await loadCompPlan();
  const rootSnap = await db.collection("users").doc(rootUid).get();
  const root = (rootSnap.data() ?? {}) as UserDoc;

  const levels: ReferralLevelStat[] = [];
  const directs: DirectStat[] = [];
  const seen = new Set<string>([rootUid]);
  let frontier = [rootUid];
  let total = 0;

  for (let lvl = 1; lvl <= cfg.referralLevels.length && frontier.length > 0; lvl++) {
    const next: string[] = [];
    let members = 0;
    let active = 0;
    let placed = 0;

    for (const chunk of chunks(frontier, IN_CHUNK)) {
      if (total >= MAX_NODES) break;
      const snap = await db.collection("users").where("referredByUserId", "in", chunk).get();
      for (const doc of snap.docs) {
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);
        const u = doc.data() as UserDoc;
        const cap = activeCapital(u);
        members++;
        placed += cap;
        if (isActiveUpline(u, cfg)) active++;
        next.push(doc.id);
        total++;
        if (lvl === 1) {
          directs.push({
            uid: doc.id,
            name: displayName(u, doc.id),
            joinedAt: u.profile?.joinedAt ?? 0,
            activePlaced: cap,
            placements: (u.placements ?? []).length,
            pendingLockedBonus: (u.placements ?? []).reduce((s, p) => s + (p.lockedBonus ?? 0), 0),
          });
        }
        if (total >= MAX_NODES) break;
      }
    }

    levels.push({ level: lvl, pct: cfg.referralLevels[lvl - 1] ?? 0, members, active, placed });
    frontier = next;
  }

  // Pad missing levels so the UI always shows every configured level.
  for (let lvl = levels.length + 1; lvl <= cfg.referralLevels.length; lvl++) {
    levels.push({ level: lvl, pct: cfg.referralLevels[lvl - 1] ?? 0, members: 0, active: 0, placed: 0 });
  }

  directs.sort((a, b) => b.activePlaced - a.activePlaced || b.joinedAt - a.joinedAt);
  const paidTiers = root.fastStart?.paidTiers ?? {};

  return {
    rootUid,
    levels,
    directs,
    totals: {
      members: levels.reduce((s, l) => s + l.members, 0),
      active: levels.reduce((s, l) => s + l.active, 0),
      placed: levels.reduce((s, l) => s + l.placed, 0),
    },
    fastStart: {
      directsRequired: cfg.fastStartDirects,
      tiers: cfg.fastStartTiers.map((t) => ({
        minPlacement: t.minPlacement,
        bonus: t.bonus,
        qualifying: directs.filter((d) => d.activePlaced >= t.minPlacement).length,
        paidAt: paidTiers[String(t.minPlacement)] ?? null,
      })),
    },
    leadershipPct: cfg.leadershipPct,
    uplineMinActive: cfg.uplineMinActive,
    selfActive: isActiveUpline(root, cfg),
    truncated: total >= MAX_NODES,
  };
});
