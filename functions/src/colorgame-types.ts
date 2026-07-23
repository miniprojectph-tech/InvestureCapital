export type DieColor = "red" | "blue" | "yellow" | "pink" | "white" | "green";
export const ALL_COLORS: DieColor[] = ["red", "blue", "yellow", "pink", "white", "green"];

export type ColorBet = {
  uid: string;
  name: string;
  color: DieColor;
  amount: number;
  placedAt: number;
};

export type RoundPhase = "betting" | "rolling" | "result" | "expired";

export type ColorRound = {
  roundId: string;
  phase: RoundPhase;
  bettingDeadline: number;
  bets: Record<string, ColorBet>;
  dice?: [DieColor, DieColor, DieColor];
  resolvedAt?: number;
  totalPool?: number;
  jackpotTriggered?: boolean;
  jackpotColor?: DieColor;
  jackpotAmount?: number;
};

export type ColorGameConfig = {
  minBet: number;
  maxBet: number;
  jackpotContribution: number;
  roundDurationMs: number;
  betWindowMs: number;
  rollAnimationMs: number;
};

export const DEFAULT_COLOR_CONFIG: ColorGameConfig = {
  minBet: 5,
  maxBet: 500,
  jackpotContribution: 0.02,
  roundDurationMs: 23_000,
  betWindowMs: 15_000,
  rollAnimationMs: 3_000,
};

export type ColorGameState = {
  jackpotPool: number;
  totalRounds: number;
  totalWagered: number;
  history: Array<{ roundId: string; dice: [DieColor, DieColor, DieColor]; at: number }>;
};

export type ColorLeaderboardEntry = {
  uid: string;
  name: string;
  totalWon: number;
  totalBet: number;
  roundsPlayed: number;
  biggestWin: number;
  updatedAt: number;
};
