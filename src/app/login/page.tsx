"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, Eye, EyeOff, ArrowRight, TrendingUp, Info, Loader2, AlertCircle } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, demoMode } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const curve = Array.from({ length: 30 }, (_, i) => ({
    day: i * 13,
    value: 250 * Math.pow(1.01, i * 13),
  }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (demoMode) {
        // Demo: skip real auth, jump straight to dashboard
        router.push("/dashboard");
        return;
      }
      await signIn(email, password);
      router.push("/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      setError(msg.replace("Firebase: ", "").replace(/\(auth\/[^)]+\)\.?$/, "").trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas grid grid-cols-1 md:grid-cols-[1fr_1.15fr]">
      <div className="p-10 flex flex-col">
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
          <p className="text-[20px] font-medium m-0">Welcome back</p>
          <p className="text-[12px] text-text-muted mt-1 m-0">
            Sign in to access your dashboard and vault.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-[10px] text-text-muted mb-1.5 uppercase tracking-wider">
              Email or investor ID
            </label>
            <div className="flex items-center gap-2 px-3 py-2.5 bg-card border border-border rounded-lg focus-within:border-gold/40">
              <Mail className="w-3.5 h-3.5 text-text-subtle" />
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="flex-1 bg-transparent text-[13px] outline-none text-text placeholder:text-text-subtle"
                required={!demoMode}
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-[10px] text-text-muted uppercase tracking-wider">
                Password
              </label>
              <Link href="#" className="text-[10px] text-gold hover:underline">
                Forgot?
              </Link>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 bg-card border border-border rounded-lg focus-within:border-gold/40">
              <Lock className="w-3.5 h-3.5 text-text-subtle" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="flex-1 bg-transparent text-[13px] outline-none text-text"
                required={!demoMode}
                autoComplete="current-password"
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
          </div>

          <label className="flex items-center gap-2 mt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="accent-[#F5C66B] w-3 h-3"
            />
            <span className="text-[11px] text-text-muted">Remember me for 30 days</span>
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
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Signing in…
              </>
            ) : (
              <>
                Sign in <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>

          <div className="flex items-center gap-2.5 my-1">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-text-subtle">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <Link
            href="/register"
            className="py-2.5 bg-transparent border border-border-strong text-text rounded-lg text-[12px] hover:bg-card transition text-center"
          >
            Create an account
          </Link>
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

      <div className="relative p-10 flex flex-col justify-between bg-gradient-to-br from-[#0E1428] via-[#1A1A2E] to-[#2A1D1F] overflow-hidden">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green" />
          <span className="text-[10px] font-medium text-text-muted tracking-wider">
            Live market — BTC $98,420 ↑ 1.84%
          </span>
        </div>

        <div className="my-4">
          <p className="text-[11px] text-gold-muted tracking-wider m-0 mb-2">
            ONE INVESTMENT · TWO INCOME STREAMS
          </p>
          <p className="text-[22px] font-medium leading-snug m-0 mb-2">
            Invest ₱1,000 once → earn{" "}
            <span className="text-gold">₱40,722</span> from a single 30-day plan.
          </p>
          <p className="text-[12px] text-text-muted leading-relaxed m-0">
            ₱1,050 daily income to your wallet + ₱1,050 seed into your Future Growth Vault
            compounding 1% daily for 365 days.
          </p>
        </div>

        <div className="bg-card/60 border border-border-gold rounded-xl p-4 backdrop-blur-sm">
          <div className="flex justify-between items-baseline mb-2.5">
            <span className="text-[10px] text-gold-muted tracking-wider">FUTURE GROWTH VAULT</span>
            <span className="text-[10px] text-green font-mono">+₱94.45 today</span>
          </div>
          <p className="text-[26px] font-medium font-mono m-0 mb-2 text-gold tracking-tight">
            ₱9,445.42
          </p>
          <div className="h-[70px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curve} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="loginGold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F5C66B" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#F5C66B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#F5C66B"
                  strokeWidth={1.5}
                  fill="url(#loginGold)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between text-[9px] text-text-subtle mt-1">
            <span>Day 1 · ₱250</span>
            <span className="text-gold-muted">Day 365 · ₱9,445</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          <div>
            <p className="text-[14px] font-medium font-mono m-0">1,284</p>
            <p className="text-[9px] text-text-subtle mt-0.5 m-0">Active investors</p>
          </div>
          <div>
            <p className="text-[14px] font-medium font-mono m-0">₱4.8M</p>
            <p className="text-[9px] text-text-subtle mt-0.5 m-0">Total managed</p>
          </div>
          <div>
            <p className="text-[14px] font-medium font-mono text-gold m-0">37.78×</p>
            <p className="text-[9px] text-text-subtle mt-0.5 m-0">Annual multiplier</p>
          </div>
        </div>
      </div>
    </div>
  );
}
