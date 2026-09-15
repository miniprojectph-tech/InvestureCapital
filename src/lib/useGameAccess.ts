"use client";

import { useSettings } from "./settings";
import { useUserState } from "./useUserState";
import { placedCapital } from "./compplan";

export type GameAccessResult = {
  loading: boolean;
  allowed: boolean;
  reason: string | null;
};

/** Games can be gated behind a minimum total of active placements (admin-configurable). */
export function useGameAccess(): GameAccessResult {
  const { settings, loading: settingsLoading } = useSettings();
  const { state, loading: userLoading } = useUserState();

  if (settingsLoading || userLoading) {
    return { loading: true, allowed: false, reason: null };
  }

  const req = settings.gameAccess;
  if (!req?.enabled) {
    return { loading: false, allowed: true, reason: null };
  }

  const placed = placedCapital(state?.placements);
  if (placed >= (req.minInvestment || 0) && placed > 0) {
    return { loading: false, allowed: true, reason: null };
  }

  const reason = `Requires an active placement of at least ₱${(req.minInvestment || 0).toLocaleString()}`;
  return { loading: false, allowed: false, reason };
}
