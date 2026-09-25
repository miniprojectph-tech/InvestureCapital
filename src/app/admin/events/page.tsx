"use client";

import { useEffect, useMemo, useState } from "react";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { AlertCircle, CheckCircle2, Loader2, Plus, Sparkles, Users, Upload, Eye, Power, X, Dices, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { formatPHP, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { useCompPlan } from "@/lib/compplan";
import { EventBody } from "@/components/events/EventPopup";
import {
  useAllEvents,
  useEventClaims,
  adminSaveEvent,
  adminSetEventStatus,
  adminAddEventSlots,
  validateEvent,
  eventIsLive,
  slotsFree,
  countdown,
  formatEventDate,
  DEFAULT_SLOT,
  DEFAULT_REFERRAL,
  DEFAULT_SPIN,
  WEDGE_COLORS,
  spinChanceTotal,
  spinAveragePayout,
  spinWindowAt,
  useSpinLog,
  type SpinWedge,
  type InvestureEvent,
  type EventKind,
  type PopupFrequency,
} from "@/lib/events";

type Draft = Omit<InvestureEvent, "id" | "createdAt" | "updatedAt" | "status"> & { id?: string };

const SPIN_PAGE = 10;      // spins shown per page in Wheel activity
const SPIN_LOG_CAP = 200;  // most recent spins kept in memory (20 pages)

const HOUR = 3_600_000;
function toLocalInput(ms: number | null): string {
  if (ms == null) return "";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocalInput(s: string): number | null {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

function blankDraft(kind: EventKind): Draft {
  const now = Date.now();
  return {
    kind,
    name: "",
    tagline: "",
    mechanics: kind === "slot"
      ? ["Choose 1–3 slots and a term.", "Pay from your wallet (instant) or send a payment — slots are held for 24 h while we verify.", "Capital back, Locked-In Bonus and referral commissions work as usual."]
      : kind === "spin"
        ? ["One free spin a day — every prize goes straight to your Game Points.", "Earn bonus spins for placements and referrals.", "Prizes are split across the day so there is always something to win."]
        : ["Applies to every placement your referrals activate before the end date.", "Fast-Start and Leadership bonuses are unchanged."],
    bannerUrl: "",
    bannerPath: "",
    startsAt: now,
    endsAt: kind === "slot" ? null : now + 7 * 24 * HOUR,
    terms: [],
    popupFrequency: "daily",
    ...(kind === "slot"
      ? { slot: { ...DEFAULT_SLOT } }
      : kind === "spin"
        ? { spin: { ...DEFAULT_SPIN, wedges: DEFAULT_SPIN.wedges.map((w) => ({ ...w })), bonusFor: { ...DEFAULT_SPIN.bonusFor } } }
        : { referral: { ...DEFAULT_REFERRAL, levelMultipliers: [...DEFAULT_REFERRAL.levelMultipliers] } }),
  };
}

export default function AdminEventsPage() {
  const { user } = useAuth();
  const { cfg } = useCompPlan();
  const { events, loading } = useAllEvents(true);
  const [now, setNow] = useState(() => Date.now());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<InvestureEvent | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const live = events.filter((e) => e.status === "live");
  const selectedEvent = events.find((e) => e.id === selected) ?? live[0] ?? null;
  const claims = useEventClaims(selectedEvent?.kind === "slot" ? selectedEvent.id : null, "all");
  const spinLog = useSpinLog(selectedEvent?.kind === "spin" ? selectedEvent.id : null, SPIN_LOG_CAP);
  const [spinPage, setSpinPage] = useState(0);
  const spinPages = Math.max(1, Math.ceil(spinLog.length / SPIN_PAGE));
  const spinPageSafe = Math.min(spinPage, spinPages - 1);
  const spinRows = spinLog.slice(spinPageSafe * SPIN_PAGE, spinPageSafe * SPIN_PAGE + SPIN_PAGE);
  useEffect(() => { setSpinPage(0); }, [selectedEvent?.id]);

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Action failed" });
    } finally {
      setBusy(null);
    }
  }

  // Editing an event that is already live: there is nothing to "publish", just save.
  const draftIsLive = !!draft?.id && events.find((e) => e.id === draft.id)?.status === "live";

  async function save(publishRequested: boolean) {
    if (!draft) return;
    const publish = publishRequested && !draftIsLive;
    const err = validateEvent({ ...draft, id: draft.id ?? "new", status: "draft", createdAt: 0, updatedAt: 0 });
    if (err) {
      setMsg({ ok: false, text: err });
      return;
    }
    await run("save", async () => {
      const { id: draftId, ...body } = draft;
      const r = await adminSaveEvent(body, draftId);
      if (draftIsLive) {
        setDraft(null);
        return `${draft.name} updated — members see the new settings on their next spin.`;
      }
      if (publish) {
        const p = await adminSetEventStatus(r.id, "live");
        setDraft(null);
        return `${draft.name} is live — ${p.notified ?? 0} member${p.notified === 1 ? "" : "s"} notified.`;
      }
      setDraft(null);
      return `${draft.name} saved as a draft.`;
    });
  }

  async function uploadBanner(file: File) {
    const { storage } = getFirebase();
    if (!storage || !user?.isAdmin || !draft) return;
    if (!file.type.startsWith("image/")) return setMsg({ ok: false, text: "Banner must be an image." });
    if (file.size > 3 * 1024 * 1024) return setMsg({ ok: false, text: "Banner too large (max 3 MB)." });
    await run("banner", async () => {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `events/${Date.now()}.${ext}`;
      const r = storageRef(storage, path);
      await uploadBytes(r, file, { contentType: file.type });
      const url = await getDownloadURL(r);
      setDraft((d) => (d ? { ...d, bannerUrl: url, bannerPath: path } : d));
      return "Banner uploaded.";
    });
  }

  const previewEvent: InvestureEvent | null = useMemo(() => {
    if (preview) return preview;
    if (!draft) return null;
    return { ...draft, id: draft.id ?? "preview", status: "live", createdAt: now, updatedAt: now };
  }, [preview, draft, now]);

  return (
    <div>
      <TopHeader title="Events" subtitle="Limited-slot placement boosts and time-bound referral multipliers" />

      {msg && !draft && (
        <p className={cn("text-[11px] m-0 mb-3 flex items-start gap-1.5", msg.ok ? "text-green" : "text-red")}>
          {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />} {msg.text}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={() => setDraft(blankDraft("slot"))} className="px-3.5 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium flex items-center gap-1.5 hover:brightness-110">
          <Plus className="w-3.5 h-3.5" /> New slot event
        </button>
        <button onClick={() => setDraft(blankDraft("referral"))} className="px-3.5 py-2 border border-border-strong rounded-lg text-[12px] text-text flex items-center gap-1.5 hover:bg-card-elev">
          <Plus className="w-3.5 h-3.5" /> New referral event
        </button>
        <button onClick={() => setDraft(blankDraft("spin"))} className="px-3.5 py-2 bg-[#F5C66B] text-[#2A1D05] rounded-lg text-[12px] font-medium flex items-center gap-1.5 hover:brightness-110">
          <Dices className="w-3.5 h-3.5" /> New spin event
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-3">
        <div className="flex flex-col gap-3 min-w-0">
          {/* Live / selected event */}
          {selectedEvent && (
            <Card className={cn(selectedEvent.kind === "slot" ? "border-gold/35" : selectedEvent.kind === "spin" ? "border-[#F5C66B]/35" : "border-vault/35")}>
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", selectedEvent.kind === "slot" ? "bg-gold/15 text-gold" : selectedEvent.kind === "spin" ? "bg-[#F5C66B]/15 text-[#F5C66B]" : "bg-vault/15 text-vault")}>
                    {selectedEvent.kind === "slot" ? <Sparkles className="w-5 h-5" /> : selectedEvent.kind === "spin" ? <Dices className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium m-0 flex items-center gap-2">
                      {selectedEvent.name}
                      <StatusPill e={selectedEvent} now={now} />
                    </p>
                    <p className="text-[11px] text-text-muted m-0 mt-0.5">
                      {selectedEvent.kind === "slot" && selectedEvent.slot
                        ? `Slot event · ×${selectedEvent.slot.payoutMultiplier} payouts · ${formatPHP(selectedEvent.slot.price, { short: true })} per slot · max ${selectedEvent.slot.maxPerMember} per member`
                        : selectedEvent.kind === "spin" && selectedEvent.spin
                          ? `Spin event · ${selectedEvent.spin.freeSpinsPerDay} free/day · ${selectedEvent.spin.dailyBudget.toLocaleString()} GP/day in ${selectedEvent.spin.windowsPerDay} window${selectedEvent.spin.windowsPerDay === 1 ? "" : "s"} · avg ${spinAveragePayout(selectedEvent.spin.wedges)} GP/spin`
                          : `Referral event · ${selectedEvent.referral?.levelMultipliers.map((m, i) => (m > 1 ? `L${i + 1} ×${m}` : null)).filter(Boolean).join(" · ") || "no boost"}`}
                      {selectedEvent.endsAt ? ` · ends ${formatEventDate(selectedEvent.endsAt)}` : " · no end date"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Tool icon={Eye} label="Preview pop-up" onClick={() => setPreview(selectedEvent)} />
                  {selectedEvent.status !== "ended" && <Tool icon={Upload} label="Edit" onClick={() => setDraft({ ...selectedEvent })} />}
                  {selectedEvent.status === "draft" && (
                    <Tool icon={Power} label="Publish" busy={busy === `pub-${selectedEvent.id}`} onClick={() => run(`pub-${selectedEvent.id}`, async () => { const r = await adminSetEventStatus(selectedEvent.id, "live"); return `${selectedEvent.name} is live — ${r.notified ?? 0} members notified.`; })} />
                  )}
                  {selectedEvent.status === "live" && selectedEvent.kind === "slot" && (
                    <Tool icon={Plus} label="Add 10 slots" busy={busy === `add-${selectedEvent.id}`} onClick={() => run(`add-${selectedEvent.id}`, async () => { await adminAddEventSlots(selectedEvent.id, 10); return "10 slots added."; })} />
                  )}
                  {selectedEvent.status === "live" && (
                    <Tool icon={X} label="Close now" danger busy={busy === `end-${selectedEvent.id}`} onClick={() => { if (window.confirm(`Close ${selectedEvent.name}? Reserved slots are released; active placements keep their boost.`)) run(`end-${selectedEvent.id}`, async () => { const r = await adminSetEventStatus(selectedEvent.id, "ended"); return `${selectedEvent.name} closed · ${r.released ?? 0} reservation(s) released.`; }); }} />
                  )}
                </div>
              </div>

              {selectedEvent.kind === "slot" && selectedEvent.slot && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                    <Tile label="Taken" value={String(selectedEvent.slot.taken)} sub={`${formatPHP(selectedEvent.slot.taken * selectedEvent.slot.price, { short: true })} placed`} tone="gold" />
                    <Tile label="Reserved" value={String(selectedEvent.slot.reserved)} sub="awaiting payment" tone="amber" />
                    <Tile label="Free" value={String(slotsFree(selectedEvent))} sub={`of ${selectedEvent.slot.totalSlots}`} />
                    <Tile label="Members" value={String(new Set(claims.filter((c) => c.status === "active" || c.status === "reserved").map((c) => c.userId)).size)} sub="holding slots" />
                  </div>
                  <div className="h-2 rounded-full bg-border overflow-hidden flex mb-3">
                    <span className="bg-gold" style={{ width: `${(selectedEvent.slot.taken / selectedEvent.slot.totalSlots) * 100}%` }} />
                    <span className="bg-[#F5C66B]" style={{ width: `${(selectedEvent.slot.reserved / selectedEvent.slot.totalSlots) * 100}%` }} />
                  </div>
                  <ResponsiveTable>
                    <table className="w-full text-[11px] min-w-[560px]">
                      <thead>
                        <tr className="text-text-subtle text-left">
                          <th className="font-normal py-1.5 px-1">Member</th>
                          <th className="font-normal py-1.5 px-1 text-right">Slots</th>
                          <th className="font-normal py-1.5 px-1">Term</th>
                          <th className="font-normal py-1.5 px-1">Status</th>
                          <th className="font-normal py-1.5 px-1">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {claims.length === 0 && <tr><td colSpan={5} className="text-center text-text-subtle py-5">No slots taken yet.</td></tr>}
                        {claims.map((c) => (
                          <tr key={c.id} className="border-t border-border">
                            <td className="py-1.5 px-1">{c.userName}</td>
                            <td className="py-1.5 px-1 text-right font-mono">{c.slots}</td>
                            <td className="py-1.5 px-1">{c.termMonths} mo</td>
                            <td className={cn("py-1.5 px-1", c.status === "active" ? "text-green" : c.status === "reserved" ? "text-[#F5C66B]" : "text-text-subtle")}>
                              {c.status === "reserved" && c.expiresAt ? `Reserved · ${countdown(c.expiresAt, now)} left` : c.status === "active" ? `Active${c.placementId ? ` · ${c.placementId}` : ""}` : c.status === "expired" ? "Expired · released" : "Released"}
                            </td>
                            <td className="py-1.5 px-1 text-text-subtle">{new Date(c.createdAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ResponsiveTable>
                </>
              )}
            </Card>
          )}

          {selectedEvent && selectedEvent.kind === "spin" && selectedEvent.spin && (
            <Card>
              <CardHeader title="Wheel activity" subtitle={`Current window ${spinWindowAt(now, selectedEvent.spin.windowsPerDay).index + 1} of ${selectedEvent.spin.windowsPerDay} · ${Math.floor(selectedEvent.spin.dailyBudget / selectedEvent.spin.windowsPerDay).toLocaleString()} GP per window`} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <Tile label="Spins" value={String(selectedEvent.spin.spins)} sub="all time" />
                <Tile label="GP paid out" value={selectedEvent.spin.spent.toLocaleString()} sub={`${selectedEvent.spin.spins ? Math.round(selectedEvent.spin.spent / selectedEvent.spin.spins) : 0} GP avg`} tone="amber" />
                <Tile label="Biggest win" value={String(selectedEvent.spin.biggestWin)} sub="GP" tone="gold" />
                <Tile label="Try again" value={`${spinLog.length ? Math.round((spinLog.filter((r) => r.points === 0).length / spinLog.length) * 100) : 0}%`} sub="of last spins" />
              </div>
              <ResponsiveTable>
                <table className="w-full text-[11px] min-w-[520px]">
                  <thead>
                    <tr className="text-text-subtle text-left">
                      <th className="font-normal py-1.5 px-1">Member</th>
                      <th className="font-normal py-1.5 px-1">Result</th>
                      <th className="font-normal py-1.5 px-1">Spin</th>
                      <th className="font-normal py-1.5 px-1">Window</th>
                      <th className="font-normal py-1.5 px-1">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spinLog.length === 0 && <tr><td colSpan={5} className="text-center text-text-subtle py-5">No spins yet.</td></tr>}
                    {spinRows.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="py-1.5 px-1">{r.userName}</td>
                        <td className={cn("py-1.5 px-1 font-mono", r.points >= 500 ? "text-[#F5C66B]" : r.points > 0 ? "text-green" : "text-text-subtle")}>{r.points > 0 ? `+${r.points} GP` : r.label}</td>
                        <td className="py-1.5 px-1 text-text-subtle">{r.kind}</td>
                        <td className="py-1.5 px-1 text-text-subtle">{r.window.slice(-2)}</td>
                        <td className="py-1.5 px-1 text-text-subtle">{new Date(r.at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
              {spinLog.length > SPIN_PAGE && (
                <Pager page={spinPageSafe} pages={spinPages} total={spinLog.length} pageSize={SPIN_PAGE} capped={spinLog.length === SPIN_LOG_CAP} onPage={setSpinPage} />
              )}
            </Card>
          )}

          {/* All events */}
          <Card>
            <CardHeader title={`All events (${events.length})`} subtitle="Tap one to see its details above" />
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-text-subtle" /></div>
            ) : events.length === 0 ? (
              <p className="text-[11px] text-text-subtle text-center py-6 m-0">No events yet. Create a slot event or a referral event above.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {events.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setSelected(e.id)}
                    className={cn("flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition", selectedEvent?.id === e.id ? "border-gold/40 bg-gold/5" : "border-border bg-canvas hover:border-border-strong")}
                  >
                    <span className={cn("w-2 h-2 rounded-full shrink-0", e.status === "live" ? (e.kind === "slot" ? "bg-gold" : e.kind === "spin" ? "bg-[#F5C66B]" : "bg-vault") : e.status === "draft" ? "bg-blue" : "bg-text-subtle")} />
                    <span className="flex-1 min-w-0 text-[12px] truncate">
                      {e.name} <span className="text-text-subtle">· {e.kind === "slot" && e.slot ? `slot · ×${e.slot.payoutMultiplier} · ${e.slot.taken}/${e.slot.totalSlots}` : e.kind === "spin" && e.spin ? `spin · ${e.spin.spins} spins · ${e.spin.spent.toLocaleString()} GP` : "referral"}</span>
                    </span>
                    <StatusPill e={e} now={now} />
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Form */}
        <Card className="self-start">
          {draft ? (
            <EventForm draft={draft} setDraft={setDraft} cfg={cfg} busy={busy} isLive={draftIsLive} msg={msg} onSave={save} onUploadBanner={uploadBanner} onCancel={() => { setDraft(null); setMsg(null); }} onPreview={() => previewEvent && setPreview(previewEvent)} />
          ) : (
            <div className="py-10 text-center">
              <Sparkles className="w-6 h-6 text-text-subtle mx-auto mb-2" />
              <p className="text-[12px] text-text m-0">Create an event, or pick one on the left and press Edit.</p>
              <p className="text-[10px] text-text-subtle m-0 mt-1">Slot events sell N slots at a fixed price with a payout multiplier. Referral events multiply commissions per level until an end date.</p>
            </div>
          )}
        </Card>
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title="Pop-up preview" maxWidth="max-w-md">
        {preview && (
          <div className="-mx-4 -mb-4 rounded-b-2xl overflow-hidden border-t border-border">
            <EventBody event={preview} now={now} compact />
          </div>
        )}
      </Modal>
    </div>
  );
}

function StatusPill({ e, now }: { e: InvestureEvent; now: number }) {
  const label = e.status === "ended" ? "Ended" : e.status === "draft" ? "Draft" : eventIsLive(e, now) ? (e.kind === "slot" && e.slot && slotsFree(e) === 0 ? "Sold out" : "LIVE") : e.startsAt > now ? "Scheduled" : "Past end";
  const cls = label === "LIVE" ? "bg-gold/15 text-gold" : label === "Sold out" ? "bg-[#F5C66B]/15 text-[#F5C66B]" : label === "Scheduled" ? "bg-blue/15 text-blue" : label === "Draft" ? "bg-card-elev text-text-muted" : "bg-card-elev text-text-subtle";
  return <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0", cls)}>{label}</span>;
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "gold" | "amber" }) {
  return (
    <div className="bg-canvas border border-border rounded-lg px-3 py-2">
      <p className="text-[9px] uppercase tracking-wide text-text-subtle m-0">{label}</p>
      <p className={cn("text-[18px] font-mono m-0 leading-tight", tone === "gold" ? "text-gold" : tone === "amber" ? "text-[#F5C66B]" : "text-text")}>{value}</p>
      <p className="text-[9px] text-text-subtle m-0">{sub}</p>
    </div>
  );
}

function Tool({ icon: Icon, label, onClick, busy, danger }: { icon: typeof Eye; label: string; onClick: () => void; busy?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} className={cn("text-[10px] px-2 py-1 rounded-md border inline-flex items-center gap-1 disabled:opacity-50 whitespace-nowrap", danger ? "border-red/30 text-red hover:bg-red/10" : "bg-card-elev border-border text-text-muted hover:text-gold hover:border-gold/40")}>
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />} {label}
    </button>
  );
}

function EventForm({
  draft, setDraft, cfg, busy, isLive, msg, onSave, onUploadBanner, onCancel, onPreview,
}: {
  draft: Draft;
  setDraft: (d: Draft | null) => void;
  cfg: ReturnType<typeof useCompPlan>["cfg"];
  busy: string | null;
  isLive: boolean;
  msg: { ok: boolean; text: string } | null;
  onSave: (publish: boolean) => void;
  onUploadBanner: (f: File) => void;
  onCancel: () => void;
  onPreview: () => void;
}) {
  const patch = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const isSlot = draft.kind === "slot";
  const s = draft.slot ?? DEFAULT_SLOT;
  const r = draft.referral ?? DEFAULT_REFERRAL;
  const sp = draft.spin ?? DEFAULT_SPIN;
  const setSpin = (p: Partial<typeof sp>) => patch({ spin: { ...sp, ...p } });
  const chanceTotal = spinChanceTotal(sp.wedges);
  const cycles = (m: number) => Math.round((m * cfg.monthDays) / cfg.cycleDays);
  const fields = "bg-canvas border border-border rounded-md px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40 w-full";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium m-0">{draft.id ? "Edit" : "New"} {isSlot ? "slot" : draft.kind === "spin" ? "spin" : "referral"} event</p>
        <button onClick={onCancel} className="text-text-subtle hover:text-text" aria-label="Cancel"><X className="w-4 h-4" /></button>
      </div>

      <label className="text-[11px] font-medium text-text">Name
        <input className={cn(fields, "mt-1")} value={draft.name} maxLength={60} onChange={(e) => patch({ name: e.target.value })} placeholder={isSlot ? "September Boost" : "Referral Rush"} />
      </label>
      <label className="text-[11px] font-medium text-text">Tagline
        <input className={cn(fields, "mt-1")} value={draft.tagline} maxLength={160} onChange={(e) => patch({ tagline: e.target.value })} placeholder={isSlot ? "Every slot pays ×1.5 for the whole term." : "Double commissions on every placement your directs make."} />
      </label>

      <div className="flex items-center gap-3">
        <div className="relative w-24 h-14 rounded-lg overflow-hidden border border-border bg-canvas flex items-center justify-center shrink-0">
          {draft.bannerUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={draft.bannerUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[9px] text-text-subtle text-center">1200 × 675</span>
          )}
          {busy === "banner" && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader2 className="w-4 h-4 text-gold animate-spin" /></div>}
        </div>
        <div className="flex-1">
          <label className="text-[11px] font-medium text-text block">Banner</label>
          <label className="mt-1 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] border border-border-strong text-text-muted hover:bg-card-elev cursor-pointer">
            <Upload className="w-3 h-3" /> {draft.bannerUrl ? "Replace" : "Upload"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadBanner(f); e.currentTarget.value = ""; }} />
          </label>
          <p className="text-[9px] text-text-subtle m-0 mt-1">PNG / JPG / WebP · 1200 × 675 (16:9), shown whole · keep the top-right corner clear (close button) · max 3 MB</p>
        </div>
      </div>

      <label className="text-[11px] font-medium text-text">Mechanics (one per line)
        <textarea className={cn(fields, "mt-1 min-h-[76px]")} value={draft.mechanics.join("\n")} onChange={(e) => patch({ mechanics: e.target.value.split("\n") })} />
      </label>

      {isSlot ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Num label="Slot price ₱" value={s.price} onChange={(v) => patch({ slot: { ...s, price: v } })} step={100} />
            <Num label="Total slots" value={s.totalSlots} onChange={(v) => patch({ slot: { ...s, totalSlots: v } })} />
            <Num label="Max per member" value={s.maxPerMember} onChange={(v) => patch({ slot: { ...s, maxPerMember: v } })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Num label="Payout multiplier" value={s.payoutMultiplier} onChange={(v) => patch({ slot: { ...s, payoutMultiplier: v } })} step={0.1} gold />
            <Num label="Reservation hold (h)" value={s.holdHours} onChange={(v) => patch({ slot: { ...s, holdHours: v } })} />
          </div>
          <div className="px-3 py-2 bg-canvas border border-border rounded-lg text-[10px] text-text-muted">
            Capacity <span className="font-mono text-text">{formatPHP(s.price * s.totalSlots, { short: true })}</span> · one slot pays{" "}
            <span className="font-mono text-gold">{formatPHP(s.price * cfg.cycleRate / 100 * s.payoutMultiplier)}</span> every {cfg.cycleDays} days
            {cfg.terms[0] ? ` (${cfg.terms[0].months}-mo term: ${formatPHP(s.price * cfg.cycleRate / 100 * s.payoutMultiplier * cycles(cfg.terms[0].months))} + ${formatPHP(s.price, { short: true })} back)` : ""}.
          </div>
        </>
      ) : draft.kind === "spin" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <label className="text-[11px] font-medium text-text">Wheel prizes ({sp.wedges.length} of 12)</label>
              <span className={cn("text-[10px]", Math.abs(chanceTotal - 100) < 0.05 ? "text-green" : "text-red")}>Chances total {chanceTotal}% {Math.abs(chanceTotal - 100) < 0.05 ? "✓" : "— must be 100%"}</span>
            </div>
            <div className="grid grid-cols-[20px_1.4fr_1fr_1fr_28px_24px] gap-1.5 px-1 text-[9px] text-text-subtle"><span /><span>Label</span><span>Game Points</span><span>Chance %</span><span /><span /></div>
            {sp.wedges.map((w, i) => (
              <div key={i} className="grid grid-cols-[20px_1.4fr_1fr_1fr_28px_24px] gap-1.5 items-center px-1">
                <span className="text-[10px] text-text-subtle">{i + 1}</span>
                <input value={w.label} maxLength={24} aria-label="Label" onChange={(e) => setSpin({ wedges: sp.wedges.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className={cn("bg-canvas border rounded-md px-2 py-1.5 text-[11px] outline-none focus:border-gold/40 w-full", w.points >= 500 ? "border-[#F5C66B]/40 text-[#F5C66B]" : "border-border text-text")} />
                <input type="number" min={0} value={w.points} aria-label="Points" onChange={(e) => setSpin({ wedges: sp.wedges.map((x, j) => (j === i ? { ...x, points: Math.max(0, Math.round(parseFloat(e.target.value) || 0)), label: x.label === `${x.points} GP` || x.label === "Try again" ? (Math.round(parseFloat(e.target.value) || 0) === 0 ? "Try again" : `${Math.round(parseFloat(e.target.value) || 0)} GP`) : x.label } : x)) })} className="bg-canvas border border-border rounded-md px-2 py-1.5 text-[11px] font-mono text-text outline-none focus:border-gold/40 w-full" />
                <input type="number" min={0} max={100} step={0.5} value={w.chance} aria-label="Chance" onChange={(e) => setSpin({ wedges: sp.wedges.map((x, j) => (j === i ? { ...x, chance: parseFloat(e.target.value) || 0 } : x)) })} className="bg-canvas border border-border rounded-md px-2 py-1.5 text-[11px] font-mono text-text outline-none focus:border-gold/40 w-full" />
                <input type="color" value={w.color} aria-label="Colour" onChange={(e) => setSpin({ wedges: sp.wedges.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) })} className="w-7 h-7 rounded-md bg-transparent border-0 p-0 cursor-pointer" />
                <button type="button" aria-label="Remove wedge" disabled={sp.wedges.length <= 2} onClick={() => setSpin({ wedges: sp.wedges.filter((_, j) => j !== i) })} className="text-text-subtle hover:text-red disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button type="button" disabled={sp.wedges.length >= 12} onClick={() => setSpin({ wedges: [...sp.wedges, { label: "Try again", points: 0, chance: 0, color: WEDGE_COLORS[sp.wedges.length % WEDGE_COLORS.length] }] })} className="self-start text-[11px] px-2.5 py-1.5 rounded-md border border-dashed border-border-strong text-text-muted hover:text-text disabled:opacity-40">+ Add wedge</button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Num label="Free spins / day" value={sp.freeSpinsPerDay} onChange={(v) => setSpin({ freeSpinsPerDay: v })} />
            <Num label="Daily budget (GP)" value={sp.dailyBudget} onChange={(v) => setSpin({ dailyBudget: v })} step={100} gold />
            <Num label="Max banked bonus" value={sp.maxBankedBonus} onChange={(v) => setSpin({ maxBankedBonus: v })} />
          </div>
          <div className="grid grid-cols-[1fr_1.6fr] gap-2 items-end">
            <Num label="Min. active investment ₱" value={sp.minActive} onChange={(v) => setSpin({ minActive: v })} step={500} gold />
            <p className="text-[10px] text-text-subtle m-0 pb-2">
              Who can spin:{" "}
              {sp.minActive > 0
                ? `members with at least ${formatPHP(sp.minActive, { short: true })} active in ${draft.terms.length ? draft.terms.map((t) => `${t}-mo`).join(" / ") : "any"} placements`
                : draft.terms.length
                  ? `members with an active ${draft.terms.map((t) => `${t}-mo`).join(" / ")} placement`
                  : "everyone"}
              . Set the terms with the chips below.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-text block mb-1">Prize windows per day</label>
              <div className="flex gap-1.5">
                {([1, 2, 3, 4] as const).map((n) => <Chip key={n} on={sp.windowsPerDay === n} onClick={() => setSpin({ windowsPerDay: n })}>{n}</Chip>)}
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-text block mb-1">Unspent budget</label>
              <div className="flex gap-1.5">
                <Chip on={sp.carryOver} onClick={() => setSpin({ carryOver: true })}>Carries over</Chip>
                <Chip on={!sp.carryOver} onClick={() => setSpin({ carryOver: false })}>Expires</Chip>
              </div>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-text block mb-1">Bonus spin (+1) for</label>
            <div className="flex flex-wrap gap-1.5">
              <Chip on={sp.bonusFor.placement} onClick={() => setSpin({ bonusFor: { ...sp.bonusFor, placement: !sp.bonusFor.placement } })}>Placement activated</Chip>
              <Chip on={sp.bonusFor.referral} onClick={() => setSpin({ bonusFor: { ...sp.bonusFor, referral: !sp.bonusFor.referral } })}>Referral joins</Chip>
              <Chip on={sp.bonusFor.withdrawal} onClick={() => setSpin({ bonusFor: { ...sp.bonusFor, withdrawal: !sp.bonusFor.withdrawal } })}>Withdrawal released</Chip>
            </div>
          </div>
          <div className="px-3 py-2 bg-canvas border border-border rounded-lg text-[10px] text-text-muted">
            {Math.floor(sp.dailyBudget / sp.windowsPerDay).toLocaleString()} GP per window · average payout <span className="font-mono text-[#F5C66B]">{spinAveragePayout(sp.wedges)} GP</span> per spin → about <span className="font-mono text-text">{spinAveragePayout(sp.wedges) > 0 ? Math.floor(sp.dailyBudget / sp.windowsPerDay / spinAveragePayout(sp.wedges)).toLocaleString() : "∞"}</span> winning spins per window before it runs dry.
            {draft.endsAt ? ` Over ${Math.max(1, Math.ceil((draft.endsAt - draft.startsAt) / 86_400_000))} day(s) the event can pay at most ${(sp.dailyBudget * Math.max(1, Math.ceil((draft.endsAt - draft.startsAt) / 86_400_000))).toLocaleString()} GP.` : ""}
          </div>
        </>
      ) : (
        <div>
          <label className="text-[11px] font-medium text-text block mb-1">Commission multiplier per level</label>
          <div className="grid grid-cols-6 gap-1.5">
            {cfg.referralLevels.map((base, i) => (
              <label key={i} className="flex flex-col items-center gap-1 text-[9px] text-text-subtle">
                L{i + 1} · {base}%
                <input type="number" step={0.5} min={1} max={10} value={r.levelMultipliers[i] ?? 1}
                  onChange={(e) => { const lm = [...r.levelMultipliers]; while (lm.length < cfg.referralLevels.length) lm.push(1); lm[i] = parseFloat(e.target.value) || 1; patch({ referral: { levelMultipliers: lm } }); }}
                  className={cn("w-full text-center bg-canvas border rounded-md px-1 py-1.5 text-[12px] font-mono outline-none", (r.levelMultipliers[i] ?? 1) > 1 ? "border-vault/50 text-vault" : "border-border text-text")} />
                <span className="text-text-muted">= {Math.round(base * (r.levelMultipliers[i] ?? 1) * 100) / 100}%</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="text-[11px] font-medium text-text block mb-1">{draft.kind === "spin" ? "Placement terms that count (eligibility)" : "Allowed terms"}</label>
        <div className="flex flex-wrap gap-1.5">
          <Chip on={draft.terms.length === 0} onClick={() => patch({ terms: [] })}>All</Chip>
          {cfg.terms.map((t) => (
            <Chip key={t.months} on={draft.terms.includes(t.months)} onClick={() => patch({ terms: draft.terms.includes(t.months) ? draft.terms.filter((x) => x !== t.months) : [...draft.terms, t.months].sort((a, b) => a - b) })}>
              {t.months} mo
            </Chip>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] font-medium text-text">Starts
          <input type="datetime-local" className={cn(fields, "mt-1 [color-scheme:dark]")} value={toLocalInput(draft.startsAt)} onChange={(e) => patch({ startsAt: fromLocalInput(e.target.value) ?? draft.startsAt })} />
        </label>
        <label className="text-[11px] font-medium text-text">Ends {isSlot ? "(optional)" : ""}
          <input type="datetime-local" className={cn(fields, "mt-1 [color-scheme:dark]")} value={toLocalInput(draft.endsAt)} onChange={(e) => patch({ endsAt: fromLocalInput(e.target.value) })} />
        </label>
      </div>

      <div>
        <label className="text-[11px] font-medium text-text block mb-1">Show the pop-up</label>
        <div className="flex flex-wrap gap-1.5">
          {([["daily", "Once a day"], ["always", "Every login"], ["once", "Once until dismissed"]] as [PopupFrequency, string][]).map(([v, l]) => (
            <Chip key={v} on={draft.popupFrequency === v} onClick={() => patch({ popupFrequency: v })}>{l}</Chip>
          ))}
        </div>
      </div>

      {msg && (
        <p className={cn("text-[11px] m-0 flex items-start gap-1.5 px-3 py-2 rounded-lg border", msg.ok ? "text-green border-green/30 bg-green/5" : "text-red border-red/30 bg-red/5")}>
          {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />} {msg.text}
        </p>
      )}

      <div className="flex flex-wrap gap-2 justify-end pt-1">
        <button onClick={onPreview} className="px-3 py-2 border border-border-strong rounded-lg text-[12px] text-text hover:bg-card-elev flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Preview</button>
        {isLive ? (
          <button onClick={() => onSave(false)} disabled={busy === "save"} className="px-3.5 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium hover:brightness-110 disabled:opacity-50 flex items-center gap-1.5">
            {busy === "save" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Save changes (live)
          </button>
        ) : (
          <>
            <button onClick={() => onSave(false)} disabled={busy === "save"} className="px-3 py-2 border border-border-strong rounded-lg text-[12px] text-text hover:bg-card-elev disabled:opacity-50">Save draft</button>
            <button onClick={() => onSave(true)} disabled={busy === "save"} className="px-3.5 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium hover:brightness-110 disabled:opacity-50 flex items-center gap-1.5">
              {busy === "save" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />} {draft.id ? "Save & publish" : "Publish now"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Numbered pager: 1 … 4 5 [6] 7 8 … 20, with Previous/Next. */
function Pager({ page, pages, total, pageSize, capped, onPage }: { page: number; pages: number; total: number; pageSize: number; capped?: boolean; onPage: (p: number) => void }) {
  // Always show first, last, and a window of 2 around the current page.
  const numbers: (number | "gap")[] = [];
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - page) <= 2) numbers.push(i);
    else if (numbers[numbers.length - 1] !== "gap") numbers.push("gap");
  }
  const start = page * pageSize;
  const btn = "min-w-[28px] h-7 px-2 rounded-md text-[11px] border flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
      <p className="text-[10px] text-text-subtle m-0">
        Showing {start + 1}–{Math.min(start + pageSize, total)} of {total}{capped && <span className="ml-1 text-text-dim">(latest {total})</span>}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(Math.max(0, page - 1))} disabled={page === 0} aria-label="Previous page" className={cn(btn, "bg-card border-border-strong text-text-muted hover:text-text")}><ChevronLeft className="w-3 h-3" /></button>
        {numbers.map((n, i) =>
          n === "gap" ? (
            <span key={`gap${i}`} className="text-[11px] text-text-subtle px-1">…</span>
          ) : (
            <button key={n} onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined} className={cn(btn, n === page ? "bg-gold text-gold-dark border-gold font-medium" : "bg-card border-border-strong text-text-muted hover:text-text")}>{n + 1}</button>
          ),
        )}
        <button onClick={() => onPage(Math.min(pages - 1, page + 1))} disabled={page >= pages - 1} aria-label="Next page" className={cn(btn, "bg-card border-border-strong text-text-muted hover:text-text")}><ChevronRight className="w-3 h-3" /></button>
      </div>
    </div>
  );
}

function Num({ label, value, onChange, step = 1, gold }: { label: string; value: number; onChange: (v: number) => void; step?: number; gold?: boolean }) {
  return (
    <label className="text-[11px] font-medium text-text">{label}
      <input type="number" step={step} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(parseFloat(e.target.value))} className={cn("mt-1 bg-canvas border border-border rounded-md px-3 py-2 text-[12px] font-mono outline-none focus:border-gold/40 w-full", gold ? "text-gold" : "text-text")} />
    </label>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("px-3 py-1.5 rounded-full text-[11px] border transition", on ? "bg-gold/15 border-gold/40 text-gold font-medium" : "bg-canvas border-border text-text-muted hover:text-text")}>
      {children}
    </button>
  );
}
