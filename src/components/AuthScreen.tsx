"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  ArrowRight,
  TrendingUp,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

type Mode = "signin" | "signup";

export function AuthScreen({ defaultMode = "signin" }: { defaultMode?: Mode }) {
  const router = useRouter();
  const { signIn, signUp, demoMode } = useAuth();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [agree, setAgree] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSignup && !agree) {
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
      if (isSignup) await signUp(name, email, password);
      else await signIn(email, password);
      router.push("/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg.replace("Firebase: ", "").replace(/\(auth\/[^)]+\)\.?$/, "").trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#060a14] text-white flex flex-col">
      {/* ambient spotlight + orbs */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(58% 52% at 50% 38%, rgba(29,63,120,0.5), transparent 72%)" }}
      />
      <div
        className="pointer-events-none absolute -left-32 top-0 w-[380px] h-[380px] rounded-full opacity-50"
        style={{ background: "radial-gradient(circle, #A78BFA 0%, transparent 68%)", animation: "auth-orb 9s ease-in-out infinite" }}
      />
      <div
        className="pointer-events-none absolute -right-32 bottom-0 w-[420px] h-[420px] rounded-full opacity-40"
        style={{ background: "radial-gradient(circle, #3DD598 0%, transparent 68%)", animation: "auth-orb 11s ease-in-out infinite reverse" }}
      />

      {/* compounding curve backdrop */}
      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 w-full h-[62vh] min-h-[360px]"
        viewBox="0 0 1000 400"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="authArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3DD598" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#3DD598" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="authLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4F8EF7" />
            <stop offset="55%" stopColor="#3DD598" />
            <stop offset="100%" stopColor="#F5C66B" />
          </linearGradient>
        </defs>
        <g stroke="#16223c" strokeWidth="1">
          <line x1="0" y1="130" x2="1000" y2="130" />
          <line x1="0" y1="230" x2="1000" y2="230" />
          <line x1="0" y1="330" x2="1000" y2="330" />
        </g>
        <path d="M0 380 Q250 362 420 302 T720 150 Q860 72 1000 22 L1000 400 L0 400 Z" fill="url(#authArea)" />
        <path
          d="M0 380 Q250 362 420 302 T720 150 Q860 72 1000 22"
          fill="none"
          stroke="url(#authLine)"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ strokeDasharray: 2200, strokeDashoffset: 2200, animation: "auth-draw 2.2s ease-out 0.25s forwards" }}
        />
      </svg>

      {/* header */}
      <header className="relative z-10 flex items-center gap-3 px-6 sm:px-10 py-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-gold" strokeWidth={2.25} />
          <span className="font-medium text-[16px]">Investure</span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 ml-3 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
          <span className="w-1.5 h-1.5 rounded-full bg-green" style={{ animation: "auth-pulse 2s ease-in-out infinite" }} />
          <span className="text-[10px] text-white/60 tracking-wide">Live · BTC $98,420 ↑ 1.84%</span>
        </div>
        {demoMode && (
          <span className="ml-auto text-[9px] font-medium bg-blue/15 text-blue px-2 py-0.5 rounded-full">Demo mode</span>
        )}
      </header>

      {/* main */}
      <main className="relative z-10 flex-1 flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-16 px-6 sm:px-10 pb-12">
        {/* headline */}
        <div className="max-w-md text-center lg:text-left">
          <p className="text-[11px] tracking-[0.22em] text-vault-muted m-0 mb-3">ONE INVESTMENT · TWO INCOME STREAMS</p>
          <h1
            className="m-0 leading-tight"
            style={{ fontFamily: "var(--font-display)", fontSize: "clamp(30px,4.6vw,46px)" }}
          >
            Invest once.
            <br />
            <span className="text-gold">Compound for 365 days.</span>
          </h1>
          <p className="text-[13px] text-white/60 mt-4 m-0 leading-relaxed max-w-sm mx-auto lg:mx-0">
            One 30-day plan seeds a Future Growth Vault that compounds 1% daily — daily income to your wallet, earnings to
            your vault.
          </p>
          <div className="hidden lg:flex items-center gap-5 mt-6">
            <Stat value="1,284" label="Investors" />
            <Stat value="₱4.8M" label="Managed" />
            <Stat value="37.78×" label="Annual" gold />
          </div>
        </div>

        {/* glass panel */}
        <div
          className="w-full max-w-[380px] rounded-3xl border border-white/12 p-6 sm:p-7"
          style={{
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04), 0 24px 60px rgba(0,0,0,0.5)",
          }}
        >
          {/* segmented control */}
          <div className="flex bg-black/30 border border-white/10 rounded-full p-1 mb-5">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={
                  "flex-1 py-1.5 rounded-full text-[12px] font-medium transition " +
                  (mode === m ? "bg-gold text-gold-dark" : "text-white/60 hover:text-white")
                }
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <p className="text-[12px] text-white/55 m-0 mb-4">
            {isSignup ? "Start with a simulated ₱10,000 demo balance." : "Sign in to your dashboard and vault."}
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            {isSignup && (
              <Field label="Full name" icon={UserIcon}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Genesis Devilla"
                  className="flex-1 bg-transparent text-[13px] outline-none text-white placeholder:text-white/30"
                  required={!demoMode}
                  autoComplete="name"
                />
              </Field>
            )}

            <Field label="Email" icon={Mail}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="flex-1 bg-transparent text-[13px] outline-none text-white placeholder:text-white/30"
                required={!demoMode}
                autoComplete="email"
              />
              {isSignup && email && (
                <CheckCircle2 className={`w-3.5 h-3.5 ${emailOk ? "text-green" : "text-white/30"}`} />
              )}
            </Field>

            <Field label="Password" icon={Lock} rightLabel={!isSignup ? "Forgot?" : undefined}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignup ? "At least 6 characters" : "••••••••"}
                className="flex-1 bg-transparent text-[13px] outline-none text-white placeholder:text-white/30"
                required={!demoMode}
                minLength={isSignup ? 6 : undefined}
                autoComplete={isSignup ? "new-password" : "current-password"}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="text-white/40 hover:text-white transition"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </Field>

            {isSignup ? (
              <label className="flex items-start gap-2 mt-0.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  className="accent-[#3DD598] w-3 h-3 mt-0.5"
                />
                <span className="text-[11px] text-white/55 leading-relaxed">
                  I understand this is a demo — all balances are simulated, no real money.
                </span>
              </label>
            ) : (
              <label className="flex items-center gap-2 mt-0.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="accent-[#3DD598] w-3 h-3"
                />
                <span className="text-[11px] text-white/55">Remember me for 30 days</span>
              </label>
            )}

            {error && (
              <div className="flex items-start gap-2 px-3 py-2 bg-red/15 border border-red/30 rounded-lg text-[11px] text-red">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 py-2.5 bg-gold text-gold-dark rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 hover:brightness-110 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> {isSignup ? "Creating account…" : "Signing in…"}
                </>
              ) : (
                <>
                  {isSignup ? "Create account" : "Sign in"} <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          <p className="text-[10px] text-white/35 text-center mt-4 m-0 leading-relaxed">
            Simulated platform — all balances and trading data are for illustration. No real money involved.
          </p>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  rightLabel,
  children,
}: {
  label: string;
  icon: typeof Mail;
  rightLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <label className="text-[10px] text-white/45 uppercase tracking-wider">{label}</label>
        {rightLabel && (
          <a href="#" className="text-[10px] text-gold hover:underline">
            {rightLabel}
          </a>
        )}
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 focus-within:border-gold/50 transition">
        <Icon className="w-4 h-4 text-white/40 shrink-0" />
        {children}
      </div>
    </div>
  );
}

function Stat({ value, label, gold }: { value: string; label: string; gold?: boolean }) {
  return (
    <div>
      <p className={`m-0 font-mono text-[16px] ${gold ? "text-gold" : "text-white"}`} style={{ fontFamily: "var(--font-display)" }}>
        {value}
      </p>
      <p className="m-0 text-[10px] text-white/45 mt-0.5">{label}</p>
    </div>
  );
}
