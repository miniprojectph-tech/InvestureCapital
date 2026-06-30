"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, loading, demoMode } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (demoMode) return; // demo: allow access for design preview
    if (!user) {
      router.replace("/admin/login");
      return;
    }
  }, [loading, demoMode, user, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <Loader2 className="w-6 h-6 text-gold animate-spin" />
      </div>
    );
  }

  // In real-auth mode, not logged in → redirect handled above
  if (!demoMode && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <Loader2 className="w-6 h-6 text-gold animate-spin" />
      </div>
    );
  }

  // Logged in but not admin → access denied screen
  if (!demoMode && user && !user.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas px-6">
        <div className="max-w-sm text-center">
          <div className="w-14 h-14 rounded-full bg-red/15 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7 text-red" />
          </div>
          <p
            className="m-0 mb-2 text-text"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "22px",
              fontVariationSettings: '"opsz" 144, "SOFT" 30',
              letterSpacing: "-0.01em",
            }}
          >
            Admin access required
          </p>
          <p className="text-[12px] text-text-muted m-0 mb-5">
            You&apos;re signed in as{" "}
            <span className="text-text">{user.email}</span>, but this account
            doesn&apos;t have admin permissions. Ask an existing admin to flip
            <code className="text-vault mx-1">isAdmin: true</code>
            on your user document in Firestore.
          </p>
          <a
            href="/dashboard"
            className="inline-block px-5 py-2 bg-card border border-border-strong rounded-lg text-[12px] hover:bg-card-elev transition"
          >
            Back to your dashboard
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
