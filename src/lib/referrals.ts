import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  collection,
  type Firestore,
  type Transaction,
} from "firebase/firestore";
import type {
  ReferralBonusType,
  ReferralReleaseType,
} from "./mock-data";
import {
  EMPTY_REFERRAL_WALLET,
  userActivityRef,
  type ReferralWallet,
  type UserState,
} from "./userState";

/** Public production origin — used as the referral-link base when we're not in
 *  the browser (e.g. building the link server-side). */
export const REFERRAL_ORIGIN = "https://www.investurecapital.app";

export type ReferralStatus =
  | "queued" // just filed by the referred user, not yet processed by the function
  | "released" // credited to the referrer's available balance
  | "pending" // awaiting admin approval
  | "locked" // held until the clearing period passes
  | "cancelled";

/** The referral-relevant slice of a plan template. */
export type ReferralPlanConfig = {
  referralEnabled?: boolean;
  referralBonusType?: ReferralBonusType;
  referralBonusValue?: number;
  referralReleaseType?: ReferralReleaseType;
  clearingPeriodDays?: number;
};

export type ReferralTransaction = {
  id: string;
  referrerUserId: string;
  referredUserId: string;
  referredUserName?: string;
  planId: string;
  planName: string;
  planActivationId: string;
  planAmount: number;
  referralBonusType?: ReferralBonusType;
  referralBonusValue?: number;
  referralBonusAmount: number;
  referralReleaseType?: ReferralReleaseType;
  clearingPeriodDays?: number;
  status: ReferralStatus;
  releaseDate?: number;
  createdAt: number;
  updatedAt?: number;
  processedAt?: number;
};

const DAY_MS = 86_400_000;

// ===== Code generation & links =====

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 ambiguity
const CODE_LENGTH = 6;

/** Random human-friendly code, e.g. "K7QP2M". Uniqueness is enforced against
 *  the referralCodes index by {@link ensureReferralCode}. */
export function generateReferralCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function getReferralLink(code: string, origin?: string): string {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : REFERRAL_ORIGIN);
  return `${base}/register?ref=${encodeURIComponent(code)}`;
}

function referralCodesDoc(db: Firestore, code: string) {
  return doc(db, "referralCodes", code.toUpperCase());
}

export function referralTxnDoc(db: Firestore, id: string) {
  return doc(db, "referral_transactions", id);
}

export function referralTxnCollection(db: Firestore) {
  return collection(db, "referral_transactions");
}

/**
 * Ensure the user has a unique referralCode plus its public code→uid index doc.
 * Idempotent: returns the existing code if one is already set. Called at signup
 * and (as a backfill) when an older account first opens the referral page.
 */
export async function ensureReferralCode(db: Firestore, uid: string): Promise<string> {
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error("User document not found");
  const existing = (snap.data() as UserState).referralCode;
  if (existing) return existing;

  // Try a few random codes to dodge the (very unlikely) collision.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateReferralCode();
    const idxRef = referralCodesDoc(db, code);
    const idxSnap = await getDoc(idxRef);
    if (idxSnap.exists()) continue;
    await setDoc(idxRef, { uid, createdAt: Date.now() });
    await updateDoc(userRef, { referralCode: code });
    return code;
  }
  throw new Error("Could not allocate a referral code, please retry");
}

/** Resolve a referral code to the referrer's uid (or null if unknown). */
export async function resolveReferralCode(
  db: Firestore,
  code: string
): Promise<string | null> {
  if (!code) return null;
  const snap = await getDoc(referralCodesDoc(db, code));
  if (!snap.exists()) return null;
  const uid = snap.data().uid;
  return typeof uid === "string" ? uid : null;
}

/**
 * Attach a referrer to a freshly-signed-up user. Sets `referredByUserId` once
 * and never overwrites it. Silently ignores unknown codes and self-referrals.
 */
export async function attachReferrer(
  db: Firestore,
  uid: string,
  code: string
): Promise<void> {
  const referrerUid = await resolveReferralCode(db, code);
  if (!referrerUid || referrerUid === uid) return; // unknown code or self-referral
  const userRef = doc(db, "users", uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists()) return;
    const cur = snap.data() as UserState;
    if (cur.referredByUserId) return; // already attached — immutable
    tx.update(userRef, { referredByUserId: referrerUid });
  });
}

// ===== Bonus math =====

/** Referral bonus for one plan activation. Percentage is of the plan amount;
 *  fixed is a flat peso amount. Disabled plans pay nothing. */
export function calculateReferralBonus(
  config: ReferralPlanConfig,
  planAmount: number
): number {
  if (!config.referralEnabled) return 0;
  const value = config.referralBonusValue ?? 0;
  if (config.referralBonusType === "fixed") return Math.max(0, value);
  // default to percentage
  return Math.max(0, planAmount * (value / 100));
}

// ===== Claim (written by the referred user at activation) =====

/**
 * File a referral claim for one plan activation. Written by the referred user;
 * a Cloud Function validates it and credits the referrer. The doc id is the
 * plan-activation id, which makes the claim idempotent (one bonus per plan).
 */
export async function createReferralClaim(
  db: Firestore,
  args: {
    referrerUserId: string;
    referredUserId: string;
    referredUserName: string;
    planId: string;
    planName: string;
    planActivationId: string;
    planAmount: number;
    config: ReferralPlanConfig;
  }
): Promise<void> {
  const { config } = args;
  if (!args.referrerUserId || args.referrerUserId === args.referredUserId) return;
  const amount = calculateReferralBonus(config, args.planAmount);

  await setDoc(referralTxnDoc(db, args.planActivationId), {
    referrerUserId: args.referrerUserId,
    referredUserId: args.referredUserId,
    referredUserName: args.referredUserName,
    planId: args.planId,
    planName: args.planName,
    planActivationId: args.planActivationId,
    planAmount: args.planAmount,
    referralBonusType: config.referralBonusType ?? "percentage",
    referralBonusValue: config.referralBonusValue ?? 0,
    referralBonusAmount: amount,
    referralReleaseType: config.referralReleaseType ?? "instant",
    clearingPeriodDays: config.clearingPeriodDays ?? 0,
    status: "queued",
    createdAt: Date.now(),
  });
}

// ===== Wallet helpers =====

export function readReferralWallet(state?: Partial<UserState> | null): ReferralWallet {
  const w = state?.referralWallet;
  return {
    available: w?.available ?? 0,
    pending: w?.pending ?? 0,
    locked: w?.locked ?? 0,
    totalEarned: w?.totalEarned ?? 0,
    totalWithdrawn: w?.totalWithdrawn ?? 0,
  };
}

const clamp0 = (n: number) => (n < 0 ? 0 : n);

/**
 * Move available referral earnings into the main wallet. Own-doc write, so the
 * user can do this client-side. Pending/locked balances are untouchable here.
 */
export async function transferReferralToWallet(
  db: Firestore,
  uid: string,
  amount: number
): Promise<void> {
  if (amount <= 0) throw new Error("Amount must be greater than zero");
  const userRef = doc(db, "users", uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists()) throw new Error("User document not found");
    const cur = snap.data() as UserState;
    const w = readReferralWallet(cur);
    if (w.available < amount) throw new Error("Insufficient available referral balance");
    tx.update(userRef, {
      "referralWallet.available": w.available - amount,
      "referralWallet.totalWithdrawn": w.totalWithdrawn + amount,
      "balances.wallet": (cur.balances?.wallet ?? 0) + amount,
    });
    tx.set(doc(userActivityRef(db, uid)), {
      type: "deposit",
      title: "Referral earnings moved to wallet",
      subtitle: `₱${amount.toLocaleString()} from referral balance`,
      amount,
      amountKind: "in",
      at: serverTimestamp(),
    });
  });
}

// ===== Admin actions (admin may write any user doc, so client-side is fine) =====

/** Read the referrer's wallet inside a transaction and apply a bucket patch. */
async function mutateReferrerWallet(
  tx: Transaction,
  db: Firestore,
  referrerUserId: string,
  patch: (w: ReferralWallet) => Partial<ReferralWallet>
) {
  const rRef = doc(db, "users", referrerUserId);
  const rSnap = await tx.get(rRef);
  const w = rSnap.exists() ? readReferralWallet(rSnap.data() as UserState) : { ...EMPTY_REFERRAL_WALLET };
  const next = patch(w);
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(next)) updates[`referralWallet.${k}`] = v;
  tx.update(rRef, updates);
}

/** Approve a pending bonus: pending → available. */
export async function approveReferralTransaction(db: Firestore, txnId: string): Promise<void> {
  const tRef = referralTxnDoc(db, txnId);
  await runTransaction(db, async (tx) => {
    const tSnap = await tx.get(tRef);
    if (!tSnap.exists()) throw new Error("Referral transaction not found");
    const t = tSnap.data() as ReferralTransaction;
    if (t.status !== "pending") throw new Error("Only pending bonuses can be approved");
    await mutateReferrerWallet(tx, db, t.referrerUserId, (w) => ({
      pending: clamp0(w.pending - t.referralBonusAmount),
      available: w.available + t.referralBonusAmount,
    }));
    tx.update(tRef, { status: "released", updatedAt: Date.now() });
  });
}

/** Release a locked bonus early: locked → available. */
export async function releaseReferralTransaction(db: Firestore, txnId: string): Promise<void> {
  const tRef = referralTxnDoc(db, txnId);
  await runTransaction(db, async (tx) => {
    const tSnap = await tx.get(tRef);
    if (!tSnap.exists()) throw new Error("Referral transaction not found");
    const t = tSnap.data() as ReferralTransaction;
    if (t.status !== "locked") throw new Error("Only locked bonuses can be released");
    await mutateReferrerWallet(tx, db, t.referrerUserId, (w) => ({
      locked: clamp0(w.locked - t.referralBonusAmount),
      available: w.available + t.referralBonusAmount,
    }));
    tx.update(tRef, { status: "released", updatedAt: Date.now() });
  });
}

/** Cancel a bonus in any active state and claw the amount back out of its bucket. */
export async function cancelReferralTransaction(db: Firestore, txnId: string): Promise<void> {
  const tRef = referralTxnDoc(db, txnId);
  await runTransaction(db, async (tx) => {
    const tSnap = await tx.get(tRef);
    if (!tSnap.exists()) throw new Error("Referral transaction not found");
    const t = tSnap.data() as ReferralTransaction;
    if (t.status === "cancelled") return;
    const amt = t.referralBonusAmount;
    await mutateReferrerWallet(tx, db, t.referrerUserId, (w) => {
      const next: Partial<ReferralWallet> = { totalEarned: clamp0(w.totalEarned - amt) };
      if (t.status === "released") next.available = clamp0(w.available - amt);
      else if (t.status === "pending") next.pending = clamp0(w.pending - amt);
      else if (t.status === "locked") next.locked = clamp0(w.locked - amt);
      return next;
    });
    tx.update(tRef, { status: "cancelled", updatedAt: Date.now() });
  });
}

export { DAY_MS };
