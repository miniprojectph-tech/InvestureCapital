/**
 * Christmas letter game (Community Room).
 *
 * Every Manila day a member with an active plan who opens the Community Room
 * gets one random letter of CHRISTMAS (two on admin-scheduled double days).
 * A letter they already have becomes a spare; 3 spares buy any missing
 * letter, and spares carry over to the next set. A full word redeems one
 * random gift from the admin's pool (Game Points, wallet credit, or mobile
 * load the team sends by hand), then the board starts again.
 *
 * Everything that gives letters or gifts happens here, in transactions.
 *   christmas_players/{uid}  — the member's board (member reads own; server writes)
 *   christmas_gifts/{id}     — every gift won (member reads own; admins read all)
 *   christmas_admin/pool     — gift pool (admins read; written by adminXmasSavePool)
 *   christmas_admin/stock    — how many of each gift went out (server only)
 *   christmas_admin/stats    — running totals for the admin page
 * Settings (season, letters on/off, redeem-until, double days) live on
 * settings/platform.christmas, which the members' app already reads.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { randomInt } from "crypto";
import { db } from "./init";
import { peso } from "./compplan-config";
import { recordPoints } from "./points-ledger";

export const WORD = "CHRISTMAS";
const LETTERS = Array.from(new Set(WORD.split("")));
const NEED: Record<string, number> = Object.fromEntries(LETTERS.map((l) => [l, WORD.split("").filter((c) => c === l).length]));
const SPARE_COST = 3;
const OFFSET = 8 * 3_600_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const manilaDate = (ms: number) => new Date(ms + OFFSET).toISOString().slice(0, 10);

type Mode = "off" | "admins" | "everyone";
type Cfg = { mode: Mode; startDate: string; endDate: string; letters: boolean; redeemUntil: string; doubleDays: string[] };

function cleanCfg(v: Record<string, unknown> | undefined): Cfg {
  const s = (x: unknown, d: string) => (typeof x === "string" && DATE_RE.test(x) ? x : d);
  const mode: Mode = v?.mode === "admins" || v?.mode === "everyone" ? v.mode : "off";
  const startDate = s(v?.startDate, "2026-12-01");
  const endDate = s(v?.endDate, "2026-12-25");
  const redeemUntil = s(v?.redeemUntil, "2027-01-06");
  const doubleDays = Array.isArray(v?.doubleDays) ? (v!.doubleDays as unknown[]).filter((d): d is string => typeof d === "string" && DATE_RE.test(d)) : [];
  return { mode, startDate, endDate, letters: v?.letters === true, redeemUntil: redeemUntil < endDate ? endDate : redeemUntil, doubleDays };
}
async function loadCfg(): Promise<Cfg> {
  const snap = await db.doc("settings/platform").get();
  return cleanCfg(snap.data()?.christmas as Record<string, unknown> | undefined);
}
/** Letters are handed out (admins-only test mode ignores the dates). */
const lettersOpen = (c: Cfg, isAdmin: boolean, today: string) =>
  c.letters && (c.mode === "admins" ? isAdmin : c.mode === "everyone" && today >= c.startDate && today <= c.endDate);
/** Trading spares and redeeming stay open until the redeem-until date. */
const redeemOpen = (c: Cfg, isAdmin: boolean, today: string) =>
  c.letters && (c.mode === "admins" ? isAdmin : c.mode === "everyone" && today >= c.startDate && today <= c.redeemUntil);

type Player = {
  uid: string; name: string;
  have: Record<string, number>; spares: number;
  lastDay: string | null; today: { day: string; letters: string[] } | null;
  lettersTotal: number; daysCollected: number; setsDone: number;
  updatedAt: number;
};
const emptyHave = () => Object.fromEntries(LETTERS.map((l) => [l, 0])) as Record<string, number>;
function readPlayer(uid: string, d: Record<string, unknown> | undefined, name: string): Player {
  const have = emptyHave();
  const h = (d?.have ?? {}) as Record<string, unknown>;
  for (const l of LETTERS) have[l] = Math.max(0, Math.min(NEED[l], Math.floor(Number(h[l]) || 0)));
  return {
    uid, name,
    have,
    spares: Math.max(0, Math.floor(Number(d?.spares) || 0)),
    lastDay: typeof d?.lastDay === "string" ? d.lastDay : null,
    today: (d?.today as Player["today"]) ?? null,
    lettersTotal: Number(d?.lettersTotal) || 0,
    daysCollected: Number(d?.daysCollected) || 0,
    setsDone: Number(d?.setsDone) || 0,
    updatedAt: Number(d?.updatedAt) || 0,
  };
}
const isComplete = (p: Player) => LETTERS.every((l) => p.have[l] >= NEED[l]);

const userRef = (uid: string) => db.collection("users").doc(uid);
const playerRef = (uid: string) => db.collection("christmas_players").doc(uid);
const poolRef = db.doc("christmas_admin/pool");
const stockRef = db.doc("christmas_admin/stock");
const statsRef = db.doc("christmas_admin/stats");
const nameOf = (u: Record<string, unknown>, uid: string) => {
  const p = (u.profile ?? {}) as { name?: string; email?: string };
  return p.name || p.email?.split("@")[0] || uid.slice(0, 6);
};
const hasActivePlan = (u: Record<string, unknown>) =>
  Array.isArray(u.placements) && (u.placements as { capital?: unknown }[]).some((x) => Number(x?.capital) > 0);

function requireUid(auth: { uid: string } | undefined): string {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  return auth.uid;
}

/* ───────────── daily letter ───────────── */
export const xmasCollect = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const cfg = await loadCfg();
  const now = Date.now();
  const today = manilaDate(now);
  return db.runTransaction(async (tx) => {
    const [uSnap, pSnap] = await Promise.all([tx.get(userRef(uid)), tx.get(playerRef(uid))]);
    const u = (uSnap.data() ?? {}) as Record<string, unknown>;
    const p = readPlayer(uid, pSnap.data(), nameOf(u, uid));
    const isAdmin = u.isAdmin === true;
    const base = { ok: true, word: WORD, spareCost: SPARE_COST, double: cfg.doubleDays.includes(today) };
    if (!lettersOpen(cfg, isAdmin, today)) return { ...base, status: "closed", player: p };
    if (u.banned) return { ...base, status: "suspended", player: p };
    if (p.lastDay === today) return { ...base, status: "already", drawn: p.today?.letters ?? [], player: p };
    if (!hasActivePlan(u)) return { ...base, status: "no-plan", player: p };

    const n = base.double ? 2 : 1;
    const drawn: string[] = [];
    let repeats = 0;
    for (let i = 0; i < n; i++) {
      const l = WORD[randomInt(WORD.length)];
      drawn.push(l);
      if (p.have[l] < NEED[l]) p.have[l] += 1;
      else { p.spares += 1; repeats += 1; }
    }
    const first = !pSnap.exists;
    p.lastDay = today;
    p.today = { day: today, letters: drawn };
    p.lettersTotal += n;
    p.daysCollected += 1;
    p.updatedAt = now;
    tx.set(playerRef(uid), p);
    tx.set(statsRef, { letters: FieldValue.increment(n), spares: FieldValue.increment(repeats), ...(first ? { players: FieldValue.increment(1) } : {}), days: { [today]: FieldValue.increment(1) }, updatedAt: now }, { merge: true });
    return { ...base, status: "new", drawn, repeats, player: p };
  });
});

/* ───────────── 3 spares → any missing letter ───────────── */
export const xmasTrade = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const letter = String((request.data as { letter?: unknown } | undefined)?.letter ?? "").toUpperCase();
  if (!LETTERS.includes(letter)) throw new HttpsError("invalid-argument", "Choose a letter of CHRISTMAS.");
  const cfg = await loadCfg();
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const [uSnap, pSnap] = await Promise.all([tx.get(userRef(uid)), tx.get(playerRef(uid))]);
    const u = (uSnap.data() ?? {}) as Record<string, unknown>;
    if (!redeemOpen(cfg, u.isAdmin === true, manilaDate(now))) throw new HttpsError("failed-precondition", "The Christmas letters have closed.");
    if (u.banned) throw new HttpsError("permission-denied", "This account is suspended.");
    const p = readPlayer(uid, pSnap.data(), nameOf(u, uid));
    if (p.spares < SPARE_COST) throw new HttpsError("failed-precondition", `You need ${SPARE_COST} spares to trade.`);
    if (p.have[letter] >= NEED[letter]) throw new HttpsError("failed-precondition", `You already have ${NEED[letter] > 1 ? "both" : "the"} ${letter}.`);
    p.spares -= SPARE_COST;
    p.have[letter] += 1;
    p.updatedAt = now;
    tx.set(playerRef(uid), p);
    tx.set(statsRef, { trades: FieldValue.increment(1), updatedAt: now }, { merge: true });
    return { ok: true, player: p };
  });
});

/* ───────────── gift pool ───────────── */
type Kind = "points" | "wallet" | "load";
type PoolItem = { id: string; kind: Kind; amount: number; chance: number; limit: number | null };
const KINDS: Kind[] = ["points", "wallet", "load"];
export const giftLabel = (g: { kind: Kind; amount: number }) =>
  g.kind === "points" ? `${g.amount.toLocaleString("en-PH")} Game Points` : g.kind === "wallet" ? `${peso(g.amount)} wallet credit` : `${peso(g.amount)} load`;
function readPool(d: Record<string, unknown> | undefined): PoolItem[] {
  const items = Array.isArray(d?.items) ? (d!.items as Record<string, unknown>[]) : [];
  return items
    .map((x) => ({ id: String(x.id ?? ""), kind: x.kind as Kind, amount: Number(x.amount), chance: Number(x.chance), limit: x.limit == null ? null : Math.floor(Number(x.limit)) }))
    .filter((x) => x.id && KINDS.includes(x.kind) && x.amount > 0 && x.chance > 0 && (x.limit === null || x.limit >= 0));
}

export const xmasRedeem = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const cfg = await loadCfg();
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const gsRef = userRef(uid).collection("game").doc("state");
    const [uSnap, pSnap, poolSnap, stockSnap, gsSnap] = await Promise.all([tx.get(userRef(uid)), tx.get(playerRef(uid)), tx.get(poolRef), tx.get(stockRef), tx.get(gsRef)]);
    const u = (uSnap.data() ?? {}) as Record<string, unknown>;
    if (!redeemOpen(cfg, u.isAdmin === true, manilaDate(now))) throw new HttpsError("failed-precondition", "Christmas gifts have closed.");
    if (u.banned) throw new HttpsError("permission-denied", "This account is suspended.");
    const name = nameOf(u, uid);
    const p = readPlayer(uid, pSnap.data(), name);
    if (!isComplete(p)) throw new HttpsError("failed-precondition", "Complete the word CHRISTMAS first.");
    const given = ((stockSnap.data()?.given ?? {}) as Record<string, number>);
    const pool = readPool(poolSnap.data());
    const open = pool.filter((x) => x.limit === null || (given[x.id] ?? 0) < x.limit);
    if (!open.length) throw new HttpsError("resource-exhausted", "Santa's gift bag is empty right now. Your letters are safe; try again later.");

    // weighted draw among gifts that are still in stock
    const total = open.reduce((s, x) => s + x.chance, 0);
    let r = (randomInt(1_000_000) / 1_000_000) * total;
    let pick = open[open.length - 1];
    for (const x of open) { if ((r -= x.chance) < 0) { pick = x; break; } }
    const label = giftLabel(pick);

    const giftRef = db.collection("christmas_gifts").doc();
    const gift = { uid, name, kind: pick.kind, amount: pick.amount, label, itemId: pick.id, set: p.setsDone + 1, at: now, status: pick.kind === "load" ? "needs_number" : "credited" };
    tx.set(giftRef, gift);
    tx.set(stockRef, { given: { [pick.id]: FieldValue.increment(1) }, updatedAt: now }, { merge: true });
    tx.set(statsRef, { sets: FieldValue.increment(1), gifts: { [pick.kind]: FieldValue.increment(1) }, giftAmounts: { [pick.kind]: FieldValue.increment(pick.amount) }, updatedAt: now }, { merge: true });

    // board starts again; spares carry over
    p.have = emptyHave();
    p.setsDone += 1;
    p.updatedAt = now;
    tx.set(playerRef(uid), p);

    if (pick.kind === "points") {
      const cur = gsSnap.exists ? (Number(gsSnap.data()?.points) || 0) : 0;
      tx.set(gsRef, { points: cur + pick.amount }, { merge: true });
      recordPoints(tx, { uid, name, at: now, type: "christmas_gift", delta: pick.amount, balanceAfter: cur + pick.amount, description: "Christmas gift (CHRISTMAS letters)", ref: { game: "christmas", giftId: giftRef.id }, stats: { "christmas.gifts": 1, "christmas.points": pick.amount }, daily: { christmasGift: pick.amount } });
      tx.set(userRef(uid).collection("activity").doc(), { type: "game-points", title: "Christmas gift", subtitle: `${pick.amount.toLocaleString("en-PH")} game points from Santa`, points: pick.amount, game: "christmas", at: FieldValue.serverTimestamp() });
      tx.set(userRef(uid).collection("notifications").doc(), { type: "christmas-gift", title: `Christmas gift: +${pick.amount.toLocaleString("en-PH")} Game Points`, body: "Added to your Game Points. Merry Christmas!", at: now, read: false });
    } else if (pick.kind === "wallet") {
      const before = Math.round((Number((u.balances as { wallet?: number } | undefined)?.wallet) || 0) * 100) / 100;
      tx.update(userRef(uid), { "balances.wallet": Math.round((before + pick.amount) * 100) / 100 });
      tx.set(userRef(uid).collection("activity").doc(), { type: "wallet-adjustment", title: "Christmas gift", subtitle: "Added to your wallet", amount: pick.amount, amountKind: "in", tag: "Christmas gift", at: FieldValue.serverTimestamp() });
      tx.set(userRef(uid).collection("notifications").doc(), { type: "christmas-gift", title: `Christmas gift: +${peso(pick.amount)}`, body: "Added to your wallet. Merry Christmas!", amount: pick.amount, at: now, read: false });
    }
    return { ok: true, gift: { id: giftRef.id, ...gift }, labels: Array.from(new Set(pool.map(giftLabel))), player: p };
  });
});

/** PH mobile number → 09XXXXXXXXX, or "" when it isn't one. */
function phMobile(v: unknown): string {
  const d = String(v ?? "").replace(/[^\d+]/g, "");
  const m = /^(?:\+?63|0)?(9\d{9})$/.exec(d);
  return m ? `0${m[1]}` : "";
}

/** Member: the mobile number for a load gift (can be corrected until it's sent). */
export const xmasSetLoadNumber = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const a = (request.data ?? {}) as { giftId?: unknown; mobile?: unknown };
  const giftId = typeof a.giftId === "string" ? a.giftId : "";
  const mobile = phMobile(a.mobile);
  if (!giftId) throw new HttpsError("invalid-argument", "Gift not found.");
  if (!mobile) throw new HttpsError("invalid-argument", "Enter a mobile number like 0917 123 4567.");
  const ref = db.collection("christmas_gifts").doc(giftId);
  await db.runTransaction(async (tx) => {
    const g = await tx.get(ref);
    if (!g.exists || g.data()?.uid !== uid || g.data()?.kind !== "load") throw new HttpsError("not-found", "Gift not found.");
    const status = g.data()?.status;
    if (status === "sent") throw new HttpsError("failed-precondition", "This load was already sent.");
    tx.update(ref, { mobile, status: "to_send", numberAt: Date.now() });
  });
  return { ok: true, mobile };
});

/* ───────────── admin ───────────── */
async function requireAdmin(auth: { uid: string } | undefined): Promise<{ uid: string; name: string }> {
  const uid = requireUid(auth);
  const s = await userRef(uid).get();
  if (!s.exists || s.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
  return { uid, name: (s.data()?.profile?.name as string | undefined) || "Admin" };
}

/** Admin: save the gift pool (what Santa can give, how likely, how many). */
export const adminXmasSavePool = onCall(async (request) => {
  const admin = await requireAdmin(request.auth);
  const raw = (request.data as { items?: unknown } | undefined)?.items;
  if (!Array.isArray(raw)) throw new HttpsError("invalid-argument", "No gifts sent.");
  if (raw.length > 12) throw new HttpsError("invalid-argument", "Up to 12 gifts.");
  const items: PoolItem[] = raw.map((x: Record<string, unknown>, i: number) => {
    const kind = x.kind as Kind;
    if (!KINDS.includes(kind)) throw new HttpsError("invalid-argument", `Gift ${i + 1}: choose a type.`);
    const amount = kind === "points" ? Math.floor(Number(x.amount)) : Math.round(Number(x.amount) * 100) / 100;
    const max = kind === "points" ? 1_000_000 : 100_000;
    if (!Number.isFinite(amount) || amount <= 0 || amount > max) throw new HttpsError("invalid-argument", `Gift ${i + 1}: enter an amount from 1 to ${max.toLocaleString("en-PH")}.`);
    const chance = Math.round(Number(x.chance) * 100) / 100;
    if (!Number.isFinite(chance) || chance <= 0 || chance > 100) throw new HttpsError("invalid-argument", `Gift ${i + 1}: chance must be above 0 and at most 100.`);
    const limit = x.limit === null || x.limit === undefined || x.limit === "" ? null : Math.floor(Number(x.limit));
    if (limit !== null && (!Number.isFinite(limit) || limit < 0 || limit > 1_000_000)) throw new HttpsError("invalid-argument", `Gift ${i + 1}: the limit must be a whole number, or empty for no limit.`);
    const id = typeof x.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(x.id) ? x.id : db.collection("_").doc().id;
    return { id, kind, amount, chance, limit };
  });
  const now = Date.now();
  const before = readPool((await poolRef.get()).data());
  await poolRef.set({ items, updatedAt: now, updatedBy: admin.uid });
  await db.collection("admin_audit").add({
    type: "xmas_pool_saved", title: "Christmas gift pool saved",
    subtitle: items.map((x) => `${giftLabel(x)} · ${x.chance}%${x.limit !== null ? ` · limit ${x.limit}` : ""}`).join("; ") || "empty",
    before: before.map((x) => ({ ...x })), after: items, by: admin.uid, byName: admin.name, at: now,
  });
  return { ok: true, items };
});

/** Admin: the team sent a member's load; tell the member. */
export const adminXmasLoadSent = onCall(async (request) => {
  const admin = await requireAdmin(request.auth);
  const a = (request.data ?? {}) as { giftId?: unknown; ref?: unknown };
  const giftId = typeof a.giftId === "string" ? a.giftId : "";
  const refNo = typeof a.ref === "string" ? a.ref.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  if (!giftId) throw new HttpsError("invalid-argument", "Gift not found.");
  const ref: DocumentReference = db.collection("christmas_gifts").doc(giftId);
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const g = await tx.get(ref);
    const d = g.data();
    if (!g.exists || d?.kind !== "load") throw new HttpsError("not-found", "Gift not found.");
    if (d.status === "sent") throw new HttpsError("failed-precondition", "Already marked sent.");
    if (d.status !== "to_send" || !d.mobile) throw new HttpsError("failed-precondition", "The member hasn't given a mobile number yet.");
    tx.update(ref, { status: "sent", sentAt: now, sentBy: admin.uid, sentByName: admin.name, ...(refNo ? { sentRef: refNo } : {}) });
    tx.set(userRef(d.uid).collection("notifications").doc(), {
      type: "christmas-gift", title: `Your ${peso(d.amount)} load was sent`,
      body: `Sent to ${d.mobile}${refNo ? ` · Ref ${refNo}` : ""}. Merry Christmas!`, at: now, read: false,
    });
    tx.set(db.collection("admin_audit").doc(), {
      type: "xmas_load_sent", uid: d.uid, userName: d.name ?? "", giftId,
      title: `Christmas load ${peso(d.amount)} sent to ${d.name ?? "a member"}`, subtitle: `${d.mobile}${refNo ? ` · Ref ${refNo}` : ""}`,
      by: admin.uid, byName: admin.name, at: now,
    });
  });
  return { ok: true };
});
