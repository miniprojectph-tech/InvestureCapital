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
import type { CompletedPlan, StoredActivePlan, UserState } from "./userState";

export type InvestorRow = {
  uid: string;
  name: string;
  email: string;
  wallet: number;
  vault: number;
  activePlansCount: number;
  joinedAt: number;
  isAdmin: boolean;
};

export type AdminAggregate = {
  totalInvestors: number;
  totalWallet: number;
  totalVault: number;
  totalDeployed: number;
  totalActivePlans: number;
};

/** Fetch up to `max` investors, newest first. Requires admin role per Firestore rules. */
export async function listInvestors(db: Firestore, max = 100): Promise<InvestorRow[]> {
  const q = query(collection(db, "users"), orderBy("profile.joinedAt", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as UserState;
    const deployed = data.activePlans?.reduce((s, p) => s + p.capital, 0) ?? 0;
    return {
      uid: d.id,
      name: data.profile?.name ?? "—",
      email: data.profile?.email ?? "",
      wallet: data.balances?.wallet ?? 0,
      vault: data.balances?.vault ?? 0,
      activePlansCount: data.activePlans?.length ?? 0,
      joinedAt: data.profile?.joinedAt ?? 0,
      isAdmin: data.isAdmin === true,
      // exposed via list for the table; deployed isn't on the row type
      ..._with({ deployed }),
    };
  });
}

// Tiny helper to keep the extra field typed loosely without polluting the row type.
function _with<T>(x: T) {
  return x as T;
}

export function computeAggregate(rows: InvestorRow[]): AdminAggregate {
  return {
    totalInvestors: rows.length,
    totalWallet: rows.reduce((s, r) => s + r.wallet, 0),
    totalVault: rows.reduce((s, r) => s + r.vault, 0),
    totalDeployed: rows.reduce(
      (s, r) => s + ((r as InvestorRow & { deployed?: number }).deployed ?? 0),
      0
    ),
    totalActivePlans: rows.reduce((s, r) => s + r.activePlansCount, 0),
  };
}

// ===== Cross-investor plan listings =====

export type ActivePlanRow = StoredActivePlan & {
  userId: string;
  userName: string;
  userEmail: string;
};

export type CompletedPlanRow = CompletedPlan & {
  userId: string;
  userName: string;
  userEmail: string;
};

export async function listAllActivePlans(db: Firestore): Promise<ActivePlanRow[]> {
  const snap = await getDocs(collection(db, "users"));
  const rows: ActivePlanRow[] = [];
  for (const userDoc of snap.docs) {
    const data = userDoc.data() as UserState;
    for (const plan of data.activePlans ?? []) {
      rows.push({
        ...plan,
        userId: userDoc.id,
        userName: data.profile?.name ?? "—",
        userEmail: data.profile?.email ?? "",
      });
    }
  }
  return rows.sort((a, b) => b.startedAt - a.startedAt);
}

export async function listAllCompletedPlans(db: Firestore): Promise<CompletedPlanRow[]> {
  const snap = await getDocs(collection(db, "users"));
  const rows: CompletedPlanRow[] = [];
  for (const userDoc of snap.docs) {
    const data = userDoc.data() as UserState;
    for (const plan of data.completedPlans ?? []) {
      rows.push({
        ...plan,
        userId: userDoc.id,
        userName: data.profile?.name ?? "—",
        userEmail: data.profile?.email ?? "",
      });
    }
  }
  return rows.sort((a, b) => b.completedAt - a.completedAt);
}

// ===== Cross-investor vault listing =====

export type VaultRow = {
  userId: string;
  userName: string;
  userEmail: string;
  vault: number;
  vaultLockStartedAt: number | null;
  vaultLastCompoundedAt: number | null;
};

/** Every investor holding a vault balance, with their lock/compound anchors. */
export async function listActiveVaults(db: Firestore): Promise<VaultRow[]> {
  const snap = await getDocs(collection(db, "users"));
  const rows: VaultRow[] = [];
  for (const userDoc of snap.docs) {
    const data = userDoc.data() as UserState;
    const vault = data.balances?.vault ?? 0;
    if (vault <= 0) continue;
    rows.push({
      userId: userDoc.id,
      userName: data.profile?.name ?? "—",
      userEmail: data.profile?.email ?? "",
      vault,
      vaultLockStartedAt: data.balances?.vaultLockStartedAt ?? null,
      vaultLastCompoundedAt: data.balances?.vaultLastCompoundedAt ?? null,
    });
  }
  return rows.sort((a, b) => b.vault - a.vault);
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
