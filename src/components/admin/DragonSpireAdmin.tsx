"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, X, Save, FlaskConical, Coins, Crown, Gift, Trophy } from "lucide-react";
import { Card, CardHeader } from "@/components/Card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { listInvestors, type InvestorRow } from "@/lib/adminQueries";
import {
  useSlotSettings, saveSlotSettings, saveHubGames, useSlotStatsToday, useGrandHistory, adminArmGrand, adminSlotPlayerSpins, spinsFor, potPointsPerWeek,
  POT_LABEL, DEFAULT_POPUP_TEXT, type SlotStatus, type SlotSettings, type DailySettings, type HubGames,
} from "@/lib/slot";

const input = "bg-canvas border border-border rounded-md px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40 w-full";
const num = cn(input, "font-mono");
const SMALL_POTS = ["mini", "minor", "major"] as const;
type SmallPot = (typeof SMALL_POTS)[number];

/** Which games appear on Games Central. Dragon Spire has its own three-way status in the tab beside this. */
export function HubGamesCard() {
  const { hub, slot, loading } = useSlotSettings();
  const [draft, setDraft] = useState<HubGames | null>(null);
  const [statusDraft, setStatusDraft] = useState<SlotStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cur = draft ?? hub;
  const curStatus = statusDraft ?? slot.status;
  const dirty = JSON.stringify(cur) !== JSON.stringify(hub) || curStatus !== slot.status;
  const rows: { key: keyof HubGames; name: string; hint: string }[] = [
    { key: "reef", name: "Investure Reef (fishing)", hint: "Off hides the card and blocks /play. Game Points, rewards and rankings are untouched." },
    { key: "tongits", name: "Tongits", hint: "Off hides the card and blocks /tongits." },
    { key: "color", name: "Color Game", hint: "Off hides the card and blocks /color-game." },
  ];
  async function save() {
    setSaving(true); setMsg(null);
    try {
      if (JSON.stringify(cur) !== JSON.stringify(hub)) await saveHubGames(cur);
      if (curStatus !== slot.status) await saveSlotSettings({ status: curStatus });
      setDraft(null); setStatusDraft(null);
      setMsg({ ok: true, text: "Saved. The hub updates for members straight away." });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed" }); }
    finally { setSaving(false); }
  }
  return (
    <Card className="mb-3">
      <CardHeader title="Games on the hub" subtitle="Switch a game off to hide it from Games Central and block its page. Dragon Spire can also open to testers only; its spins, band and jackpots are in its own tab." />
      {loading ? <Loader2 className="w-4 h-4 animate-spin text-text-subtle" /> : (
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-border">
            <div className="min-w-0">
              <p className="text-[12px] m-0">Dragon Spire (slot)</p>
              <p className="text-[10px] text-text-subtle m-0 mt-0.5">Off hides the card and blocks /dragon-spire. Testers only shows it to the testers list and admins.</p>
            </div>
            <div className="flex gap-1 p-1 rounded-lg bg-canvas border border-border shrink-0">
              {(["off", "testers", "everyone"] as SlotStatus[]).map((s) => (
                <button key={s} type="button" onClick={() => { setStatusDraft(s); setMsg(null); }} className={cn("px-3 py-1 rounded-md text-[10px] font-medium transition", curStatus === s ? (s === "off" ? "bg-card-elev text-text" : s === "testers" ? "bg-[#F5C66B]/15 text-[#F5C66B]" : "bg-green/15 text-green") : "text-text-muted hover:text-text")}>
                  {s === "off" ? "Off" : s === "testers" ? `Testers only${slot.testers.length ? ` · ${slot.testers.length}` : ""}` : "Everyone"}
                </button>
              ))}
            </div>
          </div>
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-b-0">
              <div className="min-w-0">
                <p className="text-[12px] m-0">{r.name}</p>
                <p className="text-[10px] text-text-subtle m-0 mt-0.5">{r.hint}</p>
              </div>
              <button type="button" onClick={() => { setDraft({ ...cur, [r.key]: !cur[r.key] }); setMsg(null); }} aria-pressed={cur[r.key]} className={cn("shrink-0 px-3 py-1 rounded-full text-[10px] font-medium border transition min-w-[64px]", cur[r.key] ? "bg-green/15 border-green/40 text-green" : "bg-canvas border-border text-text-muted")}>
                {cur[r.key] ? "On" : "Off"}
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button onClick={save} disabled={saving || !dirty} className="px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium disabled:opacity-50 flex items-center gap-1.5">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save</button>
        {dirty && !saving && <button onClick={() => { setDraft(null); setStatusDraft(null); setMsg(null); }} className="text-[11px] text-text-muted hover:text-text">Discard</button>}
        {msg && <span className={cn("text-[11px]", msg.ok ? "text-green" : "text-red")}>{msg.text}</span>}
      </div>
    </Card>
  );
}

/* editable copy of the settings, numbers kept as text while typing */
type Draft = {
  status: SlotStatus; testing: boolean; paidSpins: boolean;
  daily: Record<keyof DailySettings, string>;
  pots: Record<SmallPot, { amount: string; count: string; weeks: string }>;
  grandAmount: string; grandMin: string; popupText: string;
};
function draftFrom(s: SlotSettings): Draft {
  const d = {} as Record<keyof DailySettings, string>;
  (Object.keys(s.daily) as (keyof DailySettings)[]).forEach((k) => { d[k] = String(s.daily[k]); });
  return {
    status: s.status, testing: s.testing, paidSpins: s.paidSpins, daily: d,
    pots: { mini: potText(s.pots.mini), minor: potText(s.pots.minor), major: potText(s.pots.major) },
    grandAmount: String(s.grand.amount), grandMin: String(s.grand.minActive), popupText: s.popupText,
  };
}
const potText = (p: { amount: number; count: number; weeks: number }) => ({ amount: String(p.amount), count: String(p.count), weeks: String(p.weeks) });
const int = (v: string) => Math.floor(Number(v));

/** Dragon Spire: who can play, daily free spins and the points band, the pot schedule, the Grand picker, testers and today's numbers. */
export function DragonSpireAdmin() {
  const { user, demoMode } = useAuth();
  const { slot, loading } = useSlotSettings();
  const stats = useSlotStatsToday();
  const grandHistory = useGrandHistory();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const base = useMemo(() => draftFrom(slot), [slot]);
  const cur = draft ?? base;
  const dirty = JSON.stringify(cur) !== JSON.stringify(base);
  const edit = (patch: Partial<Draft>) => { setDraft({ ...cur, ...patch }); setMsg(null); };
  const editDaily = (k: keyof DailySettings, v: string) => edit({ daily: { ...cur.daily, [k]: v } });
  const editPot = (k: SmallPot, f: "amount" | "count" | "weeks", v: string) => edit({ pots: { ...cur.pots, [k]: { ...cur.pots[k], [f]: v } } });

  // members, for testers and the Grand picker
  const [investors, setInvestors] = useState<InvestorRow[]>([]);
  const [search, setSearch] = useState("");
  const [testerBusy, setTesterBusy] = useState<string | null>(null);
  useEffect(() => {
    const { db } = getFirebase();
    if (!db || demoMode) return;
    listInvestors(db, 1000).then(setInvestors).catch(() => {});
  }, [demoMode]);
  const nameOf = (uid: string) => investors.find((i) => i.uid === uid)?.name ?? uid.slice(0, 8) + "…";
  const testerSet = useMemo(() => new Set(slot.testers), [slot.testers]);
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return investors.filter((i) => !testerSet.has(i.uid) && (i.name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q))).slice(0, 6);
  }, [search, investors, testerSet]);
  const testerRows = useMemo(() => slot.testers.map((uid) => investors.find((i) => i.uid === uid) ?? { uid, name: uid.slice(0, 8) + "…", email: "" }), [slot.testers, investors]);
  async function setTesters(next: string[], key: string) {
    setTesterBusy(key); setMsg(null);
    try { await saveSlotSettings({ testers: next }); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" }); } finally { setTesterBusy(null); }
  }
  // per-tester spin tools
  const [addSpins, setAddSpins] = useState<Record<string, string>>({});
  async function testerSpins(t: { uid: string; name: string }, action: "reset" | "add") {
    const n = action === "add" ? int(addSpins[t.uid] ?? "10") : 0;
    if (action === "add" && (!Number.isFinite(n) || n < 1 || n > 200)) return setMsg({ ok: false, text: "Add between 1 and 200 spins." });
    const key = `${action}-${t.uid}`;
    setTesterBusy(key); setMsg(null);
    try {
      const r = await adminSlotPlayerSpins(t.uid, action, n);
      setMsg({ ok: true, text: action === "reset" ? `${t.name}'s day is reset. Their next open gives a fresh plan and full spins.` : `${n} spins added for ${t.name}. Today they have ${r.spinsTotal} spins, ${r.spinsUsed} played.${slot.testing ? "" : " Test mode is off, so these pay real points."}` });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not update the spins" }); }
    finally { setTesterBusy(null); }
  }

  // the Grand
  const candidates = useMemo(() => investors.filter((i) => !i.isAdmin && i.deployed >= slot.grand.minActive).sort((a, b) => b.deployed - a.deployed), [investors, slot.grand.minActive]);
  const [pick, setPick] = useState("");
  const [grandBusy, setGrandBusy] = useState(false);
  async function arm(uid: string | null) {
    setGrandBusy(true); setMsg(null);
    try {
      await adminArmGrand(uid);
      setPick("");
      setMsg({ ok: true, text: uid ? `Armed. ${nameOf(uid)}'s next spin pays the Grand, then the switch turns itself off.` : "Disarmed. Nobody is lined up for the Grand." });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not arm the Grand" }); }
    finally { setGrandBusy(false); }
  }

  async function save() {
    const d = {} as DailySettings;
    for (const k of Object.keys(cur.daily) as (keyof DailySettings)[]) {
      const v = int(cur.daily[k]);
      if (!Number.isFinite(v) || v < 0) return setMsg({ ok: false, text: "Every daily-spin field needs a whole number." });
      d[k] = v;
    }
    if (d.bandMax < d.bandMin) return setMsg({ ok: false, text: "The points band's high end must be at least its low end." });
    if (d.cap < d.baseSpins) return setMsg({ ok: false, text: "The daily cap can't be lower than the base spins." });
    if (d.everydayHwOneIn < 1) return setMsg({ ok: false, text: "Everyday Hold & Win must be 1 in at least 1 spin." });
    const pots = {} as SlotSettings["pots"];
    for (const k of SMALL_POTS) {
      const p = { amount: int(cur.pots[k].amount), count: int(cur.pots[k].count), weeks: int(cur.pots[k].weeks) };
      if (![p.amount, p.count, p.weeks].every((n) => Number.isFinite(n) && n >= 0) || p.weeks < 1) return setMsg({ ok: false, text: `${POT_LABEL[k]}: amount and count are whole numbers, weeks is at least 1.` });
      pots[k] = p;
    }
    const grandAmount = int(cur.grandAmount), grandMin = int(cur.grandMin);
    if (!Number.isFinite(grandAmount) || grandAmount < 0 || !Number.isFinite(grandMin) || grandMin < 0) return setMsg({ ok: false, text: "Grand amount and minimum placement are whole numbers." });
    setSaving(true); setMsg(null);
    try {
      await saveSlotSettings({ status: cur.status, testing: cur.testing, paidSpins: cur.paidSpins, daily: d, pots, grand: { amount: grandAmount, minActive: grandMin } as SlotSettings["grand"], popupText: cur.popupText.trim().slice(0, 300) || DEFAULT_POPUP_TEXT });
      setDraft(null);
      setMsg({ ok: true, text: cur.status === "off" ? "Saved. Dragon Spire is hidden." : cur.status === "testers" ? "Saved. Only testers (and admins) see Dragon Spire." : "Saved. Dragon Spire is open to everyone." });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed" }); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gold" /></div>;

  // live examples for the admin, from the draft
  const ex = { ...slot.daily, baseSpins: int(cur.daily.baseSpins) || 0, perThousand: int(cur.daily.perThousand) || 0, cap: int(cur.daily.cap) || 0, minActive: int(cur.daily.minActive) || 0 };
  const bandLo = int(cur.daily.bandMin) || 0, bandHi = int(cur.daily.bandMax) || 0;
  const perWeek = potPointsPerWeek({ mini: potNum(cur.pots.mini), minor: potNum(cur.pots.minor), major: potNum(cur.pots.major) });
  const armed = slot.grand.armedUid;
  const saveBar = (
    <div className="flex flex-wrap items-center gap-3 mt-3">
      <button onClick={save} disabled={saving || !dirty || !user?.isAdmin} className="px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium disabled:opacity-50 flex items-center gap-1.5">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save</button>
      {dirty && !saving && <button onClick={() => { setDraft(null); setMsg(null); }} className="text-[11px] text-text-muted hover:text-text">Discard</button>}
      {msg && <span className={cn("text-[11px]", msg.ok ? "text-green" : "text-red")}>{msg.text}</span>}
    </div>
  );

  return (
    <>
      <Card className="mb-3">
        <CardHeader
          title="Dragon Spire"
          subtitle="Daily free spins for active members. Every spin is decided by the server; the day's points are drawn from the band below."
          right={<span className={cn("text-[10px] px-2 py-0.5 rounded-full border", slot.status === "everyone" ? "border-green/40 text-green bg-green/10" : slot.status === "testers" ? "border-[#F5C66B]/40 text-[#F5C66B] bg-[#F5C66B]/10" : "border-border text-text-muted")}>{slot.status === "everyone" ? "Open to everyone" : slot.status === "testers" ? `Testers only · ${slot.testers.length}` : "Off"}</span>}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] text-text-muted mb-1">Who can play</label>
            <div className="flex gap-1 p-1 rounded-lg bg-canvas border border-border">
              {(["off", "testers", "everyone"] as SlotStatus[]).map((s) => (
                <button key={s} type="button" onClick={() => edit({ status: s })} className={cn("flex-1 py-1.5 rounded-md text-[11px] font-medium transition", cur.status === s ? "bg-gold/15 text-gold" : "text-text-muted hover:text-text")}>
                  {s === "off" ? "Off" : s === "testers" ? "Testers only" : "Everyone"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-text-muted mb-1">Test mode</label>
            <button type="button" onClick={() => edit({ testing: !cur.testing })} className={cn("w-full py-2 rounded-lg text-[11px] font-medium border transition", cur.testing ? "bg-[#7FE8C4]/15 border-[#7FE8C4]/40 text-[#7FE8C4]" : "bg-canvas border-border text-text-muted")}>
              {cur.testing ? "On · spins pay nothing, pots and Grand don't drop" : "Off · real Game Points"}
            </button>
          </div>
          <div>
            <label className="block text-[11px] text-text-muted mb-1">Paid spins (staking Game Points)</label>
            <button type="button" onClick={() => edit({ paidSpins: !cur.paidSpins })} className={cn("w-full py-2 rounded-lg text-[11px] font-medium border transition", cur.paidSpins ? "bg-gold/15 border-gold/40 text-gold" : "bg-canvas border-border text-text-muted")}>
              {cur.paidSpins ? "On · members can also bet their points" : "Off · free spins only"}
            </button>
          </div>
        </div>
        {saveBar}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        <Card>
          <CardHeader title="Daily free spins" subtitle="Spins appear when a member opens the game. Unused spins are gone at Manila midnight." right={<Gift className="w-4 h-4 text-gold" />} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Minimum active placement (₱)" value={cur.daily.minActive} onChange={(v) => editDaily("minActive", v)} />
            <Field label="Spins at the minimum" value={cur.daily.baseSpins} onChange={(v) => editDaily("baseSpins", v)} />
            <Field label="Extra spins per further ₱1,000" value={cur.daily.perThousand} onChange={(v) => editDaily("perThousand", v)} />
            <Field label="Daily cap (spins)" value={cur.daily.cap} onChange={(v) => editDaily("cap", v)} />
          </div>
          <p className="text-[10px] text-text-subtle m-0 mt-2 leading-relaxed">
            ₱{ex.minActive.toLocaleString()} → {spinsFor(ex.minActive, ex)} spins · ₱{(ex.minActive + 1000).toLocaleString()} → {spinsFor(ex.minActive + 1000, ex)} · ₱5,000 → {spinsFor(5000, ex)} · ₱9,000 → {spinsFor(9000, ex)} · ₱50,000 → {spinsFor(50000, ex)}. Below the minimum: no spins, the game shows a message.
          </p>
          <p className="text-[12px] font-medium m-0 mt-4 mb-1">Points per 10 spins <span className="font-normal text-text-subtle">· the day&apos;s total is drawn from this band and scaled by the member&apos;s spins</span></p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Low end (GP)" value={cur.daily.bandMin} onChange={(v) => editDaily("bandMin", v)} />
            <Field label="High end (GP)" value={cur.daily.bandMax} onChange={(v) => editDaily("bandMax", v)} />
          </div>
          <p className="text-[10px] text-text-subtle m-0 mt-2 leading-relaxed">
            10 spins win {bandLo.toLocaleString()}–{bandHi.toLocaleString()} GP a day · 50 spins win {(bandLo * 5).toLocaleString()}–{(bandHi * 5).toLocaleString()}. The wins are spread over the day&apos;s spins like a real slot: blanks, small hits, a few big ones. Pots and the Grand pay on top.
          </p>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Field label="Everyday Hold & Win · 1 in N spins" value={cur.daily.everydayHwOneIn} onChange={(v) => editDaily("everydayHwOneIn", v)} hint="Small medallions paid from the band, so members learn the round" />
            <div>
              <label className="block text-[11px] text-text-muted mb-1">Paytable</label>
              <p className="text-[10px] text-text-subtle m-0 leading-relaxed bg-canvas border border-border rounded-md px-3 py-2">Fixed. A pattern always pays the same points; the server picks a day whose real wins add up inside the band, nothing is stretched. The paytable scale follows the band&apos;s middle.</p>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-[11px] text-text-muted mb-1">Games Central pop-up text</label>
            <textarea value={cur.popupText} maxLength={300} rows={2} onChange={(e) => edit({ popupText: e.target.value })} className={cn(input, "resize-y")} />
            <p className="text-[9px] text-text-subtle m-0 mt-1">Shown under the spin count every visit until the member claims the day. The pop-up adds “You have ₱X active today.”</p>
          </div>
          {saveBar}
        </Card>

        <Card>
          <CardHeader title="Jackpot drops" subtitle="Each player gets these on their own schedule, at random moments. Fixed amounts, paid on top of the band." right={<Coins className="w-4 h-4 text-gold" />} />
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-[12px] min-w-[360px]">
              <thead><tr className="text-[10px] text-text-subtle text-left"><th className="font-medium py-1 pr-2">Pot</th><th className="font-medium py-1 pr-2">Amount (GP)</th><th className="font-medium py-1 pr-2">Times</th><th className="font-medium py-1 pr-2">Every N weeks</th></tr></thead>
              <tbody>
                {SMALL_POTS.map((k) => (
                  <tr key={k} className="border-t border-border">
                    <td className="py-1.5 pr-2 font-semibold">{POT_LABEL[k]}</td>
                    <td className="py-1.5 pr-2"><input type="number" min={0} value={cur.pots[k].amount} onChange={(e) => editPot(k, "amount", e.target.value)} className={cn(num, "w-24")} aria-label={`${POT_LABEL[k]} amount`} /></td>
                    <td className="py-1.5 pr-2"><input type="number" min={0} value={cur.pots[k].count} onChange={(e) => editPot(k, "count", e.target.value)} className={cn(num, "w-16")} aria-label={`${POT_LABEL[k]} times`} /></td>
                    <td className="py-1.5 pr-2"><input type="number" min={1} value={cur.pots[k].weeks} onChange={(e) => editPot(k, "weeks", e.target.value)} className={cn(num, "w-16")} aria-label={`${POT_LABEL[k]} weeks`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-text-subtle m-0 mt-2 leading-relaxed">
            Each active player receives about <span className="text-text font-mono">{Math.round(perWeek).toLocaleString()} GP</span> a week in jackpots on top of their daily band. A drop only lands on a spin, so a member who doesn&apos;t play that week misses it. Weeks run Monday to Sunday, Manila time.
          </p>
          <p className="text-[12px] font-medium m-0 mt-4 mb-1">Grand</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Grand amount (GP)" value={cur.grandAmount} onChange={(v) => edit({ grandAmount: v })} />
            <Field label="Eligible from (₱ active)" value={cur.grandMin} onChange={(v) => edit({ grandMin: v })} />
          </div>
          {saveBar}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        <Card>
          <CardHeader title="Grand jackpot winner" subtitle={`Members with ₱${slot.grand.minActive.toLocaleString()} or more active. Arm one and their next spin fills the grid and pays ${slot.grand.amount.toLocaleString()} GP; the switch turns off by itself.`} right={<Crown className="w-4 h-4 text-gold" />} />
          {armed ? (
            <div className="flex items-center gap-3 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2.5 mb-3">
              <Crown className="w-4 h-4 text-gold shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] m-0 text-text truncate">Armed on <b>{nameOf(armed)}</b></p>
                <p className="text-[10px] text-text-subtle m-0">Pays {slot.grand.amount.toLocaleString()} GP on their next spin{slot.grand.armedAt ? ` · armed ${new Date(slot.grand.armedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}` : ""}{slot.testing ? " · test mode is on, so it will not fire until test mode is off" : ""}</p>
              </div>
              <button onClick={() => arm(null)} disabled={grandBusy} className="shrink-0 px-3 py-1.5 rounded-lg border border-border-strong text-[11px] text-text disabled:opacity-50">{grandBusy ? "…" : "Disarm"}</button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <select value={pick} onChange={(e) => setPick(e.target.value)} className={cn(input, "flex-1")} aria-label="Pick the Grand winner">
                <option value="">{candidates.length ? `Pick a member (${candidates.length} eligible)…` : investors.length ? "No member meets the minimum yet" : "Loading members…"}</option>
                {candidates.map((c) => <option key={c.uid} value={c.uid}>{c.name} · ₱{c.deployed.toLocaleString()} in {c.activePlansCount} active placement{c.activePlansCount === 1 ? "" : "s"}</option>)}
              </select>
              <button onClick={() => pick && arm(pick)} disabled={!pick || grandBusy} className="px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">{grandBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crown className="w-3.5 h-3.5" />} Arm the Grand</button>
            </div>
          )}
          <p className="text-[11px] font-medium m-0 mb-1 flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 text-gold" /> Past winners</p>
          {grandHistory.length === 0 ? <p className="text-[11px] text-text-subtle m-0">Nobody has won the Grand yet.</p> : (
            <div className="flex flex-col gap-1">
              {grandHistory.slice(0, 10).map((w) => (
                <div key={`${w.uid}-${w.at}`} className="flex items-center gap-2 bg-canvas border border-border rounded-lg px-3 py-2 text-[11px]">
                  <span className="flex-1 min-w-0 truncate text-text">{nameOf(w.uid)}</span>
                  <span className="font-mono text-gold">{w.amount.toLocaleString()} GP</span>
                  <span className="text-text-subtle">{new Date(w.at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" })}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Today" subtitle="Live counts since Manila midnight" right={<Coins className="w-4 h-4 text-gold" />} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Tile label="Spins" value={stats ? stats.spins.toLocaleString() : "—"} sub={stats?.testSpins ? `+${stats.testSpins.toLocaleString()} test` : "free"} />
            <Tile label="Points paid" value={stats ? stats.paid.toLocaleString() : "—"} sub="GP, pots included" tone="text-gold" />
            <Tile label="Hold & Win" value={stats ? stats.holdWins.toLocaleString() : "—"} sub="rounds" />
            <Tile label="Jackpots" value={stats ? stats.pots.toLocaleString() : "—"} sub={stats ? `${stats.potPoints.toLocaleString()} GP` : "GP"} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Testers" subtitle={`While the game is “Testers only”, only these members (and admins) can see and play it. Reset gives a tester a fresh day; Add puts extra spins into today's plan${slot.testing ? " (test mode: they pay nothing)" : " (test mode is off: they pay real points)"}.`} right={<FlaskConical className="w-4 h-4 text-[#F5C66B]" />} />
        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 text-text-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a member to add…" className="w-full bg-canvas border border-border rounded-lg pl-8 pr-3 py-2 text-[11px] text-text outline-none focus:border-gold/40 placeholder:text-text-subtle" />
          {results.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-card border border-border-strong rounded-lg shadow-xl shadow-black/50 overflow-hidden">
              {results.map((r) => (
                <button key={r.uid} onClick={() => { setTesters([...slot.testers, r.uid], r.uid); setSearch(""); }} disabled={testerBusy === r.uid} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-card-elev transition">
                  <div className="flex-1 min-w-0"><p className="text-[11px] text-text m-0 truncate">{r.name}</p><p className="text-[9px] text-text-subtle m-0 truncate">{r.email}</p></div>
                  {testerBusy === r.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gold" /> : <Plus className="w-3.5 h-3.5 text-gold" />}
                </button>
              ))}
            </div>
          )}
        </div>
        {testerRows.length === 0 ? <p className="text-[11px] text-text-subtle m-0">No testers yet. Search a member above to add one.</p> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-1">
            {testerRows.map((t) => (
              <div key={t.uid} className="flex flex-wrap items-center gap-2 bg-canvas border border-border rounded-lg px-3 py-2">
                <FlaskConical className="w-3.5 h-3.5 text-[#F5C66B] shrink-0" />
                <div className="flex-1 min-w-[120px]"><p className="text-[11px] text-text m-0 truncate">{t.name}</p>{t.email && <p className="text-[9px] text-text-subtle m-0 truncate">{t.email}</p>}</div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => testerSpins(t, "reset")} disabled={testerBusy !== null} className="px-2 py-1 rounded-md border border-border-strong text-[10px] text-text disabled:opacity-50">{testerBusy === `reset-${t.uid}` ? "…" : "Reset day"}</button>
                  <input type="number" min={1} max={200} value={addSpins[t.uid] ?? "10"} onChange={(e) => setAddSpins({ ...addSpins, [t.uid]: e.target.value })} className={cn(num, "w-14 py-1 px-2")} aria-label={`Spins to add for ${t.name}`} />
                  <button onClick={() => testerSpins(t, "add")} disabled={testerBusy !== null} className="px-2 py-1 rounded-md bg-gold/15 text-gold text-[10px] font-medium disabled:opacity-50">{testerBusy === `add-${t.uid}` ? "…" : "Add spins"}</button>
                  <button onClick={() => setTesters(slot.testers.filter((u) => u !== t.uid), `rm-${t.uid}`)} disabled={testerBusy !== null} className="p-1 text-text-subtle hover:text-red" aria-label={`Remove ${t.name}`}><X className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

const potNum = (p: { amount: string; count: string; weeks: string }) => ({ amount: int(p.amount) || 0, count: int(p.count) || 0, weeks: Math.max(1, int(p.weeks) || 1) });

function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div>
      <label className="block text-[11px] text-text-muted mb-1">{label}</label>
      <input type="number" min={0} value={value} onChange={(e) => onChange(e.target.value)} className={num} />
      {hint && <p className="text-[9px] text-text-subtle m-0 mt-1">{hint}</p>}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-canvas border border-border rounded-lg px-3 py-2.5">
      <p className="text-[9px] uppercase tracking-wider text-text-subtle m-0 mb-1">{label}</p>
      <p className={cn("text-[14px] font-mono font-medium m-0 tabular-nums", tone)}>{value}</p>
      {sub && <p className="text-[9px] text-text-subtle m-0 mt-0.5">{sub}</p>}
    </div>
  );
}
