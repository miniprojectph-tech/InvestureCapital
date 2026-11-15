import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./init";

/**
 * Account bans and sign-up protection (admin only).
 *
 *   bans/{uid}                 the ban record (reason, until, money, what else was blocked)
 *   users/{uid}.banned         { at, until, money } — the member's own record, so payouts/withdrawals can check it
 *   banned_ips/{key}           { ip, until, fromUid }      sign-ups / sign-ins refused (enforced by the
 *                                                          login hooks once the login service is upgraded)
 *   banned_payouts/{key}       { type, number, fromUid }   withdrawals held on any account using it
 *   banned_devices/{id}        { fromUid }                 new accounts on that device are flagged
 *   sessions/{uid}             { lastIp, ips[], devices[] } recorded once a day per member, for flags + IP bans
 *   account_flags/{uid}        a new account linked to a banned one, for admin review
 *
 * A banned account is DISABLED, not deleted, so its email stays registered and
 * can't be used to sign up again. Every action goes to admin_audit.
 */

const DAY = 86_400_000;
export const DEFAULT_BANNED_MESSAGE = "This account has been suspended. Please contact support if you think this is a mistake.";

// Well-known temporary-inbox services (refused at sign-up while the switch is on).
const THROWAWAY = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com", "sharklasers.com", "grr.la",
  "10minutemail.com", "10minutemail.net", "10minemail.com", "temp-mail.org", "temp-mail.io", "tempmail.com", "tempmail.net", "tempmailo.com",
  "tempmail.plus", "tempmailaddress.com", "tempr.email", "temp-mail.ru", "yopmail.com", "yopmail.net", "yopmail.fr", "trashmail.com",
  "trashmail.de", "trashmail.net", "getnada.com", "nada.email", "dispostable.com", "maildrop.cc", "mailnesia.com", "mailcatch.com",
  "throwawaymail.com", "fakeinbox.com", "fakemail.net", "emailondeck.com", "mohmal.com", "moakt.com", "mintemail.com", "mytemp.email",
  "spamgourmet.com", "spam4.me", "mailpoof.com", "burnermail.io", "inboxkitten.com", "emailfake.com", "fakemailgenerator.com",
  "33mail.com", "anonaddy.me", "mail.tm", "mail.gw", "tmail.ws", "tmpmail.org", "tmpmail.net", "tmpeml.com", "1secmail.com",
  "1secmail.org", "1secmail.net", "esiix.com", "wwjmp.com", "xojxe.com", "yoggm.com", "oosln.com", "vjuum.com", "laafd.com",
  "txcct.com", "dpptd.com", "rteet.com", "dcctb.com", "kzccv.com", "qiott.com", "wuuvo.com", "icznn.com", "ezztt.com",
  "emltmp.com", "linshiyouxiang.net", "byom.de", "discard.email", "discardmail.com", "dropmail.me", "10mail.org", "zetmail.com",
  "spambox.us", "mailforspam.com", "jetable.org", "trash-mail.com", "wegwerfmail.de", "einrot.com", "cuvox.de", "fleckens.hu",
  "gustr.com", "jourrapide.com", "rhyta.com", "superrito.com", "teleworm.us", "armyspy.com", "dayrep.com", "luxusmail.org",
  "minuteinbox.com", "mailtemp.uk", "tempinbox.com", "tempemail.co", "instantemailaddress.com", "emailtemporanea.com",
  "correotemporal.org", "crazymailing.com", "mailbox.in.ua", "harakirimail.com", "mail7.io", "inboxbear.com", "trbvm.com",
]);

export const emailDomain = (email: string) => (email.split("@")[1] ?? "").trim().toLowerCase();
export const isThrowaway = (email: string) => {
  const d = emailDomain(email);
  if (!d) return false;
  if (THROWAWAY.has(d)) return true;
  // sub-domains of a listed service (e.g. x.mailinator.com)
  return [...THROWAWAY].some((t) => d.endsWith(`.${t}`));
};

export type SecurityConfig = { blockThrowaway: boolean; signupsPerIpPerDay: number; botCheck: boolean; bannedMessage: string };
export async function loadSecurity(): Promise<SecurityConfig> {
  const s = ((await db.doc("settings/platform").get()).data()?.security ?? {}) as Partial<SecurityConfig>;
  const n = Math.round(Number(s.signupsPerIpPerDay));
  return {
    blockThrowaway: s.blockThrowaway !== false,
    signupsPerIpPerDay: Number.isFinite(n) && n >= 1 && n <= 50 ? n : 3,
    botCheck: s.botCheck === true,
    bannedMessage: typeof s.bannedMessage === "string" && s.bannedMessage.trim() ? s.bannedMessage.trim().slice(0, 300) : DEFAULT_BANNED_MESSAGE,
  };
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
/** "112.198.1.2" / IPv6 → a safe document id. */
export const ipKey = (ip: string) => ip.replace(/[^A-Za-z0-9.:]/g, "_").replace(/\//g, "_").slice(0, 80);
/** Digits only for GCash / GoTyme / bank numbers, so spaces or dashes don't dodge a ban. */
export const payoutKey = (type: string, number: string) => `${str(type, 20) || "other"}_${number.replace(/\D/g, "").slice(0, 30)}`;

/** The caller's IP, as seen by the function's front end. */
export function callerIp(request: CallableRequest<unknown>): string {
  const xf = request.rawRequest?.headers?.["x-forwarded-for"];
  const first = (Array.isArray(xf) ? xf[0] : xf ?? "").split(",")[0].trim();
  return str(first || request.rawRequest?.ip || "", 64);
}

async function assertAdmin(uid: string | undefined) {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const snap = await db.collection("users").doc(uid).get();
  if (snap.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
}

const audit = (entry: Record<string, unknown>) => db.collection("admin_audit").add({ ...entry, at: Date.now() });

// ---------------------------------------------------------------------------
// Public (no sign-in needed)
// ---------------------------------------------------------------------------

/**
 * The sign-in screen asks this when sign-in is refused with "account disabled":
 * the admin's banned message, plus the end date for a temporary ban.
 */
export const getBanNotice = onCall(async (request) => {
  const email = str((request.data as { email?: unknown } | undefined)?.email, 200).toLowerCase();
  const sec = await loadSecurity();
  if (!email || !email.includes("@")) return { banned: false };
  try {
    const u = await getAuth().getUserByEmail(email);
    if (!u.disabled) return { banned: false };
    const ban = (await db.collection("bans").doc(u.uid).get()).data() as { status?: string; until?: number | null } | undefined;
    return { banned: true, message: sec.bannedMessage, until: ban?.status === "active" ? ban.until ?? null : null };
  } catch {
    return { banned: false };
  }
});

/** Sign-up asks this first: refused emails get a plain message before an account is made. */
export const checkSignup = onCall(async (request) => {
  const email = str((request.data as { email?: unknown } | undefined)?.email, 200).toLowerCase();
  const sec = await loadSecurity();
  if (sec.blockThrowaway && isThrowaway(email)) {
    return { ok: false, message: "Please sign up with your regular email address, such as Gmail or Yahoo." };
  }
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Members: a daily session note (IP + device) → flags for accounts linked to a banned one
// ---------------------------------------------------------------------------

type Session = { lastIp?: string; lastAt?: number; ips?: { ip: string; at: number }[]; devices?: { id: string; at: number }[] };

export const recordSession = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const device = str((request.data as { device?: unknown } | undefined)?.device, 40);
  const ip = callerIp(request);
  const now = Date.now();
  const ref = db.collection("sessions").doc(uid);
  const cur = ((await ref.get()).data() ?? {}) as Session;
  const ips = [{ ip, at: now }, ...(cur.ips ?? []).filter((x) => x.ip !== ip)].filter((x) => x.ip).slice(0, 10);
  const devices = /^[A-Za-z0-9_-]{8,40}$/.test(device) ? [{ id: device, at: now }, ...(cur.devices ?? []).filter((x) => x.id !== device)].slice(0, 5) : cur.devices ?? [];
  await ref.set({ lastIp: ip, lastAt: now, ips, devices }, { merge: true });

  // Linked to a banned account? (IP, device or payout account) → flag for review.
  const reasons: string[] = [];
  let linkedUid = "";
  if (ip) {
    const b = (await db.collection("banned_ips").doc(ipKey(ip)).get()).data() as { until?: number | null; fromUid?: string } | undefined;
    if (b && (b.until == null || b.until > now) && b.fromUid !== uid) { reasons.push("same IP"); linkedUid = b.fromUid ?? linkedUid; }
  }
  if (devices[0] && devices[0].id === device) {
    const b = (await db.collection("banned_devices").doc(device).get()).data() as { fromUid?: string } | undefined;
    if (b && b.fromUid !== uid) { reasons.push("same device"); linkedUid = b.fromUid ?? linkedUid; }
  }
  const userSnap = await db.collection("users").doc(uid).get();
  const u = userSnap.data() as { profile?: { name?: string; email?: string }; payoutMethod?: { type?: string; accountNumber?: string } } | undefined;
  if (u?.payoutMethod?.accountNumber) {
    const b = (await db.collection("banned_payouts").doc(payoutKey(u.payoutMethod.type ?? "", u.payoutMethod.accountNumber)).get()).data() as { fromUid?: string } | undefined;
    if (b && b.fromUid !== uid) { reasons.push("banned payout account"); linkedUid = b.fromUid ?? linkedUid; }
  }
  if (reasons.length) await raiseFlag(uid, u, reasons, linkedUid, reasons.includes("banned payout account"));
  return { ok: true };
});

/** Create or update the review flag; a payout match also holds withdrawals. Dismissed reasons don't come back. */
export async function raiseFlag(uid: string, u: { profile?: { name?: string; email?: string } } | undefined, reasons: string[], linkedUid: string, holdWithdrawals: boolean) {
  const ref = db.collection("account_flags").doc(uid);
  const cur = ((await ref.get()).data() ?? {}) as { reasons?: string[]; dismissed?: string[]; status?: string };
  const fresh = reasons.filter((r) => !(cur.dismissed ?? []).includes(r));
  if (!fresh.length) return;
  const linked = linkedUid ? (await db.collection("users").doc(linkedUid).get()).data() as { profile?: { name?: string; email?: string } } | undefined : undefined;
  await ref.set({
    uid,
    name: str(u?.profile?.name, 60),
    email: str(u?.profile?.email, 120),
    reasons: [...new Set([...(cur.status === "open" ? cur.reasons ?? [] : []), ...fresh])],
    linkedUid,
    linkedName: str(linked?.profile?.name, 60) || str(linked?.profile?.email, 120),
    status: "open",
    at: Date.now(),
  }, { merge: true });
  if (holdWithdrawals) await db.collection("users").doc(uid).set({ withdrawHold: true }, { merge: true });
}

// ---------------------------------------------------------------------------
// Admin: ban / unban / flags / IP bans
// ---------------------------------------------------------------------------

type BanArgs = { uid?: unknown; reason?: unknown; days?: unknown; money?: unknown; banIp?: unknown; ipDays?: unknown; banPayout?: unknown; banDevice?: unknown };

export const adminBanMember = onCall({ timeoutSeconds: 60 }, async (request) => {
  const adminUid = request.auth?.uid;
  await assertAdmin(adminUid);
  const a = (request.data ?? {}) as BanArgs;
  const uid = str(a.uid, 128);
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw new HttpsError("invalid-argument", "Pick a member.");
  if (uid === adminUid) throw new HttpsError("failed-precondition", "You can't ban your own account.");
  const reason = str(a.reason, 300);
  const days = a.days === 7 || a.days === 30 ? a.days : null;
  const ipDays = a.ipDays === 7 || a.ipDays === 30 ? a.ipDays : a.ipDays === null ? null : 30;
  const money = a.money === "hold" ? "hold" : "freeze";
  const now = Date.now();
  const until = days ? now + days * DAY : null;

  const userRef = db.collection("users").doc(uid);
  const [userSnap, sessSnap] = await Promise.all([userRef.get(), db.collection("sessions").doc(uid).get()]);
  if (!userSnap.exists) throw new HttpsError("not-found", "That member no longer exists.");
  const u = userSnap.data() as { isAdmin?: boolean; profile?: { name?: string; email?: string }; payoutMethod?: { type?: string; accountNumber?: string } };
  if (u.isAdmin === true) throw new HttpsError("failed-precondition", "Admin accounts can't be banned. Remove the admin role first.");
  const sess = (sessSnap.data() ?? {}) as Session;
  const name = str(u.profile?.name, 60);
  const email = str(u.profile?.email, 120);

  // the sign-in itself: disabled (email stays taken) and every session ends
  await getAuth().updateUser(uid, { disabled: true });
  await getAuth().revokeRefreshTokens(uid);

  const blocked: Record<string, unknown> = {};
  const batch = db.batch();
  if (a.banIp === true && sess.lastIp) {
    const ipUntil = ipDays ? now + ipDays * DAY : null;
    batch.set(db.collection("banned_ips").doc(ipKey(sess.lastIp)), { ip: sess.lastIp, until: ipUntil, fromUid: uid, fromName: name || email, by: adminUid, at: now });
    blocked.ip = sess.lastIp;
    blocked.ipUntil = ipUntil;
  }
  if (a.banPayout === true && u.payoutMethod?.accountNumber) {
    const key = payoutKey(u.payoutMethod.type ?? "", u.payoutMethod.accountNumber);
    batch.set(db.collection("banned_payouts").doc(key), { type: str(u.payoutMethod.type, 20), number: u.payoutMethod.accountNumber.replace(/\D/g, ""), fromUid: uid, fromName: name || email, by: adminUid, at: now });
    blocked.payout = key;
  }
  if (a.banDevice === true && sess.devices?.length) {
    for (const d of sess.devices.slice(0, 3)) batch.set(db.collection("banned_devices").doc(d.id), { fromUid: uid, fromName: name || email, by: adminUid, at: now });
    blocked.devices = sess.devices.slice(0, 3).map((d) => d.id);
  }
  batch.set(db.collection("bans").doc(uid), { uid, name, email, reason, until, money, status: "active", by: adminUid, at: now, ...blocked });
  batch.set(userRef, { banned: { at: now, until, money } }, { merge: true });
  await batch.commit();

  // out of the chats straight away (posting is refused for muted members), status gone
  await getDatabase().ref().update({
    [`community/muted/${uid}`]: { name: (name || email).slice(0, 40), at: now, ban: true },
    [`community/status/${uid}`]: null,
  }).catch((e) => logger.warn("ban: chat clean-up failed", { uid, e: String(e) }));

  await audit({ type: "member_banned", uid, userName: name, title: `Banned ${name || email}${until ? ` until ${new Date(until).toISOString().slice(0, 10)}` : " permanently"}`, subtitle: reason || null, money, blocked, by: adminUid });
  return { ok: true, until, blocked };
});

async function liftBan(uid: string, by: string, auto = false) {
  const ref = db.collection("bans").doc(uid);
  const ban = (await ref.get()).data() as { status?: string; name?: string; email?: string } | undefined;
  await getAuth().updateUser(uid, { disabled: false }).catch((e: { code?: string }) => { if (e?.code !== "auth/user-not-found") throw e; });
  const batch = db.batch();
  batch.set(ref, { status: "lifted", liftedAt: Date.now(), liftedBy: by, auto }, { merge: true });
  batch.set(db.collection("users").doc(uid), { banned: FieldValue.delete() }, { merge: true });
  // the IP / payout / device blocks this ban added go with it
  for (const coll of ["banned_ips", "banned_payouts", "banned_devices"]) {
    const snap = await db.collection(coll).where("fromUid", "==", uid).get();
    for (const d of snap.docs) batch.delete(d.ref);
  }
  await batch.commit();
  const mutedRef = getDatabase().ref(`community/muted/${uid}`);
  const muted = (await mutedRef.get()).val() as { ban?: boolean } | null;
  if (muted?.ban) await mutedRef.remove();
  await audit({ type: auto ? "member_ban_expired" : "member_unbanned", uid, userName: ban?.name ?? "", title: `${auto ? "Ban ended" : "Unbanned"}: ${ban?.name || ban?.email || uid}`, by });
}

export const adminUnbanMember = onCall(async (request) => {
  const adminUid = request.auth?.uid;
  await assertAdmin(adminUid);
  const uid = str((request.data as { uid?: unknown } | undefined)?.uid, 128);
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw new HttpsError("invalid-argument", "Pick a member.");
  await liftBan(uid, adminUid as string);
  return { ok: true };
});

/** Review a flag: dismiss it (and release a withdrawal hold). Banning goes through adminBanMember. */
export const adminDismissFlag = onCall(async (request) => {
  const adminUid = request.auth?.uid;
  await assertAdmin(adminUid);
  const uid = str((request.data as { uid?: unknown } | undefined)?.uid, 128);
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw new HttpsError("invalid-argument", "Pick a member.");
  const ref = db.collection("account_flags").doc(uid);
  const cur = ((await ref.get()).data() ?? {}) as { reasons?: string[]; dismissed?: string[]; name?: string };
  await ref.set({ status: "dismissed", dismissed: [...new Set([...(cur.dismissed ?? []), ...(cur.reasons ?? [])])], dismissedBy: adminUid, dismissedAt: Date.now() }, { merge: true });
  await db.collection("users").doc(uid).set({ withdrawHold: FieldValue.delete() }, { merge: true });
  await audit({ type: "account_flag_dismissed", uid, userName: cur.name ?? "", title: `Flag dismissed: ${cur.name || uid}`, subtitle: (cur.reasons ?? []).join(", ") || null, by: adminUid });
  return { ok: true };
});

export const adminLiftIpBan = onCall(async (request) => {
  const adminUid = request.auth?.uid;
  await assertAdmin(adminUid);
  const key = str((request.data as { key?: unknown } | undefined)?.key, 80);
  if (!key) throw new HttpsError("invalid-argument", "Pick an IP.");
  const ref = db.collection("banned_ips").doc(key);
  const b = (await ref.get()).data() as { ip?: string } | undefined;
  await ref.delete();
  await audit({ type: "ip_ban_lifted", title: `IP ban lifted: ${b?.ip ?? key}`, by: adminUid });
  return { ok: true };
});

/** Temporary bans end on their own; expired IP blocks are cleared. */
export const liftExpiredBans = onSchedule({ schedule: "every 60 minutes", timeZone: "Asia/Manila" }, async () => {
  const now = Date.now();
  // one range filter (no composite index needed); permanent bans have until = null and never match
  const ended = await db.collection("bans").where("until", "<=", now).get();
  const due = { docs: ended.docs.filter((d) => d.data().status === "active"), get size() { return this.docs.length; } };
  for (const d of due.docs) {
    try { await liftBan(d.id, "system", true); } catch (e) { logger.error("liftExpiredBans failed", { uid: d.id, e: String(e) }); }
  }
  const ips = await db.collection("banned_ips").where("until", "<=", now).get();
  for (const d of ips.docs) await d.ref.delete();
  if (due.size || ips.size) logger.info("expired bans lifted", { bans: due.size, ips: ips.size });
});
