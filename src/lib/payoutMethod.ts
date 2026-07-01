"use client";

import { doc, getDoc, updateDoc, type Firestore } from "firebase/firestore";
import { type PaymentMethodId, PAYMENT_METHOD_LABELS } from "./settings";
import type { PayoutMethod } from "./userState";

/** An investor's own account where approved withdrawals are sent. */
export type PayoutMethodType = PaymentMethodId; // "gotyme" | "gcash" | "bankTransfer"

export type { PayoutMethod };

export { PAYMENT_METHOD_LABELS as PAYOUT_METHOD_LABELS };

/** Label shown for the account-number field, per method type. */
export const ACCOUNT_NUMBER_LABEL: Record<PayoutMethodType, string> = {
  gcash: "GCash number",
  gotyme: "GoTyme account number",
  bankTransfer: "Account number",
};

/** Mask all but the last `visible` characters, e.g. "···· 4567". */
export function maskTail(value: string, visible = 4): string {
  const trimmed = value.replace(/\s+/g, "");
  if (trimmed.length <= visible) return trimmed;
  return `···· ${trimmed.slice(-visible)}`;
}

/**
 * Human-readable destination string stored on the withdrawal request so the
 * admin knows exactly where to send the money. e.g. "GCash · Juan Dela Cruz · ···· 4567"
 */
export function formatPayoutDestination(m: PayoutMethod): string {
  const provider =
    m.type === "bankTransfer" && m.bankName
      ? m.bankName
      : PAYMENT_METHOD_LABELS[m.type];
  return `${provider} · ${m.accountName} · ${maskTail(m.accountNumber)}`;
}

/** Short label for compact UI, e.g. "GCash · ···· 4567". */
export function shortPayoutLabel(m: PayoutMethod): string {
  const provider =
    m.type === "bankTransfer" && m.bankName
      ? m.bankName
      : PAYMENT_METHOD_LABELS[m.type];
  return `${provider} · ${maskTail(m.accountNumber)}`;
}

/** Persist the investor's payout method on their user document. */
export async function savePayoutMethod(
  db: Firestore,
  uid: string,
  method: Omit<PayoutMethod, "updatedAt">
): Promise<void> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("User document not found");
  const clean: PayoutMethod = {
    type: method.type,
    accountName: method.accountName.trim(),
    accountNumber: method.accountNumber.trim(),
    updatedAt: Date.now(),
  };
  if (method.type === "bankTransfer") {
    clean.bankName = (method.bankName ?? "").trim();
  }
  await updateDoc(ref, { payoutMethod: clean });
}

/** Type guard — validates a draft before saving. Returns an error string or null. */
export function validatePayoutDraft(draft: {
  type: PayoutMethodType;
  accountName: string;
  accountNumber: string;
  bankName?: string;
}): string | null {
  if (!draft.accountName.trim()) return "Account name is required.";
  if (!draft.accountNumber.trim()) return "Account number is required.";
  if (draft.type === "bankTransfer" && !(draft.bankName ?? "").trim()) {
    return "Bank name is required for bank transfers.";
  }
  return null;
}
