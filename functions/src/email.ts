import { onCall, onRequest, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./init";
import { renderEmail, emailProblems, firstNameOf, EMPTY_EMAIL, type EmailContent } from "./emailTemplate";

// Email marketing through Resend (https://resend.com).
//
//   * The API key, sender name/address and the unsubscribe secret live in
//     `admin_private/email` — admins only; the key is typed by the admin on the
//     Email page and never leaves the server side after that.
//   * Every email goes to ONE member (never a visible list), carries an
//     unsubscribe link, and members who opted out (`users/{uid}.emailOptOut`)
//     are skipped.
//   * Each send is logged in `email_campaigns` and `admin_audit`.

const SITE_URL = "https://www.investurecapital.app";
const RESEND = "https://api.resend.com";
const CFG_DOC = "admin_private/email";
const BATCH = 100; // Resend's batch endpoint takes up to 100 emails per request
const BATCH_GAP_MS = 600; // stay under Resend's 2 requests/second

type EmailCfg = { apiKey?: string; fromName?: string; fromEmail?: string; replyTo?: string; unsubSecret?: string };
export type EmailAudience = "all" | "active" | "noPlacement";
const AUDIENCES: EmailAudience[] = ["all", "active", "noPlacement"];

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function requireAdmin(request: CallableRequest): Promise<{ uid: string; name: string; email: string }> {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const snap = await db.collection("users").doc(request.auth.uid).get();
  if (snap.data()?.isAdmin !== true) throw new HttpsError("permission-denied", "Admin role required.");
  return { uid: request.auth.uid, name: String(snap.data()?.profile?.name ?? ""), email: String(request.auth.token.email ?? snap.data()?.profile?.email ?? "") };
}

/** Settings, with the unsubscribe secret created on first use. */
async function loadCfg(): Promise<EmailCfg & { unsubSecret: string }> {
  const snap = await db.doc(CFG_DOC).get();
  const cfg = (snap.exists ? snap.data() : {}) as EmailCfg;
  if (typeof cfg.unsubSecret === "string" && cfg.unsubSecret.length >= 32) return cfg as EmailCfg & { unsubSecret: string };
  const unsubSecret = randomBytes(32).toString("hex");
  await db.doc(CFG_DOC).set({ unsubSecret }, { merge: true });
  return { ...cfg, unsubSecret };
}

const unsubToken = (uid: string, secret: string) => createHmac("sha256", secret).update(uid).digest("hex").slice(0, 40);
function unsubUrl(uid: string, secret: string): string {
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "investurecapital-37731";
  return `https://us-central1-${project}.cloudfunctions.net/emailUnsubscribe?u=${encodeURIComponent(uid)}&t=${unsubToken(uid, secret)}`;
}

function fromLine(cfg: EmailCfg): string {
  const name = String(cfg.fromName ?? "").replace(/[<>"\r\n]/g, "").trim();
  return name ? `${name} <${cfg.fromEmail}>` : String(cfg.fromEmail);
}

function requireConfigured(cfg: EmailCfg) {
  if (!cfg.apiKey) throw new HttpsError("failed-precondition", "Email isn't set up yet: add your Resend API key under Setup.");
  if (!cfg.fromEmail || !EMAIL_RE.test(cfg.fromEmail)) throw new HttpsError("failed-precondition", "Email isn't set up yet: add the address your emails are sent from.");
}

async function resend(path: string, key: string, method: "GET" | "POST", body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(`${RESEND}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try { json = (await r.json()) as Record<string, unknown>; } catch { /* empty body */ }
  return { status: r.status, json };
}

/** Resend's error, in words the admin can act on. */
function explain(status: number, json: Record<string, unknown>): string {
  const msg = String(json.message ?? json.error ?? "");
  const name = String(json.name ?? "");
  // (Resend answers a malformed key with 400 "API key is invalid", not 401.)
  if (status === 401 || name === "missing_api_key" || name === "invalid_api_key" || /api key is invalid/i.test(msg)) return "Resend did not accept the API key. Check it under Setup.";
  if (status === 403 && /domain/i.test(msg)) return `Resend refused the sender address: ${msg} Verify your domain in Resend, then use an address on that domain.`;
  if (status === 403) return `Resend refused this send: ${msg || "not allowed for this key."}`;
  if (status === 429 && /quota|limit/i.test(name + msg)) return `You have reached your Resend sending limit: ${msg || "quota exceeded."}`;
  if (status === 429) return "Resend is asking us to slow down. Wait a minute and try again.";
  if (status === 422) return `Resend could not accept the email: ${msg || "check the sender address and content."}`;
  return `Resend error ${status}${msg ? `: ${msg}` : ""}`;
}

function cleanContent(raw: unknown): EmailContent {
  const r = (raw ?? {}) as Partial<Record<keyof EmailContent, unknown>>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const c: EmailContent = { ...EMPTY_EMAIL, subject: s(r.subject), preheader: s(r.preheader), heading: s(r.heading), body: s(r.body), imageUrl: s(r.imageUrl).trim(), buttonLabel: s(r.buttonLabel), buttonUrl: s(r.buttonUrl).trim() };
  const problems = emailProblems(c);
  if (problems.length) throw new HttpsError("invalid-argument", problems[0]);
  return c;
}

type Recipient = { uid: string; email: string; name: string };

/** Who an audience reaches, and why anyone is left out. */
async function audienceOf(audience: EmailAudience): Promise<{ list: Recipient[]; matched: number; optedOut: number; noEmail: number }> {
  const snap = await db.collection("users").select("profile", "placements", "emailOptOut").get();
  const seen = new Set<string>();
  const list: Recipient[] = [];
  let matched = 0, optedOut = 0, noEmail = 0;
  for (const d of snap.docs) {
    const u = d.data() as { profile?: { name?: string; email?: string }; placements?: unknown[]; emailOptOut?: boolean };
    const active = Array.isArray(u.placements) && u.placements.length > 0;
    if (audience === "active" && !active) continue;
    if (audience === "noPlacement" && active) continue;
    matched++;
    const email = String(u.profile?.email ?? "").trim().toLowerCase();
    // Throwaway test accounts use example.com — never mail those.
    if (!EMAIL_RE.test(email) || email.endsWith("@example.com")) { noEmail++; continue; }
    if (u.emailOptOut === true) { optedOut++; continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    list.push({ uid: d.id, email, name: String(u.profile?.name ?? "") });
  }
  return { list, matched, optedOut, noEmail };
}

function buildEmail(cfg: EmailCfg & { unsubSecret: string }, content: EmailContent, to: Recipient) {
  const unsubscribeUrl = unsubUrl(to.uid, cfg.unsubSecret);
  const r = renderEmail(content, { name: firstNameOf(to.name), unsubscribeUrl, siteUrl: SITE_URL });
  return {
    from: fromLine(cfg),
    to: [to.email],
    subject: r.subject,
    html: r.html,
    text: r.text,
    ...(cfg.replyTo && EMAIL_RE.test(cfg.replyTo) ? { reply_to: cfg.replyTo } : {}),
    headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

// ── Admin: is email ready to send? (never returns the key) ──
export const adminEmailStatus = onCall(async (request) => {
  await requireAdmin(request);
  const cfg = await loadCfg();
  const hasKey = !!cfg.apiKey;
  const fromEmail = cfg.fromEmail ?? "";
  const fromDomain = fromEmail.includes("@") ? fromEmail.split("@")[1].toLowerCase() : "";
  const out = {
    hasKey,
    keyHint: hasKey ? `••••${String(cfg.apiKey).slice(-4)}` : "",
    fromName: cfg.fromName ?? "",
    fromEmail,
    replyTo: cfg.replyTo ?? "",
    configured: hasKey && EMAIL_RE.test(fromEmail),
    domains: null as { name: string; status: string }[] | null,
    fromDomainVerified: null as boolean | null,
    problem: "" as string,
    note: "" as string,
  };
  if (!hasKey) return out;
  const r = await resend("/domains", String(cfg.apiKey), "GET");
  if (r.status === 200) {
    const data = (r.json.data as { name?: string; status?: string }[] | undefined) ?? [];
    out.domains = data.map((d) => ({ name: String(d.name ?? ""), status: String(d.status ?? "") }));
    out.fromDomainVerified = fromDomain ? out.domains.some((d) => d.name.toLowerCase() === fromDomain && d.status === "verified") : null;
  } else if (String(r.json.name ?? "") === "restricted_api_key") {
    out.note = "This key can only send, so the domain can't be checked from here. Send yourself a test to confirm it works.";
  } else {
    out.problem = explain(r.status, r.json);
  }
  return out;
});

// ── Admin: how many members an audience reaches ──
export const adminEmailAudience = onCall(async (request) => {
  await requireAdmin(request);
  const audience = String((request.data as { audience?: string })?.audience ?? "all") as EmailAudience;
  if (!AUDIENCES.includes(audience)) throw new HttpsError("invalid-argument", "Unknown audience.");
  const a = await audienceOf(audience);
  return { audience, willSend: a.list.length, matched: a.matched, optedOut: a.optedOut, noEmail: a.noEmail };
});

// ── Admin: send a test to yourself, or the campaign to an audience ──
export const adminSendEmail = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
  const admin = await requireAdmin(request);
  const data = (request.data ?? {}) as { content?: unknown; audience?: string; test?: boolean };
  const content = cleanContent(data.content);
  const cfg = await loadCfg();
  requireConfigured(cfg);
  const key = String(cfg.apiKey);

  if (data.test === true) {
    if (!EMAIL_RE.test(admin.email)) throw new HttpsError("failed-precondition", "Your admin account has no email address to send the test to.");
    const r = await resend("/emails", key, "POST", buildEmail(cfg, { ...content, subject: `[TEST] ${content.subject}` }, { uid: admin.uid, email: admin.email, name: admin.name }));
    if (r.status >= 300) throw new HttpsError("failed-precondition", explain(r.status, r.json));
    return { ok: true, test: true, sentTo: admin.email };
  }

  const audience = String(data.audience ?? "all") as EmailAudience;
  if (!AUDIENCES.includes(audience)) throw new HttpsError("invalid-argument", "Unknown audience.");
  const a = await audienceOf(audience);
  if (a.list.length === 0) throw new HttpsError("failed-precondition", "Nobody in that audience can receive email.");

  const now = Date.now();
  const ref = db.collection("email_campaigns").doc();
  await ref.set({
    subject: content.subject, heading: content.heading, audience,
    total: a.list.length, sent: 0, failed: 0, optedOut: a.optedOut, noEmail: a.noEmail,
    status: "sending", error: "", by: admin.uid, byName: admin.name, at: now,
  });

  let sent = 0, failed = 0, error = "", stopped = false;
  for (let i = 0; i < a.list.length; i += BATCH) {
    const chunk = a.list.slice(i, i + BATCH);
    try {
      const r = await resend("/emails/batch", key, "POST", chunk.map((to) => buildEmail(cfg, content, to)));
      if (r.status < 300) {
        sent += chunk.length;
      } else {
        failed += chunk.length;
        error = explain(r.status, r.json);
        // A bad key, an unverified sender or an exhausted quota will fail every batch — stop.
        if ([401, 403, 422, 429].includes(r.status)) { stopped = true; failed += a.list.length - (i + chunk.length); }
      }
    } catch (e) {
      failed += chunk.length;
      error = e instanceof Error ? e.message : "Network error while sending.";
    }
    await ref.set({ sent, failed, error }, { merge: true });
    if (stopped) break;
    if (i + BATCH < a.list.length) await sleep(BATCH_GAP_MS);
  }

  const status = failed === 0 ? "sent" : sent === 0 ? "failed" : "partial";
  await ref.set({ sent, failed, error, status, finishedAt: Date.now() }, { merge: true });
  await db.collection("admin_audit").add({
    type: "email_campaign", campaignId: ref.id, title: `Email: ${content.subject}`.slice(0, 160),
    subtitle: `${sent} sent · ${failed} failed · audience ${audience}`, by: admin.uid, at: Date.now(),
  });
  logger.info("email campaign", { id: ref.id, audience, sent, failed, status });
  return { ok: status !== "failed", id: ref.id, status, sent, failed, total: a.list.length, error };
});

// ── Public: the unsubscribe link in every email ──
const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;background:#0A0F1F;color:#EDF0F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<div style="max-width:420px;margin:12vh auto;padding:28px;background:#131A2E;border:1px solid rgba(255,255,255,.08);border-radius:16px;text-align:center;">
<p style="margin:0 0 14px 0;font-weight:700;font-size:16px;">Investure <span style="color:#3DD598;">Capital</span></p>
${body}
</div></body></html>`;

export const emailUnsubscribe = onRequest({ invoker: "public" }, async (req, res) => {
  const uid = String(req.query.u ?? (req.body as { u?: string } | undefined)?.u ?? "");
  const token = String(req.query.t ?? (req.body as { t?: string } | undefined)?.t ?? "");
  res.set("Cache-Control", "no-store");
  const bad = () => { res.status(400).send(page("Link not valid", `<p style="margin:0;font-size:14px;color:#9AA3B5;line-height:1.5;">This unsubscribe link isn't valid. Sign in and switch email updates off from your Profile instead.</p>`)); };
  if (!/^[A-Za-z0-9]{6,128}$/.test(uid) || !/^[a-f0-9]{40}$/.test(token)) return bad();
  const cfg = await loadCfg();
  const expected = unsubToken(uid, cfg.unsubSecret);
  if (!timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return bad();

  // GET only shows the button: mail scanners open links, and they must not unsubscribe anyone.
  if (req.method === "GET") {
    res.status(200).send(page("Unsubscribe", `<p style="margin:0 0 18px 0;font-size:14px;color:#9AA3B5;line-height:1.5;">Stop receiving news and offers by email? You will still get your in-app notifications.</p>
<form method="POST" action="?u=${encodeURIComponent(uid)}&t=${token}"><button type="submit" style="padding:12px 22px;border:0;border-radius:10px;background:#3DD598;color:#052418;font-weight:700;font-size:14px;cursor:pointer;">Yes, unsubscribe me</button></form>`));
    return;
  }
  if (req.method !== "POST") { res.status(405).send("Method not allowed"); return; }
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (snap.exists) await ref.set({ emailOptOut: true, emailOptOutAt: Date.now() }, { merge: true });
  res.status(200).send(page("Unsubscribed", `<p style="margin:0;font-size:14px;color:#9AA3B5;line-height:1.5;">Done. You won't receive news and offers by email from us. You can switch them back on any time from your Profile.</p>`));
});
