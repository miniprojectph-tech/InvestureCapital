"use client";

import { useState } from "react";
import { Loader2, Smartphone } from "lucide-react";
import { Card, CardHeader } from "@/components/Card";
import { Switch } from "@/components/Switch";
import { useAuth } from "@/lib/auth";
import { usePushPrefs, usePushStatus, pushTestSelf, type PushKind } from "@/lib/push";

const ROWS: { key: PushKind; label: string; sub: string }[] = [
  { key: "community", label: "Community messages", sub: "A summary, at most one per interval" },
  { key: "dm", label: "Direct messages", sub: "From your Team Leader or the admin" },
  { key: "account", label: "Account updates", sub: "Payouts, withdrawals, events" },
];

/** Profile › Notifications: the three switches and this device's push status. */
export function NotificationPrefs() {
  const { user, demoMode } = useAuth();
  const uid = user && !demoMode ? user.uid : null;
  const { prefs, setPref } = usePushPrefs(uid);
  const { status, busy, error, enable, disable } = usePushStatus(uid);
  const [test, setTest] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function sendTest() {
    setTesting(true); setTest(null);
    try {
      const r = await pushTestSelf();
      setTest(r.sent ? "Sent. It should show on this device in a moment." : "Nothing sent. Turn notifications on again on this device.");
    } catch (e) {
      setTest(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not send the test.");
    } finally { setTesting(false); }
  }

  const device =
    status === "loading" ? "Checking…"
    : status === "on" ? "notifications on"
    : status === "blocked" ? "blocked in the phone's settings"
    : status === "needs-install" ? "add Investure to your Home Screen first"
    : status === "unsupported" ? "this browser can't receive notifications"
    : "notifications off";

  return (
    <Card>
      <CardHeader title="Notifications" subtitle="What reaches your phone when the app is closed" />
      <div className="flex flex-col">
        {ROWS.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-b-0">
            <div className="min-w-0">
              <p className="text-[13px] m-0">{r.label}</p>
              <p className="text-[11px] text-text-subtle m-0">{r.sub}</p>
            </div>
            <Switch checked={prefs[r.key]} onChange={(v) => setPref(r.key, v)} disabled={!uid} label={r.label} />
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-2">
        <p className="text-[12px] text-text-muted m-0 flex items-center gap-1.5 flex-1 min-w-[180px]">
          <Smartphone className="w-3.5 h-3.5" /> This device: <span className={status === "on" ? "text-gold" : "text-text"}>{device}</span>
        </p>
        {status === "off" && (
          <button type="button" onClick={enable} disabled={busy} className="px-3 py-1.5 rounded-lg bg-gold text-gold-dark text-[11px] font-medium disabled:opacity-60 flex items-center gap-1.5">
            {busy && <Loader2 className="w-3 h-3 animate-spin" />} Turn on
          </button>
        )}
        {status === "on" && (
          <>
            <button type="button" onClick={sendTest} disabled={testing} className="px-3 py-1.5 rounded-lg border border-border-strong text-[11px] text-text disabled:opacity-60 flex items-center gap-1.5">
              {testing && <Loader2 className="w-3 h-3 animate-spin" />} Send a test
            </button>
            <button type="button" onClick={disable} disabled={busy} className="px-3 py-1.5 rounded-lg border border-border-strong text-[11px] text-text-muted disabled:opacity-60">Turn off</button>
          </>
        )}
      </div>
      {status === "needs-install" && (
        <p className="text-[11px] text-text-subtle m-0 mt-2 leading-relaxed">On iPhone, Safari only allows notifications for apps on the Home Screen: Share, then Add to Home Screen, then open Investure from there.</p>
      )}
      {status === "blocked" && (
        <p className="text-[11px] text-text-subtle m-0 mt-2 leading-relaxed">The phone is blocking notifications for Investure. Allow them in the phone&apos;s app or site settings, then come back here.</p>
      )}
      {(error || test) && <p className="text-[11px] text-text-muted m-0 mt-2">{error ?? test}</p>}
    </Card>
  );
}
