"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardHeader } from "@/components/Card";
import { Switch } from "@/components/Switch";
import type { SecurityConfig } from "@/lib/settings";
import { DEFAULT_BANNED_MESSAGE, useBannedIps, liftIpBan } from "@/lib/moderation";

/**
 * Admin › Settings › Security: sign-up protection and the message banned members
 * see. Saved with the page's Save button (draft), except "Lift" on a banned IP,
 * which takes effect at once.
 */
export function SecuritySettings({ value, onChange }: { value: SecurityConfig; onChange: (v: SecurityConfig) => void }) {
  const ips = useBannedIps();
  const [lifting, setLifting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<SecurityConfig>) => onChange({ ...value, ...p });

  async function lift(key: string) {
    setLifting(key); setError(null);
    try { await liftIpBan(key); } catch (e) { setError(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not lift it."); }
    finally { setLifting(null); }
  }

  const row = (title: string, sub: string, control: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 py-3 border-t border-border first:border-t-0">
      <div className="min-w-0"><p className="text-[12px] text-text m-0">{title}</p><p className="text-[10px] text-text-subtle m-0 mt-0.5">{sub}</p></div>
      {control}
    </div>
  );

  return (
    <div className="flex flex-col gap-3 mb-3">
      <Card>
        <CardHeader title="Sign-up protection" subtitle="Invisible to genuine members. Nothing extra to fill in." />
        <div className="flex flex-col">
          {row("Block throwaway email services", "Refuse temporary-inbox sites at sign-up. Turn off while you create dummy accounts yourself.", <Switch checked={value.blockThrowaway !== false} onChange={(v) => set({ blockThrowaway: v })} label="Block throwaway email services" />)}
          {row(
            "New accounts per IP per day",
            "Stops one person creating many accounts in a row. Starts working after the login-service upgrade.",
            <input type="number" min={1} max={50} value={value.signupsPerIpPerDay ?? 3} onChange={(e) => { const n = Math.round(Number(e.target.value)); set({ signupsPerIpPerDay: Number.isFinite(n) ? Math.max(1, Math.min(50, n)) : 3 }); }} className="w-16 bg-canvas border border-border rounded-md px-2 py-1.5 text-[12px] text-text font-mono outline-none focus:border-gold/40" />,
          )}
          {row("Invisible bot check", "Stops scripts from making accounts; people see nothing. Starts working after the login-service upgrade.", <Switch checked={value.botCheck === true} onChange={(v) => set({ botCheck: v })} label="Invisible bot check" />)}
        </div>
      </Card>

      <Card>
        <CardHeader title="Banned message" subtitle="What a banned member sees when they try to sign in. A temporary ban adds its end date." />
        <textarea
          value={value.bannedMessage ?? DEFAULT_BANNED_MESSAGE}
          maxLength={300}
          onChange={(e) => set({ bannedMessage: e.target.value })}
          className="w-full min-h-[70px] bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40 resize-y"
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-text-subtle">If you leave it empty, the default comes back.</span>
          <button type="button" onClick={() => set({ bannedMessage: DEFAULT_BANNED_MESSAGE })} className="text-[10px] text-gold hover:underline">Use default</button>
        </div>
      </Card>

      <Card>
        <CardHeader title={`Banned IPs · ${ips.length}`} subtitle="Added from the ban dialog. Lifting one takes effect at once." />
        {error && <p className="text-[11px] text-red m-0 mb-2">{error}</p>}
        {ips.length === 0 ? (
          <p className="text-[11px] text-text-subtle m-0">None.</p>
        ) : (
          <div className="flex flex-col">
            {[...ips].sort((a, b) => b.at - a.at).map((b) => (
              <div key={b.key} className="flex items-center gap-3 py-2 border-t border-border first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-text m-0 font-mono">{b.ip}</p>
                  <p className="text-[10px] text-text-subtle m-0">{b.until ? `until ${new Date(b.until).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" })}` : "permanent"}{b.fromName ? ` · from ${b.fromName}` : ""}</p>
                </div>
                <button type="button" onClick={() => lift(b.key)} disabled={lifting === b.key} className="text-[10px] px-2.5 py-1 rounded-md border border-border-strong text-text-muted hover:text-text disabled:opacity-50 flex items-center gap-1">
                  {lifting === b.key && <Loader2 className="w-3 h-3 animate-spin" />} Lift
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
