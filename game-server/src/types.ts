import type { Card } from "./engine.js";

export type Seat = { uid: string; seat: number; name: string };

export type GameState = {
  status: "in_game" | "ended";
  round: number;
  turnSeat: number;
  turnUid: string;
  phase: "draw" | "discard";
  stockCount: number;
  discard: Card[];
  melds: Record<string, Card[][]>;
  handCounts: Record<string, number>;
  hasExposed: Record<string, boolean>;
  turnStartExposed: boolean;
  seats: Seat[];
  turnDeadline: number;
  consecutiveTimeouts: Record<string, number>;
  jackpotPoints: number;
  startedAt: number;
  lastAction?: string;
};

export type RoomData = {
  challengePoints: number;
  jackpotAnte: number;
  jackpotPoints: number;
  lastWinnerUid: string | null;
  winStreak: number;
  gamesPlayed: number;
  players: Record<string, Record<string, unknown>>;
};

export type LiveRoom = {
  code: string;
  room: RoomData;
  gs: GameState;
  deck: Card[];
  hands: Record<string, Card[]>;
  timer: ReturnType<typeof setTimeout> | null;
};

// Client → Server messages
export type ClientMsg =
  | { action: "auth"; token: string; code: string }
  | { action: "draw"; code: string }
  | { action: "takeDiscard"; code: string; meldCards: Card[] }
  | { action: "meld"; code: string; cards: Card[] }
  | { action: "sapaw"; code: string; targetUid: string; meldIndex: number; card: Card }
  | { action: "discard"; code: string; card: Card }
  | { action: "call"; code: string }
  | { action: "enforceTimeout"; code: string };

// Server → Client messages
export type ServerMsg =
  | { type: "auth_ok"; uid: string }
  | { type: "auth_error"; error: string }
  | { type: "state"; gs: GameState }
  | { type: "hand"; cards: Card[] }
  | { type: "ended"; gs: GameState }
  | { type: "error"; error: string };

export type ResultType = "tongits_win" | "draw_win" | "lowest_points_win";

export type SettleInput = {
  code: string;
  now: number;
  seats: Seat[];
  values: Record<string, number>;
  winnerUid: string;
  resultType: ResultType;
  jackpot: number;
  payoutJackpot: boolean;
  challengePoints: number;
  secret: boolean;
  matchDurationSeconds: number;
};
