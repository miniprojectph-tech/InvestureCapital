"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Inbox, Pin } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { ChatView } from "@/components/community/ChatView";
import { InboxPanel } from "@/components/community/InboxPanel";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  useCommunityRoom,
  usePinnedMessage,
  useIsMuted,
  useInbox,
  useInboxMeta,
  useInboxList,
  useChatModRole,
  usePresence,
  useOnlineCount,
  useTypingSignal,
  useTypingNames,
  isInboxUnread,
  sendRoomMessage,
  sendInboxMessage,
  reactToRoomMessage,
  reactToInboxMessage,
  deleteRoomMessage,
  setPinnedMessage,
  muteUser,
  markInboxRead,
  ensureCommunityAdmin,
  formatRelative,
  type ChatItem,
} from "@/lib/community";

type Tab = "room" | "admin" | "inbox";

function previewOf(m: ChatItem | undefined): string {
  if (!m) return "No messages yet";
  const body = m.text ?? (m.kind === "image" ? "📷 Photo" : m.kind === "video" ? "🎬 Video" : m.kind === "sticker" ? "Sticker" : "");
  return `${m.name.split(" ")[0]}: ${body}`;
}

export default function CommunityPage() {
  const { user, demoMode } = useAuth();
  const [tab, setTab] = useState<Tab>("room");

  const modRole = useChatModRole();
  // Staff read the full history; members only from their sign-up date.
  const roomFeed = useCommunityRoom(!!user?.isAdmin || modRole.isMod);
  const { messages: room, loading: roomLoading } = roomFeed;
  const pinned = usePinnedMessage(room);
  const muted = useIsMuted();

  const uid = user?.uid ?? null;
  const inboxFeed = useInbox(tab === "admin" ? uid : null);
  const { messages: inbox, loading: inboxLoading } = inboxFeed;
  const inboxMeta = useInboxMeta(uid);
  const adminUnread = isInboxUnread(inboxMeta, "user");

  // Presence + "N active now"
  usePresence(!!user && !demoMode);
  const online = useOnlineCount();

  // Typing indicators for whichever conversation is open
  const typingScope = useMemo(() => (tab === "room" ? { room: true as const } : tab === "admin" && uid ? { thread: uid } : null), [tab, uid]);
  const typing = useTypingSignal(typingScope, uid ?? "", user?.name ?? "");
  const typingNames = useTypingNames(typingScope, uid ?? "");

  // Staff = full admin or chat moderator. Inbox access needs the per-mod toggle.
  const isStaff = !!user?.isAdmin || modRole.isMod;
  const canInbox = !!user?.isAdmin || (modRole.isMod && modRole.inbox);
  const inboxThreads = useInboxList(canInbox);
  const inboxUnread = inboxThreads.filter((t) => isInboxUnread(t, "admin")).length;

  // Deep link from Support: /community#admin
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#admin") setTab("admin");
  }, []);

  // Admins need their RTDB moderator flag before posting as admin.
  useEffect(() => {
    if (user?.isAdmin) ensureCommunityAdmin();
  }, [user?.isAdmin]);

  // Mark the admin thread read whenever it's open and new messages arrive.
  useEffect(() => {
    if (tab !== "admin" || !uid || !inboxMeta || !adminUnread) return;
    markInboxRead(uid, "user");
  }, [tab, uid, inboxMeta, adminUnread, inbox.length]);

  if (!user) return null;

  const sender = { uid: user.uid, name: user.name, isAdmin: user.isAdmin, isMod: modRole.isMod };

  const moderation = isStaff
    ? {
        onDelete: (m: ChatItem) => deleteRoomMessage(m.id),
        onPin: (m: ChatItem) => setPinnedMessage(pinned?.id === m.id ? null : m.id),
        onMute: (m: ChatItem) => muteUser(m.senderId, m.name),
      }
    : { onDelete: (m: ChatItem) => (m.senderId === user.uid ? deleteRoomMessage(m.id) : Promise.resolve()) };

  const lastRoom = room[room.length - 1];

  const roomHeader = (
    <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border shrink-0">
      <div className="relative shrink-0">
        <div className="w-9 h-9 rounded-full bg-[#F5C66B] text-[#2A1D05] text-[12px] font-extrabold flex items-center justify-center">IC</div>
        <span className="absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full bg-green border-2 border-card" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold m-0 truncate">Community Room</p>
        <p className="text-[11px] text-text-muted m-0">{online !== null ? `${online.toLocaleString()} active now` : "Everyone at Investure"}</p>
      </div>
    </div>
  );

  const adminHeader = (
    <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border shrink-0">
      <div className="w-9 h-9 rounded-full bg-[#F5C66B]/20 border border-[#F5C66B]/40 flex items-center justify-center shrink-0">
        <ShieldCheck className="w-4 h-4 text-[#F5C66B]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold m-0 truncate">Message Admin</p>
        <p className="text-[11px] text-text-muted m-0">Private conversation with the Investure team</p>
      </div>
    </div>
  );

  const chatItems: { key: Tab; label: string; sub: string; at?: number; unread: number; icon: React.ReactNode }[] = [
    {
      key: "room",
      label: "Community Room",
      sub: previewOf(lastRoom),
      at: lastRoom?.at,
      unread: 0,
      icon: (
        <div className="relative shrink-0">
          <div className="w-11 h-11 rounded-full bg-[#F5C66B] text-[#2A1D05] text-[13px] font-extrabold flex items-center justify-center">IC</div>
          <span className="absolute right-0 bottom-0 w-3 h-3 rounded-full bg-green border-2 border-card" />
        </div>
      ),
    },
    {
      key: "admin",
      label: "Message Admin",
      sub: inboxMeta?.lastText ? `${inboxMeta.lastFrom === "admin" ? "Admin" : "You"}: ${inboxMeta.lastText}` : "Private line to the Investure team",
      at: inboxMeta?.lastAt,
      unread: adminUnread ? 1 : 0,
      icon: (
        <div className="w-11 h-11 rounded-full bg-[#F5C66B]/20 border border-[#F5C66B]/40 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5 text-[#F5C66B]" />
        </div>
      ),
    },
    ...(canInbox
      ? [
          {
            key: "inbox" as Tab,
            label: "Inbox",
            sub: inboxThreads.length ? `${inboxThreads.length} member conversation${inboxThreads.length === 1 ? "" : "s"}` : "Member conversations",
            at: inboxThreads[0]?.lastAt,
            unread: inboxUnread,
            icon: (
              <div className="w-11 h-11 rounded-full bg-blue/15 flex items-center justify-center shrink-0">
                <Inbox className="w-5 h-5 text-blue" />
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <TopHeader title="Community" subtitle="Chat with everyone, or message the admin directly" />

      {demoMode && (
        <p className="text-[11px] text-text-muted bg-card border border-border rounded-lg px-3 py-2 mb-3 m-0">
          Chat needs Firebase — it&apos;s unavailable in demo mode.
        </p>
      )}

      {/* Phone: Messenger-style pills */}
      <div className="flex items-center gap-1.5 mb-3 lg:hidden overflow-x-auto">
        {chatItems.map((c) => (
          <button
            key={c.key}
            onClick={() => setTab(c.key)}
            className={cn(
              "relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition whitespace-nowrap",
              tab === c.key ? "bg-blue/20 text-blue" : "bg-card text-text-muted hover:text-text",
            )}
          >
            {c.label}
            {c.unread > 0 && <span className="min-w-[16px] h-4 px-1 rounded-full bg-red text-white text-[10px] font-bold flex items-center justify-center">{c.unread}</span>}
          </button>
        ))}
      </div>

      {tab === "inbox" && canInbox ? (
        <>
          <button onClick={() => setTab("room")} className="hidden lg:inline-flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text mb-2">← Back to chats</button>
          <InboxPanel staff={{ uid: user.uid, name: user.isAdmin ? "Admin" : "Moderator", isAdmin: user.isAdmin, isMod: modRole.isMod }} canSend={!demoMode} />
        </>
      ) : (
        <div className="lg:grid lg:grid-cols-[300px_1fr] lg:gap-3">
          {/* Desktop: chat list */}
          <div className="hidden lg:flex flex-col bg-card border border-border rounded-xl p-2.5 gap-1" style={{ height: "calc(100dvh - 235px)", minHeight: 460 }}>
            <div className="flex items-baseline justify-between px-2 pt-1 pb-2">
              <span className="text-[17px] font-extrabold tracking-tight">Chats</span>
              {online !== null && <span className="text-[10px] text-text-subtle">{online.toLocaleString()} active now</span>}
            </div>
            {chatItems.map((c) => (
              <button
                key={c.key}
                onClick={() => setTab(c.key)}
                className={cn("flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-left transition", tab === c.key ? "bg-card-elev" : "hover:bg-card-elev/60")}
              >
                {c.icon}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("text-[13px] m-0 truncate", c.unread ? "font-bold text-text" : "font-semibold text-text")}>{c.label}</p>
                    {c.at ? <span className="text-[10px] text-text-subtle shrink-0">{formatRelative(c.at)}</span> : null}
                  </div>
                  <p className={cn("text-[11px] m-0 truncate mt-0.5", c.unread ? "text-text font-medium" : "text-text-muted")}>{c.sub}</p>
                </div>
                {c.unread > 0 && <span className="w-2.5 h-2.5 rounded-full bg-blue shrink-0" />}
              </button>
            ))}
            {pinned && (
              <div className="mt-auto px-3 py-2.5 rounded-xl bg-canvas">
                <p className="text-[9px] uppercase tracking-[0.1em] text-[#F5C66B] font-bold m-0 flex items-center gap-1"><Pin className="w-3 h-3" /> Pinned</p>
                <p className="text-[11px] text-text m-0 mt-0.5 line-clamp-2">{pinned.text ?? (pinned.kind === "image" ? "📷 Photo" : pinned.kind === "video" ? "🎬 Video" : "Sticker")}</p>
              </div>
            )}
          </div>

          {tab === "room" && (
            <ChatView
              key="room"
              header={roomHeader}
              messages={room}
              loading={roomLoading}
              meUid={user.uid}
              uploaderUid={user.uid}
              emptyText="No messages yet — say hello to the community!"
              pinned={pinned}
              canSend={!muted && !demoMode}
              sendDisabledReason={muted ? "You've been muted in the Community Room. Message the admin if you think this is a mistake." : undefined}
              allowVideo={isStaff}
              keepOriginal={isStaff}
              blockLinks={!isStaff}
              hasMore={roomFeed.hasMore}
              loadingOlder={roomFeed.loadingOlder}
              onLoadOlder={roomFeed.loadOlder}
              historyStartLabel={isStaff ? "Beginning of the room" : "You joined the community here"}
              typingNames={typingNames}
              onTyping={typing.ping}
              onTypingStop={typing.stop}
              onSend={(p) => sendRoomMessage(sender, p)}
              onReact={(m, emoji) => reactToRoomMessage(m.id, user.uid, emoji)}
              {...moderation}
            />
          )}

          {tab === "admin" && (
            <ChatView
              key="admin"
              header={adminHeader}
              messages={inbox}
              loading={inboxLoading}
              meUid={user.uid}
              uploaderUid={user.uid}
              emptyText="This is a private conversation between you and the admin team. Send a message and we'll reply here."
              canSend={!demoMode}
              maxText={1000}
              hasMore={inboxFeed.hasMore}
              loadingOlder={inboxFeed.loadingOlder}
              onLoadOlder={inboxFeed.loadOlder}
              typingNames={typingNames}
              onTyping={typing.ping}
              onTypingStop={typing.stop}
              onSend={(p) => sendInboxMessage(user.uid, { uid: user.uid, name: user.name, isAdmin: false }, p, { name: user.name, email: user.email })}
              onReact={(m, emoji) => reactToInboxMessage(user.uid, m.id, user.uid, emoji)}
            />
          )}
        </div>
      )}
    </div>
  );
}
