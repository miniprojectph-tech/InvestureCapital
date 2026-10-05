"use client";

import { createContext, useContext } from "react";

/**
 * "View as member" (admin troubleshooting). Inside this context the member
 * pages read the VIEWED member's records instead of the signed-in admin's.
 *
 * It is view-only by construction on three levels:
 *   1. `useAuth()` hands the pages the member's identity for READS, and every
 *      account action on it (sign-in, password, sign-out) throws.
 *   2. Hooks that would otherwise write on load (creating a missing record or a
 *      referral code) check this context and only read.
 *   3. The screen wrapper (ViewOnlyGuard) swallows every click, key press and
 *      form submit except the few local controls marked `data-viewas-ok`
 *      (filters, search, export).
 *
 * The admin stays signed in as themselves the whole time, so nothing here can
 * act with the member's permissions.
 */
export type ViewAsValue = {
  uid: string;
  name: string;
  email: string;
  /** The stand-in for the auth context value (typed loosely to avoid a circular import). */
  auth: unknown;
};

export const ViewAsContext = createContext<ViewAsValue | null>(null);

/** The member being viewed, or null in the normal app. */
export function useViewAs(): ViewAsValue | null {
  return useContext(ViewAsContext);
}
