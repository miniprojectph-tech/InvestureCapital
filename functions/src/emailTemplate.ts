// Marketing email template — shared by the admin preview and Cloud Functions
// (src/lib/emailTemplate.ts is an identical copy; keep them in sync). Pure
// string building: table layout and inline styles, because that is what mail
// apps render reliably.

export type EmailContent = {
  subject: string;
  /** The grey line mail apps show after the subject. */
  preheader: string;
  heading: string;
  /** Light markup: blank line = paragraph, "- " = bullet, **bold**, bare links. `{{name}}` = first name. */
  body: string;
  imageUrl: string;
  buttonLabel: string;
  buttonUrl: string;
};

export const EMAIL_LIMITS = { subject: 150, preheader: 150, heading: 120, body: 5000, buttonLabel: 40, url: 500 };

export const EMPTY_EMAIL: EmailContent = { subject: "", preheader: "", heading: "", body: "", imageUrl: "", buttonLabel: "", buttonUrl: "" };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const isHttps = (u: string) => /^https:\/\/[^\s"'<>]+$/i.test(u.trim());

/** First name for "Hi {{name}}", or a neutral word when we don't have one. */
export function firstNameOf(name: string | undefined | null): string {
  const n = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  return n.length >= 2 && n.length <= 30 && !/[<>@]/.test(n) ? n : "there";
}

function fill(text: string, name: string): string {
  return text.replace(/\{\{\s*name\s*\}\}/gi, name);
}

/** **bold** and bare https links, on already-escaped text. */
function inlineHtml(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#0B1220;">$1</strong>')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,)])/g, '<a href="$1" style="color:#0E9F6E;text-decoration:underline;">$1</a>');
}

function bodyHtml(body: string): string {
  const out: string[] = [];
  for (const chunk of body.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    const lines = chunk.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim().length);
    if (!lines.length) continue;
    let para: string[] = [];
    let list: string[] = [];
    const flushPara = () => {
      if (para.length) out.push(`<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#3B4658;">${para.map((l) => inlineHtml(esc(l))).join("<br>")}</p>`);
      para = [];
    };
    const flushList = () => {
      if (list.length) out.push(`<ul style="margin:0 0 16px 0;padding:0 0 0 20px;font-size:15px;line-height:1.6;color:#3B4658;">${list.map((l) => `<li style="margin:0 0 6px 0;">${inlineHtml(esc(l))}</li>`).join("")}</ul>`);
      list = [];
    };
    for (const line of lines) {
      const bullet = /^\s*[-•*]\s+(.*)$/.exec(line);
      if (bullet) { flushPara(); list.push(bullet[1]); } else { flushList(); para.push(line.trim()); }
    }
    flushPara();
    flushList();
  }
  return out.join("\n");
}

function bodyText(body: string): string {
  return body.replace(/\r\n?/g, "\n").replace(/\*\*/g, "").trim();
}

export function renderEmail(
  content: EmailContent,
  opts: { name: string; unsubscribeUrl: string; siteUrl: string; brand?: string },
): { subject: string; html: string; text: string } {
  const brand = opts.brand ?? "Investure Capital";
  const name = opts.name || "there";
  const subject = fill(content.subject, name).trim();
  const heading = fill(content.heading, name).trim();
  const body = fill(content.body, name);
  const pre = fill(content.preheader, name).trim();
  const img = isHttps(content.imageUrl) ? content.imageUrl.trim() : "";
  const btnUrl = isHttps(content.buttonUrl) ? content.buttonUrl.trim() : "";
  const btn = btnUrl && content.buttonLabel.trim() ? content.buttonLabel.trim() : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#EEF2F6;">
${pre ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(pre)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td style="background:#0A0F1F;padding:20px 28px;">
<span style="font-size:17px;font-weight:700;letter-spacing:.02em;color:#FFFFFF;">${esc(brand.split(" ")[0])}</span><span style="font-size:17px;font-weight:700;letter-spacing:.02em;color:#3DD598;">${esc(brand.includes(" ") ? " " + brand.split(" ").slice(1).join(" ") : "")}</span>
</td></tr>
${img ? `<tr><td><img src="${esc(img)}" alt="" width="560" style="display:block;width:100%;height:auto;border:0;"></td></tr>` : ""}
<tr><td style="padding:28px 28px 8px 28px;">
${heading ? `<h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;color:#0B1220;font-weight:700;">${esc(heading)}</h1>` : ""}
${bodyHtml(body)}
${btn ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px 0;"><tr><td style="background:#3DD598;border-radius:10px;"><a href="${esc(btnUrl)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#052418;text-decoration:none;">${esc(btn)}</a></td></tr></table>` : ""}
</td></tr>
<tr><td style="padding:18px 28px 26px 28px;border-top:1px solid #E6EAF0;">
<p style="margin:0 0 6px 0;font-size:12px;line-height:1.5;color:#7A8597;">You are receiving this because you have an account at <a href="${esc(opts.siteUrl)}" style="color:#7A8597;">${esc(brand)}</a>.</p>
<p style="margin:0;font-size:12px;line-height:1.5;color:#7A8597;"><a href="${esc(opts.unsubscribeUrl)}" style="color:#7A8597;text-decoration:underline;">Unsubscribe from these emails</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    heading,
    bodyText(body),
    btn ? `${btn}: ${btnUrl}` : "",
    "—",
    `You are receiving this because you have an account at ${brand} (${opts.siteUrl}).`,
    `Unsubscribe: ${opts.unsubscribeUrl}`,
  ].filter(Boolean).join("\n\n");

  return { subject, html, text };
}

/** What is wrong with a draft, in plain words — empty array when it is ready to send. */
export function emailProblems(c: EmailContent): string[] {
  const p: string[] = [];
  if (!c.subject.trim()) p.push("Add a subject.");
  if (c.subject.length > EMAIL_LIMITS.subject) p.push(`The subject is too long (max ${EMAIL_LIMITS.subject}).`);
  if (!c.body.trim() && !c.heading.trim()) p.push("Write a heading or a message.");
  if (c.body.length > EMAIL_LIMITS.body) p.push(`The message is too long (max ${EMAIL_LIMITS.body} characters).`);
  if (c.heading.length > EMAIL_LIMITS.heading) p.push("The heading is too long.");
  if (c.preheader.length > EMAIL_LIMITS.preheader) p.push("The preview line is too long.");
  if (c.imageUrl.trim() && !isHttps(c.imageUrl)) p.push("The picture link must start with https://");
  if (c.buttonLabel.trim() && !isHttps(c.buttonUrl)) p.push("The button needs a link that starts with https://");
  if (c.buttonLabel.length > EMAIL_LIMITS.buttonLabel) p.push("The button text is too long.");
  return p;
}
