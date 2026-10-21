"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Lock, Loader2 } from "lucide-react";
import { ChatView } from "@/components/community/ChatView";
import { Modal } from "@/components/Modal";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { manilaDateTime, toManilaInput } from "@/lib/withdrawals";
import {
  useRoomFeed,
  usePinnedMessage,
  useRoomsReadAt,
  setRoomsRead,
  sendRoomMessage,
  reactToRoomMessage,
  deleteRoomMessage,
  setPinnedMessage,
  setRoomBoost,
  setMessageDate,
  muteUser,
  unmuteUser,
  ROOM_AUDIENCE_LABEL,
  ROOM_POSTING_LABEL,
  type RoomConfig,
  type Sender,
  type ChatItem,
  type Boost,
} from "@/lib/community";
import type { UploadLimits } from "@/lib/settings";

const input = "bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40 [color-scheme:dark]";

/**
 * One admin-created room on the Community page. Reuses the Community Room's
 * chat view; the room's settings decide who may post, who may react, what
 * history a member sees, and whether the admin may date posts.
 */
export function RoomChat({ room, sender, isStaff, isMod, muted, mutedUids, tlBadges, caps, demoMode }: {
  room: RoomConfig;
  sender: Sender;
  isStaff: boolean;
  isMod: boolean;
  muted: boolean;
  mutedUids: Set<string>;
  tlBadges: ReadonlySet<string>;
  caps: UploadLimits;
  demoMode: boolean;
}) {
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const isAdmin = !!user?.isAdmin;
  const feed = useRoomFeed(room.id, room.history, isStaff);
  const pinned = usePinnedMessage(feed.messages, room.id);
  const readMap = useRoomsReadAt(demoMode ? null : uid || null);
  const newestAt = feed.messages.length ? feed.messages[feed.messages.length - 1].at : 0;

  // reading the room clears its badge
  useEffect(() => {
    if (!uid || demoMode || !newestAt || newestAt <= (readMap[room.id] ?? 0)) return;
    setRoomsRead(uid, room.id, newestAt);
  }, [uid, demoMode, newestAt, readMap, room.id]);

  // admins in rooms with post dates on: date for the next post, and "Change date" on existing posts
  const canDate = isAdmin && room.dateEdit;
  const [postAt, setPostAt] = useState("");
  const [dating, setDating] = useState<ChatItem | null>(null);
  const [dateValue, setDateValue] = useState("");
  const [dateBusy, setDateBusy] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  const canPost = isAdmin || (room.posting === "members" && !muted);
  const canReact = isAdmin || room.posting !== "read";
  const lockLine = room.posting === "react" ? "Only the admin posts here. You can react to posts." : room.posting === "read" ? "Only the admin posts here." : muted ? "You've been muted. Message the admin if you think this is a mistake." : undefined;

  const moderation = useMemo(() => (isStaff
    ? {
        onDelete: (m: ChatItem) => deleteRoomMessage(m.id, room.id),
        onPin: (m: ChatItem) => setPinnedMessage(pinned?.id === m.id ? null : m.id, room.id),
        onMute: (m: ChatItem) => muteUser(m.senderId, m.name),
        onUnmute: (m: ChatItem) => unmuteUser(m.senderId),
        onBoost: (m: ChatItem, b: Boost) => setRoomBoost(m.id, b, room.id),
        mutedUids,
      }
    : { onDelete: (m: ChatItem) => (m.senderId === uid ? deleteRoomMessage(m.id, room.id) : Promise.resolve()) }), [isStaff, room.id, pinned?.id, mutedUids, uid]);
  void isMod;

  async function saveDate() {
    if (!dating) return;
    const ms = manilaDateTime(dateValue);
    if (ms == null) return setDateError("Pick a date and time.");
    if (ms > Date.now() + 86_400_000) return setDateError("That is more than a day in the future.");
    setDateBusy(true); setDateError(null);
    try { await setMessageDate(room.id, dating.id, ms); setDating(null); }
    catch (e) { setDateError(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not change the date."); }
    finally { setDateBusy(false); }
  }

  const header = (
    <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border shrink-0">
      <div className="w-9 h-9 rounded-full bg-card-elev border border-border flex items-center justify-center shrink-0 text-gold text-[13px] font-extrabold">{room.name.slice(0, 1).toUpperCase()}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold m-0 truncate">{room.name}</p>
        <p className="text-[11px] text-text-muted m-0 truncate">{room.blurb || `${ROOM_AUDIENCE_LABEL[room.audience]} · ${ROOM_POSTING_LABEL[room.posting]}`}</p>
      </div>
      {room.posting !== "members" && <span className="text-[9px] font-bold tracking-[0.06em] uppercase text-text-subtle bg-canvas border border-border px-1.5 py-0.5 rounded-full shrink-0">{room.posting === "react" ? "React only" : "Read only"}</span>}
      {canDate && (
        // the chat card has a fixed height, so the date control lives in the header rather than above the card
        <label className="flex items-center gap-1.5 text-[10px] text-text-muted shrink-0" title="Date for your next post (blank = now)">
          <CalendarClock className="w-3.5 h-3.5 text-gold" />
          <span className="hidden sm:inline">Next post</span>
          <input type="datetime-local" value={postAt} onChange={(e) => setPostAt(e.target.value)} className={cn(input, "py-0.5 px-1.5 text-[10px] max-w-[170px]")} />
          {postAt && <button type="button" onClick={() => setPostAt("")} className="text-text-subtle hover:text-text">now</button>}
        </label>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <ChatView
        key={room.id}
        header={header}
        messages={feed.messages}
        loading={feed.loading}
        meUid={uid}
        uploaderUid={uid}
        emptyText={room.posting === "members" ? "No messages yet. Start the conversation." : "Nothing posted here yet."}
        pinned={pinned}
        canSend={canPost && !demoMode}
        sendDisabledReason={lockLine}
        allowVideo={isStaff || room.media}
        allowImage={isStaff || room.media}
        maxImageBytes={caps.imageMB * 1024 * 1024}
        maxVideoBytes={caps.videoMB * 1024 * 1024}
        maxVideoSeconds={caps.videoSeconds}
        keepOriginal={isStaff}
        blockLinks={!isStaff && !sender.isTL}
        hasMore={feed.hasMore}
        loadingOlder={feed.loadingOlder}
        onLoadOlder={feed.loadOlder}
        historyStartLabel={room.history === "all" || isStaff ? "Beginning of the room" : "You joined the community here"}
        onSend={(p) => sendRoomMessage(sender, p, room.id, canDate && postAt ? manilaDateTime(postAt) ?? undefined : undefined)}
        onReact={canReact ? (m, emoji) => reactToRoomMessage(m.id, uid, emoji, room.id) : undefined}
        onChangeDate={canDate ? async (m) => { setDating(m); setDateValue(toManilaInput(m.at, true)); setDateError(null); } : undefined}
        tlBadges={tlBadges}
        {...moderation}
      />
      {!canPost && lockLine && room.posting !== "members" && (
        <p className="text-[11px] text-text-subtle m-0 flex items-center gap-1.5 px-1"><Lock className="w-3 h-3" /> {lockLine}</p>
      )}

      <Modal open={!!dating} onClose={() => !dateBusy && setDating(null)} title="Change the post's date">
        <div className="flex flex-col gap-3">
          <p className="text-[11px] text-text-muted m-0">The post moves to this point in the room&apos;s history. Members who joined after this date will not see it if the room shows history from the join date.</p>
          <input type="datetime-local" value={dateValue} onChange={(e) => setDateValue(e.target.value)} className={cn(input, "w-full")} />
          {dateError && <p className="text-[11px] text-red m-0">{dateError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setDating(null)} disabled={dateBusy} className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted">Cancel</button>
            <button type="button" onClick={saveDate} disabled={dateBusy} className="flex-1 py-2.5 rounded-lg bg-gold text-gold-dark text-[12px] font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">{dateBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save date</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
