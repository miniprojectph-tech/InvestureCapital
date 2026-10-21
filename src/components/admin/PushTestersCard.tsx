"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Send, X, Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/Card";
import { Switch } from "@/components/Switch";
import { getFirebase } from "@/lib/firebase";
import { listInvestors, type InvestorRow } from "@/lib/adminQueries";
import { useSettings, saveSettings, DEFAULT_PUSH } from "@/lib/settings";
import { useTesters, setTester, adminPushDevices, adminPushTest, type MemberPushInfo } from "@/lib/pushAdmin";

const manila = (ms: number) => new Date(ms).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

/** Admin › Community › Push › Test with members: testers-only switch, tester list, a member's devices, send a test. */
export function PushTestersCard({ uid: adminUid }: { uid: string }) {
  const { settings } = useSettings();
  const testersOnly = settings.push?.testersOnly === true;
  const testers = useTesters();
  const [members, setMembers] = useState<InvestorRow[]>([]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<InvestorRow | null>(null);
  const [info, setInfo] = useState<MemberPushInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [savingGate, setSavingGate] = useState(false);

  useEffect(() => {
    const { db } = getFirebase();
    if (!db) return;
    listInvestors(db, 1000).then(setMembers).catch(() => {});
  }, []);
  const byUid = useMemo(() => new Map(members.map((m) => [m.uid, m])), [members]);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return members.filter((m) => m.name.toLowerCase().includes(s) || m.email.toLowerCase().includes(s)).slice(0, 8);
  }, [q, members]);

  async function pick(m: InvestorRow) {
    setPicked(m); setQ(""); setInfo(null); setMsg(null); setLoadingInfo(true);
    try { setInfo(await adminPushDevices(m.uid)); }
    catch (e) { setMsg(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not load devices."); }
    finally { setLoadingInfo(false); }
  }

  async function sendTest() {
    if (!picked) return;
    setSending(true); setMsg(null);
    try {
      const r = await adminPushTest(picked.uid);
      setMsg(r.sent ? `Test sent to ${r.sent} device${r.sent === 1 ? "" : "s"} just now.` : r.removed ? `No live device: ${r.removed} stale registration${r.removed === 1 ? "" : "s"} dropped.` : "This member has no registered device yet. They need to open the app once and allow notifications.");
      if (r.removed) setInfo(await adminPushDevices(picked.uid));
    } catch (e) { setMsg(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not send the test."); }
    finally { setSending(false); }
  }

  async function setGate(v: boolean) {
    const { db } = getFirebase();
    if (!db) return;
    setSavingGate(true);
    try { await saveSettings(db, { push: { ...DEFAULT_PUSH, ...(settings.push ?? {}), testersOnly: v } }, adminUid); }
    finally { setSavingGate(false); }
  }

  return (
    <Card>
      <CardHeader title="Test with members" subtitle="Send pushes to chosen members only while you check phones" />
      <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border">
        <div className="min-w-0">
          <p className="text-[13px] m-0">Testers only</p>
          <p className="text-[11px] text-text-subtle m-0">While on, every push (digest, messages, account updates) goes only to the testers below</p>
        </div>
        <Switch checked={testersOnly} onChange={setGate} disabled={savingGate} label="Testers only" />
      </div>

      <p className="text-[11px] text-text-subtle m-0 mt-3 mb-1.5">Testers</p>
      <div className="flex flex-wrap gap-1.5">
        {testers.length === 0 && <span className="text-[11px] text-text-subtle">Nobody yet. Search a member below and add them.</span>}
        {testers.map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5 bg-card-elev rounded-full pl-2.5 pr-1 py-1 text-[11px]">
            {byUid.get(t)?.name ?? t.slice(0, 8)}
            <button type="button" onClick={() => setTester(t, false)} className="p-0.5 text-text-subtle hover:text-red" aria-label={`Remove ${byUid.get(t)?.name ?? "tester"}`}><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>

      <div className="relative mt-3">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a member by name or email…" className="w-full bg-canvas border border-border rounded-lg pl-8 pr-3 py-2 text-[12px] text-text outline-none focus:border-gold/40" />
        {matches.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-xl shadow-black/40 z-20 overflow-hidden">
            {matches.map((m) => (
              <button key={m.uid} type="button" onClick={() => pick(m)} className="w-full text-left px-3 py-2 text-[12px] hover:bg-card-elev flex items-center justify-between gap-2">
                <span className="truncate">{m.name} <span className="text-text-subtle">{m.email}</span></span>
                {testers.includes(m.uid) ? <span className="text-[10px] text-gold shrink-0">tester</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>

      {picked && (
        <div className="mt-3 bg-canvas rounded-lg p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] m-0">{picked.name}</p>
              <p className="text-[11px] text-text-subtle m-0">{picked.email}</p>
            </div>
            <div className="flex gap-2">
              {!testers.includes(picked.uid) ? (
                <button type="button" onClick={() => setTester(picked.uid, true)} className="text-[11px] px-3 py-1.5 rounded-lg border border-border-strong text-text flex items-center gap-1"><Plus className="w-3 h-3" /> Add as tester</button>
              ) : (
                <button type="button" onClick={() => setTester(picked.uid, false)} className="text-[11px] px-3 py-1.5 rounded-lg border border-border-strong text-text-muted">Remove tester</button>
              )}
              <button type="button" onClick={sendTest} disabled={sending || loadingInfo} className="text-[11px] px-3 py-1.5 rounded-lg bg-gold text-gold-dark font-medium disabled:opacity-60 flex items-center gap-1.5">
                {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Send a test push
              </button>
            </div>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-border">
            <p className="text-[11px] text-text-subtle m-0 mb-1">Registered devices</p>
            {loadingInfo ? (
              <p className="text-[11px] text-text-subtle m-0 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</p>
            ) : info && info.devices.length ? (
              info.devices.map((d) => (
                <div key={d.id} className="flex justify-between text-[12px] py-1"><span>{d.platform} · {d.browser}</span><span className="text-text-subtle">{manila(d.at)}</span></div>
              ))
            ) : (
              <p className="text-[12px] text-text-subtle m-0">None. They need to open the app once and allow notifications.</p>
            )}
            {info && (
              <p className="text-[11px] text-text-subtle m-0 mt-1.5">
                Switches: community {info.prefs.community ? "on" : "off"} · direct messages {info.prefs.dm ? "on" : "off"} · account updates {info.prefs.account ? "on" : "off"}
                {info.lastDigestPush ? ` · last digest push ${manila(info.lastDigestPush)}` : ""}
              </p>
            )}
          </div>
          {msg && <p className="text-[11px] text-text-muted m-0 mt-2">{msg}</p>}
        </div>
      )}
    </Card>
  );
}
