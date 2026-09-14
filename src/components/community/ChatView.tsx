"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Image as ImageIcon,
  Video as VideoIcon,
  Send,
  Loader2,
  X,
  Pin,
  Trash2,
  VolumeX,
  MoreHorizontal,
  Play,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getFirebase } from "@/lib/firebase";
import { describeStorageError } from "@/lib/storage";
import {
  type ChatItem,
  type ChatMedia,
  type SendPayload,
  MAX_TEXT,
  uploadChatImage,
  uploadChatVideo,
  youtubeId,
  containsLink,
  formatChatTime,
  formatChatDay,
} from "@/lib/community";

type Props = {
  messages: ChatItem[];
  loading: boolean;
  meUid: string;
  uploaderUid: string;
  emptyText: string;
  pinned?: ChatItem | null;
  canSend: boolean;
  sendDisabledReason?: string;
  allowVideo?: boolean;
  keepOriginal?: boolean;
  /** Reject messages containing links before they reach the (also enforcing) rules. */
  blockLinks?: boolean;
  maxText?: number;
  onSend: (payload: SendPayload) => Promise<void>;
  onDelete?: (item: ChatItem) => Promise<void>;
  onPin?: (item: ChatItem) => Promise<void>;
  onMute?: (item: ChatItem) => Promise<void>;
  className?: string;
};

type Pending = { file: File; kind: "image" | "video"; preview: string };

const URL_RE = /(https?:\/\/[^\s]+)/g;
const GROUP_MS = 3 * 60_000;

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        URL_RE.test(p) ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-current/40 break-all hover:opacity-80"
            onClick={(e) => e.stopPropagation()}
          >
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function ChatView({
  messages,
  loading,
  meUid,
  uploaderUid,
  emptyText,
  pinned,
  canSend,
  sendDisabledReason,
  allowVideo = false,
  keepOriginal = false,
  blockLinks = false,
  maxText = MAX_TEXT,
  onSend,
  onDelete,
  onPin,
  onMute,
  className,
}: Props) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<ChatMedia | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Set<string>>(new Set());

  const listRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const vidInput = useRef<HTMLInputElement>(null);

  // Keep the view pinned to the newest message unless the reader scrolled up.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (!pending) return;
    return () => URL.revokeObjectURL(pending.preview);
  }, [pending]);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuFor]);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function pickFile(kind: "image" | "video", file: File | undefined) {
    if (!file) return;
    setError(null);
    setPending({ file, kind, preview: URL.createObjectURL(file) });
  }

  function autoGrow() {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  async function submit() {
    const body = text.trim();
    if (sending || (!body && !pending)) return;
    if (blockLinks && containsLink(body)) {
      setError("Only admins can share links in the Community Room.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      let media: ChatMedia | undefined;
      let kind: SendPayload["kind"] = "text";
      if (pending) {
        const { storage } = getFirebase();
        if (!storage) throw new Error("Uploads are unavailable in demo mode.");
        media =
          pending.kind === "image"
            ? await uploadChatImage(storage, uploaderUid, pending.file, { keepOriginal })
            : await uploadChatVideo(storage, uploaderUid, pending.file);
        kind = pending.kind;
      }
      await onSend({ kind, text: body || undefined, media });
      setText("");
      setPending(null);
      atBottomRef.current = true;
      if (textRef.current) textRef.current.style.height = "auto";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/permission|PERMISSION_DENIED/i.test(msg) ? "Message blocked — you may be muted or sending too fast." : describeStorageError(e));
    } finally {
      setSending(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    if (e.key === "Enter" && !e.shiftKey && !coarse) {
      e.preventDefault();
      submit();
    }
  }

  const hasModeration = !!(onDelete || onPin || onMute);

  return (
    <div
      className={cn("bg-card border border-border rounded-xl flex flex-col overflow-hidden", className)}
      style={{ height: "calc(100dvh - 235px)", minHeight: 420 }}
    >
      {/* Pinned */}
      {pinned && (
        <div className="flex items-center gap-2 px-3 py-2 bg-gold/10 border-b border-gold/20 shrink-0">
          <Pin className="w-3.5 h-3.5 text-gold shrink-0" />
          <p className="text-[11px] text-text m-0 truncate flex-1">
            <span className="text-gold font-medium">{pinned.name}: </span>
            {pinned.text ?? (pinned.kind === "image" ? "📷 Photo" : "🎬 Video")}
          </p>
          {onPin && (
            <button onClick={() => onPin(pinned)} className="text-text-subtle hover:text-text" aria-label="Unpin">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-gold animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center px-6">
            <p className="text-[12px] text-text-subtle text-center m-0">{emptyText}</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const own = m.senderId === meUid;
            const newDay = !prev || formatChatDay(prev.at) !== formatChatDay(m.at);
            const grouped = !newDay && prev && prev.senderId === m.senderId && m.at - prev.at < GROUP_MS;
            const yt = youtubeId(m.text);
            const isPlaying = playing.has(m.id);

            return (
              <div key={m.id}>
                {newDay && (
                  <div className="flex items-center gap-3 my-3">
                    <span className="flex-1 h-px bg-border" />
                    <span className="text-[9px] uppercase tracking-[0.14em] text-text-subtle">{formatChatDay(m.at)}</span>
                    <span className="flex-1 h-px bg-border" />
                  </div>
                )}
                <div className={cn("flex gap-2 group", own ? "flex-row-reverse" : "flex-row", grouped ? "mt-0.5" : "mt-3")}>
                  {/* Avatar */}
                  <div className="w-7 shrink-0">
                    {!grouped && !own && (
                      <div
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold ring-1",
                          m.admin ? "bg-gold/20 text-gold ring-gold/30" : "bg-blue/15 text-blue ring-blue/20",
                        )}
                      >
                        {m.admin ? <ShieldCheck className="w-3.5 h-3.5" /> : initialsOf(m.name)}
                      </div>
                    )}
                  </div>

                  <div className={cn("max-w-[78%] min-w-0 flex flex-col", own ? "items-end" : "items-start")}>
                    {!grouped && !own && (
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        <span className="text-[10px] font-medium text-text-muted">{m.name}</span>
                        {m.admin && (
                          <span className="text-[8px] font-semibold uppercase tracking-wider bg-gold/15 text-gold px-1.5 py-px rounded-full">
                            Admin
                          </span>
                        )}
                      </div>
                    )}

                    <div className={cn("relative flex items-end gap-1", own ? "flex-row-reverse" : "flex-row")}>
                      <div
                        className={cn(
                          "rounded-2xl overflow-hidden",
                          own
                            ? "bg-gold/15 border border-gold/25 rounded-tr-sm"
                            : m.admin
                              ? "bg-card-elev border border-gold/20 rounded-tl-sm"
                              : "bg-card-elev border border-border rounded-tl-sm",
                        )}
                      >
                        {/* Image */}
                        {m.kind === "image" && m.media && (
                          <button onClick={() => setLightbox(m.media!)} className="block max-w-[260px]" aria-label="Open image">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={m.media.thumb ?? m.media.url}
                              alt=""
                              loading="lazy"
                              className="block w-full h-auto max-h-[320px] object-cover"
                              style={m.media.w && m.media.h ? { aspectRatio: `${m.media.w} / ${m.media.h}` } : undefined}
                            />
                          </button>
                        )}

                        {/* Video — poster first, downloads only on tap */}
                        {m.kind === "video" && m.media && (
                          <div className="max-w-[280px] bg-black">
                            {isPlaying ? (
                              <video
                                src={m.media.url}
                                poster={m.media.poster}
                                controls
                                autoPlay
                                playsInline
                                preload="none"
                                className="block w-full max-h-[320px]"
                              />
                            ) : (
                              <button
                                onClick={() => setPlaying((s) => new Set(s).add(m.id))}
                                className="relative block w-full"
                                aria-label="Play video"
                              >
                                {m.media.poster ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={m.media.poster} alt="" loading="lazy" className="block w-full h-auto max-h-[320px] object-cover opacity-90" />
                                ) : (
                                  <div className="w-[280px] h-[160px]" />
                                )}
                                <span className="absolute inset-0 flex items-center justify-center">
                                  <span className="w-12 h-12 rounded-full bg-black/60 border border-white/30 flex items-center justify-center">
                                    <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
                                  </span>
                                </span>
                                {m.media.duration ? (
                                  <span className="absolute bottom-1.5 right-1.5 text-[9px] bg-black/70 text-white px-1.5 py-0.5 rounded">
                                    0:{String(m.media.duration).padStart(2, "0")}
                                  </span>
                                ) : null}
                              </button>
                            )}
                          </div>
                        )}

                        {m.text && (
                          <p className={cn("text-[12.5px] leading-relaxed m-0 px-3 py-2 whitespace-pre-wrap break-words", own ? "text-text" : "text-text")}>
                            <Linkified text={m.text} />
                          </p>
                        )}

                        {yt && (
                          <div className="w-[280px] max-w-full aspect-video bg-black">
                            <iframe
                              src={`https://www.youtube-nocookie.com/embed/${yt}`}
                              title="YouTube video"
                              loading="lazy"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              className="w-full h-full border-0"
                            />
                          </div>
                        )}
                      </div>

                      {/* Moderation menu */}
                      {hasModeration && (
                        <div className="relative shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuFor(menuFor === m.id ? null : m.id);
                            }}
                            className="p-1 text-text-subtle/60 hover:text-text md:opacity-0 md:group-hover:opacity-100 transition"
                            aria-label="Message actions"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                          {menuFor === m.id && (
                            <div
                              className={cn(
                                "absolute bottom-full mb-1 z-20 bg-card border border-border-strong rounded-lg p-1 min-w-[150px] shadow-xl shadow-black/50",
                                own ? "right-0" : "left-0",
                              )}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {onPin && (
                                <button onClick={() => { setMenuFor(null); onPin(m); }} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-text hover:bg-card-elev rounded-md">
                                  <Pin className="w-3.5 h-3.5" /> {pinned?.id === m.id ? "Unpin" : "Pin message"}
                                </button>
                              )}
                              {onMute && !own && !m.admin && (
                                <button onClick={() => { setMenuFor(null); onMute(m); }} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-text hover:bg-card-elev rounded-md">
                                  <VolumeX className="w-3.5 h-3.5" /> Mute {m.name.split(" ")[0]}
                                </button>
                              )}
                              {onDelete && (
                                <button onClick={() => { setMenuFor(null); onDelete(m); }} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-red hover:bg-red/10 rounded-md">
                                  <Trash2 className="w-3.5 h-3.5" /> Delete
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <span className="text-[9px] text-text-subtle mt-0.5 px-1">{formatChatTime(m.at)}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border p-2.5 shrink-0">
        {!canSend ? (
          <p className="text-[11px] text-text-subtle text-center m-0 py-1.5">{sendDisabledReason ?? "You can't send messages here."}</p>
        ) : (
          <>
            {pending && (
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-canvas border border-border">
                  {pending.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pending.preview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <video src={pending.preview} muted className="w-full h-full object-cover" />
                  )}
                  <button
                    onClick={() => setPending(null)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center"
                    aria-label="Remove attachment"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
                <p className="text-[10px] text-text-subtle m-0 truncate">
                  {pending.file.name} · {(pending.file.size / 1024 / 1024).toFixed(1)} MB
                  {pending.kind === "image" && " · will be compressed"}
                </p>
              </div>
            )}
            {error && <p className="text-[10px] text-red m-0 mb-1.5 px-1">{error}</p>}
            <div className="flex items-end gap-1.5">
              <input ref={imgInput} type="file" accept="image/*" hidden onChange={(e) => { pickFile("image", e.target.files?.[0]); e.target.value = ""; }} />
              <button onClick={() => imgInput.current?.click()} className="p-2 text-text-muted hover:text-gold transition shrink-0" aria-label="Attach image" disabled={sending}>
                <ImageIcon className="w-5 h-5" />
              </button>
              {allowVideo && (
                <>
                  <input ref={vidInput} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => { pickFile("video", e.target.files?.[0]); e.target.value = ""; }} />
                  <button onClick={() => vidInput.current?.click()} className="p-2 text-text-muted hover:text-gold transition shrink-0" aria-label="Attach video" disabled={sending}>
                    <VideoIcon className="w-5 h-5" />
                  </button>
                </>
              )}
              <textarea
                ref={textRef}
                value={text}
                onChange={(e) => { setText(e.target.value.slice(0, maxText)); autoGrow(); }}
                onKeyDown={onKey}
                rows={1}
                placeholder="Write a message…"
                className="flex-1 min-w-0 bg-canvas border border-border rounded-xl px-3 py-2 text-[12.5px] text-text outline-none focus:border-gold/40 placeholder:text-text-subtle resize-none leading-relaxed"
                style={{ maxHeight: 120 }}
              />
              <button
                onClick={submit}
                disabled={sending || (!text.trim() && !pending)}
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition",
                  sending || (!text.trim() && !pending) ? "bg-card-elev text-text-subtle" : "bg-gold text-gold-dark hover:brightness-110",
                )}
                aria-label="Send"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[80] bg-black/92 flex flex-col items-center justify-center p-3" onClick={() => setLightbox(null)}>
          <button className="absolute top-3 right-3 p-2 text-white/80 hover:text-white" aria-label="Close">
            <X className="w-6 h-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url} alt="" className="max-w-[96vw] max-h-[84dvh] object-contain rounded-md" onClick={(e) => e.stopPropagation()} />
          {lightbox.original && (
            <a
              href={lightbox.original}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-white/80 hover:text-white underline"
            >
              <ExternalLink className="w-3.5 h-3.5" /> View full quality
            </a>
          )}
        </div>
      )}
    </div>
  );
}
