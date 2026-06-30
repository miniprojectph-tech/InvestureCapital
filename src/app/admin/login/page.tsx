"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const { signIn, demoMode } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (demoMode) {
        router.push("/admin");
        return;
      }
      await signIn(email, password);
      router.push("/admin");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      setError(msg.replace("Firebase: ", "").replace(/\(auth\/[^)]+\)\.?$/, "").trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="w-full max-w-[420px]">
        <div className="flex items-center justify-center gap-2 mb-6">
          <TrendingUp className="w-6 h-6 text-gold" strokeWidth={2.25} />
          <span className="font-medium text-[18px]">Investure</span>
          <span className="text-[10px] font-medium bg-vault/15 text-vault px-2 py-0.5 rounded-full ml-1">
            Admin console
          </span>
        </div>

        <div className="bg-card border border-border rounded-2xl p-7 relative overflow-hidden">
          <span
            aria-hidden
            className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-border-vault to-transparent"
          />

          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-vault" />
            <p
              className="m-0 text-text"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "20px",
                fontVariationSettings: '"opsz" 144, "SOFT" 30',
                letterSpacing: "-0.01em",
              }}
            >
              Operator sign-in
            </p>
          </div>
          <p className="text-[11px] text-text-muted m-0 mb-5">
            Restricted area. Admin role required.
            {demoMode && (
              <span className="ml-1 text-blue">Demo mode active — any credentials work.</span>
            )}
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div>
              <label className="block text-[10px] text-text-muted mb-1.5 uppercase tracking-wider">
                Admin email
              </label>
              <div className="flex items-center gap-2 px-3 py-2.5 bg-canvas border border-border rounded-lg focus-within:border-vault/40">
                <Mail className="w-3.5 h-3.5 text-text-subtle" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@investure.app"
                  className="flex-1 bg-transparent text-[13px] outline-none text-text placeholder:text-text-subtle"
                  required={!demoMode}
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-text-muted mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="flex items-center gap-2 px-3 py-2.5 bg-canvas border border-border rounded-lg focus-within:border-vault/40">
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

            {error && (
              <div className="flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-2 py-2.5 bg-vault text-vault-dark rounded-lg text-[13px] font-medium flex items-center justify-center gap-2 hover:brightness-110 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Authenticating…
                </>
              ) : (
                <>
                  Sign in to admin <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          <p className="text-[10px] text-text-subtle text-center mt-5 m-0">
            Investor instead?{" "}
            <Link href="/login" className="text-gold hover:underline">
              Use the investor login
            </Link>
          </p>
        </div>

        <p className="text-[9px] text-text-dim text-center mt-4 m-0">
          Admin role is granted manually in Firestore. Set{" "}
          <code className="text-vault-muted">isAdmin: true</code> on your user document.
        </p>
      </div>
    </div>
  );
}
