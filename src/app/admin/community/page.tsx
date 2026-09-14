"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Inbox, Search, VolumeX, Pin, ExternalLink, MessageCircle } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { ChatView } from "@/components/community/ChatView";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  useInboxList,
  useInbox,
  useMutedUsers,
  useCommunityRoom,
  usePinnedMessage,
  isInboxUnread,
  sendInboxMessage,
  deleteInboxMessage,
  markInboxRead,
  unmuteUser,
  setPinnedMessage,
  ensureCommunityAdmin,
  formatRelative,
  type ChatItem,
} from "@/lib/community";

export default function AdminCommunityPage() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [adminReady, setAdminReady] = useState(false);

  const threads = useInboxList();
  const { messages, loading } = useInbox(selected);
  const mutedUsers = useMutedUsers();
  const { messages: room } = useCommunityRoom(100);
  const pinned = usePinnedMessage(room);

  useEffect(() => {
    if (user?.isAdmin) ensureCommunityAdmin().then(setAdminReady);
  }, [user?.isAdmin]);

  const current = useMemo(() => threads.find((t) => t.uid === selected) ?? null, [threads, selected]);
  const currentUnread = isInboxUnread(current, "admin");

  useEffect(() => {
    if (selected && current && currentUnread) markInboxRead(selected, "admin");
  }, [selected, current, currentUnread, messages.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => t.name.toLowerCase().includes(q) || (t.email ?? "").toLowerCase().includes(q));
  }, [threads, search]);

  const unreadCount = threads.filter((t) => isInboxUnread(t, "admin")).length;

  if (!user) return null;
  const sender = { uid: user.uid, name: "Admin", isAdmin: true };

  return (
    <div>
      <TopHeader title="Community chat" subtitle="Member inbox and room moderation" />

      {!adminReady && user.isAdmin && (
        <p className="text-[10px] text-text-subtle m-0 mb-2">Syncing moderator access…</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-3 mb-3">
        {/* Inbox list */}
        <Card className={cn("p-0 flex flex-col", selected && "max-lg:hidden")} >
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-medium m-0 flex items-center gap-1.5">
                <Inbox className="w-3.5 h-3.5 text-text-subtle" /> Inbox
              </p>
              {unreadCount > 0 && (
                <span className="text-[9px] font-semibold bg-red/15 text-red px-1.5 py-0.5 rounded-full">{unreadCount} new</span>
              )}
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
              <p className="text-[11px] text-text-subtle text-center py-8 m-0">No conversations yet.</p>
            ) : (
              filtered.map((t) => {
                const unread = isInboxUnread(t, "admin");
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
                      {t.name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn("text-[12px] m-0 truncate", unread ? "text-text font-semibold" : "text-text")}>{t.name}</p>
                        <span className="text-[9px] text-text-subtle shrink-0">{formatRelative(t.lastAt)}</span>
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
            <>
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => setSelected(null)} className="lg:hidden p-1.5 text-text-muted hover:text-text" aria-label="Back to inbox">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="min-w-0">
                  <p className="text-[12px] font-medium m-0 truncate">{current.name}</p>
                  {current.email && <p className="text-[10px] text-text-subtle m-0 truncate">{current.email}</p>}
                </div>
                <Link href={`/admin/investors`} className="ml-auto text-[10px] text-text-subtle hover:text-text flex items-center gap-1">
                  Investors <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
              <ChatView
                key={selected}
                messages={messages}
                loading={loading}
                meUid="admin"
                uploaderUid={user.uid}
                emptyText="No messages in this conversation yet."
                canSend={adminReady}
                sendDisabledReason="Moderator access is still syncing…"
                allowVideo
                keepOriginal
                maxText={1000}
                onSend={(p) => sendInboxMessage(selected, sender, p)}
                onDelete={(m: ChatItem) => deleteInboxMessage(selected, m.id)}
              />
            </>
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

      {/* Room moderation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
    </div>
  );
}
