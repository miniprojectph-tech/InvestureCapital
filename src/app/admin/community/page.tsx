"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { VolumeX, Pin, ExternalLink, ShieldCheck, Search, Plus, X, Loader2, RefreshCw, Inbox, MessageSquare, PartyPopper, Sliders, Users, Database } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { AdminTabs, useHashTab, type AdminTab } from "@/components/admin/AdminTabs";
import { InboxPanel } from "@/components/community/InboxPanel";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { listInvestors, type InvestorRow } from "@/lib/adminQueries";
import { useSettings, saveSettings, DEFAULT_COMMUNITY, uploadLimitsFor, cleanUploadLimits, MAX_UPLOAD_MB, MAX_VIDEO_SECONDS_CAP, DEFAULT_WELCOME, DEFAULT_WELCOME_TEXT, fillWelcome, type CommunityConfig, type UploadLimits } from "@/lib/settings";
import {
  useMutedUsers,
  useCommunityRoom,
  usePinnedMessage,
  useChatMods,
  useInboxList,
  isInboxUnread,
  useCommunityStats,
  refreshCommunityStats,
  useCommunityActiveSettings,
  setCommunityActive,
  activeWindowIssues,
  formatHHMM,
  DEFAULT_ACTIVE_WINDOWS,
  type ActiveWindow,
  unmuteUser,
  setPinnedMessage,
  ensureCommunityAdmin,
  addChatMod,
  setChatModInbox,
  removeChatMod,
  formatRelative,
} from "@/lib/community";

/** The greeting every new sign-up gets: a pop-up on first sign-in and the first message in their private chat. */
function WelcomeCard({ uid }: { uid: string }) {
  const { settings } = useSettings();
  const saved = { ...DEFAULT_WELCOME, ...(settings.welcome ?? {}) };
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const on = enabled ?? saved.enabled;
  const body = text ?? saved.text;
  const dirty = on !== saved.enabled || body !== saved.text;

  async function save() {
    const { db } = getFirebase();
    if (!db) return;
    if (on && body.trim().length < 10) return setMsg({ ok: false, text: "Write a welcome message first." });
    setSaving(true);
    setMsg(null);
    try {
      await saveSettings(db, { welcome: { enabled: on, text: body.trim().slice(0, 600) } }, uid);
      setEnabled(null); setText(null);
      setMsg({ ok: true, text: on ? "Saved. Every new sign-up from now on gets this." : "Saved. New sign-ups get no welcome until you switch it back on." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-3">
      <CardHeader
        title="Welcome for new members"
        subtitle="On their first sign-in: a pop-up with this message and a “Message the admin” button, and the same message placed in their private chat. They then appear in the inbox as New member until someone replies."
        right={
          <button type="button" onClick={() => setEnabled(!on)} className={cn("px-3 py-1 rounded-full text-[10px] font-medium border transition", on ? "bg-green/15 border-green/40 text-green" : "bg-canvas border-border text-text-muted")}>
            {on ? "On" : "Off"}
          </button>
        }
      />
      <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-3", !on && "opacity-60")}>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-text">Message <span className="font-normal text-text-subtle">· type {"{{name}}"} for their first name</span></span>
          <textarea value={body} maxLength={600} rows={6} disabled={!on} onChange={(e) => setText(e.target.value)} placeholder={DEFAULT_WELCOME_TEXT} className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40 resize-y leading-relaxed" />
        </label>
        <div>
          <p className="text-[11px] font-medium text-text m-0 mb-1">How it reads</p>
          <div className="rounded-xl border border-border bg-canvas px-4 py-3 text-[12px] leading-relaxed text-text whitespace-pre-line">{fillWelcome(body || DEFAULT_WELCOME_TEXT, "Maria")}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button onClick={save} disabled={!dirty || saving} className="px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium disabled:opacity-40">{saving ? "Saving…" : "Save"}</button>
        {dirty && !saving && <button onClick={() => { setEnabled(null); setText(null); setMsg(null); }} className="text-[11px] text-text-muted hover:text-text">Discard</button>}
        {msg && <span className={cn("text-[11px]", msg.ok ? "text-green" : "text-red")}>{msg.text}</span>}
      </div>
      <p className="text-[10px] text-text-subtle m-0 mt-2">Sign-ups only: members who joined before you switched this on are not messaged.</p>
    </Card>
  );
}

/** Who may post pictures, video and links in the Community Room. Saved to settings; the rules enforce it. */
function PostingRulesCard({ uid }: { uid: string }) {
  const { settings } = useSettings();
  const cfg: CommunityConfig = { ...DEFAULT_COMMUNITY, ...(settings.community ?? {}) };
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function flip(key: keyof CommunityConfig) {
    const { db } = getFirebase();
    if (!db) return;
    setBusy(key);
    setErr(null);
    try {
      await saveSettings(db, { community: { ...cfg, [key]: !cfg[key] } }, uid);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const Row = ({ label, hint, k }: { label: string; hint: string; k: keyof CommunityConfig }) => (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-b-0">
      <div className="min-w-0">
        <p className="text-[12px] m-0">{label}</p>
        <p className="text-[10px] text-text-subtle m-0 mt-0.5">{hint}</p>
      </div>
      <button
        type="button"
        onClick={() => flip(k)}
        disabled={busy !== null}
        aria-pressed={cfg[k]}
        className={cn(
          "shrink-0 px-3 py-1 rounded-full text-[10px] font-medium border transition min-w-[64px]",
          cfg[k] ? "bg-green/15 border-green/40 text-green" : "bg-canvas border-border text-text-muted",
          busy === k && "opacity-50",
        )}
      >
        {cfg[k] ? "Allowed" : "Off"}
      </button>
    </div>
  );

  return (
    <Card className="mb-3">
      <CardHeader title="What people can send" subtitle="Switch pictures, video and links on or off for members and for moderators. Applies straight away; the admin account can always send everything." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-subtle m-0 mb-1">Members</p>
          <Row k="membersImages" label="Pictures" hint="Photos from the gallery or camera, compressed on their phone" />
          <Row k="membersVideo" label="Videos" hint="Up to 15 MB each — the biggest storage cost in the room" />
          <Row k="membersLinks" label="Links" hint="Web addresses in messages (off keeps spam and scams out)" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-subtle m-0 mb-1">Moderators</p>
          <Row k="modsVideo" label="Videos" hint="Moderators can always send pictures" />
          <Row k="modsLinks" label="Links" hint="For sharing official announcements" />
        </div>
      </div>
      {err && <p className="text-[11px] text-red m-0 mt-2">{err}</p>}
    </Card>
  );
}

/** Size and length caps for uploads, separately for the Community Room and the private admin chat. */
function UploadLimitsCard({ uid }: { uid: string }) {
  const { settings } = useSettings();
  const saved = { room: uploadLimitsFor(settings, "room"), inbox: uploadLimitsFor(settings, "inbox") };
  const [draft, setDraft] = useState<{ room: UploadLimits; inbox: UploadLimits } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cur = draft ?? saved;
  const dirty = JSON.stringify(cur) !== JSON.stringify(saved);

  const edit = (chat: "room" | "inbox", key: keyof UploadLimits, raw: string) => {
    const n = Number(raw);
    setDraft({ ...cur, [chat]: { ...cur[chat], [key]: Number.isFinite(n) ? n : cur[chat][key] } });
    setMsg(null);
  };

  async function save() {
    const { db } = getFirebase();
    if (!db) return;
    setSaving(true);
    setMsg(null);
    try {
      const clean = { room: cleanUploadLimits(cur.room), inbox: cleanUploadLimits(cur.inbox) };
      await saveSettings(db, { uploads: clean }, uid);
      setDraft(null);
      setMsg({ ok: true, text: "Saved. New limits apply to the next upload." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const Col = ({ chat, title, hint }: { chat: "room" | "inbox"; title: string; hint: string }) => (
    <div>
      <p className="text-[12px] font-medium m-0">{title}</p>
      <p className="text-[10px] text-text-subtle m-0 mb-2">{hint}</p>
      <div className="flex flex-col gap-2">
        {([
          ["imageMB", "Picture max size", "MB", 1, MAX_UPLOAD_MB],
          ["videoMB", "Video max size", "MB", 1, MAX_UPLOAD_MB],
          ["videoSeconds", "Video max length", "sec", 5, MAX_VIDEO_SECONDS_CAP],
        ] as [keyof UploadLimits, string, string, number, number][]).map(([key, label, unit, min, max]) => (
          <label key={key} className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-text-muted">{label}</span>
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                min={min}
                max={max}
                value={cur[chat][key]}
                onChange={(e) => edit(chat, key, e.target.value)}
                className="w-20 bg-canvas border border-border rounded-md px-2 py-1.5 text-[12px] font-mono text-text text-right outline-none focus:border-gold/40"
              />
              <span className="text-[10px] text-text-subtle w-7">{unit}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <Card className="mb-3">
      <CardHeader title="Upload limits" subtitle={`How big a picture or video may be, per chat. Sizes are checked by the server; the length is checked by the app. Ceiling: ${MAX_UPLOAD_MB} MB.`} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
        <Col chat="room" title="Community Room" hint="Everyone in the room, moderators included" />
        <Col chat="inbox" title="Admin message" hint="Private chats between a member and the admin team" />
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button onClick={save} disabled={saving || !dirty} className="px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium disabled:opacity-50">
          {saving ? "Saving…" : "Save limits"}
        </button>
        {dirty && !saving && <button onClick={() => { setDraft(null); setMsg(null); }} className="text-[11px] text-text-muted hover:text-text">Discard</button>}
        {msg && <span className={cn("text-[11px]", msg.ok ? "text-green" : "text-red")}>{msg.text}</span>}
      </div>
      <p className="text-[10px] text-text-subtle m-0 mt-2 leading-relaxed max-w-2xl">
        Pictures are compressed on the phone before upload, so their cap rarely matters. Videos are not: every view is a
        download (about ₱7 per GB), so a bigger video cap costs more each time one is watched.
      </p>
    </Card>
  );
}

/** The "N active now" number members see: a starting number that follows the admin's time windows, plus who is really online. */
type WindowDraft = { start: string; end: string; min: string; max: string; everyMin: string };
const toDraft = (w: ActiveWindow): WindowDraft => ({ start: w.start, end: w.end, min: String(w.min), max: String(w.max), everyMin: String(w.everyMin) });
const fromDraft = (d: WindowDraft): ActiveWindow => ({ start: d.start, end: d.end, min: parseInt(d.min, 10), max: parseInt(d.max, 10), everyMin: parseInt(d.everyMin, 10) });

function ActiveNowCard({ enabled }: { enabled: boolean }) {
  const s = useCommunityActiveSettings(enabled);
  const [on, setOn] = useState(false);
  const [rows, setRows] = useState<WindowDraft[]>(DEFAULT_ACTIVE_WINDOWS.map(toDraft));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(id); }, []);

  // Fill the form once from the saved settings; after that the admin's typing wins.
  useEffect(() => {
    if (!s || loaded) return;
    setOn(s.enabled);
    if (s.windows.length) setRows(s.windows.map(toDraft));
    setLoaded(true);
  }, [s, loaded]);

  const windows = rows.map(fromDraft);
  const issues = activeWindowIssues(windows);
  const edit = (i: number, patch: Partial<WindowDraft>) => { setRows((r) => r.map((w, j) => (j === i ? { ...w, ...patch } : w))); setMsg(null); };

  async function save() {
    if (on && issues.errors.length) return setMsg({ ok: false, text: issues.errors[0] });
    setSaving(true);
    setMsg(null);
    try {
      const r = await setCommunityActive({ enabled: on, windows });
      setMsg({ ok: true, text: `Saved. Members now see ${r.shown.toLocaleString()} active now.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const nextChangeIn = s?.window && s.enabled ? Math.max(0, Math.ceil((s.baseAt + s.window.everyMin * 60_000 - now) / 60_000)) : null;
  const num = "w-16 bg-canvas border border-border rounded-md px-2 py-1.5 text-[12px] font-mono text-text text-right outline-none focus:border-gold/40 disabled:opacity-50";
  const time = "bg-canvas border border-border rounded-md px-2 py-1.5 text-[12px] text-text outline-none focus:border-gold/40 disabled:opacity-50 [color-scheme:dark]";
  return (
    <Card className="mb-3">
      <CardHeader
        title="Active now number"
        subtitle="What members see as “N active now” in the Community Room"
        right={
          <button
            type="button"
            onClick={() => { setOn(!on); setMsg(null); }}
            className={cn("px-3 py-1 rounded-full text-[10px] font-medium border transition", on ? "bg-gold/15 border-gold/40 text-gold" : "bg-canvas border-border text-text-muted")}
          >
            {on ? "Starting number: ON" : "Starting number: OFF"}
          </button>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        <StorageTile label="Members see" value={s ? s.shown.toLocaleString() : "—"} sub="active now" tone="text-gold" />
        <StorageTile label="Really online" value={s ? s.real.toLocaleString() : "—"} sub="counted every minute" />
        <StorageTile
          label="Starting number"
          value={s ? s.base.toLocaleString() : "—"}
          sub={!s?.enabled ? "off" : !s.window ? "no window covers this time" : nextChangeIn === 0 ? "changing now" : `next change in ${nextChangeIn} min`}
        />
        <StorageTile
          label="Current window"
          value={s?.enabled && s.window ? `${formatHHMM(s.window.start)} – ${formatHHMM(s.window.end)}` : "—"}
          sub={s?.enabled && s.window ? `range ${s.window.min.toLocaleString()} – ${s.window.max.toLocaleString()} · every ${s.window.everyMin} min` : s?.enabled ? "gap: members see the real count" : "off"}
        />
      </div>

      <p className="text-[12px] font-medium m-0 mb-1">
        Time windows <span className="font-normal text-text-subtle">· Manila time · the number drifts a few steps each change and stays inside the window&apos;s range</span>
      </p>
      <div className={cn("overflow-x-auto -mx-1 px-1", !on && "opacity-60")}>
        <table className="w-full text-[12px] min-w-[560px]">
          <thead>
            <tr className="text-[10px] text-text-subtle text-left">
              <th className="font-medium py-1.5 pr-2">From</th>
              <th className="font-medium py-1.5 pr-2">To</th>
              <th className="font-medium py-1.5 pr-2 text-right">Lowest</th>
              <th className="font-medium py-1.5 pr-2 text-right">Highest</th>
              <th className="font-medium py-1.5 pr-2 text-right">Change every</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((w, i) => {
              const live = s?.enabled && s.window && s.window.start === w.start && s.window.end === w.end;
              return (
                <tr key={i} className={cn("border-t border-border", live && "bg-gold/5")}>
                  <td className="py-1.5 pr-2"><input type="time" value={w.start} disabled={!on} onChange={(e) => edit(i, { start: e.target.value })} className={cn(time, live && "border-gold/40")} aria-label={`Window ${i + 1} from`} /></td>
                  <td className="py-1.5 pr-2"><input type="time" value={w.end} disabled={!on} onChange={(e) => edit(i, { end: e.target.value })} className={time} aria-label={`Window ${i + 1} to`} /></td>
                  <td className="py-1.5 pr-2 text-right"><input type="number" min={0} value={w.min} disabled={!on} onChange={(e) => edit(i, { min: e.target.value })} className={num} aria-label={`Window ${i + 1} lowest`} /></td>
                  <td className="py-1.5 pr-2 text-right"><input type="number" min={0} value={w.max} disabled={!on} onChange={(e) => edit(i, { max: e.target.value })} className={num} aria-label={`Window ${i + 1} highest`} /></td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                    <input type="number" min={1} max={1440} value={w.everyMin} disabled={!on} onChange={(e) => edit(i, { everyMin: e.target.value })} className={cn(num, "w-14")} aria-label={`Window ${i + 1} change every (minutes)`} /> <span className="text-[10px] text-text-subtle">min</span>
                  </td>
                  <td className="py-1.5 text-right">
                    <button type="button" onClick={() => { setRows((r) => r.filter((_, j) => j !== i)); setMsg(null); }} disabled={!on || rows.length <= 1} className="p-1 text-text-subtle hover:text-red disabled:opacity-30" aria-label={`Remove window ${i + 1}`}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {on && issues.errors.map((e) => <p key={e} className="text-[10px] text-red m-0 mt-1.5">{e}</p>)}
      {on && !issues.errors.length && issues.gaps.map((g) => <p key={g} className="text-[10px] text-[#F5C66B] m-0 mt-1.5">Gap: {g} is not covered — members see only the real count then.</p>)}

      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button
          type="button"
          onClick={() => { setRows((r) => [...r, { start: r.at(-1)?.end ?? "00:00", end: "23:59", min: "20", max: "40", everyMin: "5" }]); setMsg(null); }}
          disabled={!on || rows.length >= 12}
          className="text-[11px] text-gold hover:underline flex items-center gap-1 disabled:opacity-40"
        >
          <Plus className="w-3 h-3" /> Add window
        </button>
        <button type="button" onClick={() => { setRows(DEFAULT_ACTIVE_WINDOWS.map(toDraft)); setMsg(null); }} disabled={!on} className="text-[11px] text-text-muted hover:text-text disabled:opacity-40">
          Reset to the four defaults
        </button>
        <button
          onClick={save}
          disabled={saving || !enabled}
          className="ml-auto px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {msg && <p className={cn("text-[11px] m-0 mt-2", msg.ok ? "text-green" : "text-red")}>{msg.text}</p>}
      <p className="text-[10px] text-text-subtle m-0 mt-2 leading-relaxed max-w-2xl">
        A window that ends before it starts wraps past midnight (e.g. 10:00 PM – 1:59 AM). When one window ends, the number eases
        into the next range over the next few changes instead of jumping. Everyone really online is added on top. When off,
        members see only the real count. Only admins can see these ranges and the real count.
      </p>
    </Card>
  );
}

type Tab = "inbox" | "room" | "people" | "welcome" | "posting" | "active" | "storage";
const TAB_IDS: Tab[] = ["inbox", "room", "people", "welcome", "posting", "active", "storage"];

export default function AdminCommunityPage() {
  const { user, demoMode } = useAuth();
  const { settings } = useSettings();
  const [adminReady, setAdminReady] = useState(false);
  const [tab, setTab] = useHashTab<Tab>(TAB_IDS, "inbox");

  const mutedUsers = useMutedUsers(adminReady);
  const mods = useChatMods(adminReady);
  const threads = useInboxList(adminReady);
  const { messages: room } = useCommunityRoom(true);
  const stats = useCommunityStats(adminReady);
  const [refreshing, setRefreshing] = useState(false);
  const pinned = usePinnedMessage(room);

  useEffect(() => {
    if (user?.isAdmin) ensureCommunityAdmin().then(setAdminReady);
  }, [user?.isAdmin]);

  if (!user) return null;
  const staff = { uid: user.uid, name: "Admin", isAdmin: true };
  // A new member counts as waiting until someone on the team has replied.
  const waiting = threads.filter((t) => isInboxUnread(t, "admin") || t.newMember === true).length;
  const welcomeOn = (settings.welcome?.enabled ?? DEFAULT_WELCOME.enabled) !== false;

  const tabs: AdminTab<Tab>[] = [
    { id: "inbox", label: "Inbox", icon: Inbox, count: waiting || undefined, attention: waiting > 0 },
    { id: "room", label: "Room", icon: MessageSquare, count: mutedUsers.length || undefined },
    { id: "people", label: "Moderators", icon: ShieldCheck, count: mods.length || undefined },
    { id: "welcome", label: "Welcome", icon: PartyPopper, hint: welcomeOn ? "on" : "off", hintTone: welcomeOn ? "ok" : "muted" },
    { id: "posting", label: "Posting rules", icon: Sliders },
    { id: "active", label: "Active now", icon: Users },
    { id: "storage", label: "Storage", icon: Database },
  ];

  return (
    <div>
      <TopHeader title="Community chat" subtitle="Member inbox, moderators, and room moderation" />

      <AdminTabs
        tabs={tabs}
        value={tab}
        onChange={setTab}
        right={
          !adminReady && user.isAdmin ? (
            <span className="text-[10px] text-text-subtle flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Syncing moderator access…
            </span>
          ) : undefined
        }
      />

      {tab === "inbox" && (
        <InboxPanel
          staff={staff}
          canSend={adminReady}
          threadAside={
            <Link href="/admin/investors" className="text-[10px] text-text-subtle hover:text-text flex items-center gap-1">
              Investors <ExternalLink className="w-3 h-3" />
            </Link>
          }
        />
      )}

      {tab === "room" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card>
            <CardHeader
              title="Community Room"
              subtitle="Post banners, pin and delete messages, or mute members directly in the room"
              right={
                <Link href="/community" className="text-[11px] text-gold hover:underline flex items-center gap-1">
                  Open room <ExternalLink className="w-3 h-3" />
                </Link>
              }
            />
            <div className="flex items-start gap-2 bg-canvas border border-border rounded-lg px-3 py-2.5">
              <Pin className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-text-subtle m-0 mb-0.5">Pinned message</p>
                {pinned ? (
                  <p className="text-[11px] text-text m-0 truncate">
                    <span className="text-gold">{pinned.name}: </span>
                    {pinned.text ?? (pinned.kind === "image" ? "📷 Photo" : "🎬 Video")}
                  </p>
                ) : (
                  <p className="text-[11px] text-text-subtle m-0">Nothing pinned — use the ⋯ menu on a room message.</p>
                )}
              </div>
              {pinned && (
                <button onClick={() => setPinnedMessage(null)} className="text-[10px] text-text-muted hover:text-red shrink-0">
                  Unpin
                </button>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Muted members" subtitle={`${mutedUsers.length} muted — they can read the room but not post`} />
            {mutedUsers.length === 0 ? (
              <p className="text-[11px] text-text-subtle m-0">No one is muted.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {mutedUsers.map((m) => (
                  <div key={m.uid} className="flex items-center gap-2 bg-canvas border border-border rounded-lg px-3 py-2">
                    <VolumeX className="w-3.5 h-3.5 text-red shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-text m-0 truncate">{m.name}</p>
                      <p className="text-[9px] text-text-subtle m-0">muted {formatRelative(m.at)} ago</p>
                    </div>
                    <button onClick={() => unmuteUser(m.uid)} className="text-[10px] px-2 py-1 rounded-md bg-card-elev text-text hover:bg-gold/15 hover:text-gold transition">
                      Unmute
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "people" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ModeratorsCard enabled={adminReady} demoMode={demoMode} />
        </div>
      )}

      {tab === "welcome" && <WelcomeCard uid={user.uid} />}

      {tab === "posting" && (
        <>
          <PostingRulesCard uid={user.uid} />
          <UploadLimitsCard uid={user.uid} />
        </>
      )}

      {tab === "active" && <ActiveNowCard enabled={adminReady} />}

      {/* Chat storage — history is kept forever, so keep an eye on growth */}
      {tab === "storage" && (
      <Card className="mb-3">
        <CardHeader
          title="Chat storage"
          subtitle="History is never deleted. Totals update daily — refresh for a live count."
          right={
            <button
              onClick={() => { setRefreshing(true); refreshCommunityStats().catch(() => {}).finally(() => setRefreshing(false)); }}
              disabled={refreshing || !adminReady}
              className="text-[10px] text-gold hover:underline flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} /> Refresh
            </button>
          }
        />
        {(() => {
          const msgs = stats?.roomMessages ?? 0;
          const dbGb = (msgs * 300) / 1e9;
          const mediaGb = (stats?.mediaBytes ?? 0) / 1e9;
          const monthly = Math.max(0, dbGb - 1) * 5 + mediaGb * 0.026;
          const fmtSize = (gb: number) => (gb >= 1 ? `${gb.toFixed(2)} GB` : `${(gb * 1000).toFixed(gb * 1000 >= 10 ? 0 : 1)} MB`);
          return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <StorageTile label="Room messages" value={msgs.toLocaleString()} sub={`≈ ${fmtSize(dbGb)} in the database`} />
              <StorageTile label="Media files" value={stats?.mediaFiles != null ? stats.mediaFiles.toLocaleString() : "—"} sub={stats?.mediaBytes != null ? fmtSize(mediaGb) : "not measured yet"} />
              <StorageTile label="Est. storage cost" value={`$${monthly.toFixed(2)} / mo`} sub="first 1 GB of messages is free" tone="text-green" />
              <StorageTile label="Last updated" value={stats?.updatedAt ? formatRelative(stats.updatedAt) + " ago" : "never"} sub="runs automatically every day" />
            </div>
          );
        })()}
      </Card>
      )}
    </div>
  );
}

function StorageTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-canvas border border-border rounded-lg px-3 py-2.5">
      <p className="text-[9px] uppercase tracking-wider text-text-subtle m-0 mb-1">{label}</p>
      <p className={cn("text-[14px] font-mono font-medium m-0 tabular-nums", tone)}>{value}</p>
      {sub && <p className="text-[9px] text-text-subtle m-0 mt-0.5">{sub}</p>}
    </div>
  );
}

/**
 * Chat moderators: members granted moderation powers in the Community Room
 * (delete / pin / mute / links / video) without full admin access. The
 * "Inbox" toggle additionally lets them read and reply to member → admin
 * private threads.
 */
function ModeratorsCard({ enabled, demoMode }: { enabled: boolean; demoMode: boolean }) {
  const mods = useChatMods(enabled);
  const [investors, setInvestors] = useState<InvestorRow[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { db } = getFirebase();
    if (!db || demoMode) return;
    listInvestors(db, 500).then(setInvestors).catch(() => {});
  }, [demoMode]);

  const modIds = useMemo(() => new Set(mods.map((m) => m.uid)), [mods]);
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return investors
      .filter((i) => !modIds.has(i.uid) && (i.name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [search, investors, modIds]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Chat moderators"
        subtitle="Members who can moderate the room without full admin access"
        right={<ShieldCheck className="w-4 h-4 text-gold" />}
      />

      <div className="relative mb-2">
        <Search className="w-3.5 h-3.5 text-text-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search a member to add…"
          disabled={!enabled}
          className="w-full bg-canvas border border-border rounded-lg pl-8 pr-3 py-2 text-[11px] text-text outline-none focus:border-gold/40 placeholder:text-text-subtle disabled:opacity-50"
        />
        {results.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-card border border-border-strong rounded-lg shadow-xl shadow-black/50 overflow-hidden">
            {results.map((r) => (
              <button
                key={r.uid}
                onClick={() => run(r.uid, async () => { await addChatMod(r.uid, r.name, false); setSearch(""); })}
                disabled={busy === r.uid}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-card-elev transition"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-text m-0 truncate">{r.name}</p>
                  <p className="text-[9px] text-text-subtle m-0 truncate">{r.email}</p>
                </div>
                {busy === r.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gold" /> : <Plus className="w-3.5 h-3.5 text-gold" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-[10px] text-red m-0 mb-2">{error}</p>}

      {mods.length === 0 ? (
        <p className="text-[11px] text-text-subtle m-0">No moderators yet. Search a member above to add one.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {mods.map((m) => (
            <div key={m.uid} className="flex items-center gap-2 bg-canvas border border-border rounded-lg px-3 py-2">
              <ShieldCheck className="w-3.5 h-3.5 text-gold shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-text m-0 truncate">{m.name}</p>
                <p className="text-[9px] text-text-subtle m-0">added {formatRelative(m.at)} ago</p>
              </div>
              <button
                onClick={() => run(`inbox-${m.uid}`, () => setChatModInbox(m.uid, !m.inbox))}
                disabled={busy === `inbox-${m.uid}`}
                title="Allow this moderator to read and reply to member → admin private messages"
                className={cn(
                  "text-[9px] px-2 py-1 rounded-md border transition",
                  m.inbox ? "bg-gold/15 text-gold border-gold/30" : "bg-card-elev text-text-muted border-transparent hover:text-text",
                )}
              >
                Inbox {m.inbox ? "on" : "off"}
              </button>
              <button
                onClick={() => run(`rm-${m.uid}`, () => removeChatMod(m.uid))}
                disabled={busy === `rm-${m.uid}`}
                className="p-1 text-text-subtle hover:text-red transition"
                aria-label={`Remove ${m.name} as moderator`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[9px] text-text-subtle m-0 mt-3 leading-relaxed">
        Moderators get the ⋯ menu (pin · mute · delete), can post links and videos, and are tagged <span className="text-gold">Mod</span>.
        They moderate from the Community page — they can&apos;t open this admin panel.
      </p>
    </Card>
  );
}
