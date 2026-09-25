"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Plus, ArrowUp, ArrowDown, Trash2, Loader2, Image as ImageIcon, Video as VideoIcon, Link2 as Youtube, X, Eye, ExternalLink, CheckCircle2, AlertCircle, GripVertical, Search } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { FaqAnswer } from "@/components/faq/FaqAnswer";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { describeStorageError } from "@/lib/storage";
import {
  useFaq,
  useFaqVotes,
  saveFaq,
  newFaqItem,
  faqCategories,
  uploadFaqImage,
  uploadFaqVideo,
  youtubeMedia,
  formatDuration,
  FAQ_MAX_MEDIA,
  FAQ_MAX_QUESTION,
  FAQ_MAX_ANSWER,
  FAQ_MAX_CAPTION,
  DEFAULT_CATEGORY,
  type FaqItem,
  type FaqMedia,
} from "@/lib/faq";

export default function AdminFaqPage() {
  const { user } = useAuth();
  const { faq, loading } = useFaq();
  const votes = useFaqVotes();

  // Local working copy of the list; saved as a whole document.
  const [items, setItems] = useState<FaqItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState<"image" | "video" | null>(null);
  const [newCat, setNewCat] = useState<string | null>(null);
  const [ytUrl, setYtUrl] = useState<string | null>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const vidInput = useRef<HTMLInputElement>(null);

  // Take the server copy whenever we have no unsaved edits.
  useEffect(() => {
    if (!dirty) setItems(faq.items);
  }, [faq.items, dirty]);

  const categories = useMemo(() => faqCategories(items), [items]);
  const current = items.find((it) => it.id === selected) ?? null;
  const published = items.filter((it) => it.status === "published").length;

  function patch(p: Partial<FaqItem>) {
    if (!current) return;
    setItems((list) => list.map((it) => (it.id === current.id ? { ...it, ...p, updatedAt: Date.now() } : it)));
    setDirty(true);
  }

  function addNew() {
    const it = newFaqItem(current?.category ?? categories[0] ?? DEFAULT_CATEGORY);
    setItems((list) => [...list, it]);
    setSelected(it.id);
    setPreview(false);
    setDirty(true);
  }

  function remove(id: string) {
    if (!window.confirm("Delete this question? Members will no longer see it.")) return;
    setItems((list) => list.filter((it) => it.id !== id));
    if (selected === id) setSelected(null);
    setDirty(true);
  }

  /** Move within the same category (keeps the category grouping intact). */
  function move(id: string, dir: -1 | 1) {
    setItems((list) => {
      const i = list.findIndex((it) => it.id === id);
      if (i < 0) return list;
      const cat = list[i].category;
      let j = i + dir;
      while (j >= 0 && j < list.length && list[j].category !== cat) j += dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  }

  async function save() {
    if (!user) return;
    const bad = items.find((it) => it.status === "published" && (it.question.trim().length < 3 || (!it.answer.trim() && it.media.length === 0)));
    if (bad) {
      setSelected(bad.id);
      setMsg({ ok: false, text: `"${bad.question || "Untitled"}" is published but has no question or answer yet.` });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await saveFaq(items, user.uid);
      setDirty(false);
      setMsg({ ok: true, text: "FAQ saved. Members see published questions right away." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  async function addFile(kind: "image" | "video", file: File | undefined) {
    if (!file || !current || !user) return;
    if (current.media.length >= FAQ_MAX_MEDIA) return setMsg({ ok: false, text: `Up to ${FAQ_MAX_MEDIA} media items per question.` });
    const { storage } = getFirebase();
    if (!storage) return setMsg({ ok: false, text: "Uploads are unavailable in demo mode." });
    setUploading(kind);
    setMsg(null);
    try {
      const m = kind === "image" ? await uploadFaqImage(storage, user.uid, file) : await uploadFaqVideo(storage, user.uid, file);
      patch({ media: [...current.media, m] });
    } catch (e) {
      setMsg({ ok: false, text: describeStorageError(e) });
    } finally {
      setUploading(null);
    }
  }

  function addYoutube() {
    if (!current || ytUrl === null) return;
    const m = youtubeMedia(ytUrl);
    if (!m) return setMsg({ ok: false, text: "That doesn't look like a YouTube link." });
    if (current.media.length >= FAQ_MAX_MEDIA) return setMsg({ ok: false, text: `Up to ${FAQ_MAX_MEDIA} media items per question.` });
    patch({ media: [...current.media, m] });
    setYtUrl(null);
  }

  function setMedia(i: number, p: Partial<FaqMedia> | null) {
    if (!current) return;
    const next = current.media.map((m, j) => (j === i ? (p ? { ...m, ...p } : null) : m)).filter((m): m is FaqMedia => !!m);
    patch({ media: next });
  }

  const f = filter.trim().toLowerCase();
  const listGroups = useMemo(() => {
    const map = new Map<string, FaqItem[]>();
    for (const it of items) {
      if (f && !it.question.toLowerCase().includes(f)) continue;
      map.set(it.category, [...(map.get(it.category) ?? []), it]);
    }
    return [...map.entries()];
  }, [items, f]);

  if (!user?.isAdmin) return null;

  const fields = "bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40 w-full";

  return (
    <div>
      <TopHeader title="FAQ" subtitle={`${published} published · ${items.length - published} draft${items.length - published === 1 ? "" : "s"} · members see published questions only`} />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={addNew} className="px-3.5 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium flex items-center gap-1.5 hover:brightness-110"><Plus className="w-3.5 h-3.5" /> New question</button>
        <Link href="/faq" className="px-3.5 py-2 border border-border-strong rounded-lg text-[12px] text-text flex items-center gap-1.5 hover:bg-card-elev"><ExternalLink className="w-3.5 h-3.5" /> View as member</Link>
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-[10px] px-2 py-1 rounded-full bg-[#F5C66B]/15 text-[#F5C66B] font-semibold">Unsaved changes</span>}
          <button onClick={save} disabled={saving || !dirty} className="px-3.5 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium flex items-center gap-1.5 hover:brightness-110 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Save changes
          </button>
        </div>
      </div>

      {msg && (
        <p className={cn("text-[11px] m-0 mb-3 flex items-start gap-1.5", msg.ok ? "text-green" : "text-red")}>
          {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />} {msg.text}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3 items-start">
        {/* List */}
        <div className={cn("bg-card border border-border rounded-xl flex flex-col overflow-hidden", selected && "max-lg:hidden")}>
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
            <Search className="w-3.5 h-3.5 text-text-subtle shrink-0" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter questions" aria-label="Filter questions" className="flex-1 min-w-0 bg-transparent text-[12px] text-text outline-none placeholder:text-text-subtle" />
            <span className="text-[9px] text-text-subtle whitespace-nowrap">arrows reorder</span>
          </div>
          <div className="flex flex-col p-2 gap-0.5 overflow-y-auto" style={{ maxHeight: "calc(100dvh - 300px)", minHeight: 240 }}>
            {loading && items.length === 0 ? (
              <div className="py-10 flex justify-center"><Loader2 className="w-4 h-4 text-gold animate-spin" /></div>
            ) : listGroups.length === 0 ? (
              <p className="text-[11px] text-text-subtle text-center py-10 m-0">{items.length ? "No questions match." : "No questions yet. Click New question to start."}</p>
            ) : (
              listGroups.map(([cat, list]) => (
                <div key={cat} className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-text-subtle px-2 pt-2 pb-1">{cat}</span>
                  {list.map((it) => (
                    <div key={it.id} className={cn("group flex items-center gap-2 pl-1.5 pr-2 py-1.5 rounded-lg cursor-pointer", selected === it.id ? "bg-card-elev border border-gold/40" : "hover:bg-card-elev/60 border border-transparent")} onClick={() => { setSelected(it.id); setPreview(false); }}>
                      <GripVertical className="w-3.5 h-3.5 text-text-dim shrink-0" />
                      <span className={cn("flex-1 min-w-0 truncate text-[12px]", it.status === "draft" ? "text-text-muted" : "text-text", selected === it.id && "font-semibold")}>{it.question || <span className="italic text-text-subtle">Untitled question</span>}</span>
                      <span className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                        <button onClick={(e) => { e.stopPropagation(); move(it.id, -1); }} aria-label="Move up" className="w-6 h-6 rounded-md text-text-muted hover:text-text hover:bg-canvas flex items-center justify-center"><ArrowUp className="w-3.5 h-3.5" /></button>
                        <button onClick={(e) => { e.stopPropagation(); move(it.id, 1); }} aria-label="Move down" className="w-6 h-6 rounded-md text-text-muted hover:text-text hover:bg-canvas flex items-center justify-center"><ArrowDown className="w-3.5 h-3.5" /></button>
                      </span>
                      <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0", it.status === "published" ? "bg-gold/15 text-gold" : "bg-white/8 text-text-muted")}>{it.status === "published" ? "Live" : "Draft"}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Editor */}
        <div className={cn(!selected && "max-lg:hidden")}>
          {!current ? (
            <div className="bg-card border border-border rounded-xl flex items-center justify-center py-16">
              <p className="text-[12px] text-text-muted m-0 text-center px-6">Pick a question on the left, or click New question.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2 min-w-0">
                  <button onClick={() => setSelected(null)} className="lg:hidden text-[11px] text-text-muted hover:text-text">← Back</button>
                  <span className="text-[13px] font-medium truncate">{preview ? "Preview" : "Edit question"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-text-muted whitespace-nowrap">Helpful <span className="font-mono text-gold">{votes[current.id]?.up ?? 0}</span> · Not helpful <span className="font-mono text-red">{votes[current.id]?.down ?? 0}</span></span>
                  <button onClick={() => setPreview((p) => !p)} className={cn("text-[11px] px-2.5 py-1.5 rounded-md border flex items-center gap-1.5", preview ? "border-gold/40 text-gold bg-gold/10" : "border-border-strong text-text-muted hover:text-text")}><Eye className="w-3.5 h-3.5" /> {preview ? "Back to editing" : "Preview"}</button>
                  <button onClick={() => remove(current.id)} className="text-[11px] px-2.5 py-1.5 rounded-md border border-red/30 text-red hover:bg-red/10 flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                </div>
              </div>

              {preview ? (
                <div className="p-4">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-text-subtle">{current.category}</span>
                  <div className="mt-2 bg-canvas border border-gold/40 rounded-2xl px-4 py-3.5">
                    <p className="text-[13.5px] font-semibold m-0 mb-3">{current.question || "Untitled question"}</p>
                    <FaqAnswer item={current} />
                  </div>
                </div>
              ) : (
                <div className="p-4 flex flex-col gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3">
                    <label className="text-[11px] font-medium text-text">Question
                      <input className={cn(fields, "mt-1")} value={current.question} maxLength={FAQ_MAX_QUESTION} onChange={(e) => patch({ question: e.target.value })} placeholder="When are withdrawals released?" />
                    </label>
                    <label className="text-[11px] font-medium text-text">Category
                      {newCat === null ? (
                        <select className={cn(fields, "mt-1")} value={current.category} onChange={(e) => { if (e.target.value === "__new") setNewCat(""); else patch({ category: e.target.value }); }}>
                          {(categories.includes(current.category) ? categories : [...categories, current.category]).map((c) => <option key={c} value={c}>{c}</option>)}
                          <option value="__new">+ New category…</option>
                        </select>
                      ) : (
                        <div className="flex gap-1.5 mt-1">
                          <input autoFocus className={fields} value={newCat} maxLength={40} placeholder="Category name" onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newCat.trim()) { patch({ category: newCat.trim() }); setNewCat(null); } if (e.key === "Escape") setNewCat(null); }} />
                          <button onClick={() => { if (newCat.trim()) patch({ category: newCat.trim() }); setNewCat(null); }} className="px-2.5 rounded-lg bg-gold text-gold-dark text-[11px] font-medium">Add</button>
                          <button onClick={() => setNewCat(null)} className="px-2 rounded-lg border border-border text-text-muted" aria-label="Cancel"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </label>
                  </div>

                  <label className="text-[11px] font-medium text-text">Answer
                    <textarea className={cn(fields, "mt-1 leading-relaxed resize-y")} rows={8} value={current.answer} maxLength={FAQ_MAX_ANSWER} onChange={(e) => patch({ answer: e.target.value })} placeholder={"Withdrawals are released in two batches every week.\n\n- Requested **Monday to Thursday** → released **Friday**\n- Requested **Friday to Sunday** → released **Monday**"} />
                    <span className="block text-[10px] text-text-subtle font-normal mt-1">Blank line = new paragraph · start a line with &ldquo;- &rdquo; for a bullet · **bold** · links are allowed</span>
                  </label>

                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-text">Media <span className="text-text-subtle font-normal">· up to {FAQ_MAX_MEDIA}, shown under the answer in this order</span></span>
                      <div className="flex gap-1.5">
                        <input ref={imgInput} type="file" accept="image/*" hidden onChange={(e) => { addFile("image", e.target.files?.[0]); e.target.value = ""; }} />
                        <input ref={vidInput} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => { addFile("video", e.target.files?.[0]); e.target.value = ""; }} />
                        <MediaButton icon={ImageIcon} label="Image" busy={uploading === "image"} disabled={!!uploading || current.media.length >= FAQ_MAX_MEDIA} onClick={() => imgInput.current?.click()} />
                        <MediaButton icon={VideoIcon} label="Upload video" busy={uploading === "video"} disabled={!!uploading || current.media.length >= FAQ_MAX_MEDIA} onClick={() => vidInput.current?.click()} />
                        <MediaButton icon={Youtube} label="YouTube link" disabled={!!uploading || current.media.length >= FAQ_MAX_MEDIA} onClick={() => setYtUrl("")} />
                      </div>
                    </div>
                    {ytUrl !== null && (
                      <div className="flex gap-1.5">
                        <input autoFocus className={fields} value={ytUrl} placeholder="https://youtu.be/… or a youtube.com/watch link" onChange={(e) => setYtUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addYoutube(); if (e.key === "Escape") setYtUrl(null); }} />
                        <button onClick={addYoutube} className="px-3 rounded-lg bg-gold text-gold-dark text-[11px] font-medium whitespace-nowrap">Add link</button>
                        <button onClick={() => setYtUrl(null)} className="px-2 rounded-lg border border-border text-text-muted" aria-label="Cancel"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {current.media.map((m, i) => (
                        <div key={i} className="rounded-xl bg-canvas border border-border p-2.5 flex flex-col gap-2">
                          <div className="relative aspect-video rounded-lg overflow-hidden bg-card-elev flex items-center justify-center">
                            {m.kind === "youtube" && m.videoId ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`https://i.ytimg.com/vi/${m.videoId}/hqdefault.jpg`} alt="" className="w-full h-full object-cover" />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={m.kind === "video" ? m.poster : m.thumb ?? m.url} alt="" className="w-full h-full object-cover" />
                            )}
                            {m.kind !== "image" && <span className="absolute bottom-1.5 right-1.5 text-[9px] font-mono bg-black/70 text-white px-1.5 py-0.5 rounded">{m.kind === "youtube" ? "YouTube" : `${formatDuration(m.duration)} · ${Math.round((m.bytes ?? 0) / 1024 / 1024)} MB`}</span>}
                          </div>
                          <input className={cn(fields, "py-1.5 text-[11px]")} value={m.caption ?? ""} maxLength={FAQ_MAX_CAPTION} placeholder="Caption (optional)" aria-label="Caption" onChange={(e) => setMedia(i, { caption: e.target.value })} />
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-text-subtle capitalize">{m.kind === "youtube" ? "YouTube" : m.kind}{m.kind === "image" && m.bytes ? ` · ${Math.round(m.bytes / 1024)} KB in` : ""}</span>
                            <div className="flex items-center gap-1">
                              {i > 0 && <button onClick={() => { const arr = [...current.media]; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; patch({ media: arr }); }} aria-label="Move earlier" className="text-text-subtle hover:text-text"><ArrowUp className="w-3.5 h-3.5" /></button>}
                              <button onClick={() => setMedia(i, null)} className="text-[11px] text-red hover:underline">Remove</button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {current.media.length < FAQ_MAX_MEDIA && (
                        <div className="rounded-xl border border-dashed border-border-strong p-3 flex flex-col items-center justify-center text-center gap-1 min-h-[120px]">
                          <span className="text-[11px] text-text-muted">{current.media.length === 0 ? "No media yet" : "Add another item"}</span>
                          <span className="text-[10px] text-text-subtle leading-relaxed">Image up to 15 MB (compressed here) · video up to 40 MB / 2 min · YouTube for anything longer</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-text-muted">Status</span>
                      <span className="inline-flex rounded-full bg-canvas border border-border p-0.5">
                        <button onClick={() => patch({ status: "published" })} className={cn("px-3 py-1 rounded-full text-[11px] font-semibold", current.status === "published" ? "bg-gold text-gold-dark" : "text-text-muted hover:text-text")}>Published</button>
                        <button onClick={() => patch({ status: "draft" })} className={cn("px-3 py-1 rounded-full text-[11px] font-semibold", current.status === "draft" ? "bg-card-elev text-text" : "text-text-muted hover:text-text")}>Draft</button>
                      </span>
                      <span className="text-[10px] text-text-subtle">Last edited {new Date(current.updatedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</span>
                    </div>
                    <button onClick={save} disabled={saving || !dirty} className="px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium flex items-center gap-1.5 hover:brightness-110 disabled:opacity-50">
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save changes
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MediaButton({ icon: Icon, label, onClick, busy, disabled }: { icon: typeof ImageIcon; label: string; onClick: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="text-[11px] px-2.5 py-1.5 rounded-md border border-border-strong bg-card-elev text-text hover:border-gold/40 flex items-center gap-1.5 disabled:opacity-50">
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />} {label}
    </button>
  );
}
