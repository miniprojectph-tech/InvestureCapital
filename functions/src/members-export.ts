import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { db } from "./init";

/**
 * Admin export of the member directory (name, email, phone, mode of payout…).
 * The rows are assembled here, not in the browser, so the admin check and the
 * audit entry can't be skipped. The file itself is built client-side from the
 * returned rows and is never stored anywhere.
 *
 * Phone: the platform doesn't ask for a phone number at sign-up. Most members
 * pay out through GCash, whose account number IS their mobile number, so the
 * phone column is the GCash number (or a `profile.phone` if one was ever saved).
 */

export type MemberExportFilter = "all" | "active" | "noPayout" | "withPayout";

export type MemberExportRow = {
  uid: string;
  name: string;
  email: string;
  phone: string;
  joinedAt: number | null;
  payoutMode: string;
  payoutAccountName: string;
  payoutAccountNumber: string;
  payoutBank: string;
  wallet: number;
  activePlacements: number;
  activeCapital: number;
  sponsor: string;
  referralCode: string;
  role: "Admin" | "Member";
  /** Admin-only account tags, "; "-separated. */
  tags: string;
};

const PAYOUT_LABEL: Record<string, string> = { gcash: "GCash", gotyme: "GoTyme", bankTransfer: "Bank transfer" };
const FILTERS: MemberExportFilter[] = ["all", "active", "noPayout", "withPayout"];

type UserDoc = {
  profile?: { name?: string; email?: string; phone?: string; joinedAt?: number };
  payoutMethod?: { type?: string; accountName?: string; accountNumber?: string; bankName?: string };
  balances?: { wallet?: number };
  placements?: { capital?: number }[];
  referredByUserId?: string;
  referralCode?: string;
  isAdmin?: boolean;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const adminExportMembers = onCall({ memory: "512MiB", timeoutSeconds: 120 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const caller = await db.collection("users").doc(request.auth.uid).get();
  if (caller.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");

  const raw = (request.data as { filter?: unknown } | undefined)?.filter ?? "all";
  if (!FILTERS.includes(raw as MemberExportFilter)) throw new HttpsError("invalid-argument", "Unknown filter.");
  const filter = raw as MemberExportFilter;
  const tagRaw = (request.data as { tag?: unknown } | undefined)?.tag;
  const tagOnly = typeof tagRaw === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(tagRaw) ? tagRaw : null;

  // Only the fields the export needs — not whole member records.
  const snap = await db
    .collection("users")
    .select("profile", "payoutMethod", "balances.wallet", "placements", "referredByUserId", "referralCode", "isAdmin")
    .get();

  // Admin-only account tags (labels for reports; never shown to members).
  const [tagSnap, linkSnap] = await Promise.all([db.collection("account_tags").get(), db.collection("account_tag_links").get()]);
  const tagName = new Map(tagSnap.docs.map((d) => [d.id, str(d.data().name, 40)] as const));
  const tagsByUid = new Map<string, string[]>();
  for (const d of linkSnap.docs) {
    const ids = Array.isArray(d.data().tags) ? (d.data().tags as unknown[]).filter((x): x is string => typeof x === "string" && tagName.has(x)) : [];
    if (ids.length) tagsByUid.set(d.id, ids);
  }
  if (tagOnly && !tagName.has(tagOnly)) throw new HttpsError("not-found", "That tag no longer exists.");

  const nameByUid = new Map<string, string>();
  for (const d of snap.docs) nameByUid.set(d.id, str((d.data() as UserDoc).profile?.name) || "");

  const rows: MemberExportRow[] = [];
  for (const d of snap.docs) {
    const u = d.data() as UserDoc;
    const pm = u.payoutMethod;
    const hasPayout = !!(pm && pm.type && pm.accountNumber);
    const placements = Array.isArray(u.placements) ? u.placements : [];
    if (filter === "active" && placements.length === 0) continue;
    if (filter === "noPayout" && hasPayout) continue;
    if (filter === "withPayout" && !hasPayout) continue;
    const tagIds = tagsByUid.get(d.id) ?? [];
    if (tagOnly && !tagIds.includes(tagOnly)) continue;

    const accountNumber = hasPayout ? str(pm!.accountNumber, 60).replace(/\s+/g, "") : "";
    rows.push({
      uid: d.id,
      name: str(u.profile?.name),
      email: str(u.profile?.email),
      phone: str(u.profile?.phone, 40) || (hasPayout && pm!.type === "gcash" ? accountNumber : ""),
      joinedAt: typeof u.profile?.joinedAt === "number" ? u.profile.joinedAt : null,
      payoutMode: hasPayout ? PAYOUT_LABEL[pm!.type ?? ""] ?? str(pm!.type, 40) : "",
      payoutAccountName: hasPayout ? str(pm!.accountName) : "",
      payoutAccountNumber: accountNumber,
      payoutBank: hasPayout && pm!.type === "bankTransfer" ? str(pm!.bankName) : "",
      wallet: Math.round(num(u.balances?.wallet) * 100) / 100,
      activePlacements: placements.length,
      activeCapital: placements.reduce((s, p) => s + num(p?.capital), 0),
      sponsor: u.referredByUserId ? nameByUid.get(u.referredByUserId) || "" : "",
      referralCode: str(u.referralCode, 40),
      role: u.isAdmin === true ? "Admin" : "Member",
      tags: tagIds.map((id) => tagName.get(id) ?? "").filter(Boolean).sort().join("; "),
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  // This file holds every member's payout details — record who took a copy.
  await db.collection("admin_audit").add({ type: "members_export", filter, tag: tagOnly, rows: rows.length, by: request.auth.uid, at: Date.now() });
  logger.info("members export", { filter, rows: rows.length, by: request.auth.uid });

  return { ok: true, filter, generatedAt: Date.now(), total: snap.size, rows };
});
