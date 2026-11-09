"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, Inbox, Pin, Crown, Lock, ArrowLeft, Search } from "lucide-react";
import { LockedRoom } from "@/components/community/LockedRoom";
import { TopHeader } from "@/components/TopHeader";
import { PushCard } from "@/components/PushCard";
import { ChatView } from "@/components/community/ChatView";
import { RoomChat } from "@/components/community/RoomChat";
import { InboxPanel } from "@/components/community/InboxPanel";
import { cn } from "@/lib/utils";
import { useUserState } from "@/lib/useUserState";
import { Avatar } from "@/components/Avatar";
import { TeamLeaderPanel } from "@/components/community/TeamLeaderPanel";
import { useAuth } from "@/lib/auth";
import { useSettings, uploadLimitsFor } from "@/lib/settings";
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
  needsReply,
  sendRoomMessage,
  sendInboxMessage,
  reactToRoomMessage,
  reactToInboxMessage,
  deleteRoomMessage,
  setPinnedMessage,
  muteUser,
  unmuteUser,
  useMutedUsers,
  useCommunityPermissions,
  markInboxRead,
  ensureCommunityAdmin,
  formatRelative,
  STAFF_NAME,
  setRoomBoost,
  useTeamLeaderRole,
  useTeamLeaderBadges,
  useMemberDmThreads,
  useDm,
  isDmUnread,
  markDmRead,
  sendDm,
  reactToDm,
  deleteDmMessage,
  setRoomRead,
  useRoomReadAt,
  useRoomUnread,
  useRooms,
  visibleRooms,
  listedRooms,
  canSeeRoom,
  useMyRoomMemberships,
  useRoomsUnread,
  ROOM_AUDIENCE_LABEL,
  ROOM_POSTING_LABEL,
  type Boost,
  type ChatItem,
} from "@/lib/community";

type Tab = "room" | "admin" | "inbox" | "team" | `dm:${string}` | `room:${string}`;

/** The address fragment for an open chat (the Community Room is #community). */
const chatHash = (key: Tab) => `#${key === "room" ? "community" : key}`;
/** Which chat a fragment opens, or null for the list. */
function tabFromHash(h: string): Tab | null {
  if (h === "#community") return "room";
  if (h === "#admin" || h === "#team" || h === "#inbox") return h.slice(1) as Tab;
  if (/^#(dm|room):[A-Za-z0-9_-]+$/.test(h)) return h.slice(1) as Tab;
  return null;
}

function previewOf(m: ChatItem | undefined): string {
  if (!m) return "No messages yet";
  const body = m.text ?? (m.kind === "image" ? "📷 Photo" : m.kind === "video" ? "🎬 Video" : m.kind === "sticker" ? "Sticker" : "");
  return `${m.name.split(" ")[0]}: ${body}`;
}

export default function CommunityPage() {
  const { user, demoMode } = useAuth();
  const [tab, setTab] = useState<Tab>("room");
  // Phones (below lg) work like Messenger: a list of chats, and a chat opens full
  // screen until ← goes back. Wide screens keep the list beside the open chat.
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  // A chat counts as open (read stamps, typing, live thread) only when it is on screen.
  const showingChat = wide || phoneOpen;
  // the page behind a full-screen chat must not scroll
  useEffect(() => {
    if (wide || !phoneOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [wide, phoneOpen]);
  // Phones: opening a chat adds a history step (#community, #admin, #room:…), so the
  // phone's own Back button closes the chat and returns to the list, like Messenger.
  // Next.js keeps native pushState/replaceState in step with its router.
  const pushedRef = useRef(false);
  const openChat = (key: Tab) => {
    setTab(key);
    setPhoneOpen(true);
    if (!wide && typeof window !== "undefined") {
      window.history.pushState(null, "", `${window.location.pathname}${window.location.search}${chatHash(key)}`);
      pushedRef.current = true;
    }
  };
  const backToList = () => {
    // our own history step: going back closes the chat (see the popstate listener)
    if (pushedRef.current) { window.history.back(); return; }
    setPhoneOpen(false);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  };
  useEffect(() => {
    const onPop = () => {
      const key = tabFromHash(window.location.hash);
      if (key) { setTab(key); setPhoneOpen(true); pushedRef.current = true; }
      else { pushedRef.current = false; setPhoneOpen(false); }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const modRole = useChatModRole();
  const tlRole = useTeamLeaderRole();
  // Staff read the full history; members only from their sign-up date.
  const { state: me } = useUserState();
  const roomFeed = useCommunityRoom(!!user?.isAdmin || modRole.isMod);
  const { messages: room, loading: roomLoading } = roomFeed;
  const pinned = usePinnedMessage(room);
  const muted = useIsMuted();
  // Moderators see who is muted, so a muted member's menu offers "Unmute" instead.
  const mutedList = useMutedUsers(!!user?.isAdmin || modRole.isMod);
  const mutedUids = useMemo(() => new Set(mutedList.map((m) => m.uid)), [mutedList]);

  const uid = user?.uid ?? null;
  const inboxFeed = useInbox(tab === "admin" && showingChat ? uid : null);
  const { messages: inbox, loading: inboxLoading } = inboxFeed;
  const inboxMeta = useInboxMeta(uid);
  const adminUnread = isInboxUnread(inboxMeta, "user");

  // Presence + "N active now"
  usePresence(!!user && !demoMode);
  const online = useOnlineCount();

  // Typing indicators for whichever conversation is open
  const typingScope = useMemo(() => (!showingChat ? null : tab === "room" ? { room: true as const } : tab === "admin" && uid ? { thread: uid } : null), [tab, uid, showingChat]);
  // The admin account types and posts as "Admin", never under its own name.
  const typing = useTypingSignal(typingScope, uid ?? "", user?.isAdmin ? STAFF_NAME : user?.name ?? "");
  const typingNames = useTypingNames(typingScope, uid ?? "");

  // Staff = full admin or chat moderator. Inbox access needs the per-mod toggle.
  const isStaff = !!user?.isAdmin || modRole.isMod;
  // What this person may post in the room (admin toggles; the rules enforce the same).
  const perms = useCommunityPermissions();
  const { settings } = useSettings();
  const roomCaps = uploadLimitsFor(settings, "room");
  const inboxCaps = uploadLimitsFor(settings, "inbox");
  // Team Leaders may always send pictures, video and links in the room (the rules say the same)
  const canVideo = !!user?.isAdmin || (modRole.isMod && perms.modsVideo) || perms.membersVideo || tlRole.isTL;
  const canLinks = !!user?.isAdmin || (modRole.isMod && perms.modsLinks) || perms.membersLinks || tlRole.isTL;
  const canImage = isStaff || perms.membersImages || tlRole.isTL;
  const tlBadges = useTeamLeaderBadges(perms.tlBadges !== false);
  const canInbox = !!user?.isAdmin || (modRole.isMod && modRole.inbox);
  const inboxThreads = useInboxList(canInbox);
  // Team Leader threads: a leader wrote to this member
  const dmThreads = useMemberDmThreads(uid);
  const dmTl = tab.startsWith("dm:") ? tab.slice(3) : null;
  const dmThread = dmThreads.find((t) => t.tlUid === dmTl) ?? null;
  const dmFeed = useDm(dmTl, dmTl ? uid : null);
  const dmBadge = useMemo(() => new Set(dmTl ? [dmTl] : []), [dmTl]);
  const inboxUnread = inboxThreads.filter(needsReply).length;

  // The chat boxes are sized to fill the screen. When the "Turn on notifications"
  // banner shows above them they shrink by its height, so the message box (and the
  // admin's send button) stays on screen.
  const [pushBox, setPushBox] = useState<HTMLDivElement | null>(null);
  const [pushH, setPushH] = useState(0);
  useEffect(() => {
    if (!pushBox || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setPushH(Math.round(pushBox.getBoundingClientRect().height)));
    ro.observe(pushBox);
    return () => ro.disconnect();
  }, [pushBox]);

  // Deep link from Support: /community#admin
  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = window.location.hash;
    const key = tabFromHash(h);
    if (!key) return;
    setTab(key);
    // a link straight to a chat opens it, on phones too — with the list underneath,
    // so the phone's Back button lands on the chat list rather than leaving
    setPhoneOpen(true);
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      const base = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState(null, "", base);
      window.history.pushState(null, "", `${base}${h}`);
      pushedRef.current = true;
    }
  }, []);

  // Admins need their RTDB moderator flag before posting as admin.
  useEffect(() => {
    if (user?.isAdmin) ensureCommunityAdmin();
  }, [user?.isAdmin]);

  useEffect(() => {
    if (!showingChat || !dmTl || !uid || !dmThread || !isDmUnread(dmThread, "member")) return;
    markDmRead(dmTl, uid, "member");
  }, [showingChat, dmTl, uid, dmThread, dmFeed.messages.length]);

  // Mark the admin thread read whenever it's open and new messages arrive.
  useEffect(() => {
    if (!showingChat || tab !== "admin" || !uid || !inboxMeta || !adminUnread) return;
    markInboxRead(uid, "user");
  }, [showingChat, tab, uid, inboxMeta, adminUnread, inbox.length]);

  // The room counts as read up to the newest message while its tab is open
  // (that is what clears the badges on the menu and the app icon).
  const newestRoomAt = room.length ? room[room.length - 1].at : 0;
  const roomReadAt = useRoomReadAt(uid);
  const roomUnread = useRoomUnread(!!uid && !demoMode);
  useEffect(() => {
    if (!showingChat || tab !== "room" || !uid || demoMode || !newestRoomAt || newestRoomAt <= roomReadAt) return;
    setRoomRead(uid, newestRoomAt);
  }, [showingChat, tab, uid, demoMode, newestRoomAt, roomReadAt]);

  // Admin-created rooms this person may enter (admins: all that are not hidden… and hidden ones too)
  const allRooms = useRooms();
  // Exclusive rooms: everyone sees the name with a lock; only people the admin added get in.
  const memberOf = useMyRoomMemberships(allRooms);
  const viewer = useMemo(() => ({ isAdmin: !!user?.isAdmin, isMod: modRole.isMod, isTL: tlRole.isTL, memberOf }), [user?.isAdmin, modRole.isMod, tlRole.isTL, memberOf]);
  const rooms = useMemo(() => visibleRooms(allRooms, viewer), [allRooms, viewer]);
  const listed = useMemo(() => listedRooms(allRooms, viewer), [allRooms, viewer]);
  const roomsUnread = useRoomsUnread(rooms, !!uid && !demoMode, memberOf);
  const openRoom = tab.startsWith("room:") ? listed.find((r) => `room:${r.id}` === tab) ?? null : null;
  const openLocked = !!openRoom && !canSeeRoom(openRoom, viewer);

  if (!user) return null;

  const sender = { uid: user.uid, name: user.name, isAdmin: user.isAdmin, isMod: modRole.isMod, isTL: tlRole.isTL, photo: me?.profile?.photoURL ?? null };

  const moderation = isStaff
    ? {
        onDelete: (m: ChatItem) => deleteRoomMessage(m.id),
        onPin: (m: ChatItem) => setPinnedMessage(pinned?.id === m.id ? null : m.id),
        onMute: (m: ChatItem) => muteUser(m.senderId, m.name),
        onUnmute: (m: ChatItem) => unmuteUser(m.senderId),
        onBoost: (m: ChatItem, b: Boost) => setRoomBoost(m.id, b),
        mutedUids,
      }
    : { onDelete: (m: ChatItem) => (m.senderId === user.uid ? deleteRoomMessage(m.id) : Promise.resolve()) };

  const lastRoom = room[room.length - 1];

  const back = !wide ? (
    <button type="button" onClick={backToList} className="w-8 h-8 -ml-1 shrink-0 flex items-center justify-center text-blue" aria-label="Back to chats"><ArrowLeft className="w-5 h-5" /></button>
  ) : null;
  // full screen on phones: no card border or corners around the chat
  const fill = !wide ? "rounded-none border-0" : undefined;

  const roomHeader = (
    <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border shrink-0">
      {back}
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
      {back}
      <div className="w-9 h-9 rounded-full bg-[#F5C66B]/20 border border-[#F5C66B]/40 flex items-center justify-center shrink-0">
        <ShieldCheck className="w-4 h-4 text-[#F5C66B]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold m-0 truncate">Message Admin</p>
        <p className="text-[11px] text-text-muted m-0">Private conversation with the Investure team</p>
      </div>
    </div>
  );

  const chatItems: { key: Tab; label: string; sub: string; at?: number; unread: number; icon: React.ReactNode; locked?: boolean }[] = [
    {
      key: "room",
      label: "Community Room",
      sub: previewOf(lastRoom),
      at: lastRoom?.at,
      unread: showingChat && tab === "room" ? 0 : roomUnread,
      icon: (
        <div className="relative shrink-0">
          <div className="w-11 h-11 rounded-full bg-[#F5C66B] text-[#2A1D05] text-[13px] font-extrabold flex items-center justify-center">IC</div>
          <span className="absolute right-0 bottom-0 w-3 h-3 rounded-full bg-green border-2 border-card" />
        </div>
      ),
    },
    ...listed.map((r) => {
      // someone not added to an exclusive room sees only its name and a lock
      const locked = !canSeeRoom(r, viewer);
      return {
        key: `room:${r.id}` as Tab,
        label: r.name,
        sub: locked ? "" : r.blurb || `${ROOM_AUDIENCE_LABEL[r.audience]} · ${ROOM_POSTING_LABEL[r.posting]}`,
        at: undefined,
        unread: locked || (showingChat && tab === `room:${r.id}`) ? 0 : roomsUnread.byRoom[r.id] ?? 0,
        locked,
        icon: locked ? (
          <div className="w-11 h-11 rounded-full bg-card-elev border border-[#F5C66B]/40 flex items-center justify-center shrink-0 text-[#F5C66B]"><Lock className="w-[18px] h-[18px]" /></div>
        ) : (
          <div className="w-11 h-11 rounded-full bg-card-elev border border-border flex items-center justify-center shrink-0 text-gold text-[14px] font-extrabold">{r.name.slice(0, 1).toUpperCase()}</div>
        ),
      };
    }),
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
    ...(tlRole.isTL
      ? [
          {
            key: "team" as Tab,
            label: "My team chats",
            sub: "Message members directly as a Team Leader",
            at: undefined,
            unread: 0,
            icon: (
              <div className="w-11 h-11 rounded-full bg-[#5CE0D2]/15 border border-[#5CE0D2]/40 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5 text-[#5CE0D2]" />
              </div>
            ),
          },
        ]
      : []),
    ...dmThreads.map((t) => ({
      key: `dm:${t.tlUid}` as Tab,
      label: t.name,
      sub: t.lastText ? `${t.lastFrom === t.tlUid ? t.name.split(" ")[0] : "You"}: ${t.lastText}` : "Team Leader",
      at: t.lastAt,
      unread: isDmUnread(t, "member") ? 1 : 0,
      icon: <Avatar src={t.photo} name={t.name} id={t.tlUid} size={44} ring="ring-1 ring-[#5CE0D2]/40" />,
    })),
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
    <div style={{ "--chat-offset": `${235 + pushH}px` } as React.CSSProperties}>
      <TopHeader title="Community" subtitle="Chat with everyone, or message the admin directly" />

      {demoMode && (
        <p className="text-[11px] text-text-muted bg-card border border-border rounded-lg px-3 py-2 mb-3 m-0">
          Chat needs Firebase — it&apos;s unavailable in demo mode.
        </p>
      )}

      {/* flow-root so the measured height includes the banner's bottom margin */}
      <div ref={setPushBox} className="flow-root">
        <PushCard />
      </div>

      {/* Phone: Messenger-style list of chats (a chat then opens full screen) */}
      {!wide && !phoneOpen && (
        <div className="bg-card border border-border rounded-xl py-2">
          <div className="px-3.5 pt-1.5 pb-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[22px] font-extrabold tracking-tight">Chats</span>
              {online !== null && <span className="text-[11px] text-text-subtle">{online.toLocaleString()} active now</span>}
            </div>
            <div className="mt-2 flex items-center gap-2 px-3.5 py-2 bg-canvas rounded-full">
              <Search className="w-4 h-4 text-text-subtle shrink-0" />
              <input value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} placeholder="Search chats" aria-label="Search chats" className="bg-transparent text-[14px] outline-none w-full text-text placeholder:text-text-subtle" />
            </div>
          </div>
          {chatItems
            .filter((c) => { const s = chatSearch.trim().toLowerCase(); return !s || c.label.toLowerCase().includes(s) || c.sub.toLowerCase().includes(s); })
            .map((c) => (
              <button key={c.key} onClick={() => openChat(c.key)} className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left active:bg-card-elev transition">
                {c.icon}
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[15px] m-0 truncate flex items-center gap-1", c.unread ? "font-bold text-text" : "font-semibold text-text")}>
                    <span className="truncate">{c.label}</span>
                    {c.locked && <Lock className="w-3.5 h-3.5 text-text-subtle shrink-0" aria-label="Locked" />}
                  </p>
                  {c.sub && <p className={cn("text-[13px] m-0 truncate mt-0.5", c.unread ? "text-text font-semibold" : "text-text-muted")}>{c.sub}</p>}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {c.at ? <span className={cn("text-[11px]", c.unread ? "text-text" : "text-text-subtle")}>{formatRelative(c.at)}</span> : null}
                  {c.unread > 1 ? (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-blue text-white text-[11px] font-bold flex items-center justify-center">{c.unread > 99 ? "99+" : c.unread}</span>
                  ) : c.unread === 1 ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-blue" />
                  ) : null}
                </div>
              </button>
            ))}
        </div>
      )}

      {!showingChat ? null : tab === "inbox" && canInbox ? (
        <div className={cn(!wide && "fixed inset-0 z-[65] bg-canvas flex flex-col overflow-y-auto px-2 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] [--chat-offset:calc(64px+env(safe-area-inset-top)+env(safe-area-inset-bottom))]")}>
          {!wide ? (
            <button onClick={backToList} className="flex items-center gap-1.5 text-[14px] text-blue font-semibold py-3 px-1 shrink-0"><ArrowLeft className="w-5 h-5" /> Chats</button>
          ) : (
            <button onClick={() => setTab("room")} className="inline-flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text mb-2">← Back to chats</button>
          )}
          <InboxPanel staff={{ uid: user.uid, name: STAFF_NAME, isAdmin: user.isAdmin, isMod: modRole.isMod }} canSend={!demoMode} />
        </div>
      ) : tab === "team" && tlRole.isTL ? (
        <div className={cn(!wide && "fixed inset-0 z-[65] bg-canvas flex flex-col overflow-y-auto px-2 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] [--chat-offset:calc(64px+env(safe-area-inset-top)+env(safe-area-inset-bottom))]")}>
          {!wide ? (
            <button onClick={backToList} className="flex items-center gap-1.5 text-[14px] text-blue font-semibold py-3 px-1 shrink-0"><ArrowLeft className="w-5 h-5" /> Chats</button>
          ) : (
            <button onClick={() => setTab("room")} className="inline-flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text mb-2">← Back to chats</button>
          )}
          <TeamLeaderPanel me={{ uid: user.uid, name: user.name, photo: me?.profile?.photoURL ?? null }} canSend={!demoMode} />
        </div>
      ) : (
        <div className={cn("lg:grid lg:grid-cols-[300px_1fr] lg:gap-3", !wide && "fixed inset-0 z-[65] bg-card flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] [--chat-offset:calc(env(safe-area-inset-top)+env(safe-area-inset-bottom))]")}>
          {/* Desktop: chat list */}
          <div className="hidden lg:flex flex-col bg-card border border-border rounded-xl p-2.5 gap-1" style={{ height: "calc(100dvh - var(--chat-offset, 235px))", minHeight: 460 }}>
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
                    <p className={cn("text-[13px] m-0 truncate flex items-center gap-1", c.unread ? "font-bold text-text" : "font-semibold text-text")}>
                      <span className="truncate">{c.label}</span>
                      {c.locked && <Lock className="w-3 h-3 text-text-subtle shrink-0" aria-label="Locked" />}
                    </p>
                    {c.at ? <span className="text-[10px] text-text-subtle shrink-0">{formatRelative(c.at)}</span> : null}
                  </div>
                  {c.sub && <p className={cn("text-[11px] m-0 truncate mt-0.5", c.unread ? "text-text font-medium" : "text-text-muted")}>{c.sub}</p>}
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
              className={fill}
              header={roomHeader}
              messages={room}
              loading={roomLoading}
              meUid={user.uid}
              uploaderUid={user.uid}
              emptyText="No messages yet — say hello to the community!"
              pinned={pinned}
              canSend={!muted && !demoMode}
              sendDisabledReason={muted ? "You've been muted in the Community Room. Message the admin if you think this is a mistake." : undefined}
              allowVideo={canVideo}
              allowImage={canImage}
              allowAlbum={!!user.isAdmin}
              maxImageBytes={roomCaps.imageMB * 1024 * 1024}
              maxVideoBytes={roomCaps.videoMB * 1024 * 1024}
              maxVideoSeconds={roomCaps.videoSeconds}
              keepOriginal={isStaff}
              blockLinks={!canLinks}
              hasMore={roomFeed.hasMore}
              loadingOlder={roomFeed.loadingOlder}
              onLoadOlder={roomFeed.loadOlder}
              historyStartLabel={isStaff ? "Beginning of the room" : "You joined the community here"}
              typingNames={typingNames}
              onTyping={typing.ping}
              onTypingStop={typing.stop}
              onSend={(p) => sendRoomMessage(sender, p)}
              onReact={(m, emoji) => reactToRoomMessage(m.id, user.uid, emoji)}
              tlBadges={tlBadges}
              {...moderation}
            />
          )}

          {openRoom && openLocked && <LockedRoom name={openRoom.name} onBack={!wide ? backToList : undefined} fullScreen={!wide} />}

          {openRoom && !openLocked && (
            <RoomChat
              key={openRoom.id}
              room={openRoom}
              addedAt={memberOf[openRoom.id]}
              sender={sender}
              isStaff={isStaff}
              isMod={modRole.isMod}
              muted={muted}
              mutedUids={mutedUids}
              tlBadges={tlBadges}
              caps={roomCaps}
              demoMode={demoMode}
              onBack={!wide ? backToList : undefined}
              fullScreen={!wide}
            />
          )}

          {dmTl && (
            <ChatView
              key={tab}
              className={fill}
              header={
                <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border shrink-0">
                  {back}
                  <Avatar src={dmThread?.photo} name={dmThread?.name ?? "Team Leader"} id={dmTl} size={36} ring="ring-1 ring-[#5CE0D2]/40" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold m-0 truncate flex items-center gap-1.5">{dmThread?.name ?? "Team Leader"} <span className="text-[8px] font-bold tracking-[0.06em] text-[#5CE0D2] bg-[#5CE0D2]/15 border border-[#5CE0D2]/40 px-1.5 py-px rounded-full">Team Leader</span></p>
                    <p className="text-[11px] text-text-muted m-0">Private conversation</p>
                  </div>
                </div>
              }
              messages={dmFeed.messages}
              loading={dmFeed.loading}
              meUid={user.uid}
              uploaderUid={user.uid}
              uploadFolder={`inbox/${user.uid}`}
              maxImageBytes={inboxCaps.imageMB * 1024 * 1024}
              maxVideoBytes={inboxCaps.videoMB * 1024 * 1024}
              maxVideoSeconds={inboxCaps.videoSeconds}
              emptyText="Your Team Leader will write here."
              canSend={!demoMode && !!dmThread}
              maxText={1000}
              hasMore={dmFeed.hasMore}
              loadingOlder={dmFeed.loadingOlder}
              onLoadOlder={dmFeed.loadOlder}
              tlBadges={dmBadge}
              onSend={(p) => sendDm({ uid: dmTl, name: dmThread?.name ?? "Team Leader", photo: dmThread?.photo ?? null }, { uid: user.uid, name: user.name, photo: me?.profile?.photoURL ?? null }, false, p)}
              onReact={(m, emoji) => reactToDm(dmTl, user.uid, m.id, user.uid, emoji)}
              onDelete={(m) => (m.senderId === user.uid ? deleteDmMessage(dmTl, user.uid, m.id) : Promise.resolve())}
            />
          )}

          {tab === "admin" && (
            <ChatView
              key="admin"
              className={fill}
              header={adminHeader}
              messages={inbox}
              loading={inboxLoading}
              meUid={user.uid}
              uploaderUid={user.uid}
              uploadFolder={`inbox/${user.uid}`}
              maxImageBytes={inboxCaps.imageMB * 1024 * 1024}
              maxVideoBytes={inboxCaps.videoMB * 1024 * 1024}
              maxVideoSeconds={inboxCaps.videoSeconds}
              emptyText="This is a private conversation between you and the admin team. Send a message and we'll reply here."
              canSend={!demoMode}
              maxText={1000}
              hasMore={inboxFeed.hasMore}
              loadingOlder={inboxFeed.loadingOlder}
              onLoadOlder={inboxFeed.loadOlder}
              typingNames={typingNames}
              onTyping={typing.ping}
              onTypingStop={typing.stop}
              onSend={(p) => sendInboxMessage(user.uid, { uid: user.uid, name: user.name, isAdmin: false, photo: me?.profile?.photoURL ?? null }, p, { name: user.name, email: user.email })}
              onReact={(m, emoji) => reactToInboxMessage(user.uid, m.id, user.uid, emoji)}
            />
          )}
        </div>
      )}
    </div>
  );
}
