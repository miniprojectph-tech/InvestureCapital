"use client";

import { useMemo, useState } from "react";
import { Loader2, Save, Play, AlertCircle, CheckCircle2, Plus, Trash2, X, Send } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { AdminTabs, useHashTab } from "@/components/admin/AdminTabs";
import { Card, CardHeader } from "@/components/Card";
import { SantaFlyby, SantaChip } from "@/components/christmas/SantaFlyby";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { useSettings, saveSettings } from "@/lib/settings";
import { useNow } from "@/lib/compplan";
import {
  cleanChristmas, christmasActive, christmasCountdown, manilaDate, giftLabel, useXmasAdminDoc, useAllXmasGifts,
  adminXmasSavePool, adminXmasLoadSent, GIFT_KIND_LABEL,
  type ChristmasConfig, type ChristmasMode, type PoolItem, type GiftKind, type XmasStats, type XmasGift,
} from "@/lib/christmas";

type Tab = "flyby" | "letters" | "pool" | "gifts";
const TAB_IDS: Tab[] = ["flyby", "letters", "pool", "gifts"];

const MODES: { id: ChristmasMode; label: string; hint: string }[] = [
  { id: "off", label: "Off", hint: "Nobody sees Santa or the letters." },
  { id: "admins", label: "Admins only (test)", hint: "Only admins see Santa and get letters, starting now; the dates are ignored. Gifts admins redeem are real (wallet credit, points, load)." },
  { id: "everyone", label: "Everyone", hint: "Every member sees Santa from the start date to the end date (Manila time)." },
];

const fmt = (d: string) => new Date(`${d}T00:00:00+08:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
const when = (ms: number) => new Date(ms).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
const peso = (n: number) => `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^FirebaseError:\s*/, "") || "Something went wrong. Try again.";
const input = "bg-canvas border border-border rounded-md px-3 py-2 text-[13px] text-text outline-none focus:border-[#F5C66B]/50";

type PoolRow = { id: string; kind: GiftKind; amount: string; chance: string; limit: string };
const toRows = (items: PoolItem[] | undefined): PoolRow[] =>
  (items ?? []).map((x) => ({ id: x.id, kind: x.kind, amount: String(x.amount), chance: String(x.chance), limit: x.limit == null ? "" : String(x.limit) }));
const newId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Admin › Christmas: Santa's flyby, the CHRISTMAS letter game, its gift pool, and the gifts given (load to send). */
export default function AdminChristmasPage() {
  const { user } = useAuth();
  const { settings, loading } = useSettings();
  const [tab, setTab] = useHashTab<Tab>(TAB_IDS, "flyby");
  const stored = useMemo(() => cleanChristmas(settings.christmas), [settings.christmas]);
  const [draft, setDraft] = useState<ChristmasConfig | null>(null);
  const cfg = draft ?? stored;
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [play, setPlay] = useState(0);
  const now = useNow(60_000);

  const { data: poolDoc } = useXmasAdminDoc<{ items?: PoolItem[]; updatedAt?: number }>("pool");
  const { data: stockDoc } = useXmasAdminDoc<{ given?: Record<string, number> }>("stock");
  const { data: stats } = useXmasAdminDoc<XmasStats>("stats");
  const { gifts, loaded: giftsLoaded } = useAllXmasGifts(500);
  const toSend = gifts.filter((g) => g.kind === "load" && g.status === "to_send").length;

  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(stored);
  const badDates = cfg.endDate < cfg.startDate || cfg.redeemUntil < cfg.endDate;
  const edit = (patch: Partial<ChristmasConfig>) => { setMsg(null); setDraft({ ...cfg, ...patch }); };

  const save = async () => {
    if (badDates) { setMsg({ ok: false, text: "Check the dates: end on or after start, redeem-until on or after the end." }); return; }
    const { db } = getFirebase();
    if (!db || !user) return;
    setSaving(true); setMsg(null);
    try {
      await saveSettings(db, { christmas: cfg }, user.uid);
      setDraft(null);
      setMsg({ ok: true, text: "Saved" });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally { setSaving(false); }
  };

  const membersNow = christmasActive({ ...stored, mode: stored.mode === "admins" ? "off" : stored.mode }, false, now);
  const today = manilaDate(now);
  const status =
    stored.mode === "off" ? "Off"
    : stored.mode === "admins" ? "Admins only (test)"
    : membersNow ? "Live for everyone"
    : today < stored.startDate ? `Starts ${fmt(stored.startDate)}`
    : "Ended";
  const c = christmasCountdown(cfg, now);
  const countdownText = c.phase === "days" ? `${c.days} day${c.days === 1 ? "" : "s"} until Christmas` : c.phase === "eve" ? `Christmas Eve, ${c.hours} h ${c.minutes} min to go` : c.phase === "day" ? "Christmas Day: \"Merry Christmas!\" with confetti" : "After Christmas: \"Merry Christmas and a happy New Year\"";

  const settingsTab = tab === "flyby" || tab === "letters";

  return (
    <div>
      <TopHeader title="Christmas" subtitle="Santa's flyby, the CHRISTMAS letters and the gifts in the Community Room" />
      <AdminTabs
        tabs={[
          { id: "flyby" as Tab, label: "Santa flyby", hint: status, hintTone: stored.mode === "off" ? "muted" : membersNow || stored.mode === "admins" ? "ok" : "warn" },
          { id: "letters" as Tab, label: "Letter game", hint: stored.letters ? "on" : "off", hintTone: stored.letters ? "ok" : "muted" },
          { id: "pool" as Tab, label: "Gift pool", count: poolDoc?.items?.length ?? 0 },
          { id: "gifts" as Tab, label: "Gifts given", count: gifts.length, attention: toSend > 0, hint: toSend ? `${toSend} load to send` : null, hintTone: "warn" },
        ]}
        value={tab}
        onChange={(t) => { setTab(t); setMsg(null); }}
        right={settingsTab ? (
          <>
            {msg && <span className={cn("text-[11px] flex items-center gap-1", msg.ok ? "text-green" : "text-red")}>{msg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}{msg.text}</span>}
            {dirty && !msg && <span className="text-[10px] px-2 py-1 rounded-full bg-[#F5C66B]/10 border border-[#F5C66B]/30 text-[#F5C66B]">Unsaved changes</span>}
            <button
              onClick={save}
              disabled={saving || !dirty || loading}
              className="px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium flex items-center gap-2 hover:brightness-110 transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? "Saving…" : "Save changes"}
            </button>
          </>
        ) : null}
      />

      {tab === "flyby" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card>
            <CardHeader title="Who sees Santa" subtitle="Santa flies across the Community Room once a day, drops a present, and it opens into the countdown card." />
            <div className="flex flex-col gap-2">
              {MODES.map((m) => (
                <label key={m.id} className={cn("flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition", cfg.mode === m.id ? "border-[#F5C66B]/50 bg-[#F5C66B]/5" : "border-border hover:bg-card-elev/50")}>
                  <input type="radio" name="xmas-mode" className="mt-1 accent-[#F5C66B]" checked={cfg.mode === m.id} onChange={() => edit({ mode: m.id })} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-text">{m.label}</span>
                    <span className="block text-[11px] text-text-muted">{m.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-text-muted">Start date</span>
                <input type="date" value={cfg.startDate} onChange={(e) => e.target.value && edit({ startDate: e.target.value })} className={input} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-text-muted">End date</span>
                <input type="date" value={cfg.endDate} onChange={(e) => e.target.value && edit({ endDate: e.target.value })} className={cn(input, cfg.endDate < cfg.startDate && "border-red/60")} />
              </label>
            </div>
            {cfg.endDate < cfg.startDate && <p className="text-[11px] text-red mt-1.5 m-0">The end date must be on or after the start date.</p>}
            <p className="text-[11px] text-text-subtle mt-2 m-0">Dates are Manila time. Santa flies by himself the first time a member opens the Community Room each day; the 🛷 chip in the room header replays him any time.</p>
          </Card>

          <Card>
            <CardHeader title="Preview" subtitle="Plays here on this page only; members don't see it." />
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={() => setPlay((n) => n + 1)} className="px-4 py-2 rounded-lg bg-[#F5C66B] text-[#2A1D05] text-[12px] font-semibold flex items-center gap-2 hover:brightness-110 transition">
                <Play className="w-3.5 h-3.5" /> Play Santa
              </button>
              <span className="text-[11px] text-text-muted">Header chip:</span>
              <SantaChip cfg={cfg} onClick={() => setPlay((n) => n + 1)} />
            </div>
            <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-1.5 text-[12px]">
              <dt className="text-text-muted">Status</dt><dd className="m-0 text-text">{status}</dd>
              <dt className="text-text-muted">Season</dt><dd className="m-0 text-text">{fmt(stored.startDate)} – {fmt(stored.endDate)}</dd>
              <dt className="text-text-muted">Card today</dt><dd className="m-0 text-text">{countdownText}</dd>
              <dt className="text-text-muted">Sound</dt><dd className="m-0 text-text">Sleigh bells, unless the member turned game sounds off on their device</dd>
            </dl>
            <p className="text-[11px] text-text-subtle mt-3 m-0">Phones only allow sound after the first tap on the page, so the very first flyby after opening the app may be silent. The chip replay always has sound.</p>
          </Card>
          <SantaFlyby cfg={cfg} play={play} />
        </div>
      )}

      {tab === "letters" && <LettersTab cfg={cfg} edit={edit} stats={stats} />}
      {tab === "pool" && <PoolTab key={poolDoc?.updatedAt ?? 0} saved={poolDoc?.items} given={stockDoc?.given ?? {}} />}
      {tab === "gifts" && <GiftsTab gifts={gifts} loaded={giftsLoaded} />}
    </div>
  );
}

/* ───────────── Letter game ───────────── */
function LettersTab({ cfg, edit, stats }: { cfg: ChristmasConfig; edit: (p: Partial<ChristmasConfig>) => void; stats: XmasStats | null }) {
  const [day, setDay] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const addDay = () => {
    if (!day) { setErr("Pick a date first."); return; }
    if (day < cfg.startDate || day > cfg.endDate) { setErr(`Pick a day between ${fmt(cfg.startDate)} and ${fmt(cfg.endDate)}.`); return; }
    if (cfg.doubleDays.includes(day)) { setErr("That day is already a double letter day."); return; }
    setErr(null); setDay("");
    edit({ doubleDays: [...cfg.doubleDays, day].sort() });
  };
  const g = stats?.gifts ?? {};
  const amt = stats?.giftAmounts ?? {};
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card>
        <CardHeader title="CHRISTMAS letters" subtitle="One random letter a day for members with an active plan, when they open the Community Room. Shown in Santa's card." />
        <label className={cn("flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition", cfg.letters ? "border-[#F5C66B]/50 bg-[#F5C66B]/5" : "border-border")}>
          <input type="checkbox" className="mt-1 accent-[#F5C66B]" checked={cfg.letters} onChange={(e) => edit({ letters: e.target.checked })} />
          <span>
            <span className="block text-[13px] font-semibold text-text">Letter game on</span>
            <span className="block text-[11px] text-text-muted">Follows Santa&apos;s setting (Off / Admins only / Everyone) and dates. Letters are given from the start date to the end date.</span>
          </span>
        </label>
        <label className="flex flex-col gap-1 mt-4 max-w-[220px]">
          <span className="text-[11px] text-text-muted">Trade spares and redeem until</span>
          <input type="date" value={cfg.redeemUntil} onChange={(e) => e.target.value && edit({ redeemUntil: e.target.value })} className={cn(input, cfg.redeemUntil < cfg.endDate && "border-red/60")} />
        </label>
        {cfg.redeemUntil < cfg.endDate && <p className="text-[11px] text-red mt-1.5 m-0">Must be on or after the end date ({fmt(cfg.endDate)}).</p>}
        <ul className="mt-4 text-[11px] text-text-muted list-disc pl-4 flex flex-col gap-1">
          <li>No catching up: a day the member doesn&apos;t open the Community Room is a letter missed.</li>
          <li>A letter they already have becomes a spare. {3} spares buy any missing letter; spares carry over to the next word.</li>
          <li>A full word redeems one random gift from the pool, then the board starts again.</li>
          <li>Members keep their letters if their plan ends, and can still trade and redeem; they just stop getting new ones.</li>
        </ul>
      </Card>

      <div className="flex flex-col gap-3">
        <Card>
          <CardHeader title="Double letter days" subtitle="Santa leaves 2 presents (2 letters) on these days. Announce them to bring members back." />
          <div className="flex flex-wrap gap-1.5">
            {cfg.doubleDays.length === 0 && <span className="text-[12px] text-text-subtle">None yet.</span>}
            {cfg.doubleDays.map((d) => (
              <span key={d} className="inline-flex items-center gap-1 rounded-full border border-[#F5C66B]/40 bg-[#F5C66B]/10 px-2.5 py-1 text-[12px] text-[#F5C66B]">
                {fmt(d)}
                <button type="button" aria-label={`Remove ${fmt(d)}`} onClick={() => edit({ doubleDays: cfg.doubleDays.filter((x) => x !== d) })} className="hover:text-text"><X className="w-3.5 h-3.5" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <input type="date" value={day} min={cfg.startDate} max={cfg.endDate} onChange={(e) => { setDay(e.target.value); setErr(null); }} className={input} />
            <button type="button" onClick={addDay} className="px-3 py-2 rounded-lg border border-border text-[12px] text-text hover:bg-card-elev flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add day</button>
          </div>
          {err && <p className="text-[11px] text-red mt-1.5 m-0">{err}</p>}
          <p className="text-[11px] text-text-subtle mt-2 m-0">Remember to press Save changes.</p>
        </Card>

        <Card>
          <CardHeader title="So far" subtitle="Running totals since the game started." />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
            <dt className="text-text-muted">Members playing</dt><dd className="m-0 text-text text-right tabular-nums">{(stats?.players ?? 0).toLocaleString()}</dd>
            <dt className="text-text-muted">Letters given</dt><dd className="m-0 text-text text-right tabular-nums">{(stats?.letters ?? 0).toLocaleString()}</dd>
            <dt className="text-text-muted">…of which spares</dt><dd className="m-0 text-text text-right tabular-nums">{(stats?.spares ?? 0).toLocaleString()}</dd>
            <dt className="text-text-muted">Spare trades</dt><dd className="m-0 text-text text-right tabular-nums">{(stats?.trades ?? 0).toLocaleString()}</dd>
            <dt className="text-text-muted">Words completed</dt><dd className="m-0 text-text text-right tabular-nums">{(stats?.sets ?? 0).toLocaleString()}</dd>
            <dt className="text-text-muted">Game Points given</dt><dd className="m-0 text-text text-right tabular-nums">{(g.points ?? 0).toLocaleString()} gifts · {(amt.points ?? 0).toLocaleString()} GP</dd>
            <dt className="text-text-muted">Wallet credit given</dt><dd className="m-0 text-text text-right tabular-nums">{(g.wallet ?? 0).toLocaleString()} gifts · {peso(amt.wallet ?? 0)}</dd>
            <dt className="text-text-muted">Load won</dt><dd className="m-0 text-text text-right tabular-nums">{(g.load ?? 0).toLocaleString()} gifts · {peso(amt.load ?? 0)}</dd>
          </dl>
        </Card>
      </div>
    </div>
  );
}

/* ───────────── Gift pool ───────────── */
function PoolTab({ saved, given }: { saved: PoolItem[] | undefined; given: Record<string, number> }) {
  const [rows, setRows] = useState<PoolRow[]>(() => toRows(saved));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(rows) !== JSON.stringify(toRows(saved));
  const set = (i: number, patch: Partial<PoolRow>) => { setMsg(null); setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r))); };
  const total = rows.reduce((s, r) => s + (Number(r.chance) || 0), 0);
  const avgMoney = total ? rows.reduce((s, r) => s + (r.kind !== "points" ? (Number(r.chance) || 0) * (Number(r.amount) || 0) : 0), 0) / total : 0;
  const avgPoints = total ? rows.reduce((s, r) => s + (r.kind === "points" ? (Number(r.chance) || 0) * (Number(r.amount) || 0) : 0), 0) / total : 0;

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await adminXmasSavePool(rows.map((r) => ({ id: r.id, kind: r.kind, amount: Number(r.amount), chance: Number(r.chance), limit: r.limit.trim() === "" ? null : Number(r.limit) })));
      setMsg({ ok: true, text: "Gift pool saved" });
    } catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader
        title="Gift pool"
        subtitle="When a member completes CHRISTMAS, Santa picks one gift at random, weighted by chance. A gift that reaches its limit drops out of the draw."
        right={
          <div className="flex items-center gap-2">
            {msg && <span className={cn("text-[11px]", msg.ok ? "text-green" : "text-red")}>{msg.text}</span>}
            <button onClick={save} disabled={busy || !dirty} className="px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium flex items-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save gift pool
            </button>
          </div>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[640px]">
          <thead>
            <tr className="text-left text-text-muted">
              <th className="py-2 pr-2 font-medium">Gift type</th>
              <th className="py-2 pr-2 font-medium">Amount</th>
              <th className="py-2 pr-2 font-medium">Chance</th>
              <th className="py-2 pr-2 font-medium">Limit</th>
              <th className="py-2 pr-2 font-medium text-right">Given</th>
              <th className="py-2 pr-2 font-medium text-right">Left</th>
              <th className="py-2 pr-2 font-medium text-right">Real odds</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const out = given[r.id] ?? 0;
              const lim = r.limit.trim() === "" ? null : Number(r.limit);
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-2 pr-2">
                    <select value={r.kind} onChange={(e) => set(i, { kind: e.target.value as GiftKind })} className={cn(input, "py-1.5")}>
                      {(["points", "wallet", "load"] as GiftKind[]).map((k) => <option key={k} value={k}>{GIFT_KIND_LABEL[k]}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-1">
                      {r.kind !== "points" && <span className="text-text-muted">₱</span>}
                      <input type="number" min={1} value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} className={cn(input, "w-24 py-1.5")} aria-label="Amount" />
                      {r.kind === "points" && <span className="text-text-muted">GP</span>}
                    </div>
                  </td>
                  <td className="py-2 pr-2"><div className="flex items-center gap-1"><input type="number" min={0.01} max={100} step="any" value={r.chance} onChange={(e) => set(i, { chance: e.target.value })} className={cn(input, "w-20 py-1.5")} aria-label="Chance" /><span className="text-text-muted">%</span></div></td>
                  <td className="py-2 pr-2"><input type="number" min={0} placeholder="No limit" value={r.limit} onChange={(e) => set(i, { limit: e.target.value })} className={cn(input, "w-24 py-1.5")} aria-label="Limit" /></td>
                  <td className="py-2 pr-2 text-right tabular-nums">{out.toLocaleString()}</td>
                  <td className={cn("py-2 pr-2 text-right tabular-nums", lim !== null && out >= lim && "text-red")}>{lim === null ? "No limit" : Math.max(0, lim - out).toLocaleString()}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-text-muted">{total ? `${((Number(r.chance) || 0) / total * 100).toFixed(1)}%` : "–"}</td>
                  <td className="py-2 text-right"><button type="button" aria-label="Remove gift" onClick={() => setRows(rows.filter((_, k) => k !== i))} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-text-muted hover:text-red"><Trash2 className="w-3.5 h-3.5" /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" disabled={rows.length >= 12} onClick={() => setRows([...rows, { id: newId(), kind: "points", amount: "200", chance: "10", limit: "" }])} className="mt-3 px-3 py-2 rounded-lg border border-border text-[12px] text-text hover:bg-card-elev flex items-center gap-1.5 disabled:opacity-40">
        <Plus className="w-3.5 h-3.5" /> Add gift
      </button>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12px]">
        <div className="rounded-lg bg-canvas px-3 py-2"><span className="block text-text-muted text-[11px]">Chances add up to</span><span className={cn("font-semibold tabular-nums", Math.abs(total - 100) > 0.01 && total > 0 && "text-[#F5A524]")}>{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}%</span>{Math.abs(total - 100) > 0.01 && total > 0 && <span className="block text-[11px] text-text-muted">Real odds are scaled to 100%.</span>}</div>
        <div className="rounded-lg bg-canvas px-3 py-2"><span className="block text-text-muted text-[11px]">Average money per gift (wallet + load)</span><span className="font-semibold tabular-nums">{peso(Math.round(avgMoney * 100) / 100)}</span></div>
        <div className="rounded-lg bg-canvas px-3 py-2"><span className="block text-text-muted text-[11px]">Average Game Points per gift</span><span className="font-semibold tabular-nums">{Math.round(avgPoints).toLocaleString()} GP</span></div>
      </div>
      <p className="text-[11px] text-text-subtle mt-3 m-0">Budget guide: a member who opens the Community Room every day finishes about 1 to 2 words over the season. Use the limits to cap the wallet credit and load you give out. Wallet credit can be withdrawn.</p>
    </Card>
  );
}

/* ───────────── Gifts given ───────────── */
type GiftFilter = "all" | "to_send" | "needs_number" | "sent" | "wallet" | "points";
const FILTERS: { id: GiftFilter; label: string; test: (g: XmasGift) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "to_send", label: "Load to send", test: (g) => g.kind === "load" && g.status === "to_send" },
  { id: "needs_number", label: "Waiting for number", test: (g) => g.kind === "load" && g.status === "needs_number" },
  { id: "sent", label: "Load sent", test: (g) => g.kind === "load" && g.status === "sent" },
  { id: "wallet", label: "Wallet credit", test: (g) => g.kind === "wallet" },
  { id: "points", label: "Game Points", test: (g) => g.kind === "points" },
];

function GiftsTab({ gifts, loaded }: { gifts: XmasGift[]; loaded: boolean }) {
  const [filter, setFilter] = useState<GiftFilter>(() => (gifts.some((g) => g.kind === "load" && g.status === "to_send") ? "to_send" : "all"));
  const [sending, setSending] = useState<string | null>(null);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const shown = gifts.filter(FILTERS.find((f) => f.id === filter)!.test);

  const markSent = async (g: XmasGift) => {
    setSending(g.id); setErr(null);
    try { await adminXmasLoadSent(g.id, refs[g.id]?.trim() || undefined); } catch (e) { setErr(errText(e)); } finally { setSending(null); }
  };

  return (
    <Card>
      <CardHeader title="Gifts given" subtitle="Every gift members redeemed. Load is sent by your team: send it to the number shown, then press Mark sent and the member is told." />
      <div className="flex flex-wrap gap-1.5 mb-3">
        {FILTERS.map((f) => {
          const n = gifts.filter(f.test).length;
          return (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)} className={cn("px-2.5 py-1 rounded-full text-[11px] border", filter === f.id ? "bg-[#F5C66B]/15 border-[#F5C66B]/40 text-[#F5C66B]" : "bg-canvas border-border text-text-muted")}>
              {f.label} <span className="font-mono">{n}</span>
            </button>
          );
        })}
      </div>
      {err && <p className="text-[12px] text-red mb-2 m-0">{err}</p>}
      {!loaded ? (
        <p className="text-[12px] text-text-muted flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-[12px] text-text-muted">Nothing here yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] min-w-[680px]">
            <thead>
              <tr className="text-left text-text-muted">
                <th className="py-2 pr-2 font-medium">When</th>
                <th className="py-2 pr-2 font-medium">Member</th>
                <th className="py-2 pr-2 font-medium">Gift</th>
                <th className="py-2 pr-2 font-medium">Status</th>
                <th className="py-2 pr-2 font-medium">Mobile number</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((g) => (
                <tr key={g.id} className="border-t border-border align-middle">
                  <td className="py-2 pr-2 whitespace-nowrap text-text-muted">{when(g.at)}</td>
                  <td className="py-2 pr-2">{g.name}</td>
                  <td className="py-2 pr-2">{g.label || giftLabel(g)}</td>
                  <td className="py-2 pr-2">
                    {g.kind !== "load" ? <span className="text-green">Added</span>
                      : g.status === "needs_number" ? <span className="text-[#F5A524]">Waiting for number</span>
                      : g.status === "to_send" ? <span className="text-[#F5C66B]">To send</span>
                      : <span className="text-green">Sent {g.sentAt ? when(g.sentAt) : ""}{g.sentRef ? ` · Ref ${g.sentRef}` : ""}</span>}
                  </td>
                  <td className="py-2 pr-2 font-mono">{g.mobile ?? "–"}</td>
                  <td className="py-2 text-right">
                    {g.kind === "load" && g.status === "to_send" && (
                      <div className="flex items-center justify-end gap-1.5">
                        <input placeholder="Ref (optional)" value={refs[g.id] ?? ""} onChange={(e) => setRefs({ ...refs, [g.id]: e.target.value })} className={cn(input, "w-32 py-1.5 text-[12px]")} aria-label="Reference number" />
                        <button type="button" disabled={sending === g.id} onClick={() => markSent(g)} className="px-3 py-1.5 rounded-lg bg-gold text-gold-dark text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-50">
                          {sending === g.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Mark sent
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-text-subtle mt-3 m-0">Shows the latest 500 gifts.</p>
    </Card>
  );
}
