"use client";

import { useMemo, useState } from "react";
import { Loader2, Save, Play, AlertCircle, CheckCircle2 } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { AdminTabs, useHashTab } from "@/components/admin/AdminTabs";
import { Card, CardHeader } from "@/components/Card";
import { SantaFlyby, SantaChip } from "@/components/christmas/SantaFlyby";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { useSettings, saveSettings } from "@/lib/settings";
import { useNow } from "@/lib/compplan";
import { cleanChristmas, christmasActive, christmasCountdown, manilaDate, type ChristmasConfig, type ChristmasMode } from "@/lib/christmas";

type Tab = "flyby";
const TAB_IDS: Tab[] = ["flyby"];

const MODES: { id: ChristmasMode; label: string; hint: string }[] = [
  { id: "off", label: "Off", hint: "Nobody sees Santa." },
  { id: "admins", label: "Admins only (test)", hint: "Only admins see Santa, starting now; the dates are ignored. Use this to try it in the Community Room." },
  { id: "everyone", label: "Everyone", hint: "Every member sees Santa from the start date to the end date (Manila time)." },
];

const fmt = (d: string) => new Date(`${d}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

/** Admin › Christmas: Santa's flyby + countdown in the Community Room. */
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

  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(stored);
  const badDates = cfg.endDate < cfg.startDate;
  const edit = (patch: Partial<ChristmasConfig>) => { setMsg(null); setDraft({ ...cfg, ...patch }); };

  const save = async () => {
    if (badDates) { setMsg({ ok: false, text: "The end date must be on or after the start date." }); return; }
    const { db } = getFirebase();
    if (!db || !user) return;
    setSaving(true); setMsg(null);
    try {
      await saveSettings(db, { christmas: cfg }, user.uid);
      setDraft(null);
      setMsg({ ok: true, text: "Saved" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save. Try again." });
    } finally { setSaving(false); }
  };

  // what a member sees, using the saved settings
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

  return (
    <div>
      <TopHeader title="Christmas" subtitle="Santa's flyby and the countdown in the Community Room" />
      <AdminTabs
        tabs={[{ id: "flyby" as Tab, label: "Santa flyby", hint: status, hintTone: stored.mode === "off" ? "muted" : membersNow || stored.mode === "admins" ? "ok" : "warn" }]}
        value={tab}
        onChange={setTab}
        right={
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
        }
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
                <input type="date" value={cfg.startDate} onChange={(e) => e.target.value && edit({ startDate: e.target.value })} className="bg-canvas border border-border rounded-md px-3 py-2 text-[13px] text-text outline-none focus:border-[#F5C66B]/50" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-text-muted">End date</span>
                <input type="date" value={cfg.endDate} onChange={(e) => e.target.value && edit({ endDate: e.target.value })} className={cn("bg-canvas border rounded-md px-3 py-2 text-[13px] text-text outline-none focus:border-[#F5C66B]/50", badDates ? "border-red/60" : "border-border")} />
              </label>
            </div>
            {badDates && <p className="text-[11px] text-red mt-1.5 m-0">The end date must be on or after the start date.</p>}
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
    </div>
  );
}
