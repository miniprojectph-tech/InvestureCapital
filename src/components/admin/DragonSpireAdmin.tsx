"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, X, Save, FlaskConical, Coins } from "lucide-react";
import { Card, CardHeader } from "@/components/Card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { listInvestors, type InvestorRow } from "@/lib/adminQueries";
import {
  useSlotSettings, saveSlotSettings, saveHubGames, useSlotPots, useSlotStatsToday, slotSimulate, adminSetSlotPots,
  POT_KEYS, POT_LABEL, DEFAULT_BETS, DEFAULT_POT_SEED, DEFAULT_POT_FEED,
  type SlotStatus, type SimResult, type PotKey, type HubGames,
} from "@/lib/slot";

const input = "bg-canvas border border-border rounded-md px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40 w-full";
const num = cn(input, "font-mono");

/** Which games appear on Games Central. Dragon Spire has its own three-way status in the tab beside this. */
export function HubGamesCard() {
  const { hub, loading } = useSlotSettings();
  const [draft, setDraft] = useState<HubGames | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cur = draft ?? hub;
  const dirty = JSON.stringify(cur) !== JSON.stringify(hub);
  const rows: { key: keyof HubGames; name: string; hint: string }[] = [
    { key: "reef", name: "Investure Reef (fishing)", hint: "Off hides the card and blocks /play. Game Points, rewards and rankings are untouched." },
    { key: "tongits", name: "Tongits", hint: "Off hides the card and blocks /tongits." },
    { key: "color", name: "Color Game", hint: "Off hides the card and blocks /color-game." },
  ];
  async function save() {
    setSaving(true); setMsg(null);
    try { await saveHubGames(cur); setDraft(null); setMsg({ ok: true, text: "Saved. The hub updates for members straight away." }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed" }); }
    finally { setSaving(false); }
  }
  return (
    <Card className="mb-3">
      <CardHeader title="Games on the hub" subtitle="Switch a game off to hide it from Games Central and block its page. Dragon Spire is controlled from its own tab." />
      {loading ? <Loader2 className="w-4 h-4 animate-spin text-text-subtle" /> : (
        <div className="flex flex-col">
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
        {dirty && !saving && <button onClick={() => { setDraft(null); setMsg(null); }} className="text-[11px] text-text-muted hover:text-text">Discard</button>}
        {msg && <span className={cn("text-[11px]", msg.ok ? "text-green" : "text-red")}>{msg.text}</span>}
      </div>
    </Card>
  );
}

/** Dragon Spire: who can play, test mode, testers, bets, pots, today's numbers, and the maths simulator. */
export function DragonSpireAdmin() {
  const { user, demoMode } = useAuth();
  const { slot, loading } = useSlotSettings();
  const potsLive = useSlotPots();
  const stats = useSlotStatsToday();
  const [status, setStatus] = useState<SlotStatus | null>(null);
  const [testing, setTesting] = useState<boolean | null>(null);
  const [bets, setBets] = useState<string | null>(null);
  const [seed, setSeed] = useState<Record<PotKey, string> | null>(null);
  const [feed, setFeed] = useState<Record<PotKey, string> | null>(null);
  const [refBet, setRefBet] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sim, setSim] = useState<SimResult | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const [potEdit, setPotEdit] = useState<Record<PotKey, string> | null>(null);
  const [potBusy, setPotBusy] = useState(false);

  const curStatus = status ?? slot.status;
  const curTesting = testing ?? slot.testing;
  const curBets = bets ?? (slot.engine?.bets ?? DEFAULT_BETS).join(", ");
  const curSeed = seed ?? Object.fromEntries(POT_KEYS.map((k) => [k, String(slot.engine?.pots?.seed?.[k] ?? DEFAULT_POT_SEED[k])])) as Record<PotKey, string>;
  const curFeed = feed ?? Object.fromEntries(POT_KEYS.map((k) => [k, String(((slot.engine?.pots?.feed?.[k] ?? DEFAULT_POT_FEED[k]) * 100).toFixed(2).replace(/\.?0+$/, ""))])) as Record<PotKey, string>;
  const curRefBet = refBet ?? String(slot.engine?.pots?.refBet ?? 100);
  const dirty = status !== null || testing !== null || bets !== null || seed !== null || feed !== null || refBet !== null;

  // testers
  const [investors, setInvestors] = useState<InvestorRow[]>([]);
  const [search, setSearch] = useState("");
  const [testerBusy, setTesterBusy] = useState<string | null>(null);
  useEffect(() => {
    const { db } = getFirebase();
    if (!db || demoMode) return;
    listInvestors(db, 500).then(setInvestors).catch(() => {});
  }, [demoMode]);
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

  async function save() {
    const betList = curBets.split(/[,\s]+/).map((b) => Math.floor(Number(b))).filter((b) => Number.isFinite(b) && b > 0);
    if (betList.length === 0) return setMsg({ ok: false, text: "Enter at least one bet, e.g. 5, 10, 25." });
    const seedN = {} as Record<PotKey, number>, feedN = {} as Record<PotKey, number>;
    for (const k of POT_KEYS) {
      seedN[k] = Math.floor(Number(curSeed[k])); feedN[k] = Number(curFeed[k]) / 100;
      if (!Number.isFinite(seedN[k]) || seedN[k] < 0) return setMsg({ ok: false, text: `${POT_LABEL[k]} seed must be a number of Game Points.` });
      if (!Number.isFinite(feedN[k]) || feedN[k] < 0 || feedN[k] > 0.2) return setMsg({ ok: false, text: `${POT_LABEL[k]} feed is a percent between 0 and 20.` });
    }
    const ref = Math.floor(Number(curRefBet));
    if (!Number.isFinite(ref) || ref < 1) return setMsg({ ok: false, text: "The full-pot bet must be at least 1 GP." });
    setSaving(true); setMsg(null);
    try {
      await saveSlotSettings({ status: curStatus, testing: curTesting, engine: { ...(slot.engine ?? {}), bets: Array.from(new Set(betList)).sort((a, b) => a - b), pots: { seed: seedN, feed: feedN, refBet: ref } } });
      setStatus(null); setTesting(null); setBets(null); setSeed(null); setFeed(null); setRefBet(null);
      setMsg({ ok: true, text: curStatus === "off" ? "Saved. Dragon Spire is hidden." : curStatus === "testers" ? "Saved. Only testers (and admins) see Dragon Spire." : "Saved. Dragon Spire is open to everyone." });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed" }); }
    finally { setSaving(false); }
  }

  async function runSim() {
    setSimBusy(true); setMsg(null);
    try { setSim(await slotSimulate(50000)); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Simulation failed" }); } finally { setSimBusy(false); }
  }

  async function savePots() {
    if (!potEdit) return;
    const pots: Partial<Record<PotKey, number>> = {};
    for (const k of POT_KEYS) { const v = Math.floor(Number(potEdit[k])); if (!Number.isFinite(v) || v < 0) return setMsg({ ok: false, text: `${POT_LABEL[k]}: enter a number.` }); pots[k] = v; }
    setPotBusy(true); setMsg(null);
    try { await adminSetSlotPots(pots); setPotEdit(null); setMsg({ ok: true, text: "Pots updated." }); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not update the pots" }); } finally { setPotBusy(false); }
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gold" /></div>;

  return (
    <>
      <Card className="mb-3">
        <CardHeader
          title="Dragon Spire"
          subtitle="Who can play, test mode and the bet sizes. Every spin is decided by the server."
          right={<span className={cn("text-[10px] px-2 py-0.5 rounded-full border", slot.status === "everyone" ? "border-green/40 text-green bg-green/10" : slot.status === "testers" ? "border-[#F5C66B]/40 text-[#F5C66B] bg-[#F5C66B]/10" : "border-border text-text-muted")}>{slot.status === "everyone" ? "Open to everyone" : slot.status === "testers" ? `Testers only · ${slot.testers.length}` : "Off"}</span>}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] text-text-muted mb-1">Who can play</label>
            <div className="flex gap-1 p-1 rounded-lg bg-canvas border border-border">
              {(["off", "testers", "everyone"] as SlotStatus[]).map((s) => (
                <button key={s} type="button" onClick={() => { setStatus(s); setMsg(null); }} className={cn("flex-1 py-1.5 rounded-md text-[11px] font-medium transition", curStatus === s ? "bg-gold/15 text-gold" : "text-text-muted hover:text-text")}>
                  {s === "off" ? "Off" : s === "testers" ? "Testers only" : "Everyone"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-text-muted mb-1">Test mode</label>
            <button type="button" onClick={() => { setTesting(!curTesting); setMsg(null); }} className={cn("w-full py-2 rounded-lg text-[11px] font-medium border transition", curTesting ? "bg-[#7FE8C4]/15 border-[#7FE8C4]/40 text-[#7FE8C4]" : "bg-canvas border-border text-text-muted")}>
              {curTesting ? "On · spins are free and pay nothing" : "Off · real Game Points"}
            </button>
          </div>
          <div>
            <label className="block text-[11px] text-text-muted mb-1">Bet sizes (GP)</label>
            <input value={curBets} onChange={(e) => { setBets(e.target.value); setMsg(null); }} className={num} placeholder="5, 10, 25, 50, 100, 250, 500" />
          </div>
        </div>

        <p className="text-[12px] font-medium m-0 mt-4 mb-1">Jackpot pots <span className="font-normal text-text-subtle">· seed = where a pot restarts after it is won · feed = share of every bet added to the pot</span></p>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-[12px] min-w-[420px]">
            <thead><tr className="text-[10px] text-text-subtle text-left"><th className="font-medium py-1 pr-2">Pot</th><th className="font-medium py-1 pr-2">Live now</th><th className="font-medium py-1 pr-2">Seed (GP)</th><th className="font-medium py-1 pr-2">Feed (% of bet)</th></tr></thead>
            <tbody>
              {POT_KEYS.map((k) => (
                <tr key={k} className="border-t border-border">
                  <td className="py-1.5 pr-2 font-semibold">{POT_LABEL[k]}</td>
                  <td className="py-1.5 pr-2 font-mono text-gold">{Math.round(potsLive.pots[k]).toLocaleString()}</td>
                  <td className="py-1.5 pr-2"><input type="number" min={0} value={curSeed[k]} onChange={(e) => { setSeed({ ...curSeed, [k]: e.target.value }); setMsg(null); }} className={cn(num, "w-28")} aria-label={`${POT_LABEL[k]} seed`} /></td>
                  <td className="py-1.5 pr-2"><input type="number" min={0} step={0.1} value={curFeed[k]} onChange={(e) => { setFeed({ ...curFeed, [k]: e.target.value }); setMsg(null); }} className={cn(num, "w-24")} aria-label={`${POT_LABEL[k]} feed percent`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-text-muted">
          A bet of <input type="number" min={1} value={curRefBet} onChange={(e) => { setRefBet(e.target.value); setMsg(null); }} className={cn(num, "w-20 py-1")} aria-label="Full-pot bet" /> GP wins the full pot; smaller bets win a proportional share.
        </label>

        <div className="flex flex-wrap items-center gap-3 mt-3">
          <button onClick={save} disabled={saving || !dirty || !user?.isAdmin} className="px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium disabled:opacity-50 flex items-center gap-1.5">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save</button>
          {dirty && !saving && <button onClick={() => { setStatus(null); setTesting(null); setBets(null); setSeed(null); setFeed(null); setRefBet(null); setMsg(null); }} className="text-[11px] text-text-muted hover:text-text">Discard</button>}
          {msg && <span className={cn("text-[11px]", msg.ok ? "text-green" : "text-red")}>{msg.text}</span>}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader title="Testers" subtitle="While the game is “Testers only”, only these members (and admins) can see and play it." />
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
            <div className="flex flex-col gap-1">
              {testerRows.map((t) => (
                <div key={t.uid} className="flex items-center gap-2 bg-canvas border border-border rounded-lg px-3 py-2">
                  <FlaskConical className="w-3.5 h-3.5 text-[#F5C66B] shrink-0" />
                  <div className="flex-1 min-w-0"><p className="text-[11px] text-text m-0 truncate">{t.name}</p>{t.email && <p className="text-[9px] text-text-subtle m-0 truncate">{t.email}</p>}</div>
                  <button onClick={() => setTesters(slot.testers.filter((u) => u !== t.uid), `rm-${t.uid}`)} disabled={testerBusy === `rm-${t.uid}`} className="p-1 text-text-subtle hover:text-red" aria-label={`Remove ${t.name}`}><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Today and the maths" subtitle="Live counts since midnight, and a 50,000-spin simulation of the current settings" right={<Coins className="w-4 h-4 text-gold" />} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <Tile label="Spins" value={stats ? stats.spins.toLocaleString() : "—"} sub={stats?.testSpins ? `+${stats.testSpins.toLocaleString()} test` : "paid"} />
            <Tile label="Wagered" value={stats ? stats.wagered.toLocaleString() : "—"} sub="GP" />
            <Tile label="Paid out" value={stats ? stats.paid.toLocaleString() : "—"} sub={stats && stats.wagered > 0 ? `${Math.round((stats.paid / stats.wagered) * 100)}% of wagered` : "GP"} tone="text-gold" />
            <Tile label="Features" value={stats ? `${stats.freeSpins} · ${stats.holdWins}` : "—"} sub="free spins · hold & win" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={runSim} disabled={simBusy} className="px-3 py-1.5 rounded-lg border border-border-strong text-[11px] text-text flex items-center gap-1.5 disabled:opacity-50">{simBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />} Simulate 50,000 spins</button>
            {sim && (
              <span className="text-[11px] text-text-muted">
                Return <b className="text-text font-mono">{(sim.rtp * 100).toFixed(1)}%</b> · hits <b className="text-text font-mono">{(sim.hitRate * 100).toFixed(0)}%</b> · free spins 1 in <b className="text-text font-mono">{Math.round(1 / Math.max(sim.freeSpinRate, 1e-9))}</b> · Hold &amp; Win 1 in <b className="text-text font-mono">{Math.round(1 / Math.max(sim.holdWinRate, 1e-9))}</b> · biggest <b className="text-text font-mono">{Math.round(sim.maxWin)}×</b>
              </span>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-border">
            <p className="text-[11px] font-medium m-0 mb-1.5">Set the pots by hand <span className="font-normal text-text-subtle">· e.g. to seed them before launch</span></p>
            <div className="flex flex-wrap items-end gap-2">
              {POT_KEYS.map((k) => (
                <label key={k} className="text-[10px] text-text-subtle">{POT_LABEL[k]}<input type="number" min={0} value={potEdit?.[k] ?? String(Math.round(potsLive.pots[k]))} onChange={(e) => setPotEdit({ ...(potEdit ?? Object.fromEntries(POT_KEYS.map((p) => [p, String(Math.round(potsLive.pots[p]))])) as Record<PotKey, string>), [k]: e.target.value })} className={cn(num, "w-24 py-1 mt-0.5")} /></label>
              ))}
              <button onClick={savePots} disabled={!potEdit || potBusy} className="px-3 py-1.5 rounded-lg bg-gold/15 text-gold text-[11px] font-medium disabled:opacity-40">{potBusy ? "Saving…" : "Apply"}</button>
            </div>
          </div>
        </Card>
      </div>
    </>
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
