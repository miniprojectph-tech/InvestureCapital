"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";
import { useAuth } from "./auth";
import type { TongitsResult } from "./tongits-game";

// ===== Types (mirror functions/src/tongits.ts) =====
export type TongitsStatus =
  | "open"
  | "full"
  | "ready"
  | "cancelled"
  | "in_game"
  | "post_game"
  | "completed";

export type TongitsPlayer = {
  uid: string;
  name: string;
  seat: number;
  isReady: boolean;
  agreedToChallenge: boolean;
  joinedAt: number;
  jackpotContributed: number;
};

export type TongitsRoom = {
  roomCode: string;
  creatorUserId: string;
  challengePoints: number;
  jackpotAnte: number;
  jackpotPoints: number;
  // Streak-based jackpot: 2 consecutive wins by the same player claim the pot.
  lastWinnerUid?: string | null;
  winStreak?: number;
  isPrivate?: boolean;
  maxPlayers: number;
  status: TongitsStatus;
  chatEnabled: boolean;
  players: Record<string, TongitsPlayer>;
  gamesPlayed: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  lastResult?: TongitsResult | null;
  splitConsent?: Record<string, boolean>;
};

export type TongitsChat = {
  id: string;
  uid: string;
  name: string;
  message: string;
  createdAt: number;
};

export const MIN_CHALLENGE = 50;
export const MAX_PLAYERS = 3;

export function seatedPlayers(room: TongitsRoom): TongitsPlayer[] {
  return Object.values(room.players ?? {}).sort((a, b) => a.seat - b.seat);
}

// ===== Callable wrappers =====
async function call<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not connected");
  const fn = httpsCallable<Record<string, unknown>, T>(functions, name);
  const res = await fn(data);
  return res.data;
}

export const createRoom = (challengePoints: number, jackpotAnte?: number, isPrivate?: boolean) =>
  call<{ code: string }>("createTongitsRoom", { challengePoints, jackpotAnte, isPrivate });
export const joinRoom = (code: string) => call<{ code: string }>("joinTongitsRoom", { code });
export const setReady = (code: string, ready: boolean) =>
  call<{ ok: boolean }>("setTongitsReady", { code, ready });
export const confirmChallenge = (code: string) =>
  call<{ ok: boolean }>("confirmTongitsChallenge", { code });
export const leaveRoom = (code: string) => call<{ ok: boolean }>("leaveTongitsRoom", { code });
export const cancelRoom = (code: string) => call<{ ok: boolean }>("cancelTongitsRoom", { code });

// ===== Chat (direct client writes, gated by Firestore rules) =====
export async function sendChat(db: Firestore, code: string, uid: string, name: string, message: string) {
  const text = message.trim().slice(0, 300);
  if (!text) return;
  await addDoc(collection(db, "game_rooms", code, "chat"), {
    uid,
    name,
    message: text,
    createdAt: Date.now(),
  });
}

export async function reportChat(
  db: Firestore,
  args: { reporterUserId: string; roomCode: string; messageId: string; reason?: string }
) {
  await addDoc(collection(db, "game_chat_reports"), {
    reporterUserId: args.reporterUserId,
    roomCode: args.roomCode,
    messageId: args.messageId,
    reason: args.reason ?? "",
    createdAt: Date.now(),
  });
}

// ===== Hooks =====

/** Live list of open rooms for the lobby (equality-only query → no composite index). */
export function useOpenRooms() {
  const { demoMode } = useAuth();
  const [rooms, setRooms] = useState<TongitsRoom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (demoMode) {
      setRooms([]);
      setLoading(false);
      return;
    }
    const { db } = getFirebase();
    if (!db) {
      setRooms([]);
      setLoading(false);
      return;
    }
    const q = query(collection(db, "game_rooms"), where("status", "==", "open"), limit(30));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as TongitsRoom).filter((r) => !r.isPrivate);
        rows.sort((a, b) => b.createdAt - a.createdAt);
        setRooms(rows);
        setLoading(false);
      },
      (err) => {
        console.warn("open rooms subscription error:", err);
        setRooms([]);
        setLoading(false);
      }
    );
    return unsub;
  }, [demoMode]);

  return { rooms, loading };
}

/** Live single room. */
export function useRoom(code: string | null) {
  const [room, setRoom] = useState<TongitsRoom | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) {
      setRoom(null);
      setLoading(false);
      return;
    }
    const { db } = getFirebase();
    if (!db) {
      setRoom(null);
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "game_rooms", code),
      (snap) => {
        setRoom(snap.exists() ? (snap.data() as TongitsRoom) : null);
        setLoading(false);
      },
      () => {
        setRoom(null);
        setLoading(false);
      }
    );
    return unsub;
  }, [code]);

  return { room, loading };
}

/** Live chat for a room (oldest→newest). */
export function useRoomChat(code: string | null) {
  const [messages, setMessages] = useState<TongitsChat[]>([]);

  useEffect(() => {
    if (!code) {
      setMessages([]);
      return;
    }
    const { db } = getFirebase();
    if (!db) return;
    const q = query(
      collection(db, "game_rooms", code, "chat"),
      orderBy("createdAt", "asc"),
      limit(100)
    );
    const unsub = onSnapshot(
      q,
      (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TongitsChat, "id">) }))),
      (err) => console.warn("chat subscription error:", err)
    );
    return unsub;
  }, [code]);

  return messages;
}
