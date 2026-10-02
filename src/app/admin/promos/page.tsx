"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Loader2, Image as ImageIcon, Video as VideoIcon, Link2, X, CheckCircle2, AlertCircle, HelpCircle, Play } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { PromoCard } from "@/components/promos/PromoPopup";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { describeStorageError } from "@/lib/storage";
import { useFaq, uploadFaqImage, uploadFaqVideo, youtubeMedia, formatDuration, type FaqMedia } from "@/lib/faq";
import {
  usePromos,
  savePromos,
  newPromo,
  promoState,
  promoHasContent,
  PROMO_LINK_CHOICES,
  PROMO_MAX_TITLE,
  PROMO_MAX_BODY,
  PROMO_MAX_BUTTON,
  type Promo,
  type PromoFrequency,
  type PromoAudience,
} from "@/lib/promos";

const input = "w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40";

/** <input type="datetime-local"> value for a timestamp, in this device's time zone. */
function toLocalInput(ts: number | null): string {
  if (!ts) return "";
  const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}
function fromLocalInput(v: string): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

const STATE_CHIP: Record<ReturnType<typeof promoState>, { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-green/15 text-green" },
  scheduled: { label: "Scheduled", cls: "bg-blue/15 text-blue" },
  ended: { label: "Ended", cls: "bg-card-elev text-text-subtle" },
  draft: { label: "Draft", cls: "bg-card-elev text-text-muted" },
};

export default function AdminPromosPage() {
  const { user } = useAuth();
  const { promos, loading } = usePromos();
  const { faq } = useFaq();

  // Local working copy; saved as one document.
  const [items, setItems] = useState<Promo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState<"image" | "video" | null>(null);
  const [ytUrl, setYtUrl] = useState<string | null>(null);
  const [faqPick, setFaqPick] = useState(false);
  const imgInput = useRef<HTMLInputElement>(null);
  const vidInput = useRef<HTMLInputElement>(null);

  // Take the server copy whenever there are no unsaved edits.
  useEffect(() => {
    if (!dirty) setItems(promos);
  }, [promos, dirty]);

  const current = items.find((p) => p.id === selected) ?? null;
  const now = Date.now();

  function patch(p: Partial<Promo>) {
    if (!current) return;
    setItems((list) => list.map((it) => (it.id === current.id ? { ...it, ...p, updatedAt: Date.now() } : it)));
    setDirty(true);
    setMsg(null);
  }

  function add() {
    const p = newPromo();
    setItems((list) => [p, ...list]);
    setSelected(p.id);
    setDirty(true);
    setMsg(null);
  }

  function remove(id: string) {
    setItems((list) => list.filter((p) => p.id !== id));
    if (selected === id) setSelected(null);
    setDirty(true);
  }

  async function save(next?: Promo[]) {
    if (!user) return;
    const list = next ?? items;
    const liveEmpty = list.find((p) => p.status === "live" && !promoHasContent(p));
    if (liveEmpty) return setMsg({ ok: false, text: "A live pop-up needs a title, a message or a picture/video. Add one or set it back to Draft." });
    const badWindow = list.find((p) => p.startAt && p.endAt && p.endAt <= p.startAt);
    if (badWindow) return setMsg({ ok: false, text: `"${badWindow.name || badWindow.title || "A pop-up"}" ends before it starts. Fix the dates.` });
    setSaving(true);
    setMsg(null);
    try {
      await savePromos(list, user.uid);
      setDirty(false);
      setMsg({ ok: true, text: "Saved. Members see live pop-ups the next time they open the app." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function addFile(kind: "image" | "video", file: File | undefined) {
    if (!file || !current || !user) return;
    const { storage } = getFirebase();
    if (!storage) return;
    setUploading(kind);
    setMsg(null);
    try {
      const m = kind === "image" ? await uploadFaqImage(storage, user.uid, file) : await uploadFaqVideo(storage, user.uid, file);
      patch({ media: m });
    } catch (e) {
      setMsg({ ok: false, text: describeStorageError(e) });
    } finally {
      setUploading(null);
    }
  }

  function addYoutube() {
    if (ytUrl === null) return;
    const m = youtubeMedia(ytUrl);
    if (!m) return setMsg({ ok: false, text: "That doesn't look like a YouTube link." });
    patch({ media: m });
    setYtUrl(null);
  }

  // Videos and pictures already uploaded for the Help & FAQ page, ready to reuse.
  const faqMedia: { q: string; m: FaqMedia }[] = faq.items.flatMap((it) => it.media.map((m) => ({ q: it.question || "Untitled question", m })));

  return (
    <div>
      <TopHeader title="Pop-up ads" subtitle="Announcements, how-to videos and offers shown to members after they sign in" />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={add} className="px-3 py-2 rounded-lg bg-gold text-gold-dark text-[12px] font-medium flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New pop-up
        </button>
        <button onClick={() => save()} disabled={!dirty || saving} className="px-3 py-2 rounded-lg border border-border-strong text-[12px] text-text disabled:opacity-40 flex items-center gap-1.5">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {dirty ? "Save changes" : "Saved"}
        </button>
        {msg && (
          <span className={cn("text-[11px] flex items-center gap-1.5", msg.ok ? "text-green" : "text-red")}>
            {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />} {msg.text}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_340px] gap-3 items-start">
        {/* list */}
        <Card className="!p-2">
          {loading && <p className="text-[11px] text-text-subtle p-3 m-0">Loading…</p>}
          {!loading && items.length === 0 && (
            <p className="text-[11px] text-text-subtle p-3 m-0 leading-relaxed">
              No pop-ups yet. Press <span className="text-gold">New pop-up</span> to make one — for example your “How to earn” video.
            </p>
          )}
          {items.map((p) => {
            const st = STATE_CHIP[promoState(p, now)];
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={cn("w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2 transition", selected === p.id ? "bg-card-elev" : "hover:bg-card-elev/50")}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] m-0 truncate">{p.name || p.title || "Untitled pop-up"}</p>
                  <p className="text-[10px] text-text-subtle m-0 mt-0.5 truncate">
                    {p.media ? (p.media.kind === "image" ? "Picture" : "Video") : "Text only"} · {p.frequency === "once" ? "shown once" : p.frequency === "daily" ? "once a day" : "every visit"}
                  </p>
                </div>
                <span className={cn("text-[9px] px-2 py-0.5 rounded-full font-medium shrink-0", st.cls)}>{st.label}</span>
              </button>
            );
          })}
        </Card>

        {/* editor */}
        {current ? (
          <Card>
            <CardHeader
              title="Edit pop-up"
              right={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => patch({ status: current.status === "live" ? "draft" : "live" })}
                    className={cn("px-3 py-1 rounded-full text-[10px] font-medium border transition", current.status === "live" ? "bg-green/15 border-green/40 text-green" : "bg-canvas border-border text-text-muted")}
                  >
                    {current.status === "live" ? "Live — members can see it" : "Draft — hidden"}
                  </button>
                  <button onClick={() => remove(current.id)} className="p-1.5 rounded-md text-text-subtle hover:text-red hover:bg-red/10" aria-label="Delete pop-up">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              }
            />
            <div className="flex flex-col gap-3.5">
              <Field label="Name (only you see this)">
                <input className={input} value={current.name} maxLength={60} placeholder="e.g. How to earn video" onChange={(e) => patch({ name: e.target.value })} />
              </Field>
              <Field label="Title" count={`${current.title.length}/${PROMO_MAX_TITLE}`}>
                <input className={input} value={current.title} maxLength={PROMO_MAX_TITLE} placeholder="e.g. New here? Watch how to earn" onChange={(e) => patch({ title: e.target.value })} />
              </Field>
              <Field label="Message (optional)" count={`${current.body.length}/${PROMO_MAX_BODY}`} hint="Blank line = new paragraph · start a line with “- ” for a bullet · **bold**">
                <textarea className={cn(input, "min-h-[90px] resize-y leading-relaxed")} value={current.body} maxLength={PROMO_MAX_BODY} placeholder="A short line or two about what this is." onChange={(e) => patch({ body: e.target.value })} />
              </Field>

              {/* media */}
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-text">Picture or video <span className="text-text-subtle font-normal">· one per pop-up</span></span>
                  <div className="flex flex-wrap gap-1.5">
                    <input ref={imgInput} type="file" accept="image/*" hidden onChange={(e) => { addFile("image", e.target.files?.[0]); e.target.value = ""; }} />
                    <input ref={vidInput} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => { addFile("video", e.target.files?.[0]); e.target.value = ""; }} />
                    <MediaButton icon={ImageIcon} label="Picture" busy={uploading === "image"} disabled={!!uploading} onClick={() => imgInput.current?.click()} />
                    <MediaButton icon={VideoIcon} label="Upload video" busy={uploading === "video"} disabled={!!uploading} onClick={() => vidInput.current?.click()} />
                    <MediaButton icon={Link2} label="YouTube link" disabled={!!uploading} onClick={() => { setYtUrl(""); setFaqPick(false); }} />
                    <MediaButton icon={HelpCircle} label="From FAQ" disabled={!!uploading || faqMedia.length === 0} onClick={() => { setFaqPick((v) => !v); setYtUrl(null); }} />
                  </div>
                </div>
                {ytUrl !== null && (
                  <div className="flex gap-1.5">
                    <input autoFocus className={input} value={ytUrl} placeholder="https://youtu.be/… or a youtube.com/watch link" onChange={(e) => setYtUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addYoutube(); if (e.key === "Escape") setYtUrl(null); }} />
                    <button onClick={addYoutube} className="px-3 rounded-lg bg-gold text-gold-dark text-[11px] font-medium whitespace-nowrap">Add link</button>
                    <button onClick={() => setYtUrl(null)} className="px-2 rounded-lg border border-border text-text-muted" aria-label="Cancel"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}
                {faqPick && (
                  <div className="border border-border rounded-lg p-2 flex flex-col gap-1 max-h-[220px] overflow-y-auto">
                    <p className="text-[10px] text-text-subtle m-0 px-1 pb-1">Reuse something already on the Help &amp; FAQ page (no second upload, no extra storage):</p>
                    {faqMedia.map(({ q, m }, i) => (
                      <button key={i} onClick={() => { patch({ media: m }); setFaqPick(false); }} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-card-elev text-left">
                        <span className="relative w-14 h-9 rounded bg-canvas border border-border overflow-hidden shrink-0 flex items-center justify-center">
                          {(m.poster || m.thumb || (m.kind === "image" && m.url)) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.poster ?? m.thumb ?? m.url} alt="" className="w-full h-full object-cover" />
                          ) : null}
                          {m.kind !== "image" && <Play className="absolute w-3.5 h-3.5 text-white drop-shadow" fill="currentColor" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11px] truncate">{q}</span>
                          <span className="block text-[10px] text-text-subtle">{m.kind === "image" ? "Picture" : m.kind === "youtube" ? "YouTube video" : `Video${m.duration ? ` · ${formatDuration(m.duration)}` : ""}`}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {current.media ? (
                  <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-canvas border border-border">
                    <span className="relative w-16 h-10 rounded bg-card-elev overflow-hidden shrink-0 flex items-center justify-center">
                      {(current.media.poster || current.media.thumb || (current.media.kind === "image" && current.media.url)) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={current.media.poster ?? current.media.thumb ?? current.media.url} alt="" className="w-full h-full object-cover" />
                      ) : null}
                      {current.media.kind !== "image" && <Play className="absolute w-4 h-4 text-white drop-shadow" fill="currentColor" />}
                    </span>
                    <span className="flex-1 text-[11px] text-text-muted">
                      {current.media.kind === "image" ? "Picture" : current.media.kind === "youtube" ? "YouTube video" : `Uploaded video${current.media.duration ? ` · ${formatDuration(current.media.duration)}` : ""}`}
                    </span>
                    <button onClick={() => patch({ media: null })} className="text-[10px] text-text-muted hover:text-red">Remove</button>
                  </div>
                ) : (
                  <p className="text-[10px] text-text-subtle m-0">None yet. Uploads allow videos up to 40 MB and 2 minutes.</p>
                )}
              </div>

              {/* button */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Button text (optional)">
                  <input className={input} value={current.buttonLabel} maxLength={PROMO_MAX_BUTTON} placeholder="e.g. Start earning" onChange={(e) => patch({ buttonLabel: e.target.value })} />
                </Field>
                <Field label="Button opens" hint="Pick a page, or type a full https:// address">
                  <input className={input} list="promo-links" value={current.buttonHref} placeholder="/plans" onChange={(e) => patch({ buttonHref: e.target.value })} />
                  <datalist id="promo-links">
                    {PROMO_LINK_CHOICES.map((c) => <option key={c.href} value={c.href}>{c.label}</option>)}
                  </datalist>
                </Field>
              </div>

              {/* who / when / how often */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Who sees it">
                  <select className={input} value={current.audience} onChange={(e) => patch({ audience: e.target.value as PromoAudience })}>
                    <option value="all">Every member</option>
                    <option value="noPlacement">Members with no placement yet</option>
                    <option value="active">Members with an active placement</option>
                  </select>
                </Field>
                <Field label="How often">
                  <select className={input} value={current.frequency} onChange={(e) => patch({ frequency: e.target.value as PromoFrequency })}>
                    <option value="once">Once — until they close it</option>
                    <option value="daily">Once a day</option>
                    <option value="always">Every time they open the app</option>
                  </select>
                </Field>
                <Field label="Starts (optional)" hint="Empty = as soon as it is Live">
                  <input type="datetime-local" className={cn(input, "[color-scheme:dark]")} value={toLocalInput(current.startAt)} onChange={(e) => patch({ startAt: fromLocalInput(e.target.value) })} />
                </Field>
                <Field label="Ends (optional)" hint="Empty = until you switch it off">
                  <input type="datetime-local" className={cn(input, "[color-scheme:dark]")} value={toLocalInput(current.endAt)} onChange={(e) => patch({ endAt: fromLocalInput(e.target.value) })} />
                </Field>
              </div>
              <p className="text-[10px] text-text-subtle m-0">Times use this device&apos;s time zone. If an event pop-up is also running, the event shows first and this one right after.</p>
            </div>
          </Card>
        ) : (
          <Card>
            <p className="text-[12px] text-text-muted m-0 py-10 text-center">Pick a pop-up on the left, or make a new one.</p>
          </Card>
        )}

        {/* preview */}
        <div className="lg:sticky lg:top-4">
          <p className="text-[10px] uppercase tracking-wider text-text-subtle m-0 mb-1.5">What members see</p>
          {current ? (
            <div className="rounded-3xl bg-card border border-gold/30 shadow-xl overflow-hidden">
              <PromoCard promo={current} onDismiss={() => {}} />
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border p-8 text-center text-[11px] text-text-subtle">The preview appears here.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, count, children }: { label: string; hint?: string; count?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-[11px] font-medium text-text">
        {label}
        {count && <span className="text-[10px] text-text-subtle font-normal font-mono">{count}</span>}
      </span>
      {children}
      {hint && <span className="text-[10px] text-text-subtle">{hint}</span>}
    </label>
  );
}

function MediaButton({ icon: Icon, label, onClick, disabled, busy }: { icon: typeof ImageIcon; label: string; onClick: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="px-2.5 py-1.5 rounded-lg border border-border text-[11px] text-text-muted hover:text-text hover:border-border-strong flex items-center gap-1.5 disabled:opacity-40">
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />} {label}
    </button>
  );
}
