"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Inbox, Search, MessageCircle } from "lucide-react";
import { Card } from "@/components/Card";
import { ChatView } from "@/components/community/ChatView";
import { cn } from "@/lib/utils";
import { useSettings, uploadLimitsFor } from "@/lib/settings";
import {
  useInboxList,
  useInbox,
  isInboxUnread,
  sendInboxMessage,
  deleteInboxMessage,
  reactToInboxMessage,
  markInboxRead,
  formatRelative,
  useTypingSignal,
  useTypingNames,
  type ChatItem,
  type Sender,
} from "@/lib/community";

type Props = {
  /** The staff member replying (admin or chat moderator with inbox access). */
  staff: Sender;
  /** False while moderator access is still syncing — composer is disabled. */
  canSend: boolean;
  /** Optional slot rendered beside the thread title (e.g. a link to Investors). */
  threadAside?: React.ReactNode;
};

function initialsOf(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

export function InboxPanel({ staff, canSend, threadAside }: Props) {
  const { settings } = useSettings();
  const inboxCaps = uploadLimitsFor(settings, "inbox");
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<"all" | "unread" | "new">("all");

  const threads = useInboxList(true);
  const feed = useInbox(selected);
  const { messages, loading } = feed;

  const current = useMemo(() => threads.find((t) => t.uid === selected) ?? null, [threads, selected]);
  const currentUnread = isInboxUnread(current, "admin");
  const typingScope = useMemo(() => (selected ? { thread: selected } : null), [selected]);
  const typing = useTypingSignal(typingScope, "admin", staff.name);
  const typingNames = useTypingNames(typingScope, "admin");

  useEffect(() => {
    if (selected && current && currentUnread) markInboxRead(selected, "admin");
  }, [selected, current, currentUnread, messages.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = threads;
    if (show === "unread") list = list.filter((t) => isInboxUnread(t, "admin") || t.newMember === true);
    if (show === "new") list = list.filter((t) => t.newMember === true);
    if (!q) return list;
    return list.filter((t) => t.name.toLowerCase().includes(q) || (t.email ?? "").toLowerCase().includes(q));
  }, [threads, search, show]);

  // A new member counts as unread until someone on the team has replied to them.
  const unreadCount = threads.filter((t) => isInboxUnread(t, "admin") || t.newMember === true).length;
  const newCount = threads.filter((t) => t.newMember === true).length;

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
                <span className="text-[9px] font-semibold bg-red/15 text-red px-1.5 py-0.5 rounded-full">{unreadCount} unread</span>
              )}
            </span>
          </div>
          <div className="flex gap-1 mb-2">
            {([["all", "All"], ["unread", "Unread"], ["new", "New members"]] as const).map(([k, label]) => (
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
        <div className="flex-1 overflow-y-auto" style={{ maxHeight: "calc(100dvh - 330px)", minHeight: 240 }}>
          {filtered.length === 0 ? (
            <p className="text-[11px] text-text-subtle text-center py-8 m-0">{show === "new" ? "No new members waiting." : show === "unread" ? "Nothing unread." : "No conversations yet."}</p>
          ) : (
            filtered.map((t) => {
              const unread = isInboxUnread(t, "admin") || t.newMember === true;
              const active = t.uid === selected;
              return (
                <button
                  key={t.uid}
                  onClick={() => setSelected(t.uid)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 text-left border-b border-border transition",
                    active ? "bg-gold/10" : "hover:bg-card-elev",
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-blue/15 text-blue text-[10px] font-semibold flex items-center justify-center ring-1 ring-blue/20 shrink-0">
                    {initialsOf(t.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("text-[12px] m-0 truncate text-text flex items-center gap-1.5 min-w-0", unread && "font-semibold")}>
                        <span className="truncate">{t.name}</span>
                        {t.newMember && <span className="text-[8px] font-semibold uppercase tracking-wide bg-green/15 text-green px-1.5 py-px rounded-full shrink-0">New member</span>}
                      </p>
                      <span className="text-[9px] text-text-subtle shrink-0">{t.newMember && t.joinedAt ? `Joined ${formatRelative(t.joinedAt)} ago` : formatRelative(t.lastAt)}</span>
                    </div>
                    <p className={cn("text-[10px] m-0 truncate mt-0.5", unread ? "text-text-muted" : "text-text-subtle")}>
                      {t.lastFrom === "admin" ? "You: " : ""}
                      {t.lastText}
                    </p>
                  </div>
                  {unread && <span className="w-2 h-2 rounded-full bg-red shrink-0" />}
                </button>
              );
            })
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
                <div className="w-9 h-9 rounded-full bg-blue/15 text-blue text-[11px] font-extrabold flex items-center justify-center shrink-0">{initialsOf(current.name)}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold m-0 truncate">{current.name}</p>
                  {current.email && <p className="text-[10px] text-text-subtle m-0 truncate">{current.email}</p>}
                </div>
                {threadAside}
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
            emptyText="No messages in this conversation yet."
            canSend={canSend}
            sendDisabledReason="Moderator access is still syncing…"
            allowVideo
            keepOriginal
            maxText={1000}
            hasMore={feed.hasMore}
            loadingOlder={feed.loadingOlder}
            onLoadOlder={feed.loadOlder}
            typingNames={typingNames}
            onTyping={typing.ping}
            onTypingStop={typing.stop}
            onSend={(p) => sendInboxMessage(selected, staff, p)}
            onReact={(m: ChatItem, emoji) => reactToInboxMessage(selected, m.id, staff.uid, emoji)}
            onDelete={(m: ChatItem) => deleteInboxMessage(selected, m.id)}
          />
        ) : (
          <div className="bg-card border border-border rounded-xl flex items-center justify-center" style={{ height: "calc(100dvh - 235px)", minHeight: 420 }}>
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
