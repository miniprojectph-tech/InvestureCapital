"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { X, Loader2, AlertCircle, KeyRound, Mail, Link2, Copy, CheckCircle2 } from "lucide-react";
import { getFirebase } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

type Mode = "link" | "temp";
type Result = { ok: boolean; mode: Mode; email: string; name: string; hasPassword: boolean; usesGoogle: boolean; link?: string; tempPassword?: string };

function call(uid: string, mode: Mode): Promise<Result> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Not available right now.");
  return httpsCallable<{ uid: string; mode: Mode }, Result>(functions, "adminResetMemberPassword")({ uid, mode }).then((r) => r.data);
}

const clean = (e: unknown) => (e instanceof Error ? e.message.replace(/^[A-Z_]+:\s*/, "").replace("Firebase: ", "").replace(/\(auth\/[^)]+\)\.?$/, "").trim() : "Something went wrong.");

/** Admin › Investors: get a locked-out member back in — by reset link or by temporary password. */
export function ResetPasswordModal({ member, onClose }: { member: { uid: string; name: string; email: string } | null; onClose: () => void }) {
  const { resetPassword } = useAuth();
  const [busy, setBusy] = useState<"email" | Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [temp, setTemp] = useState<string | null>(null);
  const [confirmTemp, setConfirmTemp] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [google, setGoogle] = useState(false);

  // A fresh window for each member: never carry one member's link or password over to the next.
  useEffect(() => {
    setBusy(null); setError(null); setEmailed(false); setLink(null); setTemp(null); setConfirmTemp(false); setCopied(null); setGoogle(false);
  }, [member?.uid]);

  if (!member) return null;
  const first = member.name.split(" ")[0] || "the member";

  async function emailLink() {
    if (!member) return;
    setBusy("email"); setError(null);
    try {
      await resetPassword(member.email);
      setEmailed(true);
    } catch (e) {
      setError(clean(e));
    } finally {
      setBusy(null);
    }
  }

  async function run(mode: Mode) {
    if (!member) return;
    setBusy(mode); setError(null);
    try {
      const r = await call(member.uid, mode);
      setGoogle(r.usesGoogle && !r.hasPassword);
      if (r.link) setLink(r.link);
      if (r.tempPassword) { setTemp(r.tempPassword); setConfirmTemp(false); }
    } catch (e) {
      setError(clean(e));
    } finally {
      setBusy(null);
    }
  }

  function copy(what: string, text: string) {
    navigator.clipboard?.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(null), 1600); }).catch(() => {});
  }

  const box = "rounded-xl border border-border bg-canvas p-3 flex flex-col gap-2";
  const btn = "px-3 py-2 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5 disabled:opacity-40";

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Reset password">
      <div className="w-full max-w-[460px] max-h-[92dvh] overflow-y-auto bg-card border border-border-strong rounded-2xl p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue/15 flex items-center justify-center"><KeyRound className="w-4 h-4 text-blue" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-medium m-0 truncate">Reset password · {member.name}</p>
            <p className="text-[10px] text-text-subtle m-0 truncate">{member.email}</p>
          </div>
          <button type="button" onClick={onClose} className="text-text-subtle hover:text-text" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        {google && (
          <p className="text-[11px] text-[#F5C66B] m-0 leading-relaxed">
            {first} signs in with Google and has never set a password. They can keep using “Continue with Google”; a password is only needed if they want to sign in with email as well.
          </p>
        )}

        {/* 1 — reset link */}
        <div className={box}>
          <p className="text-[12px] font-medium m-0">Reset link <span className="text-[10px] font-normal text-green">· recommended</span></p>
          <p className="text-[11px] text-text-muted m-0 leading-relaxed">{first} chooses their own new password. You never see it.</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={emailLink} disabled={!!busy || !member.email} className={`${btn} border border-border-strong text-text`}>
              {busy === "email" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Email it to them
            </button>
            <button onClick={() => run("link")} disabled={!!busy || !member.email} className={`${btn} border border-border-strong text-text`}>
              {busy === "link" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />} Make a link to copy
            </button>
          </div>
          {emailed && <p className="text-[11px] text-green m-0 flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" /> Sent to {member.email}. Ask them to check the spam folder too.</p>}
          {link && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-card border border-dashed border-border-strong">
                <span className="flex-1 font-mono text-[10px] text-text-muted truncate">{link}</span>
                <button onClick={() => copy("link", link)} className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-blue/15 text-blue flex items-center gap-1">
                  <Copy className="w-3 h-3" /> {copied === "link" ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-[10px] text-text-subtle m-0">Send this to {first} in a private chat. It works once and expires in about an hour. Anyone who has the link can set the password, so don&apos;t post it in the Community Room.</p>
            </div>
          )}
        </div>

        {/* 2 — temporary password */}
        <div className={box}>
          <p className="text-[12px] font-medium m-0">Temporary password</p>
          <p className="text-[11px] text-text-muted m-0 leading-relaxed">For a member who can&apos;t open their email. Their current password stops working at once and they are signed out on every device.</p>
          {temp ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-card border border-dashed border-[#F5C66B]/50">
                <span className="flex-1 font-mono text-[16px] tracking-wider text-text select-all">{temp}</span>
                <button onClick={() => copy("temp", temp)} className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-[#F5C66B]/15 text-[#F5C66B] flex items-center gap-1">
                  <Copy className="w-3 h-3" /> {copied === "temp" ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-[10px] text-text-subtle m-0">Shown only now — it is not saved anywhere. Give it to {first} privately and ask them to change it right away in Profile › Change password.</p>
            </div>
          ) : confirmTemp ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-text">Replace {first}&apos;s password now?</span>
              <button onClick={() => run("temp")} disabled={!!busy} className={`${btn} bg-[#F5C66B]/15 border border-[#F5C66B]/40 text-[#F5C66B]`}>
                {busy === "temp" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Yes, set a temporary password
              </button>
              <button onClick={() => setConfirmTemp(false)} disabled={!!busy} className="text-[11px] text-text-muted hover:text-text">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmTemp(true)} disabled={!!busy} className={`${btn} self-start border border-border-strong text-text`}>
              <KeyRound className="w-3.5 h-3.5" /> Set a temporary password
            </button>
          )}
        </div>

        {error && <p className="text-[11px] text-red m-0 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}</p>}

        <button type="button" onClick={onClose} className="py-2.5 border border-border-strong rounded-lg text-[12px] text-text hover:bg-card-elev">Done</button>
      </div>
    </div>
  );
}
