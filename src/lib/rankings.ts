"use client";

import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";

export type RankingGame = "reef" | "tongits" | "color";

export const RANKING_LABEL: Record<RankingGame, string> = {
  reef: "Reef",
  tongits: "Tongits",
  color: "Color Game",
};

type Result = { ok: boolean; cleared: Partial<Record<RankingGame, number>> };

function call<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Firebase not initialized");
  return httpsCallable<Record<string, unknown>, T>(functions, name)(data).then((r) => r.data);
}

/** Admin: clear whole rankings. Points balances and tiers are not touched. */
export function adminResetRankings(games: RankingGame[]): Promise<Result> {
  return call<Result>("adminResetRankings", { games });
}

/** Admin: remove one player from the given rankings. */
export function adminRemoveFromRanking(games: RankingGame[], uid: string): Promise<Result> {
  return call<Result>("adminRemoveFromRanking", { games, uid });
}
