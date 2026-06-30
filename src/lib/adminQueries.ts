"use client";

import { collection, getDocs, limit, orderBy, query, type Firestore } from "firebase/firestore";
import type { UserState } from "./userState";

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
