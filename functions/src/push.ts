import * as webpush from "web-push";
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { getDatabase, type DataSnapshot } from "firebase-admin/database";
import { logger } from "firebase-functions";
import { db } from "./init";

// Web Push (VAPID) straight to the browsers' push services — no FCM console
// key needed. Devices register at `push/subs/{uid}/{id}` (RTDB, written by the
// member under rules); member switches at `push/prefs/{uid}`; the digest keeps
// `push/last/{uid}` (when each member was last pushed about the room) and
// `push/state/digest` (what the last run did, for the admin tab).
//
//   * onNotificationPush  every bell notice → one push (DMs / account updates)
//   * pushDigest          every 5 min: "N new messages in the community" to
//                         members who have unread room messages, honouring the
//                         admin interval, a per-member cooldown and quiet hours
//   * adminPushDigestNow  the admin's "Run now" button (ignores the gates)
//   * pushTestSelf        "Send a test" on the member's profile

const VAPID_PRIVATE_KEY = defineSecret("VAPID_PRIVATE_KEY");
export const VAPID_PUBLIC_KEY = "BIpttrtsFzyDYFr-lxkSOi4rMk_Qb3b36VIOXbhDTDJXI82XQ6FLICywpISHg4azH_q8DXt5xtu2TV_NuypZsGw";
const SUBJECT = "mailto:support@investurecapital.app";

type Sub = { endpoint?: string; p256dh?: string; auth?: string; at?: number; ua?: string };
type Prefs = { community?: boolean; dm?: boolean; account?: boolean };
export type PushKind = "community" | "dm" | "account";
type Payload = { title: string; body: string; href: string; tag?: string; badge?: number };

export type PushConfig = { digest: boolean; intervalMin: number; cooldownMin: number; quietFrom: number; quietTo: number; dm: boolean; account: boolean; testersOnly: boolean };
export const DEFAULT_PUSH: PushConfig = { digest: true, intervalMin: 15, cooldownMin: 30, quietFrom: 22, quietTo: 7, dm: true, account: true, testersOnly: false };
export const MIN_INTERVAL_MIN = 5;

async function loadPushConfig(): Promise<PushConfig> {
  const snap = await db.doc("settings/platform").get();
  const p = (snap.data()?.push ?? {}) as Partial<Record<keyof PushConfig, unknown>>;
  const num = (v: unknown, d: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    digest: bool(p.digest, DEFAULT_PUSH.digest),
    intervalMin: num(p.intervalMin, DEFAULT_PUSH.intervalMin, MIN_INTERVAL_MIN, 24 * 60),
    cooldownMin: num(p.cooldownMin, DEFAULT_PUSH.cooldownMin, 0, 24 * 60),
    quietFrom: num(p.quietFrom, DEFAULT_PUSH.quietFrom, 0, 23),
    quietTo: num(p.quietTo, DEFAULT_PUSH.quietTo, 0, 23),
    dm: bool(p.dm, DEFAULT_PUSH.dm),
    account: bool(p.account, DEFAULT_PUSH.account),
    testersOnly: bool(p.testersOnly, DEFAULT_PUSH.testersOnly),
  };
}

/** "Testers only": while on, pushes go only to members listed at push/testers. */
type Gate = { testersOnly: boolean; testers: Set<string> };
async function loadGate(cfg: PushConfig): Promise<Gate> {
  if (!cfg.testersOnly) return { testersOnly: false, testers: new Set() };
  const v = ((await getDatabase().ref("push/testers").once("value")).val() ?? {}) as Record<string, boolean>;
  return { testersOnly: true, testers: new Set(Object.keys(v).filter((k) => v[k] === true)) };
}

const manilaHour = (ms: number) => new Date(ms + 8 * 3_600_000).getUTCHours();
/** Quiet hours may wrap midnight (22 → 7). Equal from/to means no quiet hours. */
export function inQuietHours(hour: number, from: number, to: number): boolean {
  if (from === to) return false;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

const vapid = () => ({ subject: SUBJECT, publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY.value() });

/** One payload to every device a member registered; dead subscriptions are dropped. */
export async function pushToMember(
  uid: string,
  kind: PushKind,
  payload: Payload,
  pre?: { subs?: Record<string, Sub> | null; prefs?: Prefs | null; gate?: Gate | null },
): Promise<{ sent: number; removed: number; skipped: boolean }> {
  const rtdb = getDatabase();
  if (pre?.gate?.testersOnly && !pre.gate.testers.has(uid)) return { sent: 0, removed: 0, skipped: true };
  const prefs = pre && "prefs" in pre ? pre.prefs : ((await rtdb.ref(`push/prefs/${uid}`).once("value")).val() as Prefs | null);
  if (prefs && prefs[kind] === false) return { sent: 0, removed: 0, skipped: true };
  const subs = pre && "subs" in pre ? pre.subs : ((await rtdb.ref(`push/subs/${uid}`).once("value")).val() as Record<string, Sub> | null);
  if (!subs) return { sent: 0, removed: 0, skipped: false };
  let sent = 0, removed = 0;
  const body = JSON.stringify(payload);
  await Promise.all(Object.entries(subs).map(async ([id, s]) => {
    if (!s?.endpoint || !s.p256dh || !s.auth) return;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { vapidDetails: vapid(), TTL: 6 * 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // 404 / 410: the browser dropped the subscription (app uninstalled, permission revoked)
      if (code === 404 || code === 410) { await rtdb.ref(`push/subs/${uid}/${id}`).remove(); removed++; }
      else logger.warn("push failed", { uid, code, message: (e as Error).message });
    }
  }));
  return { sent, removed, skipped: false };
}

/** Every bell notice becomes one push: chat notices as "direct messages", everything else as "account updates". */
export const onNotificationPush = onDocumentCreated({ document: "users/{uid}/notifications/{id}", secrets: [VAPID_PRIVATE_KEY] }, async (event) => {
  const n = event.data?.data() as { type?: string; title?: string; body?: string; href?: string; threadKey?: string } | undefined;
  if (!n?.title) return;
  const kind: PushKind = n.type === "inbox" || n.type === "dm" ? "dm" : "account";
  const cfg = await loadPushConfig();
  if (kind === "dm" ? !cfg.dm : !cfg.account) return;
  const r = await pushToMember(event.params.uid, kind, {
    title: String(n.title).slice(0, 80),
    body: String(n.body ?? "").replace(/\s+/g, " ").slice(0, 160),
    href: n.href ?? "/notifications",
    tag: n.threadKey ? `t:${n.threadKey}` : `n:${event.params.id}`,
  }, { gate: await loadGate(cfg) });
  if (r.sent || r.removed) logger.info("push", { uid: event.params.uid, kind, ...r });
});

export type DigestResult = { ran: boolean; reason?: "off" | "interval" | "quiet"; members: number; devices: number; pushed: number; sent: number; removed: number; at: number };

/**
 * The community digest. Reads the last day of room messages once, then for
 * each member with a registered device: messages newer than both their room
 * read stamp and their last push → one push, unless they are inside the
 * cooldown and have not opened the app since the last push.
 */
async function runDigest(force: boolean): Promise<DigestResult> {
  const now = Date.now();
  const rtdb = getDatabase();
  const cfg = await loadPushConfig();
  const stateRef = rtdb.ref("push/state/digest");
  const state = ((await stateRef.once("value")).val() ?? {}) as { lastRunAt?: number };
  const base: DigestResult = { ran: false, members: 0, devices: 0, pushed: 0, sent: 0, removed: 0, at: now };
  if (!force) {
    if (!cfg.digest) return { ...base, reason: "off" };
    if (now - (state.lastRunAt ?? 0) < cfg.intervalMin * 60_000 - 20_000) return { ...base, reason: "interval" };
    if (inQuietHours(manilaHour(now), cfg.quietFrom, cfg.quietTo)) return { ...base, reason: "quiet" };
  }

  const dayAgo = now - 24 * 3_600_000;
  const [subsSnap, prefsSnap, lastSnap, readSnap, roomSnap, roomsSnap, roomsReadSnap, tlSnap, modSnap] = await Promise.all([
    rtdb.ref("push/subs").once("value"),
    rtdb.ref("push/prefs").once("value"),
    rtdb.ref("push/last").once("value"),
    rtdb.ref("community/roomRead").once("value"),
    rtdb.ref("community/room").orderByChild("at").startAt(dayAgo).limitToLast(300).once("value"),
    rtdb.ref("community/rooms").once("value"),
    rtdb.ref("community/roomsRead").once("value"),
    rtdb.ref("teamLeaders").once("value"),
    rtdb.ref("chatMods").once("value"),
  ]);
  const subs = (subsSnap.val() ?? {}) as Record<string, Record<string, Sub>>;
  const prefs = (prefsSnap.val() ?? {}) as Record<string, Prefs>;
  const last = (lastSnap.val() ?? {}) as Record<string, number>;
  const read = (readSnap.val() ?? {}) as Record<string, number>;
  const roomsRead = (roomsReadSnap.val() ?? {}) as Record<string, Record<string, number>>;
  const tls = (tlSnap.val() ?? {}) as Record<string, unknown>;
  const mods = (modSnap.val() ?? {}) as Record<string, unknown>;
  type Msg = { at: number; uid: string };
  const collect = (snap: DataSnapshot): Msg[] => {
    const out: Msg[] = [];
    snap.forEach((c) => {
      const m = c.val() as { at?: number; uid?: string } | null;
      if (m && typeof m.at === "number") out.push({ at: m.at, uid: String(m.uid ?? "") });
    });
    return out;
  };
  const msgs = collect(roomSnap);
  // admin-created rooms: who may see each, and its last day of messages
  type Room = { id: string; audience: string; hidden: boolean };
  const rooms: Room[] = Object.entries((roomsSnap.val() ?? {}) as Record<string, { audience?: string; hidden?: boolean }>)
    .map(([id, r]) => ({ id, audience: String(r.audience ?? "all"), hidden: r.hidden === true }))
    .filter((r) => !r.hidden && r.audience !== "admins");
  const roomMsgs = new Map<string, Msg[]>();
  for (const r of rooms) roomMsgs.set(r.id, collect(await rtdb.ref(`community/roomMsgs/${r.id}`).orderByChild("at").startAt(dayAgo).limitToLast(300).once("value")));
  const canSee = (r: Room, uid: string) => r.audience === "all" || (r.audience === "tl" && uid in tls) || (r.audience === "mods" && uid in mods);

  const result: DigestResult = { ...base, ran: true, members: Object.keys(subs).length };
  const stamps: Record<string, number> = {};
  const gate = await loadGate(cfg);
  const anyMsgs = msgs.length > 0 || [...roomMsgs.values()].some((l) => l.length > 0);
  if (anyMsgs) {
    for (const [uid, devices] of Object.entries(subs)) {
      const n = Object.keys(devices ?? {}).length;
      if (!n) continue;
      result.devices += n;
      if (prefs[uid]?.community === false) continue;
      // members only see the room from their join date
      const joined = Number((await rtdb.ref(`members/${uid}/joinedAt`).once("value")).val() ?? 0);
      const lastPush = last[uid] ?? 0;
      const readAt = Math.max(read[uid] ?? 0, joined);
      let fresh = 0, unread = 0, opened = readAt > lastPush;
      const count = (list: Msg[], readStamp: number) => {
        const since = Math.max(readStamp, lastPush);
        fresh += list.filter((m) => m.uid !== uid && m.at > since).length;
        unread += list.filter((m) => m.uid !== uid && m.at > readStamp).length;
        if (readStamp > lastPush) opened = true;
      };
      count(msgs, readAt);
      for (const r of rooms) if (canSee(r, uid)) count(roomMsgs.get(r.id) ?? [], Math.max(roomsRead[uid]?.[r.id] ?? 0, joined));
      if (!fresh) continue;
      if (!opened && now - lastPush < cfg.cooldownMin * 60_000) continue;
      const shown = unread > 99 ? "99+" : String(unread);
      const r = await pushToMember(uid, "community", {
        title: "Investure Community",
        body: `${shown} new message${unread === 1 ? "" : "s"} in the community`,
        href: "/community",
        tag: "community",
        badge: unread,
      }, { subs: devices, prefs: prefs[uid] ?? null, gate });
      result.sent += r.sent;
      result.removed += r.removed;
      if (r.sent) { result.pushed++; stamps[`push/last/${uid}`] = now; }
    }
  } else {
    for (const devices of Object.values(subs)) result.devices += Object.keys(devices ?? {}).length;
  }

  await rtdb.ref().update({
    ...stamps,
    "push/state/digest": { lastRunAt: now, pushed: result.pushed, sent: result.sent, removed: result.removed, members: result.members, devices: result.devices, manual: force },
  });
  logger.info("push digest", result);
  return result;
}

export const pushDigest = onSchedule({ schedule: "every 5 minutes", timeZone: "Asia/Manila", secrets: [VAPID_PRIVATE_KEY] }, async () => {
  await runDigest(false);
});

async function requireAdmin(request: CallableRequest): Promise<string> {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const snap = await db.collection("users").doc(request.auth.uid).get();
  if (snap.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
  return request.auth.uid;
}

/** Admin › Community › Push › "Run digest now": runs regardless of interval, quiet hours or the switch. */
export const adminPushDigestNow = onCall({ secrets: [VAPID_PRIVATE_KEY] }, async (request) => {
  await requireAdmin(request);
  return runDigest(true);
});

function describeUa(ua: string): { platform: string; browser: string } {
  const platform = /iPhone|iPad|iPod/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Macintosh/.test(ua) ? "Mac" : "Other";
  const browser = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox/.test(ua) ? "Firefox" : /Chrome|CriOS/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "Browser";
  return { platform, browser };
}

/** Admin › Community › Push › Test with members: a member's registered devices and switches. */
export const adminPushDevices = onCall(async (request) => {
  await requireAdmin(request);
  const uid = typeof request.data?.uid === "string" ? request.data.uid : "";
  if (!uid) throw new HttpsError("invalid-argument", "Pick a member.");
  const rtdb = getDatabase();
  const [subsSnap, prefsSnap, lastSnap] = await Promise.all([rtdb.ref(`push/subs/${uid}`).once("value"), rtdb.ref(`push/prefs/${uid}`).once("value"), rtdb.ref(`push/last/${uid}`).once("value")]);
  const subs = (subsSnap.val() ?? {}) as Record<string, Sub>;
  const prefs = (prefsSnap.val() ?? {}) as Prefs;
  return {
    devices: Object.entries(subs).map(([id, s]) => ({ id, at: s.at ?? 0, ...describeUa(String(s.ua ?? "")) })).sort((a, b) => b.at - a.at),
    prefs: { community: prefs.community !== false, dm: prefs.dm !== false, account: prefs.account !== false },
    lastDigestPush: (lastSnap.val() as number | null) ?? null,
  };
});

/** Admin: one test push to a chosen member's devices (ignores "testers only" and the member's switches). */
export const adminPushTest = onCall({ secrets: [VAPID_PRIVATE_KEY] }, async (request) => {
  await requireAdmin(request);
  const uid = typeof request.data?.uid === "string" ? request.data.uid : "";
  if (!uid) throw new HttpsError("invalid-argument", "Pick a member.");
  const r = await pushToMember(uid, "account", {
    title: "Test from the Investure team",
    body: "Notifications are working on this device.",
    href: "/notifications",
    tag: "admin-test",
  }, { prefs: null, gate: null });
  await db.collection("admin_audit").add({ type: "push_test_sent", uid, title: "Push test sent", subtitle: `${r.sent} device${r.sent === 1 ? "" : "s"}`, by: request.auth!.uid, at: Date.now() });
  return r;
});

/** Profile › Notifications › "Send a test": one push to the caller's own devices. */
export const pushTestSelf = onCall({ secrets: [VAPID_PRIVATE_KEY] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const r = await pushToMember(uid, "account", {
    title: "Notifications are on",
    body: "You'll hear about community messages, replies and account updates here.",
    href: "/profile",
    tag: "test",
  }, { prefs: null });
  if (!r.sent && !r.removed) throw new HttpsError("failed-precondition", "This device isn't registered yet. Turn notifications on first.");
  return r;
});
