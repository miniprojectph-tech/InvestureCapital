"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Inbox, Search, MessageCircle, MailWarning } from "lucide-react";
import { Card } from "@/components/Card";
import { ChatView } from "@/components/community/ChatView";
import { cn } from "@/lib/utils";
import { useSettings, uploadLimitsFor } from "@/lib/settings";
import { useNow } from "@/lib/compplan";
import { useAllMemberStatuses, statusText } from "@/lib/activeStatus";
import { StatusDot, statusTone } from "@/components/community/StatusDot";
import { SeenMark } from "@/components/community/SeenMark";
import { getFirebase } from "@/lib/firebase";
import { listInvestors } from "@/lib/adminQueries";
import {
  useInboxList,
  useInbox,
  isInboxUnread,
  needsReply,
  isNewMember,
  isWelcomeOnly,
  sortInboxThreads,
  markInboxUnread,
  NEW_MEMBER_DAYS,
  sendInboxMessage,
  deleteInboxMessage,
  reactToInboxMessage,
  markInboxRead,
  formatRelative,
  useTypingSignal,
  useTypingNames,
  type ChatItem,
  type InboxMeta,
  type Sender,
} from "@/lib/community";

type Props = {
  /** The staff member replying (admin or chat moderator with inbox access). */
  staff: Sender;
  /** False while moderator access is still syncing — composer is disabled. */
  canSend: boolean;
  /** Optional slot beside the thread title; a function gets the open member's uid (e.g. a link to their account). */
  threadAside?: React.ReactNode | ((uid: string) => React.ReactNode);
};

type Member = { uid: string; name: string; email: string };

/**
 * Every member's CURRENT name and email (admins only; moderators can't read the
 * member records and keep the names saved on each conversation). A conversation
 * keeps the name it started with, which is often an old name or the email prefix.
 */
function useMemberDirectory(enabled: boolean): Map<string, Member> {
  const [dir, setDir] = useState<Map<string, Member>>(new Map());
  useEffect(() => {
    const { db } = getFirebase();
    if (!enabled || !db) return;
    let cancelled = false;
    listInvestors(db)
      .then((rows) => {
        if (cancelled) return;
        setDir(new Map(rows.filter((r) => !r.isAdmin).map((r) => [r.uid, { uid: r.uid, name: r.name && r.name !== "—" ? r.name : "", email: r.email }])));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enabled]);
  return dir;
}

const PAGE = 80;
const DAY_MS = 86_400_000;
const manilaDay = (ms: number) => Math.floor((ms + 8 * 3_600_000) / DAY_MS);
/** Divider label for a conversation in the list. */
function groupOf(at: number, now: number): string {
  const d = manilaDay(now) - manilaDay(at);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : d < 7 ? "This week" : "Older";
}

function initialsOf(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

export function InboxPanel({ staff, canSend, threadAside }: Props) {
  const { settings } = useSettings();
  const inboxCaps = uploadLimitsFor(settings, "inbox");
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [show, setShowRaw] = useState<"conversations" | "unread" | "new" | "active">("conversations");
  const [limit, setLimit] = useState(PAGE);
  const setShow = (k: typeof show) => { setShowRaw(k); setLimit(PAGE); };
  const [now] = useState(() => Date.now());

  const saved = useInboxList(true);
  const directory = useMemberDirectory(!!staff.isAdmin);
  // Conversations under the member's current name; the saved name still matches a search.
  const threads = useMemo(
    () => saved.map((t) => {
      const m = directory.get(t.uid);
      return { ...t, savedName: t.name, name: m?.name || t.name || m?.email.split("@")[0] || "Member", email: m?.email || t.email };
    }),
    [saved, directory],
  );
  // who is active / away right now (admins and inbox moderators may read it; the rules say so)
  const statuses = useAllMemberStatuses(true);
  const clock = useNow(30_000);
  const feed = useInbox(selected);
  const { messages, loading } = feed;

  // A member with no conversation yet opens an empty one; the first message starts it.
  const current = useMemo((): (InboxMeta & { savedName?: string }) | null => {
    const t = threads.find((x) => x.uid === selected);
    if (t) return t;
    const m = selected ? directory.get(selected) : undefined;
    return m ? { uid: m.uid, name: m.name || m.email.split("@")[0] || "Member", email: m.email, lastAt: 0, lastText: "", lastFrom: "" } : null;
  }, [threads, selected, directory]);
  const isNewThread = !!current && current.lastAt === 0;
  const currentUnread = isInboxUnread(current, "admin");
  const typingScope = useMemo(() => (selected ? { thread: selected } : null), [selected]);
  const typing = useTypingSignal(typingScope, "admin", staff.name);
  const typingNames = useTypingNames(typingScope, "admin");

  useEffect(() => {
    if (selected && current && currentUnread) markInboxRead(selected, "admin");
  }, [selected, current, currentUnread, messages.length]);

  // Deep link from a bell notification: /admin/community?thread=<uid>#inbox
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("thread");
    if (t) setSelected(t);
  }, []);

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;
  // A welcome nobody answered sits in New members for a week, never in Conversations.
  // Everything else is a conversation and stays one: answered threads are kept, unanswered ones pinned on top.
  const filtered = useMemo(() => {
    const byLast = (a: { lastAt: number }, b: { lastAt: number }) => b.lastAt - a.lastAt;
    if (searching) return sortInboxThreads(threads, now).filter((t) => [t.name, t.savedName, t.email].some((s) => (s ?? "").toLowerCase().includes(q)));
    if (show === "unread") return threads.filter(needsReply).sort(byLast);
    if (show === "new") return threads.filter((t) => isWelcomeOnly(t) && isNewMember(t, now)).sort((a, b) => (b.joinedAt ?? b.lastAt) - (a.joinedAt ?? a.lastAt));
    if (show === "active") return sortInboxThreads(threads, now).filter((t) => statuses[t.uid]?.state === "active");
    const conv = threads.filter((t) => !isWelcomeOnly(t));
    return [...conv.filter(needsReply).sort(byLast), ...conv.filter((t) => !needsReply(t)).sort(byLast)];
  }, [threads, searching, q, show, now, statuses]);
  const pinned = !searching && show === "conversations" ? filtered.filter(needsReply).length : 0;
  const visible = filtered.slice(0, pinned + limit);
  const labelOf = (t: InboxMeta) => (!searching && show === "conversations" ? (needsReply(t) ? "Needs reply" : groupOf(t.lastAt, clock)) : null);

  // Searching also finds members you have never messaged.
  const others = useMemo(() => {
    if (q.length < 2) return [];
    const has = new Set(threads.map((t) => t.uid));
    return [...directory.values()].filter((m) => !has.has(m.uid) && (m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))).slice(0, 20);
  }, [q, threads, directory]);

  // "Needs reply" = the member wrote last and nobody opened it. New members are counted separately, never as unread.
  const unreadCount = threads.filter(needsReply).length;
  const newCount = threads.filter((t) => isWelcomeOnly(t) && isNewMember(t, now)).length;
  const activeCount = threads.filter((t) => statuses[t.uid]?.state === "active").length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-3">
      {/* Thread list */}
      <Card className={cn("p-0 flex flex-col", selected && "max-lg:hidden")}>
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-medium m-0 flex items-center gap-1.5">
              <Inbox className="w-3.5 h-3.5 text-text-subtle" /> Inbox
            </p>
            <span className="flex items-center gap-1">
              {newCount > 0 && (
                <span className="text-[9px] font-semibold bg-green/15 text-green px-1.5 py-0.5 rounded-full">{newCount} new member{newCount === 1 ? "" : "s"}</span>
              )}
              {unreadCount > 0 && (
                <span className="text-[9px] font-semibold bg-red/15 text-red px-1.5 py-0.5 rounded-full">{unreadCount} need{unreadCount === 1 ? "s" : ""} reply</span>
              )}
            </span>
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {([["conversations", "Conversations"], ["unread", `Needs reply${unreadCount ? ` · ${unreadCount}` : ""}`], ["new", `New members${newCount ? ` · ${newCount}` : ""}`], ["active", `Active now${activeCount ? ` · ${activeCount}` : ""}`]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setShow(k)} aria-pressed={show === k} className={cn("px-2.5 py-1 rounded-full text-[10px] font-medium border transition", show === k ? "bg-gold/15 border-gold/40 text-gold" : "bg-canvas border-border text-text-muted hover:text-text")}>
                {label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-text-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members"
              className="w-full bg-canvas border border-border rounded-lg pl-8 pr-3 py-2 text-[11px] text-text outline-none focus:border-gold/40 placeholder:text-text-subtle"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto" style={{ maxHeight: "calc(100dvh - var(--chat-offset, 235px) - 95px)", minHeight: 240 }}>
          {filtered.length === 0 && others.length === 0 ? (
            <p className="text-[11px] text-text-subtle text-center py-8 m-0 px-4">{searching ? "No member matches." : show === "new" ? `No unanswered welcomes from the last ${NEW_MEMBER_DAYS} days.` : show === "unread" ? "Nothing waiting for a reply." : show === "active" ? "No one in your conversations is active right now." : "No conversations yet."}</p>
          ) : (
            visible.map((t, i) => {
              const unread = needsReply(t);
              const fresh = isWelcomeOnly(t) && isNewMember(t, now);
              const active = t.uid === selected;
              const label = labelOf(t);
              const showLabel = !!label && (i === 0 || labelOf(visible[i - 1]) !== label);
              return (
                <Fragment key={t.uid}>
                {showLabel && <p className={cn("text-[9px] uppercase tracking-wider m-0 px-3 pt-3 pb-1", label === "Needs reply" ? "text-red" : "text-text-subtle")}>{label}</p>}
                <button
                  onClick={() => setSelected(t.uid)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 text-left border-b border-border transition",
                    active ? "bg-gold/10" : unread ? "bg-red/[0.06] shadow-[inset_3px_0_0_#FF6B6B] hover:bg-red/10" : "hover:bg-card-elev",
                  )}
                >
                  <div className="relative w-8 h-8 rounded-full bg-blue/15 text-blue text-[10px] font-semibold flex items-center justify-center ring-1 ring-blue/20 shrink-0">
                    {initialsOf(t.name)}
                    <StatusDot status={statuses[t.uid]} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("text-[12px] m-0 truncate text-text flex items-center gap-1.5 min-w-0", unread && "font-semibold")}>
                        <span className="truncate">{t.name}</span>
                        {fresh && <span className="text-[8px] font-semibold uppercase tracking-wide bg-green/15 text-green px-1.5 py-px rounded-full shrink-0">New member</span>}
                      </p>
                      <span className="text-[9px] text-text-subtle shrink-0">{fresh && t.joinedAt ? `Joined ${formatRelative(t.joinedAt)} ago` : formatRelative(t.lastAt)}</span>
                    </div>
                    {statuses[t.uid] && <p className={cn("text-[9px] m-0 mt-0.5", statusTone(statuses[t.uid]))}>{statusText(statuses[t.uid], clock)}</p>}
                    <p className={cn("text-[10px] m-0 truncate mt-0.5", unread ? "text-text-muted" : "text-text-subtle")}>
                      {t.lastFrom === "admin" ? "You: " : ""}
                      {t.lastText}
                    </p>
                    {!isWelcomeOnly(t) && (t.lastFrom === "admin" ? (
                      <p className="text-[9px] m-0 mt-0.5"><SeenMark lastAt={t.lastAt} readAt={t.userReadAt} /></p>
                    ) : !unread ? (
                      <p className="text-[9px] text-text-subtle m-0 mt-0.5">Member wrote last · read by the team</p>
                    ) : null)}
                  </div>
                  {unread && <span className="w-2 h-2 rounded-full bg-red shrink-0" />}
                </button>
                </Fragment>
              );
            })
          )}
          {filtered.length > visible.length && (
            <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="w-full py-2.5 text-[11px] text-gold hover:underline border-b border-border">
              Show older conversations · {filtered.length - visible.length} more
            </button>
          )}
          {others.length > 0 && (
            <>
              <p className="text-[9px] uppercase tracking-wider text-text-subtle m-0 px-3 pt-3 pb-1">No conversation yet</p>
              {others.map((m) => (
                <button
                  key={m.uid}
                  onClick={() => setSelected(m.uid)}
                  className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 text-left border-b border-border transition", m.uid === selected ? "bg-gold/10" : "hover:bg-card-elev")}
                >
                  <div className="relative w-8 h-8 rounded-full bg-card-elev text-text-muted text-[10px] font-semibold flex items-center justify-center shrink-0">
                    {initialsOf(m.name || m.email)}
                    <StatusDot status={statuses[m.uid]} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] m-0 truncate text-text">{m.name || m.email.split("@")[0]}</p>
                    <p className="text-[10px] m-0 truncate mt-0.5 text-text-subtle">{m.email} · Start a conversation</p>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </Card>

      {/* Thread */}
      <div className={cn(!selected && "max-lg:hidden")}>
        {selected && current ? (
          <ChatView
            key={selected}
            header={
              <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border shrink-0">
                <button onClick={() => setSelected(null)} className="lg:hidden w-8 h-8 -ml-1 flex items-center justify-center text-blue" aria-label="Back to inbox">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="relative w-9 h-9 rounded-full bg-blue/15 text-blue text-[11px] font-extrabold flex items-center justify-center shrink-0">{initialsOf(current.name)}<StatusDot status={statuses[current.uid]} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold m-0 truncate flex items-center gap-2">
                    <span className="truncate">{current.name}</span>
                    {!isNewThread && current.lastFrom === "admin" && !isWelcomeOnly(current) && <SeenMark lastAt={current.lastAt} readAt={current.userReadAt} now={clock} className="text-[10px] font-normal shrink-0" />}
                  </p>
                  {/* status and email share one line, so the email stays visible while they're online (staff only; members can't read the inbox) */}
                  {(statuses[current.uid] || current.email) && (
                    <p className="text-[10px] m-0 truncate">
                      {statuses[current.uid] && <span className={statusTone(statuses[current.uid])}>{statusText(statuses[current.uid], clock, true)}</span>}
                      {statuses[current.uid] && current.email && <span className="text-text-subtle"> · </span>}
                      {current.email && <span className="text-text-subtle select-all" title={current.email}>{current.email}</span>}
                    </p>
                  )}
                </div>
                {current.lastFrom !== "admin" && (
                  <button
                    onClick={() => { markInboxUnread(selected); setSelected(null); }}
                    title="Put this conversation back in Needs reply"
                    className="text-[10px] text-text-subtle hover:text-text flex items-center gap-1 shrink-0"
                  >
                    <MailWarning className="w-3 h-3" /> Mark unread
                  </button>
                )}
                {typeof threadAside === "function" ? threadAside(current.uid) : threadAside}
              </div>
            }
            messages={messages}
            loading={loading}
            meUid="admin"
            reactorUid={staff.uid}
            uploaderUid={staff.uid}
            uploadFolder={`inbox/${staff.uid}`}
            maxImageBytes={inboxCaps.imageMB * 1024 * 1024}
            maxVideoBytes={inboxCaps.videoMB * 1024 * 1024}
            maxVideoSeconds={inboxCaps.videoSeconds}
            emptyText={isNewThread ? `No messages yet. Your first message starts a conversation with ${current.name}.` : "No messages in this conversation yet."}
            canSend={canSend}
            sendDisabledReason="Moderator access is still syncing…"
            allowVideo
            allowAlbum={staff.isAdmin}
            keepOriginal
            maxText={1000}
            hasMore={feed.hasMore}
            loadingOlder={feed.loadingOlder}
            onLoadOlder={feed.loadOlder}
            typingNames={typingNames}
            onTyping={typing.ping}
            onTypingStop={typing.stop}
            onSend={(p) => sendInboxMessage(selected, staff, p, isNewThread ? { name: current.name, email: current.email } : undefined)}
            onReact={(m: ChatItem, emoji) => reactToInboxMessage(selected, m.id, staff.uid, emoji)}
            onDelete={(m: ChatItem) => deleteInboxMessage(selected, m.id)}
          />
        ) : (
          <div className="bg-card border border-border rounded-xl flex items-center justify-center" style={{ height: "calc(100dvh - var(--chat-offset, 235px))", minHeight: 420 }}>
            <div className="text-center px-6">
              <MessageCircle className="w-8 h-8 text-text-subtle mx-auto mb-2" />
              <p className="text-[12px] text-text-muted m-0">Select a member conversation to reply.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
