"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, Loader2, Smartphone } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePushStatus, isPushCardDismissed, dismissPushCard } from "@/lib/push";

/**
 * "Turn on notifications" — shown at the top of the Community and
 * Notifications pages until the member turns them on. "Not now" hides it for a
 * week. The phone's own permission prompt only opens from the tap on "Turn on".
 */
export function PushCard() {
  const { user, demoMode } = useAuth();
  const uid = user && !demoMode ? user.uid : null;
  const { status, busy, error, enable } = usePushStatus(uid);
  const [hidden, setHidden] = useState(() => isPushCardDismissed());

  if (!uid || hidden) return null;
  if (status !== "off" && status !== "needs-install") return null;

  const notNow = () => { dismissPushCard(); setHidden(true); };

  return (
    <div className="bg-card border border-gold/30 rounded-xl p-4 mb-3">
      <div className="flex gap-3 items-start">
        <BellRing className="w-5 h-5 text-gold shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold m-0">Turn on notifications</p>
          <p className="text-[12px] text-text-muted m-0 mt-1 leading-relaxed">
            Get a heads-up for community messages, replies from your Team Leader, and account updates. You choose which ones in your <Link href="/profile" className="text-gold hover:underline">Profile</Link>.
          </p>
          {status === "needs-install" ? (
            <p className="text-[11px] text-text-subtle m-0 mt-2.5 leading-relaxed flex gap-1.5">
              <Smartphone className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>On iPhone: add Investure to your Home Screen first (Share, then Add to Home Screen), then open it from there and come back here.</span>
            </p>
          ) : null}
          {error && <p className="text-[11px] text-red m-0 mt-2">{error}</p>}
          <div className="flex gap-2 mt-3">
            {status === "off" && (
              <button type="button" onClick={enable} disabled={busy} className="px-4 py-2 rounded-lg bg-gold text-gold-dark text-[12px] font-medium disabled:opacity-60 flex items-center gap-1.5">
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Turn on
              </button>
            )}
            <button type="button" onClick={notNow} className="px-4 py-2 rounded-lg border border-border-strong text-[12px] text-text-muted">Not now</button>
          </div>
        </div>
      </div>
    </div>
  );
}
