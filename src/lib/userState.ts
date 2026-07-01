import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";

export type StoredActivePlan = {
  id: string;
  planId: string;
  capital: number;
  startedAt: number; // unix ms
  completedAt?: number;
};

export type CompletedPlan = StoredActivePlan & {
  completedAt: number;
  vaultCredited: number;
  capitalReturned: number;
};

/** Investor's own account where approved withdrawals are sent. */
export type PayoutMethod = {
  type: "gotyme" | "gcash" | "bankTransfer";
  accountName: string;
  accountNumber: string;
  bankName?: string;
  updatedAt: number;
};

export type UserState = {
  profile: {
    name: string;
    email: string;
    joinedAt: number;
    demoSeeded: boolean;
  };
  balances: {
    wallet: number;
    vault: number;
    vaultLockStartedAt: number | null;
    /** When the vault was last compounded by the scheduled job. */
    vaultLastCompoundedAt?: number | null;
  };
  activePlans: StoredActivePlan[];
  completedPlans?: CompletedPlan[];
  /** Where approved withdrawals are paid out. Set by the investor on /withdrawals. */
  payoutMethod?: PayoutMethod;
  /** Admin role — set manually in Firestore console. Defaults false on seed. */
  isAdmin?: boolean;
};

/** Kept for backwards compatibility; new sign-ups now start with zero balance. */
export const STARTER_BALANCE = 0;

export function createStarterState(name: string, email: string): UserState {
  const now = Date.now();
  return {
    profile: { name, email, joinedAt: now, demoSeeded: true },
    balances: { wallet: 0, vault: 0, vaultLockStartedAt: null },
    activePlans: [],
    completedPlans: [],
    isAdmin: false,
  };
}

export async function ensureUserDoc(
  db: Firestore,
  uid: string,
  name: string,
  email: string
): Promise<void> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  const seed = createStarterState(name, email);
  await setDoc(ref, seed);
}

export function subscribeToUserState(
  db: Firestore,
  uid: string,
  cb: (state: UserState | null) => void
): Unsubscribe {
  const ref = doc(db, "users", uid);
  return onSnapshot(
    ref,
    (snap) => cb(snap.exists() ? (snap.data() as UserState) : null),
    (err) => {
      console.error("user state subscription error", err);
      cb(null);
    }
  );
}

// Day computed from plan start time (real wall-clock days elapsed).
export function getDayProgress(plan: StoredActivePlan, planDurationDays: number): number {
  const elapsed = Math.floor((Date.now() - plan.startedAt) / 86_400_000);
  return Math.min(planDurationDays, Math.max(1, elapsed + 1));
}

// Derived helpers (pure — take plans + templates, return numbers)
export type PlanTemplate = {
  id: string;
  durationDays: number;
  dailyRate: number; // percent
};

export function computeDeployed(activePlans: StoredActivePlan[]) {
  return activePlans.reduce((sum, p) => sum + p.capital, 0);
}

export function computeDailyIncome(
  activePlans: StoredActivePlan[],
  templates: PlanTemplate[]
) {
  return activePlans.reduce((sum, p) => {
    const tpl = templates.find((t) => t.id === p.planId);
    if (!tpl) return sum;
    return sum + p.capital * (tpl.dailyRate / 100);
  }, 0);
}

export function computePendingVaultCredits(
  activePlans: StoredActivePlan[],
  templates: PlanTemplate[]
) {
  return activePlans.reduce((sum, p) => {
    const tpl = templates.find((t) => t.id === p.planId);
    if (!tpl) return sum;
    return sum + p.capital * (tpl.dailyRate / 100) * tpl.durationDays;
  }, 0);
}

export function computeVaultLockDay(vaultLockStartedAt: number | null): number {
  if (!vaultLockStartedAt) return 0;
  const elapsed = Math.floor((Date.now() - vaultLockStartedAt) / 86_400_000);
  return Math.max(0, Math.min(365, elapsed));
}

export function userActivityRef(db: Firestore, uid: string) {
  return collection(db, "users", uid, "activity");
}

export { serverTimestamp };

// ===== Write helpers =====

async function logActivity(
  db: Firestore,
  uid: string,
  event: {
    type: string;
    title: string;
    subtitle: string;
    amount?: number;
    amountKind?: "in" | "out" | "neutral";
  }
) {
  await addDoc(userActivityRef(db, uid), {
    ...event,
    at: serverTimestamp(),
  });
}

/**
 * Add funds to wallet. Used by the Top-up panel on /wallet. Simulated —
 * in production this would route through a payment gateway and only credit
 * the wallet on payment confirmation.
 */
export async function topUpWallet(
  db: Firestore,
  uid: string,
  amount: number
): Promise<void> {
  if (amount <= 0) throw new Error("Amount must be greater than zero");
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("User document not found");
  const cur = snap.data() as UserState;
  await updateDoc(ref, {
    "balances.wallet": (cur.balances.wallet ?? 0) + amount,
  });
  await logActivity(db, uid, {
    type: "deposit",
    title: "Wallet topped up",
    subtitle: "Simulated deposit · instant",
    amount,
    amountKind: "in",
  });
}

export async function withdrawFromWallet(
  db: Firestore,
  uid: string,
  amount: number
): Promise<void> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("User document not found");
  const cur = snap.data() as UserState;
  if (cur.balances.wallet < amount) throw new Error("Insufficient wallet balance");

  await updateDoc(ref, {
    "balances.wallet": cur.balances.wallet - amount,
  });
  await logActivity(db, uid, {
    type: "withdrawal",
    title: "Withdrawal approved",
    subtitle: "To bank ····3421",
    amount,
    amountKind: "out",
  });
}

/**
 * Admin-only: fast-forward a user's active plan to completion. Used for
 * testing the completion flow without waiting real days. Credits the vault
 * by `capital × dailyRate × duration`, returns capital to wallet, moves the
 * plan from activePlans → completedPlans, anchors the vault lock if it's
 * the user's first ever completion, and logs the event.
 */
export async function completePlanForUser(
  db: Firestore,
  userId: string,
  planInstanceId: string,
  planRate: number,
  planDuration: number,
  planName: string
): Promise<void> {
  const ref = doc(db, "users", userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("User not found");
  const cur = snap.data() as UserState;

  const plan = cur.activePlans?.find((p) => p.id === planInstanceId);
  if (!plan) throw new Error("Plan not found in active list");

  const vaultCredit = plan.capital * (planRate / 100) * planDuration;
  const completed: CompletedPlan = {
    ...plan,
    completedAt: Date.now(),
    vaultCredited: vaultCredit,
    capitalReturned: plan.capital,
  };

  const updates: Record<string, unknown> = {
    activePlans: cur.activePlans.filter((p) => p.id !== planInstanceId),
    completedPlans: [...(cur.completedPlans ?? []), completed],
    "balances.vault": (cur.balances.vault ?? 0) + vaultCredit,
    "balances.wallet": (cur.balances.wallet ?? 0) + plan.capital,
  };

  if (!cur.balances.vaultLockStartedAt) {
    updates["balances.vaultLockStartedAt"] = Date.now();
  }
  // Anchor the compounding clock to now on first vault credit, so the
  // scheduled job compounds from here rather than from the (earlier) lock date.
  if (!cur.balances.vaultLastCompoundedAt) {
    updates["balances.vaultLastCompoundedAt"] = Date.now();
  }

  await updateDoc(ref, updates);
  await logActivity(db, userId, {
    type: "plan-complete",
    title: `Plan completed — ${planName}`,
    subtitle: `Vault credited ${vaultCredit.toFixed(2)} · capital ${plan.capital} returned`,
    amount: vaultCredit,
    amountKind: "neutral",
  });
}

export async function activatePlanFor(
  db: Firestore,
  uid: string,
  planId: string,
  planName: string,
  capital: number
): Promise<void> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("User document not found");
  const cur = snap.data() as UserState;
  if (cur.balances.wallet < capital) {
    throw new Error("Insufficient wallet balance to activate this plan");
  }

  const newPlan: StoredActivePlan = {
    id: `${Date.now()}-${planId}`,
    planId,
    capital,
    startedAt: Date.now(),
  };

  const updates: Record<string, unknown> = {
    "balances.wallet": cur.balances.wallet - capital,
    activePlans: [...cur.activePlans, newPlan],
  };

  // Anchor the 365-day vault lock to the first ever activation.
  if (!cur.balances.vaultLockStartedAt) {
    updates["balances.vaultLockStartedAt"] = Date.now();
  }

  await updateDoc(ref, updates);
  await logActivity(db, uid, {
    type: "plan-activate",
    title: `Plan activated — ${planName}`,
    subtitle: `Capital ${capital.toLocaleString()}`,
    amount: capital,
    amountKind: "out",
  });
}
