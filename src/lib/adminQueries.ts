"use client";

import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { UserState } from "./userState";
import type { Placement, CompletedPlacement } from "./compplan";

export type InvestorRow = {
  uid: string;
  name: string;
  email: string;
  wallet: number;
  /** Locked-In Bonuses still to be paid on active placements. */
  bonusesDue: number;
  /** Capital currently placed. */
  deployed: number;
  activePlansCount: number;
  completedPlansCount: number;
  totalEarned: number;
  joinedAt: number;
  isAdmin: boolean;
};

export type AdminAggregate = {
  totalInvestors: number;
  totalWallet: number;
  totalBonusesDue: number;
  totalDeployed: number;
  totalActivePlans: number;
};

/** Fetch up to `max` investors, newest first. Requires admin role per Firestore rules. */
export async function listInvestors(db: Firestore, max = 100): Promise<InvestorRow[]> {
  const q = query(collection(db, "users"), orderBy("profile.joinedAt", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as UserState;
    const placements = data.placements ?? [];
    const completed = data.completedPlacements ?? [];
    return {
      uid: d.id,
      name: data.profile?.name ?? "—",
      email: data.profile?.email ?? "",
      wallet: data.balances?.wallet ?? 0,
      bonusesDue: placements.reduce((s, p) => s + p.lockedBonus, 0),
      deployed: placements.reduce((s, p) => s + p.capital, 0),
      activePlansCount: placements.length,
      completedPlansCount: completed.length,
      totalEarned:
        placements.reduce((s, p) => s + (p.totalPaid ?? 0), 0) +
        completed.reduce((s, p) => s + (p.totalPaid ?? 0) + (p.lockedBonusPaid ?? 0), 0),
      joinedAt: data.profile?.joinedAt ?? 0,
      isAdmin: data.isAdmin === true,
    };
  });
}

export function computeAggregate(rows: InvestorRow[]): AdminAggregate {
  return {
    totalInvestors: rows.length,
    totalWallet: rows.reduce((s, r) => s + r.wallet, 0),
    totalBonusesDue: rows.reduce((s, r) => s + r.bonusesDue, 0),
    totalDeployed: rows.reduce((s, r) => s + r.deployed, 0),
    totalActivePlans: rows.reduce((s, r) => s + r.activePlansCount, 0),
  };
}

// ===== Cross-investor placement listing =====

export type PlacementRow = Placement & {
  userId: string;
  userName: string;
  userEmail: string;
  status: "active" | "completed";
  completedAt?: number;
  lockedBonusPaid?: number;
};

/** Every placement on the platform (active first, newest first). Admin only. */
export async function listAllPlacements(db: Firestore): Promise<PlacementRow[]> {
  const snap = await getDocs(collection(db, "users"));
  const rows: PlacementRow[] = [];
  for (const userDoc of snap.docs) {
    const data = userDoc.data() as UserState;
    const who = { userId: userDoc.id, userName: data.profile?.name ?? "—", userEmail: data.profile?.email ?? "" };
    for (const p of data.placements ?? []) rows.push({ ...p, ...who, status: "active" });
    for (const p of (data.completedPlacements ?? []) as CompletedPlacement[]) {
      rows.push({ ...p, ...who, status: "completed", completedAt: p.completedAt, lockedBonusPaid: p.lockedBonusPaid });
    }
  }
  return rows.sort((a, b) => (a.status === b.status ? b.startedAt - a.startedAt : a.status === "active" ? -1 : 1));
}

// ===== Cross-investor activity (collectionGroup) =====

export type AdminActivityRow = {
  id: string;
  path: string;
  userId: string;
  type: string;
  title: string;
  subtitle: string;
  amount?: number;
  amountKind?: "in" | "out" | "neutral";
  at: number;
};

function rowFromActivityDoc(d: QueryDocumentSnapshot): AdminActivityRow {
  const data = d.data();
  const userId = d.ref.parent.parent?.id ?? "";
  // Firestore timestamps come back as Timestamp objects; normalise to ms.
  const at =
    data.at && typeof (data.at as { toMillis?: () => number }).toMillis === "function"
      ? (data.at as { toMillis: () => number }).toMillis()
      : typeof data.at === "number"
      ? data.at
      : Date.now();
  return {
    id: d.id,
    path: d.ref.path,
    userId,
    type: data.type ?? "unknown",
    title: data.title ?? "",
    subtitle: data.subtitle ?? "",
    amount: typeof data.amount === "number" ? data.amount : undefined,
    amountKind: data.amountKind,
    at,
  };
}

export type ActivityPage = {
  rows: AdminActivityRow[];
  lastDoc: QueryDocumentSnapshot | null;
  hasMore: boolean;
};

/**
 * Fetch up to `cap` cross-investor activity rows in one shot, then sort
 * client-side by `at` desc. This avoids needing a Firestore single-field
 * exemption for `collectionGroup('activity').orderBy('at')` — the spec
 * is committed in firestore.indexes.json but takes 5–10 minutes to build
 * the first time. The client-side cap stays well under Firestore's
 * collectionGroup limits for the prototype scale.
 */
export async function fetchAllActivity(
  db: Firestore,
  cap = 500
): Promise<AdminActivityRow[]> {
  const q = query(collectionGroup(db, "activity"), limit(cap));
  const snap = await getDocs(q);
  const rows = snap.docs.map(rowFromActivityDoc);
  return rows.sort((a, b) => b.at - a.at);
}

/** Legacy paginated fetch (requires the COLLECTION_GROUP_DESC exemption on `at`). */
export async function fetchActivityPage(
  db: Firestore,
  pageSize: number,
  after?: QueryDocumentSnapshot | null
): Promise<ActivityPage> {
  const base = query(collectionGroup(db, "activity"), orderBy("at", "desc"));
  const q = after ? query(base, startAfter(after), limit(pageSize)) : query(base, limit(pageSize));
  const snap = await getDocs(q);
  return {
    rows: snap.docs.map(rowFromActivityDoc),
    lastDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
    hasMore: snap.docs.length === pageSize,
  };
}
