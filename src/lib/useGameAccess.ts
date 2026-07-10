"use client";

import { useSettings } from "./settings";
import { useUserState } from "./useUserState";

export type GameAccessResult = {
  loading: boolean;
  allowed: boolean;
  reason: string | null;
};

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

  const plans = state?.activePlans ?? [];
  const match = plans.find(
    (p) => p.planId === req.requiredPlanId && p.capital >= req.minInvestment
  );

  if (match) {
    return { loading: false, allowed: true, reason: null };
  }

  const reason = `Requires an active ${req.requiredPlanName || "plan"} with at least ₱${req.minInvestment.toLocaleString()} investment`;
  return { loading: false, allowed: false, reason };
}
