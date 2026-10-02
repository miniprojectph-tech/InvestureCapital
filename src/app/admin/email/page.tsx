"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, Send, FlaskConical, Image as ImageIcon, RefreshCw, X, ShieldCheck } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { describeStorageError } from "@/lib/storage";
import { uploadFaqImage } from "@/lib/faq";
import { renderEmail, emailProblems, firstNameOf, EMPTY_EMAIL, EMAIL_LIMITS, type EmailContent } from "@/lib/emailTemplate";
import {
  getEmailStatus,
  countAudience,
  sendTestEmail,
  sendCampaign,
  saveEmailSetup,
  useEmailCampaigns,
  AUDIENCE_LABELS,
  type EmailStatus,
  type EmailAudience,
  type AudienceCount,
} from "@/lib/email";

const input = "w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40";
const SITE = "https://www.investurecapital.app";
const DRAFT_KEY = "investure.emailDraft";

type Note = { ok: boolean; text: string };
const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

export default function AdminEmailPage() {
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;

  // ── setup ──
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [setup, setSetup] = useState({ apiKey: "", fromName: "", fromEmail: "", replyTo: "" });
  const [setupOpen, setSetupOpen] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);
  const [setupNote, setSetupNote] = useState<Note | null>(null);

  const refreshStatus = useCallback(async (fillForm: boolean) => {
    setStatusLoading(true);
    try {
      const s = await getEmailStatus();
      setStatus(s);
      if (fillForm) setSetup({ apiKey: "", fromName: s.fromName || "Investure Capital", fromEmail: s.fromEmail, replyTo: s.replyTo });
      if (!s.configured) setSetupOpen(true);
    } catch (e) {
      setSetupNote({ ok: false, text: errText(e) });
    } finally {
      setStatusLoading(false);
    }
  }, []);
  useEffect(() => { if (isAdmin) refreshStatus(true); }, [isAdmin, refreshStatus]);

  async function saveSetup() {
    if (!user) return;
    if (!status?.hasKey && !setup.apiKey.trim()) return setSetupNote({ ok: false, text: "Paste your Resend API key." });
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(setup.fromEmail.trim())) return setSetupNote({ ok: false, text: "Enter the address your emails are sent from, e.g. hello@yourdomain.com." });
    setSavingSetup(true);
    setSetupNote(null);
    try {
      await saveEmailSetup(setup, user.uid);
      await refreshStatus(true);
      setSetupNote({ ok: true, text: "Saved. Send yourself a test to confirm it works." });
    } catch (e) {
      setSetupNote({ ok: false, text: errText(e) });
    } finally {
      setSavingSetup(false);
    }
  }

  // ── compose ──
  const [content, setContent] = useState<EmailContent>(EMPTY_EMAIL);
  const [audience, setAudience] = useState<EmailAudience>("all");
  const [count, setCount] = useState<AudienceCount | null>(null);
  const [counting, setCounting] = useState(false);
  const [busy, setBusy] = useState<"test" | "send" | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imgInput = useRef<HTMLInputElement>(null);

  // Keep the draft on this device so a refresh doesn't lose the email being written.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null") as EmailContent | null;
      if (saved && typeof saved.subject === "string") setContent({ ...EMPTY_EMAIL, ...saved });
    } catch { /* no draft */ }
  }, []);
  const edit = (p: Partial<EmailContent>) => {
    setContent((c) => {
      const next = { ...c, ...p };
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
    setNote(null);
  };

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setCounting(true);
    setCount(null);
    countAudience(audience)
      .then((c) => { if (!cancelled) setCount(c); })
      .catch(() => { if (!cancelled) setCount(null); })
      .finally(() => { if (!cancelled) setCounting(false); });
    return () => { cancelled = true; };
  }, [audience, isAdmin]);

  const problems = emailProblems(content);
  const preview = useMemo(
    () => renderEmail(content, { name: firstNameOf(user?.name), unsubscribeUrl: "#", siteUrl: SITE }),
    [content, user?.name],
  );

  async function addImage(file: File | undefined) {
    if (!file || !user) return;
    const { storage } = getFirebase();
    if (!storage) return;
    setUploading(true);
    setNote(null);
    try {
      const m = await uploadFaqImage(storage, user.uid, file);
      edit({ imageUrl: m.url });
    } catch (e) {
      setNote({ ok: false, text: describeStorageError(e) });
    } finally {
      setUploading(false);
    }
  }

  async function test() {
    if (problems.length) return setNote({ ok: false, text: problems[0] });
    setBusy("test");
    setNote(null);
    try {
      const r = await sendTestEmail(content);
      setNote({ ok: true, text: `Test sent to ${"sentTo" in r ? r.sentTo : "your address"}. Check your inbox (and the spam folder).` });
    } catch (e) {
      setNote({ ok: false, text: errText(e) });
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setConfirm(false);
    setBusy("send");
    setNote(null);
    try {
      const r = await sendCampaign(content, audience);
      if ("status" in r) {
        if (r.status === "sent") {
          setNote({ ok: true, text: `Sent to ${r.sent.toLocaleString()} member${r.sent === 1 ? "" : "s"}.` });
          try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
          setContent(EMPTY_EMAIL);
        } else {
          setNote({ ok: false, text: `${r.sent.toLocaleString()} sent, ${r.failed.toLocaleString()} not sent. ${r.error}` });
        }
      }
    } catch (e) {
      setNote({ ok: false, text: errText(e) });
    } finally {
      setBusy(null);
    }
  }

  const campaigns = useEmailCampaigns(isAdmin);
  const ready = !!status?.configured;
  const canSend = ready && problems.length === 0 && !!count && count.willSend > 0 && !busy;

  return (
    <div>
      <TopHeader title="Email" subtitle="Send news and offers to your members by email" />

      {/* setup */}
      <Card className="mb-3">
        <CardHeader
          title="Setup"
          subtitle="Emails are sent through Resend. This is a one-time setup."
          right={
            <div className="flex items-center gap-2">
              {statusLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-text-subtle" />
              ) : (
                <span className={cn("text-[10px] px-2.5 py-1 rounded-full font-medium", ready && !status?.problem ? "bg-green/15 text-green" : "bg-red/15 text-red")}>
                  {ready && !status?.problem ? "Ready to send" : "Not set up"}
                </span>
              )}
              <button onClick={() => setSetupOpen((v) => !v)} className="text-[11px] text-gold hover:underline">{setupOpen ? "Hide" : "Edit"}</button>
            </div>
          }
        />
        {status && !setupOpen && (
          <p className="text-[11px] text-text-muted m-0">
            {ready ? <>Sending as <span className="text-text">{status.fromName ? `${status.fromName} <${status.fromEmail}>` : status.fromEmail}</span> · key {status.keyHint}</> : "Add your Resend API key and sender address to start."}
          </p>
        )}
        {status?.problem && <p className="text-[11px] text-red m-0 mt-2 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {status.problem}</p>}
        {status && status.fromDomainVerified === false && (
          <p className="text-[11px] text-red m-0 mt-2 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
            The domain of {status.fromEmail} is not verified in Resend, so emails from it will be refused. Verify the domain in Resend, or use an address on a verified domain{status.domains?.length ? ` (${status.domains.map((d) => `${d.name}: ${d.status}`).join(", ")})` : ""}.
          </p>
        )}
        {status?.fromDomainVerified === true && !setupOpen && (
          <p className="text-[11px] text-green m-0 mt-1.5 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Sender domain verified in Resend.</p>
        )}
        {status?.note && <p className="text-[10px] text-text-subtle m-0 mt-1.5">{status.note}</p>}

        {setupOpen && (
          <div className="mt-3 flex flex-col gap-3">
            <ol className="m-0 pl-4 text-[11px] text-text-muted leading-relaxed flex flex-col gap-1">
              <li>Create a free account at <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-blue underline">resend.com</a>.</li>
              <li>In Resend, open <span className="text-text">Domains</span>, add your domain (for example investurecapital.app) and add the DNS records it shows you where your domain is managed. Wait until it says <span className="text-text">Verified</span>.</li>
              <li>In Resend, open <span className="text-text">API Keys</span>, create a key, and paste it below. Only you type it; it is stored where members can never read it.</li>
            </ol>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Resend API key" hint={status?.hasKey ? `A key is saved (${status.keyHint}). Leave empty to keep it.` : "Starts with re_"}>
                <input type="password" autoComplete="off" className={cn(input, "font-mono")} value={setup.apiKey} placeholder={status?.hasKey ? "•••••••• (unchanged)" : "re_…"} onChange={(e) => setSetup({ ...setup, apiKey: e.target.value })} />
              </Field>
              <Field label="Sender name" hint="What members see in their inbox">
                <input className={input} value={setup.fromName} maxLength={60} placeholder="Investure Capital" onChange={(e) => setSetup({ ...setup, fromName: e.target.value })} />
              </Field>
              <Field label="Send from (email address)" hint="Must be on the domain you verified in Resend">
                <input type="email" className={input} value={setup.fromEmail} placeholder="hello@investurecapital.app" onChange={(e) => setSetup({ ...setup, fromEmail: e.target.value })} />
              </Field>
              <Field label="Replies go to (optional)" hint="Where a member's reply lands">
                <input type="email" className={input} value={setup.replyTo} placeholder="support@investurecapital.app" onChange={(e) => setSetup({ ...setup, replyTo: e.target.value })} />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={saveSetup} disabled={savingSetup} className="px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium disabled:opacity-50">{savingSetup ? "Saving…" : "Save setup"}</button>
              <button onClick={() => refreshStatus(false)} disabled={statusLoading} className="text-[11px] text-text-muted hover:text-text flex items-center gap-1.5 disabled:opacity-50">
                <RefreshCw className={cn("w-3 h-3", statusLoading && "animate-spin")} /> Check connection
              </button>
              {setupNote && <span className={cn("text-[11px]", setupNote.ok ? "text-green" : "text-red")}>{setupNote.text}</span>}
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-3 items-start mb-3">
        {/* compose */}
        <Card>
          <CardHeader title="Write an email" subtitle="Write it once; each member gets their own copy with their first name and an unsubscribe link." />
          <div className="flex flex-col gap-3.5">
            <Field label="Subject" count={`${content.subject.length}/${EMAIL_LIMITS.subject}`}>
              <input className={input} value={content.subject} maxLength={EMAIL_LIMITS.subject} placeholder="e.g. New event: ×1.5 payouts this week" onChange={(e) => edit({ subject: e.target.value })} />
            </Field>
            <Field label="Preview line (optional)" hint="The grey text mail apps show after the subject">
              <input className={input} value={content.preheader} maxLength={EMAIL_LIMITS.preheader} placeholder="e.g. Only 50 slots — here is how to join" onChange={(e) => edit({ preheader: e.target.value })} />
            </Field>
            <Field label="Heading">
              <input className={input} value={content.heading} maxLength={EMAIL_LIMITS.heading} placeholder="e.g. Hi {{name}}, something new for you" onChange={(e) => edit({ heading: e.target.value })} />
            </Field>
            <Field label="Message" count={`${content.body.length}/${EMAIL_LIMITS.body}`} hint="Blank line = new paragraph · start a line with “- ” for a bullet · **bold** · type {{name}} for the member's first name">
              <textarea className={cn(input, "min-h-[180px] resize-y leading-relaxed")} value={content.body} maxLength={EMAIL_LIMITS.body} placeholder={"Hi {{name}},\n\nWrite your message here."} onChange={(e) => edit({ body: e.target.value })} />
            </Field>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-text">Picture (optional)</span>
              <div className="flex flex-wrap items-center gap-2">
                <input ref={imgInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { addImage(e.target.files?.[0]); e.target.value = ""; }} />
                <button type="button" onClick={() => imgInput.current?.click()} disabled={uploading} className="px-2.5 py-1.5 rounded-lg border border-border text-[11px] text-text-muted hover:text-text flex items-center gap-1.5 disabled:opacity-40">
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />} {content.imageUrl ? "Replace picture" : "Upload a picture"}
                </button>
                {content.imageUrl && (
                  <button type="button" onClick={() => edit({ imageUrl: "" })} className="text-[11px] text-text-muted hover:text-red flex items-center gap-1"><X className="w-3 h-3" /> Remove</button>
                )}
              </div>
              <span className="text-[10px] text-text-subtle">Shown full width above the heading. A wide banner (about 1200 × 600) looks best.</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Button text (optional)">
                <input className={input} value={content.buttonLabel} maxLength={EMAIL_LIMITS.buttonLabel} placeholder="e.g. Open Investure" onChange={(e) => edit({ buttonLabel: e.target.value })} />
              </Field>
              <Field label="Button link" hint="A full https:// address">
                <input className={input} value={content.buttonUrl} maxLength={EMAIL_LIMITS.url} placeholder={`${SITE}/plans`} onChange={(e) => edit({ buttonUrl: e.target.value })} />
              </Field>
            </div>

            <div className="pt-3 border-t border-border flex flex-col gap-2.5">
              <Field label="Send to">
                <select className={input} value={audience} onChange={(e) => setAudience(e.target.value as EmailAudience)}>
                  {(Object.keys(AUDIENCE_LABELS) as EmailAudience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>)}
                </select>
              </Field>
              <p className="text-[11px] text-text-muted m-0">
                {counting ? "Counting…" : count ? (
                  <>
                    <span className="text-text font-medium">{count.willSend.toLocaleString()}</span> member{count.willSend === 1 ? "" : "s"} will receive this
                    {(count.optedOut > 0 || count.noEmail > 0) && (
                      <span className="text-text-subtle"> · left out: {count.optedOut} unsubscribed{count.noEmail > 0 ? `, ${count.noEmail} with no usable email` : ""}</span>
                    )}
                  </>
                ) : "Could not count this audience."}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button onClick={test} disabled={!ready || !!busy} className="px-3.5 py-2 rounded-lg border border-border-strong text-[12px] text-text flex items-center gap-1.5 disabled:opacity-40">
                  {busy === "test" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />} Send a test to me
                </button>
                <button onClick={() => (problems.length ? setNote({ ok: false, text: problems[0] }) : setConfirm(true))} disabled={!canSend && problems.length === 0} className="px-3.5 py-2 rounded-lg bg-gold text-gold-dark text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-40">
                  {busy === "send" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  {busy === "send" ? "Sending… keep this page open" : `Send to ${count ? count.willSend.toLocaleString() : "…"} member${count?.willSend === 1 ? "" : "s"}`}
                </button>
              </div>
              {!ready && !statusLoading && <p className="text-[11px] text-text-subtle m-0">Finish Setup above before sending.</p>}
              {note && (
                <p className={cn("text-[11px] m-0 flex items-start gap-1.5", note.ok ? "text-green" : "text-red")}>
                  {note.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />} {note.text}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* preview */}
        <div className="xl:sticky xl:top-4">
          <p className="text-[10px] uppercase tracking-wider text-text-subtle m-0 mb-1.5">What the email looks like</p>
          <div className="rounded-xl border border-border overflow-hidden bg-white">
            <div className="px-3 py-2 border-b border-[#E6EAF0] bg-[#F7F9FB]">
              <p className="m-0 text-[12px] font-semibold text-[#0B1220] truncate">{preview.subject || "Subject"}</p>
              <p className="m-0 text-[10px] text-[#7A8597] truncate">{content.preheader || "Preview line"}</p>
            </div>
            <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="block w-full h-[560px] border-0 bg-white" />
          </div>
        </div>
      </div>

      {/* history */}
      <Card>
        <CardHeader title="Sent emails" subtitle="The last 20 sends" />
        {campaigns.length === 0 ? (
          <p className="text-[11px] text-text-subtle m-0">Nothing sent yet.</p>
        ) : (
          <div className="flex flex-col">
            {campaigns.map((c, i) => (
              <div key={c.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-2", i < campaigns.length - 1 && "border-b border-border")}>
                <div className="flex-1 min-w-[180px]">
                  <p className="text-[12px] m-0 truncate">{c.subject}</p>
                  <p className="text-[10px] text-text-subtle m-0 mt-0.5">
                    {AUDIENCE_LABELS[c.audience] ?? c.audience} · {new Date(c.at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{c.byName ? ` · by ${c.byName}` : ""}
                  </p>
                  {c.error && c.status !== "sent" && <p className="text-[10px] text-red m-0 mt-0.5">{c.error}</p>}
                </div>
                <span className="text-[11px] font-mono text-text-muted">{c.sent.toLocaleString()} / {c.total.toLocaleString()}</span>
                <span className={cn("text-[9px] px-2 py-0.5 rounded-full font-medium",
                  c.status === "sent" ? "bg-green/15 text-green" : c.status === "sending" ? "bg-blue/15 text-blue" : "bg-red/15 text-red")}>
                  {c.status === "sent" ? "Sent" : c.status === "sending" ? "Sending" : c.status === "partial" ? "Partly sent" : "Failed"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* confirm */}
      {confirm && count && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4" onClick={() => setConfirm(false)} role="dialog" aria-modal="true">
          <div className="w-full max-w-sm bg-card border border-border-strong rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-[14px] font-medium m-0">Send this email to {count.willSend.toLocaleString()} member{count.willSend === 1 ? "" : "s"}?</p>
            <p className="text-[11px] text-text-muted m-0 mt-2 leading-relaxed">
              “{content.subject}” goes to {AUDIENCE_LABELS[audience].toLowerCase()}. An email can&apos;t be taken back once it is sent.
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setConfirm(false)} className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted">Go back</button>
              <button onClick={send} className="flex-1 py-2.5 rounded-lg bg-gold text-gold-dark text-[12px] font-medium">Send now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, count, children }: { label: string; hint?: string; count?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-[11px] font-medium text-text">
        {label}
        {count && <span className="text-[10px] text-text-subtle font-normal font-mono">{count}</span>}
      </span>
      {children}
      {hint && <span className="text-[10px] text-text-subtle">{hint}</span>}
    </label>
  );
}
