"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";
import { useAuth } from "./auth";

/** Bans, review flags and sign-up protection. All admin data is admin-only by rule; members only see the sign-in message. */

export const DEFAULT_BANNED_MESSAGE = "This account has been suspended. Please contact support if you think this is a mistake.";

export type BanMoney = "freeze" | "hold";
export type Ban = {
  uid: string; name: string; email: string; reason: string;
  until: number | null; money: BanMoney; status: "active" | "lifted"; at: number;
  ip?: string; ipUntil?: number | null; payout?: string; devices?: string[];
};
export type AccountFlag = { uid: string; name: string; email: string; reasons: string[]; linkedUid: string; linkedName: string; status: "open" | "dismissed"; at: number };
export type BannedIp = { key: string; ip: string; until: number | null; fromUid: string; fromName: string; at: number };

function call<T = unknown, R = unknown>(name: string, data: T): Promise<R> {
  const { functions } = getFirebase();
  if (!functions) return Promise.reject(new Error("Not connected."));
  return httpsCallable<T, R>(functions, name)(data).then((r) => r.data);
}

// ----- members / sign-in screen -----
export const getBanNotice = (email: string) => call<{ email: string }, { banned: boolean; message?: string; until?: number | null }>("getBanNotice", { email });
export const checkSignup = (email: string) => call<{ email: string }, { ok: boolean; message?: string }>("checkSignup", { email });
export const recordSession = (device: string) => call<{ device: string }, { ok: boolean }>("recordSession", { device });

/** The full message a banned person sees, with the end date for a temporary ban. */
export function banNoticeText(n: { message?: string; until?: number | null }): string {
  const msg = n.message?.trim() || DEFAULT_BANNED_MESSAGE;
  if (!n.until) return msg;
  const d = new Date(n.until).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
  return `${msg} Suspended until ${d}.`;
}

/** A random id kept on this phone / browser, so a banned person's next account on it can be flagged. */
export function deviceId(): string {
  try {
    const k = "investure.device";
    let id = localStorage.getItem(k);
    if (!id || !/^[A-Za-z0-9_-]{8,40}$/.test(id)) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
      localStorage.setItem(k, id);
    }
    return id;
  } catch {
    return "";
  }
}

// ----- admin -----
export type BanArgs = { uid: string; reason: string; days: 7 | 30 | null; money: BanMoney; banIp: boolean; ipDays: 7 | 30 | null; banPayout: boolean; banDevice: boolean };
export const banMember = (a: BanArgs) => call<BanArgs, { ok: boolean; until: number | null; blocked: Record<string, unknown> }>("adminBanMember", a);
export const unbanMember = (uid: string) => call("adminUnbanMember", { uid });
export const dismissFlag = (uid: string) => call("adminDismissFlag", { uid });
export const liftIpBan = (key: string) => call("adminLiftIpBan", { key });

function useAdminCollection<T>(name: string, field: string, value: string, map: (id: string, d: Record<string, unknown>) => T): T[] {
  const { user } = useAuth();
  const [rows, setRows] = useState<T[]>([]);
  useEffect(() => {
    if (!user?.isAdmin) return;
    const { db } = getFirebase();
    if (!db) return;
    const q = field ? query(collection(db, name), where(field, "==", value)) : collection(db, name);
    return onSnapshot(q, (s) => setRows(s.docs.map((d) => map(d.id, d.data()))), () => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.isAdmin, name, field, value]);
  return rows;
}

const num = (v: unknown) => (typeof v === "number" ? v : 0);
const s = (v: unknown) => (typeof v === "string" ? v : "");
export const useActiveBans = () => useAdminCollection<Ban>("bans", "status", "active", (id, d) => ({
  uid: id, name: s(d.name), email: s(d.email), reason: s(d.reason), until: typeof d.until === "number" ? d.until : null,
  money: d.money === "hold" ? "hold" : "freeze", status: "active", at: num(d.at),
  ip: s(d.ip) || undefined, ipUntil: typeof d.ipUntil === "number" ? d.ipUntil : null, payout: s(d.payout) || undefined,
}));
export const useOpenFlags = () => useAdminCollection<AccountFlag>("account_flags", "status", "open", (id, d) => ({
  uid: id, name: s(d.name), email: s(d.email), reasons: Array.isArray(d.reasons) ? (d.reasons as string[]) : [], linkedUid: s(d.linkedUid), linkedName: s(d.linkedName), status: "open", at: num(d.at),
}));
export const useBannedIps = () => useAdminCollection<BannedIp>("banned_ips", "", "", (id, d) => ({
  key: id, ip: s(d.ip), until: typeof d.until === "number" ? d.until : null, fromUid: s(d.fromUid), fromName: s(d.fromName), at: num(d.at),
}));
