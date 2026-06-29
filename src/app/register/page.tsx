"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  ArrowRight,
  TrendingUp,
  Info,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const { signUp, demoMode } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agree, setAgree] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agree) {
      setError("Please agree to the terms to continue.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (demoMode) {
        router.push("/dashboard");
        return;
      }
      await signUp(name, email, password);
      router.push("/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-up failed";
      setError(msg.replace("Firebase: ", "").replace(/\(auth\/[^)]+\)\.?$/, "").trim());
    } finally {
      setBusy(false);
    }
  }

  const passwordOk = password.length >= 6;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  return (
    <div className="min-h-screen bg-canvas grid grid-cols-1 md:grid-cols-[1fr_1.15fr]">
      <div className="p-6 sm:p-10 flex flex-col">
        <div className="flex items-center gap-2 mb-10">
          <TrendingUp className="w-5 h-5 text-gold" strokeWidth={2.25} />
          <span className="font-medium text-[16px]">Investure</span>
          {demoMode && (
            <span className="ml-auto text-[9px] font-medium bg-blue/15 text-blue px-2 py-0.5 rounded-full">
              Demo mode
            </span>
          )}
        </div>

        <div className="mb-6">
          <p className="text-[20px] font-medium m-0">Create your account</p>
          <p className="text-[12px] text-text-muted mt-1 m-0">
            Start with a simulated ₱10,000 demo balance.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-[10px] text-text-muted mb-1.5 uppercase tracking-wider">
              Full name
            </label>
            <div className="flex items-center gap-2 px-3 py-2.5 bg-card border border-border rounded-lg focus-within:border-gold/40">
              <UserIcon className="w-3.5 h-3.5 text-text-subtle" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Genesis Devilla"
                className="flex-1 bg-transparent text-[13px] outline-none text-text placeholder:text-text-subtle"
                required={!demoMode}
                autoComplete="name"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-text-muted mb-1.5 uppercase tracking-wider">
              Email
            </label>
            <div className="flex items-center gap-2 px-3 py-2.5 bg-card border border-border rounded-lg focus-within:border-gold/40">
              <Mail className="w-3.5 h-3.5 text-text-subtle" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="flex-1 bg-transparent text-[13px] outline-none text-text placeholder:text-text-subtle"
                required={!demoMode}
                autoComplete="email"
              />
              {email && (
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${emailOk ? "text-green" : "text-text-subtle"}`}
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-text-muted mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <div className="flex items-center gap-2 px-3 py-2.5 bg-card border border-border rounded-lg focus-within:border-gold/40">
              <Lock className="w-3.5 h-3.5 text-text-subtle" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="flex-1 bg-transparent text-[13px] outline-none text-text"
                required={!demoMode}
                minLength={6}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="text-text-subtle hover:text-text transition"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {password && (
              <p className={`text-[10px] mt-1 m-0 ${passwordOk ? "text-green" : "text-text-subtle"}`}>
                {passwordOk ? "✓ Strong enough" : "Needs at least 6 characters"}
              </p>
            )}
          </div>

          <label className="flex items-start gap-2 mt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="accent-[#F5C66B] w-3 h-3 mt-0.5"
            />
            <span className="text-[11px] text-text-muted leading-relaxed">
              I understand this is a demo platform. All balances are simulated and no real
              money is involved.
            </span>
          </label>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-2 py-2.5 bg-gold text-gold-dark rounded-lg text-[13px] font-medium flex items-center justify-center gap-2 hover:brightness-110 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating account…
              </>
            ) : (
              <>
                Create account <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>

          <p className="text-[11px] text-text-muted text-center mt-2 m-0">
            Already have an account?{" "}
            <Link href="/login" className="text-gold hover:underline">
              Sign in
            </Link>
          </p>
        </form>

        <div className="mt-auto pt-6">
          <p className="text-[9px] text-text-dim leading-relaxed flex items-start gap-1.5 m-0">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            <span>
              Demo platform — all balances and trading data are simulated for illustration.
              No real money involved.
            </span>
          </p>
        </div>
      </div>

      <div className="hidden md:flex relative p-10 flex-col justify-center bg-gradient-to-br from-[#0E1428] via-[#1A1A2E] to-[#2A1D1F] overflow-hidden">
        <div>
          <p className="text-[11px] text-gold-muted tracking-wider m-0 mb-3">
            WHAT YOU GET ON DAY 1
          </p>
          <div className="flex flex-col gap-3">
            <Feature
              title="₱10,000 demo balance"
              body="Pre-loaded simulated capital ready to deploy across short-term plans."
            />
            <Feature
              title="Active 30-day plan"
              body="Auto-activated so you immediately see daily income flowing into your wallet."
            />
            <Feature
              title="Future Growth Vault"
              body="Watch your earnings compound at 1% daily — visible per-second ticking."
            />
            <Feature
              title="Time Machine"
              body="Drag a slider to project your vault from day 1 to day 730 in real-time."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 bg-card/40 border border-border rounded-lg p-3 backdrop-blur-sm">
      <div className="w-7 h-7 rounded-full bg-gold/15 flex items-center justify-center shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 text-gold" />
      </div>
      <div>
        <p className="text-[12px] font-medium m-0">{title}</p>
        <p className="text-[11px] text-text-muted mt-0.5 m-0">{body}</p>
      </div>
    </div>
  );
}
