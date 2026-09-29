"use client";

import { useState, type FormEvent } from "react";
import { X, Loader2, AlertCircle, CheckCircle2, KeyRound, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

/** Turn a Firebase error into a sentence a member can act on. */
function friendly(err: unknown): string {
  const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
  if (code === "auth/wrong-password" || code === "auth/invalid-credential" || code === "auth/invalid-login-credentials") return "That current password isn't right.";
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a few minutes and try again.";
  if (code === "auth/weak-password") return "That password is too easy to guess. Use at least 8 characters.";
  if (code === "auth/requires-recent-login") return "Please sign out, sign in again, and retry.";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "The Google window was closed before confirming.";
  if (code === "auth/network-request-failed") return "No connection. Check your internet and try again.";
  const msg = err instanceof Error ? err.message : "Something went wrong.";
  return msg.replace("Firebase: ", "").replace(/\(auth\/[^)]+\)\.?$/, "").replace(/^[A-Z_]+:\s*/, "").trim() || "Something went wrong.";
}

function Shell({ title, icon: Icon, danger, onClose, children }: { title: string; icon: typeof KeyRound; danger?: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-label={title}>
      <div className="w-full max-w-[400px] bg-card border border-border-strong rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", danger ? "bg-red/15" : "bg-gold/15")}>
            <Icon className={cn("w-4 h-4", danger ? "text-red" : "text-gold")} />
          </div>
          <p className="text-[14px] font-medium m-0 flex-1">{title}</p>
          <button onClick={onClose} className="text-text-subtle hover:text-text" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <label className="text-[11px] font-medium text-text block">
      {label}
      <span className="mt-1 flex items-center gap-2 bg-canvas border border-border rounded-lg px-3 py-2 focus-within:border-gold/40">
        <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required className="flex-1 min-w-0 bg-transparent text-[13px] text-text outline-none" />
        <button type="button" onClick={() => setShow((s) => !s)} className="text-text-subtle hover:text-text" aria-label={show ? "Hide password" : "Show password"}>
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </span>
    </label>
  );
}

const ErrorLine = ({ text }: { text: string }) => (
  <p className="text-[11px] text-red m-0 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {text}</p>
);

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, hasPassword, changePassword, resetPassword } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  if (!open) return null;

  function close() {
    setCurrent(""); setNext(""); setAgain(""); setError(null); setDone(null);
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== again) return setError("The two new passwords don't match.");
    setBusy(true);
    try {
      await changePassword(current, next);
      setDone("Your password has been changed. Use the new one next time you sign in.");
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendReset() {
    if (!user?.email) return;
    setBusy(true);
    setError(null);
    try {
      await resetPassword(user.email);
      setDone(`A reset link was sent to ${user.email}. Check your inbox and spam.`);
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Change password" icon={KeyRound} onClose={close}>
      {done ? (
        <div className="flex flex-col gap-3">
          <p className="text-[12px] text-green m-0 flex items-start gap-1.5"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> {done}</p>
          <button onClick={close} className="py-2.5 bg-gold text-gold-dark rounded-lg text-[12px] font-medium hover:brightness-110">Done</button>
        </div>
      ) : !hasPassword ? (
        <div className="flex flex-col gap-3">
          <p className="text-[12px] text-text-muted m-0 leading-relaxed">
            You sign in with Google, so there is no password to change here. Your sign-in is protected by your Google account&apos;s own password and security settings.
          </p>
          <button onClick={close} className="py-2.5 border border-border-strong rounded-lg text-[12px] text-text hover:bg-card-elev">Close</button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
          <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
          <PasswordField label="New password again" value={again} onChange={setAgain} autoComplete="new-password" />
          <p className="text-[10px] text-text-subtle m-0">At least 8 characters. Don&apos;t reuse a password from another site.</p>
          {error && <ErrorLine text={error} />}
          <button type="submit" disabled={busy} className="py-2.5 bg-gold text-gold-dark rounded-lg text-[12px] font-medium hover:brightness-110 disabled:opacity-60 flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Change password
          </button>
          <button type="button" onClick={sendReset} disabled={busy} className="text-[11px] text-text-muted hover:text-text underline disabled:opacity-60">
            Forgot your current password? Email me a reset link
          </button>
        </form>
      )}
    </Shell>
  );
}

// Account deletion is admin-only: see components/admin/DeleteMemberModal.tsx.
