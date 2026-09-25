"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Image as ImageIcon,
  Video as VideoIcon,
  Camera,
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
  Smile,
  Reply,
  Copy,
  ThumbsUp,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getFirebase } from "@/lib/firebase";
import { describeStorageError } from "@/lib/storage";
import {
  type ChatItem,
  type ChatMedia,
  type ReplyRef,
  type SendPayload,
  MAX_TEXT,
  uploadChatImage,
  uploadChatVideo,
  youtubeId,
  containsLink,
  formatChatTime,
  formatChatStamp,
  summarizeReactions,
} from "@/lib/community";
import { findSticker, stickerSrc, QUICK_REACTIONS } from "@/lib/stickers";
import { StickerTray, FullEmojiPicker, rememberSticker } from "./StickerTray";

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
  /** Scroll-back: older history exists / is being fetched / fetch the next page. */
  hasMore?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  /** Shown at the very top once everything available is loaded. */
  historyStartLabel?: string;
  /** Messenger-style conversation header rendered inside the card. */
  header?: ReactNode;
  /** Who is typing (other people), already filtered and capped. */
  typingNames?: string[];
  /** Called on every keystroke (throttled by the caller's hook). */
  onTyping?: () => void;
  onTypingStop?: () => void;
  onSend: (payload: SendPayload) => Promise<void>;
  /** Add / change / clear (null) the viewer's reaction. */
  onReact?: (item: ChatItem, emoji: string | null) => Promise<void>;
  /** The uid reactions are stored under — defaults to meUid (staff inboxes pass their real uid). */
  reactorUid?: string;
  onDelete?: (item: ChatItem) => Promise<void>;
  onPin?: (item: ChatItem) => Promise<void>;
  onMute?: (item: ChatItem) => Promise<void>;
  className?: string;
};

type Pending = { file: File; kind: "image" | "video"; preview: string };
type Sheet = { item: ChatItem; picker: boolean };

const URL_RE = /(https?:\/\/[^\s]+)/g;
/** Consecutive messages from one sender inside this window share a bubble group. */
const GROUP_MS = 5 * 60_000;
/** A quiet spell longer than this gets a "Today 9:15 AM" separator. */
const GAP_MS = 20 * 60_000;
const LONG_PRESS_MS = 420;

const PALETTE: [string, string][] = [
  ["#2DD4BF", "#04302B"],
  ["#A78BFA", "#1F1447"],
  ["#4F8EF7", "#FFFFFF"],
  ["#F472B6", "#3B0A22"],
  ["#FBBF24", "#3A2500"],
  ["#34D399", "#062E1E"],
];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function colorFor(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        URL_RE.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="underline decoration-current/50 break-all hover:opacity-80" onClick={(e) => e.stopPropagation()}>
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Avatar({ item, size = 30 }: { item: ChatItem; size?: number }) {
  if (item.admin) {
    return (
      <div className="rounded-full bg-[#F5C66B]/20 border border-[#F5C66B]/40 flex items-center justify-center shrink-0" style={{ width: size, height: size }} aria-hidden="true">
        <ShieldCheck className="w-3.5 h-3.5 text-[#F5C66B]" />
      </div>
    );
  }
  const [bg, fg] = colorFor(item.senderId);
  return (
    <div className="rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0" style={{ width: size, height: size, background: bg, color: fg }} aria-hidden="true">
      {initialsOf(item.name)}
    </div>
  );
}

function snippetOf(m: ChatItem): string {
  if (m.text) return m.text;
  if (m.kind === "image") return "📷 Photo";
  if (m.kind === "video") return "🎬 Video";
  if (m.kind === "sticker") return "Sticker";
  return "";
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
  hasMore = false,
  loadingOlder = false,
  onLoadOlder,
  historyStartLabel = "Beginning of the conversation",
  header,
  typingNames = [],
  onTyping,
  onTypingStop,
  onSend,
  onReact,
  reactorUid,
  onDelete,
  onPin,
  onMute,
  className,
}: Props) {
  const reactor = reactorUid ?? meUid;
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<ChatMedia | null>(null);
  const [playing, setPlaying] = useState<Set<string>>(new Set());
  const [tray, setTray] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [hoverMenu, setHoverMenu] = useState<string | null>(null);
  const [hoverPicker, setHoverPicker] = useState<string | null>(null);
  const [shownTime, setShownTime] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const heightBeforeLoad = useRef<number | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const camInput = useRef<HTMLInputElement>(null);
  const vidInput = useRef<HTMLInputElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  // Keep the view pinned to the newest message unless the reader scrolled up.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, loading, typingNames.length, tray, replyTo]);

  useEffect(() => {
    if (!pending) return;
    return () => URL.revokeObjectURL(pending.preview);
  }, [pending]);

  useEffect(() => {
    if (!hoverMenu && !hoverPicker) return;
    const close = () => { setHoverMenu(null); setHoverPicker(null); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [hoverMenu, hoverPicker]);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setSheet(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet]);

  function requestOlder() {
    const el = listRef.current;
    if (!el || !onLoadOlder || !hasMore || loadingOlder) return;
    heightBeforeLoad.current = el.scrollHeight;
    onLoadOlder();
  }

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 80) requestOlder();
  }

  // After older messages are prepended, keep the reader on the message they
  // were looking at instead of jumping to the new top.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || loadingOlder || heightBeforeLoad.current === null) return;
    el.scrollTop += el.scrollHeight - heightBeforeLoad.current;
    heightBeforeLoad.current = null;
  }, [loadingOlder, messages]);

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

  async function send(payload: SendPayload) {
    setSending(true);
    setError(null);
    try {
      await onSend(replyTo ? { ...payload, replyTo } : payload);
      setReplyTo(null);
      atBottomRef.current = true;
      onTypingStop?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/permission|PERMISSION_DENIED/i.test(msg) ? "Message blocked — you may be muted or sending too fast." : describeStorageError(e));
      throw e;
    } finally {
      setSending(false);
    }
  }

  async function submit() {
    const body = text.trim();
    if (sending || (!body && !pending)) return;
    if (blockLinks && containsLink(body)) {
      setError("Only admins can share links in the Community Room.");
      return;
    }
    try {
      let media: ChatMedia | undefined;
      let kind: SendPayload["kind"] = "text";
      if (pending) {
        const { storage } = getFirebase();
        if (!storage) throw new Error("Uploads are unavailable in demo mode.");
        setSending(true);
        media = pending.kind === "image" ? await uploadChatImage(storage, uploaderUid, pending.file, { keepOriginal }) : await uploadChatVideo(storage, uploaderUid, pending.file);
        kind = pending.kind;
      }
      await send({ kind, text: body || undefined, media });
      setText("");
      setPending(null);
      setTray(false);
      if (textRef.current) textRef.current.style.height = "auto";
    } catch (e) {
      if (!error) setError(describeStorageError(e));
      setSending(false);
    }
  }

  async function sendSticker(key: string) {
    if (sending) return;
    rememberSticker(key);
    try {
      await send({ kind: "sticker", sticker: key });
    } catch {
      /* shown in error */
    }
  }

  function sendLike() {
    if (sending) return;
    send({ kind: "text", text: "👍" }).catch(() => {});
  }

  function insertEmoji(emoji: string) {
    const el = textRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + emoji + text.slice(end)).slice(0, maxText);
    setText(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
      autoGrow();
    });
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    if (e.key === "Enter" && !e.shiftKey && !coarse) {
      e.preventDefault();
      submit();
    }
  }

  function react(item: ChatItem, emoji: string) {
    if (!onReact) return;
    const current = item.reactions?.[reactor];
    onReact(item, current === emoji ? null : emoji).catch(() => setError("Couldn't save your reaction."));
    setSheet(null);
    setHoverPicker(null);
  }

  function startReply(item: ChatItem) {
    setReplyTo({ id: item.id, name: item.name, text: snippetOf(item).slice(0, 120) || undefined });
    setSheet(null);
    setHoverMenu(null);
    requestAnimationFrame(() => textRef.current?.focus());
  }

  function copyText(item: ChatItem) {
    if (item.text && typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(item.text).catch(() => {});
    setSheet(null);
    setHoverMenu(null);
  }

  // Long-press (touch) opens the reaction sheet; a short tap toggles the time.
  function onPressStart(e: ReactPointerEvent, item: ChatItem) {
    if (e.pointerType === "mouse") return;
    pressStart.current = { x: e.clientX, y: e.clientY };
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      if (navigator.vibrate) navigator.vibrate(10);
      setSheet({ item, picker: false });
    }, LONG_PRESS_MS);
  }
  function onPressMove(e: ReactPointerEvent) {
    if (!pressStart.current || !pressTimer.current) return;
    if (Math.abs(e.clientX - pressStart.current.x) > 10 || Math.abs(e.clientY - pressStart.current.y) > 10) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }
  function onPressEnd() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressStart.current = null;
  }

  const hasModeration = !!(onDelete || onPin || onMute);
  const canReact = !!onReact;

  /** One message with its bubble, reactions and (desktop) hover toolbar. */
  function renderMessage(m: ChatItem, first: boolean, last: boolean, inOverlay: boolean) {
    const own = m.senderId === meUid;
    const yt = youtubeId(m.text);
    const isPlaying = playing.has(m.id);
    const st = m.kind === "sticker" ? findSticker(m.sticker) : null;
    const rx = summarizeReactions(m.reactions, reactor);
    const canRemove = !!onDelete && (own || hasModeration);

    const radius = own
      ? cn("rounded-[18px]", first && !last && "rounded-br-[5px]", !first && !last && "rounded-r-[5px]", !first && last && "rounded-tr-[5px]")
      : cn("rounded-[18px]", first && !last && "rounded-bl-[5px]", !first && !last && "rounded-l-[5px]", !first && last && "rounded-tl-[5px]");

    const bubble = (
      <div
        className={cn(
          "relative max-w-full overflow-hidden",
          m.kind === "sticker" ? "" : cn(radius, own ? "bg-[linear-gradient(135deg,#4F8EF7,#7B61FF)] text-white" : "bg-[#232B45] text-text"),
        )}
      >
        {m.replyTo && (
          <div className={cn("mx-3 mt-2 px-2.5 py-1.5 rounded-lg border-l-2 text-[11px] leading-snug", own ? "bg-white/15 border-white/60 text-white/90" : "bg-canvas/60 border-blue text-text-muted")}>
            <span className="font-semibold">{m.replyTo.name}</span>
            {m.replyTo.text && <span className="block truncate max-w-[240px]">{m.replyTo.text}</span>}
          </div>
        )}

        {m.kind === "sticker" && (
          st ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={stickerSrc(st.pack, st.sticker)} alt={st.sticker.label} loading="lazy" className="block w-[132px] h-[132px] object-contain select-none" draggable={false} />
          ) : (
            <div className="w-[132px] h-[132px] rounded-2xl bg-[#232B45] flex items-center justify-center text-[11px] text-text-subtle">Sticker</div>
          )
        )}

        {m.kind === "image" && m.media && (
          <button onClick={(e) => { e.stopPropagation(); setLightbox(m.media!); }} className="block max-w-[260px]" aria-label="Open image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.media.thumb ?? m.media.url} alt="" loading="lazy" className="block w-full h-auto max-h-[320px] object-cover" style={m.media.w && m.media.h ? { aspectRatio: `${m.media.w} / ${m.media.h}` } : undefined} />
          </button>
        )}

        {m.kind === "video" && m.media && (
          <div className="max-w-[280px] bg-black">
            {isPlaying ? (
              <video src={m.media.url} poster={m.media.poster} controls autoPlay playsInline preload="none" className="block w-full max-h-[320px]" />
            ) : (
              <button onClick={(e) => { e.stopPropagation(); setPlaying((s) => new Set(s).add(m.id)); }} className="relative block w-full" aria-label="Play video">
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
                {m.media.duration ? <span className="absolute bottom-1.5 right-1.5 text-[9px] bg-black/70 text-white px-1.5 py-0.5 rounded">0:{String(m.media.duration).padStart(2, "0")}</span> : null}
              </button>
            )}
          </div>
        )}

        {m.text && (
          <p className={cn("text-[14px] leading-[1.4] m-0 px-3 py-2 whitespace-pre-wrap break-words", /^\p{Extended_Pictographic}{1,3}$/u.test(m.text.trim()) && "text-[34px] leading-none py-1.5")}>
            <Linkified text={m.text} />
          </p>
        )}

        {yt && (
          <div className="w-[280px] max-w-full aspect-video bg-black">
            <iframe src={`https://www.youtube-nocookie.com/embed/${yt}`} title="YouTube video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="w-full h-full border-0" />
          </div>
        )}
      </div>
    );

    return (
      <div className={cn("flex items-end gap-2 group", own ? "flex-row-reverse" : "flex-row", rx.total > 0 && "mb-3")}>
        {/* Avatar column (others only, on the last bubble of a group) */}
        {!own && <div className="w-[30px] shrink-0">{last && <Avatar item={m} />}</div>}

        <div className={cn("relative max-w-[78%] min-w-0", own ? "flex justify-end" : "")}>
          <div
            className={cn("relative", !inOverlay && "cursor-default select-none md:select-text")}
            onClick={() => !inOverlay && setShownTime((t) => (t === m.id ? null : m.id))}
            onPointerDown={(e) => !inOverlay && onPressStart(e, m)}
            onPointerMove={onPressMove}
            onPointerUp={onPressEnd}
            onPointerCancel={onPressEnd}
            onPointerLeave={onPressEnd}
            onContextMenu={(e) => { if (!inOverlay && pressStart.current) e.preventDefault(); }}
          >
            {bubble}

            {/* Reactions pill overlapping the bottom corner */}
            {rx.total > 0 && !inOverlay && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setSheet({ item: m, picker: false }); }}
                className={cn(
                  "absolute -bottom-2.5 flex items-center gap-0.5 pl-1.5 pr-2 py-0.5 rounded-full bg-card-elev border-2 border-card text-[12px] shadow-md shadow-black/40",
                  own ? "left-1" : "right-1",
                  rx.mine && "ring-1 ring-blue",
                )}
                aria-label={`${rx.total} reaction${rx.total === 1 ? "" : "s"}`}
              >
                <span className="tracking-[-0.15em]">{rx.list.slice(0, 3).map((r) => r.emoji).join("")}</span>
                {rx.total > 1 && <span className="font-mono text-[10px] text-text-muted ml-1">{rx.total}</span>}
              </button>
            )}
          </div>

          {/* Desktop hover toolbar: react / reply / more */}
          {!inOverlay && (canReact || hasModeration || canSend) && (
            <div className={cn("hidden md:flex absolute top-1/2 -translate-y-1/2 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition", own ? "right-full mr-1.5" : "left-full ml-1.5")}>
              {canReact && (
                <div className="relative">
                  <button type="button" onClick={(e) => { e.stopPropagation(); setHoverPicker(hoverPicker === m.id ? null : m.id); setHoverMenu(null); }} className="w-7 h-7 rounded-full flex items-center justify-center text-text-subtle hover:text-text hover:bg-card-elev" aria-label="React">
                    <Smile className="w-4 h-4" />
                  </button>
                  {hoverPicker === m.id && (
                    <div className={cn("absolute bottom-full mb-1.5 z-30 flex items-center gap-0.5 px-1.5 py-1 rounded-full bg-[#1B2340] border border-border-strong shadow-xl shadow-black/50", own ? "right-0" : "left-0")} onClick={(e) => e.stopPropagation()}>
                      {QUICK_REACTIONS.map((e) => (
                        <button key={e} type="button" onClick={() => react(m, e)} className={cn("w-8 h-8 rounded-full text-[20px] leading-none hover:scale-125 transition", m.reactions?.[reactor] === e && "bg-blue/25")} aria-label={`React ${e}`}>{e}</button>
                      ))}
                      <button type="button" onClick={() => { setHoverPicker(null); setSheet({ item: m, picker: true }); }} className="w-7 h-7 rounded-full bg-card-elev flex items-center justify-center text-text-muted hover:text-text" aria-label="More reactions"><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
              )}
              {canSend && (
                <button type="button" onClick={(e) => { e.stopPropagation(); startReply(m); }} className="w-7 h-7 rounded-full flex items-center justify-center text-text-subtle hover:text-text hover:bg-card-elev" aria-label="Reply">
                  <Reply className="w-4 h-4" />
                </button>
              )}
              <div className="relative">
                <button type="button" onClick={(e) => { e.stopPropagation(); setHoverMenu(hoverMenu === m.id ? null : m.id); setHoverPicker(null); }} className="w-7 h-7 rounded-full flex items-center justify-center text-text-subtle hover:text-text hover:bg-card-elev" aria-label="More">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {hoverMenu === m.id && (
                  <div className={cn("absolute bottom-full mb-1 z-30 bg-card border border-border-strong rounded-lg p-1 min-w-[150px] shadow-xl shadow-black/50", own ? "right-0" : "left-0")} onClick={(e) => e.stopPropagation()}>
                    {m.text && <MenuItem icon={Copy} label="Copy" onClick={() => copyText(m)} />}
                    {onPin && <MenuItem icon={Pin} label={pinned?.id === m.id ? "Unpin" : "Pin message"} onClick={() => { setHoverMenu(null); onPin(m); }} />}
                    {onMute && !own && !m.admin && <MenuItem icon={VolumeX} label={`Mute ${m.name.split(" ")[0]}`} onClick={() => { setHoverMenu(null); onMute(m); }} />}
                    {canRemove && <MenuItem icon={Trash2} label="Remove" danger onClick={() => { setHoverMenu(null); onDelete!(m); }} />}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-card border border-border rounded-xl flex flex-col overflow-hidden", className)} style={{ height: "calc(100dvh - 235px)", minHeight: 460 }}>
      {header}

      {/* Pinned */}
      {pinned && (
        <div className="flex items-center gap-2 mx-3 mt-2 px-3 py-2 bg-canvas rounded-xl shrink-0">
          <Pin className="w-3.5 h-3.5 text-[#F5C66B] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] uppercase tracking-[0.1em] text-[#F5C66B] font-bold m-0">Pinned</p>
            <p className="text-[11px] text-text m-0 truncate">
              <span className="text-text-muted">{pinned.name}: </span>
              {snippetOf(pinned)}
            </p>
          </div>
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
            <Loader2 className="w-5 h-5 text-blue animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center px-6">
            <p className="text-[12px] text-text-subtle text-center m-0">{emptyText}</p>
          </div>
        ) : (
          <>
            <div className="flex justify-center pb-2">
              {hasMore ? (
                <button onClick={requestOlder} disabled={loadingOlder} className="text-[10px] px-3 py-1 rounded-full bg-card-elev border border-border text-text-muted hover:text-text flex items-center gap-1.5 disabled:opacity-70">
                  {loadingOlder ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  {loadingOlder ? "Loading older messages…" : "Load older messages"}
                </button>
              ) : (
                <span className="text-[9px] uppercase tracking-[0.14em] text-text-subtle">{historyStartLabel}</span>
              )}
            </div>

            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const own = m.senderId === meUid;
              const gap = !prev || m.at - prev.at > GAP_MS;
              const first = gap || !prev || prev.senderId !== m.senderId || m.at - prev.at > GROUP_MS;
              const last = !next || next.senderId !== m.senderId || next.at - m.at > GROUP_MS;
              return (
                <Fragment key={m.id}>
                  {gap && (
                    <div className="flex justify-center py-2.5">
                      <span className="text-[10px] font-semibold text-text-subtle">{formatChatStamp(m.at)}</span>
                    </div>
                  )}
                  {!own && first && (
                    <div className={cn("pl-[38px] text-[11px] text-text-muted mb-0.5 flex items-center gap-1.5", !gap && "mt-2")}>
                      {m.name}
                      {m.admin && <span className="text-[8px] font-extrabold uppercase tracking-[0.1em] text-[#F5C66B] bg-[#F5C66B]/15 px-1.5 py-px rounded-full">{m.mod ? "Mod" : "Admin"}</span>}
                    </div>
                  )}
                  <div className={cn(first ? (own && !gap ? "mt-2" : "") : "mt-0.5")}>{renderMessage(m, first, last, false)}</div>
                  {shownTime === m.id && (
                    <p className={cn("text-[10px] text-text-subtle m-0 mt-0.5", own ? "text-right pr-1" : "pl-[38px]")}>{formatChatTime(m.at)}</p>
                  )}
                </Fragment>
              );
            })}

            {typingNames.length > 0 && (
              <div className="flex items-center gap-2 pl-[38px] mt-2">
                <div className="flex gap-1 px-3 py-2.5 rounded-[18px] bg-[#232B45]">
                  <span className="w-1.5 h-1.5 rounded-full bg-text-subtle animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-text animate-bounce" />
                </div>
                <span className="text-[10px] text-text-subtle">{typingNames.length === 1 ? `${typingNames[0]} is typing` : `${typingNames.slice(0, 2).join(", ")}${typingNames.length > 2 ? " and others" : ""} are typing`}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border shrink-0">
        {!canSend ? (
          <p className="text-[11px] text-text-subtle text-center m-0 py-3 px-3">{sendDisabledReason ?? "You can't send messages here."}</p>
        ) : (
          <>
            {replyTo && (
              <div className="flex items-center gap-2 px-3 pt-2">
                <Reply className="w-3.5 h-3.5 text-blue shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-text m-0">Replying to <span className="font-semibold">{replyTo.name}</span></p>
                  {replyTo.text && <p className="text-[10px] text-text-subtle m-0 truncate">{replyTo.text}</p>}
                </div>
                <button onClick={() => setReplyTo(null)} className="text-text-subtle hover:text-text" aria-label="Cancel reply"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}
            {pending && (
              <div className="flex items-center gap-2 px-3 pt-2">
                <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-canvas border border-border">
                  {pending.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pending.preview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <video src={pending.preview} muted className="w-full h-full object-cover" />
                  )}
                  <button onClick={() => setPending(null)} className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center" aria-label="Remove attachment">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
                <p className="text-[10px] text-text-subtle m-0 truncate">
                  {pending.file.name} · {(pending.file.size / 1024 / 1024).toFixed(1)} MB
                  {pending.kind === "image" && " · will be compressed"}
                </p>
              </div>
            )}
            {error && <p className="text-[10px] text-red m-0 px-3 pt-2">{error}</p>}

            <div className="flex items-end gap-0.5 p-2">
              <input ref={imgInput} type="file" accept="image/*" hidden onChange={(e) => { pickFile("image", e.target.files?.[0]); e.target.value = ""; }} />
              <input ref={camInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pickFile("image", e.target.files?.[0]); e.target.value = ""; }} />
              <button onClick={() => imgInput.current?.click()} className="w-9 h-9 rounded-full flex items-center justify-center text-blue hover:bg-card-elev transition shrink-0" aria-label="Attach image" disabled={sending}>
                <ImageIcon className="w-[22px] h-[22px]" />
              </button>
              <button onClick={() => camInput.current?.click()} className="w-9 h-9 rounded-full md:hidden flex items-center justify-center text-blue hover:bg-card-elev transition shrink-0" aria-label="Take a photo" disabled={sending}>
                <Camera className="w-[22px] h-[22px]" />
              </button>
              {allowVideo && (
                <>
                  <input ref={vidInput} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => { pickFile("video", e.target.files?.[0]); e.target.value = ""; }} />
                  <button onClick={() => vidInput.current?.click()} className="w-9 h-9 rounded-full flex items-center justify-center text-blue hover:bg-card-elev transition shrink-0" aria-label="Attach video" disabled={sending}>
                    <VideoIcon className="w-[22px] h-[22px]" />
                  </button>
                </>
              )}
              <div className="flex-1 min-w-0 flex items-end bg-[#232B45] rounded-[20px] pl-3.5 pr-1 py-1 ml-1">
                <textarea
                  ref={textRef}
                  value={text}
                  onChange={(e) => { setText(e.target.value.slice(0, maxText)); autoGrow(); onTyping?.(); }}
                  onKeyDown={onKey}
                  onFocus={() => setTray(false)}
                  rows={1}
                  placeholder="Aa"
                  aria-label="Message"
                  className="flex-1 min-w-0 bg-transparent text-[15px] text-text outline-none placeholder:text-text-subtle resize-none leading-[1.4] py-1.5"
                  style={{ maxHeight: 120 }}
                />
                <button type="button" onClick={() => { setTray((t) => !t); textRef.current?.blur(); }} className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition", tray ? "bg-blue/20 text-blue" : "text-blue hover:bg-blue/10")} aria-label={tray ? "Close stickers" : "Stickers and emoji"}>
                  <Smile className="w-[22px] h-[22px]" />
                </button>
              </div>
              {text.trim() || pending ? (
                <button onClick={submit} disabled={sending} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-blue hover:bg-card-elev transition disabled:opacity-50" aria-label="Send">
                  {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-[22px] h-[22px]" />}
                </button>
              ) : (
                <button onClick={sendLike} disabled={sending} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-blue hover:bg-card-elev transition disabled:opacity-50" aria-label="Send a thumbs up">
                  {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <ThumbsUp className="w-[22px] h-[22px]" fill="currentColor" />}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {tray && canSend && <StickerTray onSticker={sendSticker} onEmoji={insertEmoji} />}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[80] bg-black/92 flex flex-col items-center justify-center p-3" onClick={() => setLightbox(null)}>
          <button className="absolute top-3 right-3 p-2 text-white/80 hover:text-white" aria-label="Close">
            <X className="w-6 h-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url} alt="" className="max-w-[96vw] max-h-[84dvh] object-contain rounded-md" onClick={(e) => e.stopPropagation()} />
          {lightbox.original && (
            <a href={lightbox.original} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-white/80 hover:text-white underline">
              <ExternalLink className="w-3.5 h-3.5" /> View full quality
            </a>
          )}
        </div>
      )}

      {/* Hold-a-message sheet: reactions + actions (Messenger style) */}
      {sheet && (
        <div className="fixed inset-0 z-[85] bg-black/65 backdrop-blur-[2px] flex flex-col" onClick={() => setSheet(null)} role="dialog" aria-label="Message actions">
          <div className="flex-1 flex flex-col justify-center px-4 gap-2.5 min-h-0" onClick={(e) => e.stopPropagation()}>
            {canReact && (
              sheet.picker ? (
                <div className="bg-card border border-border-strong rounded-2xl overflow-hidden shadow-2xl shadow-black/60 self-stretch" style={{ height: "min(340px, 42dvh)" }}>
                  <FullEmojiPicker onPick={(e) => react(sheet.item, e)} />
                </div>
              ) : (
                <div className={cn("flex items-center gap-1 px-2 py-1.5 rounded-full bg-[#1B2340] border border-border-strong shadow-2xl shadow-black/60", sheet.item.senderId === meUid ? "self-end" : "self-start ml-[38px]")}>
                  {QUICK_REACTIONS.map((e) => (
                    <button key={e} type="button" onClick={() => react(sheet.item, e)} className={cn("w-10 h-10 rounded-full text-[26px] leading-none active:scale-90 transition", sheet.item.reactions?.[reactor] === e && "bg-blue/25")} aria-label={`React ${e}`}>{e}</button>
                  ))}
                  <button type="button" onClick={() => setSheet({ ...sheet, picker: true })} className="w-8 h-8 rounded-full bg-card-elev flex items-center justify-center text-text" aria-label="More reactions"><Plus className="w-4 h-4" /></button>
                </div>
              )
            )}
            <div className="max-h-[40dvh] overflow-hidden">
              {sheet.item.senderId !== meUid && <p className="pl-[38px] text-[11px] text-text-muted m-0 mb-0.5">{sheet.item.name}</p>}
              {renderMessage(sheet.item, true, true, true)}
              <p className={cn("text-[10px] text-text-subtle m-0 mt-1.5", sheet.item.senderId === meUid ? "text-right" : "pl-[38px]")}>{formatChatStamp(sheet.item.at)}</p>
            </div>
            {summarizeReactions(sheet.item.reactions, reactor).total > 0 && (
              <div className={cn("flex flex-wrap gap-1.5", sheet.item.senderId === meUid ? "justify-end" : "pl-[38px]")}>
                {summarizeReactions(sheet.item.reactions, reactor).list.map((r) => (
                  <span key={r.emoji} className="text-[11px] px-2 py-0.5 rounded-full bg-card-elev border border-border text-text">{r.emoji} <span className="font-mono text-text-muted">{r.count}</span></span>
                ))}
              </div>
            )}
          </div>
          <div className="bg-card rounded-t-2xl px-2 pt-2 pb-[max(env(safe-area-inset-bottom),16px)] shadow-[0_-12px_40px_rgba(0,0,0,0.5)]" onClick={(e) => e.stopPropagation()}>
            <div className="w-9 h-1 rounded-full bg-border-strong mx-auto mb-2" />
            {canSend && <SheetItem icon={Reply} label="Reply" onClick={() => startReply(sheet.item)} />}
            {sheet.item.text && <SheetItem icon={Copy} label="Copy" onClick={() => copyText(sheet.item)} />}
            {onPin && <SheetItem icon={Pin} label={pinned?.id === sheet.item.id ? "Unpin" : "Pin message"} tag="Mods" onClick={() => { setSheet(null); onPin(sheet.item); }} />}
            {onMute && sheet.item.senderId !== meUid && !sheet.item.admin && <SheetItem icon={VolumeX} label={`Mute ${sheet.item.name.split(" ")[0]}`} tag="Mods" onClick={() => { setSheet(null); onMute(sheet.item); }} />}
            {onDelete && (sheet.item.senderId === meUid || hasModeration) && <SheetItem icon={Trash2} label="Remove" danger onClick={() => { setSheet(null); onDelete(sheet.item); }} />}
            {!canSend && !sheet.item.text && !onPin && !onDelete && <p className="text-[11px] text-text-subtle text-center m-0 py-2">Tap a reaction above.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: typeof Copy; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-md", danger ? "text-red hover:bg-red/10" : "text-text hover:bg-card-elev")}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function SheetItem({ icon: Icon, label, onClick, danger, tag }: { icon: typeof Copy; label: string; onClick: () => void; danger?: boolean; tag?: string }) {
  return (
    <button onClick={onClick} className={cn("w-full flex items-center gap-3.5 px-3 py-3 text-[14px] rounded-xl text-left", danger ? "text-red hover:bg-red/10" : "text-text hover:bg-card-elev")}>
      <Icon className="w-5 h-5" /> {label}
      {tag && <span className="ml-auto text-[9px] font-bold uppercase tracking-[0.1em] text-[#F5C66B]">{tag}</span>}
    </button>
  );
}
