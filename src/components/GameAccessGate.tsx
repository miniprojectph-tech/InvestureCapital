"use client";

import { Lock, Loader2 } from "lucide-react";
import Link from "next/link";
import { useGameAccess } from "@/lib/useGameAccess";

export function GameAccessGate({ children }: { children: React.ReactNode }) {
  const { loading, allowed, reason } = useGameAccess();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-gold/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-gold" />
          </div>
          <h2 className="text-lg font-semibold text-text">Game access locked</h2>
          <p className="text-[13px] text-text-muted leading-relaxed">{reason}</p>
          <Link
            href="/plans"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-bg text-[13px] font-semibold hover:bg-gold-hover transition-colors"
          >
            View plans
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
