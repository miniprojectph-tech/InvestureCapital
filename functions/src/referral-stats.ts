import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./init";
import { loadCompPlan, activeCapital, isActiveUpline, displayName, type UserDoc } from "./compplan";
import { maskName } from "./maskName";

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
  /** Level-1 commission this member has been paid from this direct, all time. */
  commissionPaid: number;
  /** One line per active placement: what it paid and what Leadership it will pay, and when. */
  items: DirectPlacement[];
};
export type DirectPlacement = {
  id: string;
  capital: number;
  termMonths: number;
  startedAt: number;
  /** When the term completes (the Leadership Bonus is paid on the next hourly run). */
  endsAt: number;
  lockedBonus: number;
  /** Level-1 commission paid to this member for this placement. */
  commission: number;
};

const DAY_MS = 86_400_000;

/**
 * One person in the team tree. `p` is the position of their sponsor in the same
 * list (-1 = invited directly by the member whose tree this is), so no member ids
 * are sent. A member sees full names only for their own direct invites; deeper
 * levels are masked (`m`) and no amounts are included. An admin looking at a
 * member's tree gets full names and the amount each person has placed (`amt`).
 */
export type TeamNode = { p: number; l: number; n: string; j: number; a: boolean; c: number; m?: boolean; amt?: number };

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

  // Only an admin can ask for someone else's tree (checked above) — they see everything.
  const adminView = rootUid !== callerUid;
  const tree: TeamNode[] = [];
  const position = new Map<string, number>(); // member id → position in `tree`

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
        {
          const parent = lvl === 1 ? -1 : position.get(String(u.referredByUserId ?? "")) ?? -1;
          const full = displayName(u, doc.id);
          const masked = !adminView && lvl > 1;
          position.set(doc.id, tree.length);
          tree.push({
            p: parent,
            l: lvl,
            n: masked ? maskName(full) : full,
            j: u.profile?.joinedAt ?? 0,
            a: (u.placements ?? []).length > 0,
            c: 0,
            ...(masked ? { m: true } : {}),
            ...(adminView ? { amt: cap } : {}),
          });
          if (parent >= 0) tree[parent].c++;
        }
        if (lvl === 1) {
          const active = u.placements ?? [];
          directs.push({
            uid: doc.id,
            name: displayName(u, doc.id),
            joinedAt: u.profile?.joinedAt ?? 0,
            activePlaced: cap,
            placements: active.length,
            pendingLockedBonus: active.reduce((s, p) => s + (p.lockedBonus ?? 0), 0),
            commissionPaid: 0, // filled in below from the commission records
            items: active
              .map((p) => ({
                id: String(p.id ?? ""),
                capital: Number(p.capital) || 0,
                termMonths: Number(p.termMonths) || 0,
                startedAt: Number(p.startedAt) || 0,
                endsAt: (Number(p.startedAt) || 0) + (Number(p.cycles) || 0) * (Number(p.cycleDays) || 0) * DAY_MS,
                lockedBonus: Number(p.lockedBonus) || 0,
                commission: 0,
              }))
              .sort((a, b) => a.endsAt - b.endsAt),
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

  // Level-1 commission paid to this member, per direct and per placement. Two equality
  // filters, so no composite index is needed; one read per direct placement ever paid.
  if (directs.length > 0) {
    const byUid = new Map(directs.map((d) => [d.uid, d]));
    const comms = await db.collection("commissions").where("toUserId", "==", rootUid).where("level", "==", 1).get();
    for (const c of comms.docs) {
      const x = c.data() as { type?: string; status?: string; fromUserId?: string; placementId?: string; amount?: number };
      if (x.type !== "level" || x.status !== "paid") continue;
      const d = byUid.get(String(x.fromUserId ?? ""));
      if (!d) continue;
      const amt = Number(x.amount) || 0;
      d.commissionPaid = Math.round((d.commissionPaid + amt) * 100) / 100;
      const item = d.items.find((i) => i.id === x.placementId);
      if (item) item.commission = Math.round((item.commission + amt) * 100) / 100;
    }
  }

  directs.sort((a, b) => b.activePlaced - a.activePlaced || b.joinedAt - a.joinedAt);
  const paidTiers = root.fastStart?.paidTiers ?? {};

  return {
    rootUid,
    levels,
    directs,
    tree,
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
