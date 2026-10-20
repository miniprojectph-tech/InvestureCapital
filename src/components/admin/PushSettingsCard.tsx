"use client";

import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { Loader2, Play } from "lucide-react";
import { Card, CardHeader } from "@/components/Card";
import { Switch } from "@/components/Switch";
import { getFirebase } from "@/lib/firebase";
import { useSettings, saveSettings, DEFAULT_PUSH, MIN_PUSH_INTERVAL_MIN, type PushConfig } from "@/lib/settings";

type DigestState = { lastRunAt?: number; pushed?: number; sent?: number; removed?: number; members?: number; devices?: number; manual?: boolean };
type DigestResult = { ran: boolean; reason?: string; members: number; devices: number; pushed: number; sent: number; removed: number };

const input = "bg-canvas border border-border rounded-md px-2 py-1 text-[12px] text-text font-mono outline-none focus:border-gold/40 w-[72px]";
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
const manila = (ms: number) => new Date(ms).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

/** Admin › Community › Push: digest timing, quiet hours, per-kind switches, run now. */
export function PushSettingsCard({ uid }: { uid: string }) {
  const { settings } = useSettings();
  // null = showing what is saved; an object = unsaved edits
  const [edits, setEdits] = useState<PushConfig | null>(null);
  const saved: PushConfig = { ...DEFAULT_PUSH, ...(settings.push ?? {}) };
  const draft = edits ?? saved;
  const dirty = edits !== null;
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [state, setState] = useState<DigestState | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const { rtdb } = getFirebase();
    if (!rtdb) return;
    return onValue(ref(rtdb, "push/state/digest"), (s) => setState((s.val() as DigestState | null) ?? null), () => {});
  }, []);

  const patch = (p: Partial<PushConfig>) => { setEdits({ ...draft, ...p }); setMsg(null); };

  async function save() {
    const { db } = getFirebase();
    if (!db) return;
    const clean: PushConfig = {
      ...draft,
      intervalMin: Math.max(MIN_PUSH_INTERVAL_MIN, Math.round(Number(draft.intervalMin)) || DEFAULT_PUSH.intervalMin),
      cooldownMin: Math.max(0, Math.round(Number(draft.cooldownMin)) || 0),
    };
    setSaving(true);
    try {
      await saveSettings(db, { push: clean }, uid);
      setEdits(null); setMsg("Saved.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not save."); }
    finally { setSaving(false); }
  }

  async function runNow() {
    const { functions } = getFirebase();
    if (!functions) return;
    setRunning(true); setMsg(null);
    try {
      const r = (await httpsCallable<unknown, DigestResult>(functions, "adminPushDigestNow")({})).data;
      setMsg(`Digest ran: ${r.pushed} member${r.pushed === 1 ? "" : "s"} pushed (${r.sent} device${r.sent === 1 ? "" : "s"})${r.removed ? `, ${r.removed} dead device${r.removed === 1 ? "" : "s"} dropped` : ""}. ${r.devices} device${r.devices === 1 ? "" : "s"} registered across ${r.members} member${r.members === 1 ? "" : "s"}.`);
    } catch (e) { setMsg(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "The digest could not run."); }
    finally { setRunning(false); }
  }

  const row = (label: string, sub: string | null, control: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-b-0">
      <div className="min-w-0"><p className="text-[13px] m-0">{label}</p>{sub && <p className="text-[11px] text-text-subtle m-0">{sub}</p>}</div>
      {control}
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card>
        <CardHeader title="Community digest" subtitle="One push per member: “N new messages in the community”" />
        {row("Community digest", "Off pauses room pushes; direct messages and account updates still go out", <Switch checked={draft.digest} onChange={(v) => patch({ digest: v })} label="Community digest" />)}
        {row("Check every", `minutes, minimum ${MIN_PUSH_INTERVAL_MIN}`, <span className="flex items-center gap-1.5"><input type="number" min={MIN_PUSH_INTERVAL_MIN} max={1440} value={draft.intervalMin} onChange={(e) => patch({ intervalMin: Number(e.target.value) })} className={input} /><span className="text-[11px] text-text-subtle">min</span></span>)}
        {row("Per-member cooldown", "No second room push within this time unless they opened the app", <span className="flex items-center gap-1.5"><input type="number" min={0} max={1440} value={draft.cooldownMin} onChange={(e) => patch({ cooldownMin: Number(e.target.value) })} className={input} /><span className="text-[11px] text-text-subtle">min</span></span>)}
        {row("Quiet hours (Manila)", "Room pushes wait for the morning; set both the same for none", (
          <span className="flex items-center gap-1.5 text-[11px] text-text-subtle">
            <select value={draft.quietFrom} onChange={(e) => patch({ quietFrom: Number(e.target.value) })} className="bg-canvas border border-border rounded-md px-1.5 py-1 text-[11px] text-text">{HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
            to
            <select value={draft.quietTo} onChange={(e) => patch({ quietTo: Number(e.target.value) })} className="bg-canvas border border-border rounded-md px-1.5 py-1 text-[11px] text-text">{HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
          </span>
        ))}
        <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-border">
          <button type="button" onClick={runNow} disabled={running} className="text-[11px] px-3 py-1.5 rounded-lg border border-border-strong text-text flex items-center gap-1.5 disabled:opacity-60">
            {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Run digest now
          </button>
          <button type="button" onClick={save} disabled={!dirty || saving} className="text-[11px] px-4 py-1.5 rounded-lg bg-gold text-gold-dark font-medium disabled:opacity-50 flex items-center gap-1.5">
            {saving && <Loader2 className="w-3 h-3 animate-spin" />} Save
          </button>
        </div>
        {msg && <p className="text-[11px] text-text-muted m-0 mt-2">{msg}</p>}
      </Card>

      <div className="flex flex-col gap-3">
        <Card>
          <CardHeader title="One push each" subtitle="Sent the moment the bell notice is written" />
          {row("Direct message pushes", "Team Leader messages, admin replies, member replies to leaders", <Switch checked={draft.dm} onChange={(v) => patch({ dm: v })} label="Direct message pushes" />)}
          {row("Account update pushes", "Payouts, withdrawals, events, daily notices", <Switch checked={draft.account} onChange={(v) => patch({ account: v })} label="Account update pushes" />)}
        </Card>
        <Card>
          <CardHeader title="Last digest" />
          {state?.lastRunAt ? (
            <p className="text-[12px] text-text-muted m-0 leading-relaxed">
              {manila(state.lastRunAt)}{state.manual ? " (run by hand)" : ""} · {state.pushed ?? 0} member{state.pushed === 1 ? "" : "s"} pushed · {state.devices ?? 0} device{state.devices === 1 ? "" : "s"} on across {state.members ?? 0} member{state.members === 1 ? "" : "s"}
              {state.removed ? ` · ${state.removed} dead device${state.removed === 1 ? "" : "s"} dropped` : ""}
            </p>
          ) : (
            <p className="text-[12px] text-text-subtle m-0">The digest has not run yet.</p>
          )}
          <p className="text-[11px] text-text-subtle m-0 mt-2 leading-relaxed">Android shows the number of waiting notifications on the app icon; iPhone shows the unread count carried by the push. Members choose what they receive in Profile › Notifications.</p>
        </Card>
      </div>
    </div>
  );
}
