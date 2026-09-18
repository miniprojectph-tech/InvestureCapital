"use client";

import { useEffect, useState } from "react";
import { Users, ShieldCheck, Inbox } from "lucide-react";
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
  useChatModRole,
  isInboxUnread,
  sendRoomMessage,
  sendInboxMessage,
  deleteRoomMessage,
  setPinnedMessage,
  muteUser,
  markInboxRead,
  ensureCommunityAdmin,
  type ChatItem,
} from "@/lib/community";

type Tab = "room" | "admin" | "inbox";

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

  // Staff = full admin or chat moderator. Inbox access needs the per-mod toggle.
  const isStaff = user.isAdmin || modRole.isMod;
  const canInbox = user.isAdmin || (modRole.isMod && modRole.inbox);
  const sender = { uid: user.uid, name: user.name, isAdmin: user.isAdmin, isMod: modRole.isMod };

  const moderation = isStaff
    ? {
        onDelete: (m: ChatItem) => deleteRoomMessage(m.id),
        onPin: (m: ChatItem) => setPinnedMessage(pinned?.id === m.id ? null : m.id),
        onMute: (m: ChatItem) => muteUser(m.senderId, m.name),
      }
    : {};

  return (
    <div>
      <TopHeader title="Community" subtitle="Chat with everyone, or message the admin directly" />

      {demoMode && (
        <p className="text-[11px] text-text-muted bg-card border border-border rounded-lg px-3 py-2 mb-3 m-0">
          Chat needs Firebase — it&apos;s unavailable in demo mode.
        </p>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-card border border-border rounded-full p-1 mb-3 w-fit max-w-full overflow-x-auto">
        <TabButton active={tab === "room"} onClick={() => setTab("room")} icon={<Users className="w-3.5 h-3.5" />}>
          Community Room
        </TabButton>
        <TabButton active={tab === "admin"} onClick={() => setTab("admin")} icon={<ShieldCheck className="w-3.5 h-3.5" />} dot={adminUnread}>
          Message Admin
        </TabButton>
        {canInbox && (
          <TabButton active={tab === "inbox"} onClick={() => setTab("inbox")} icon={<Inbox className="w-3.5 h-3.5" />}>
            Inbox
          </TabButton>
        )}
      </div>

      {tab === "room" && (
        <ChatView
          key="room"
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
          onSend={(p) => sendRoomMessage(sender, p)}
          {...moderation}
        />
      )}

      {tab === "admin" && (
        <ChatView
          key="admin"
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
          onSend={(p) => sendInboxMessage(user.uid, { uid: user.uid, name: user.name, isAdmin: false }, p, { name: user.name, email: user.email })}
        />
      )}

      {tab === "inbox" && canInbox && (
        <InboxPanel staff={{ uid: user.uid, name: user.isAdmin ? "Admin" : "Moderator", isAdmin: user.isAdmin, isMod: modRole.isMod }} canSend={!demoMode} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] transition whitespace-nowrap",
        active ? "bg-gold text-gold-dark font-medium" : "text-text-muted hover:text-text",
      )}
    >
      {icon}
      {children}
      {dot && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red ring-2 ring-card" />}
    </button>
  );
}
