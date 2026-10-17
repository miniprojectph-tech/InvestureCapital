"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Crown, Loader2, MessageCircle, Search, Sparkles, Users } from "lucide-react";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { ChatView } from "@/components/community/ChatView";
import { cn } from "@/lib/utils";
import { useSettings, uploadLimitsFor } from "@/lib/settings";
import {
  useLeaderDmThreads, useDm, isDmUnread, sendDm, markDmRead, deleteDmMessage, reactToDm, tlMembers, formatRelative,
  type TlMember, type ChatItem,
} from "@/lib/community";

const NEW_DAYS = 30;

/**
 * A Team Leader's own corner of the Community page: their conversations, the
 * new members of the last 30 days, and the whole member directory, each with a
 * Message button. Only the leader can start a thread; the member replies in it.
 */
export function TeamLeaderPanel({ me, canSend }: { me: { uid: string; name: string; photo?: string | null }; canSend: boolean }) {
  const { settings } = useSettings();
  const caps = uploadLimitsFor(settings, "inbox");
  const [list, setList] = useState<"chats" | "new" | "all">("chats");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TlMember | null>(null);
  const [members, setMembers] = useState<TlMember[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const threads = useLeaderDmThreads(me.uid);
  const feed = useDm(selected ? me.uid : null, selected?.uid ?? null);
  const thread = useMemo(() => threads.find((t) => t.memberUid === selected?.uid) ?? null, [threads, selected]);
  const badge = useMemo(() => new Set([me.uid]), [me.uid]);

  useEffect(() => {
    let alive = true;
    tlMembers().then((m) => { if (alive) setMembers(m); }).catch((e) => { if (alive) setLoadErr(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not load members"); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (selected && thread && isDmUnread(thread, "tl")) markDmRead(me.uid, selected.uid, "tl");
  }, [selected, thread, me.uid, feed.messages.length]);

  const [cutoff] = useState(() => Date.now() - NEW_DAYS * 86_400_000);
  const q = search.trim().toLowerCase();
  const byName = (m: TlMember) => !q || m.name.toLowerCase().includes(q);
  const newMembers = (members ?? []).filter((m) => m.joinedAt >= cutoff).filter(byName);
  const allMembers = (members ?? []).filter(byName);
  const chatRows = threads.filter((t) => !q || t.name.toLowerCase().includes(q));
  const unread = threads.filter((t) => isDmUnread(t, "tl")).length;
  const memberOf = (uid: string, name: string, photo?: string | null): TlMember => members?.find((m) => m.uid === uid) ?? { uid, name, joinedAt: 0, placed: false, photoURL: photo ?? null };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3">
      <Card className={cn("p-0 flex flex-col", selected && "max-lg:hidden")}>
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-medium m-0 flex items-center gap-1.5"><Crown className="w-3.5 h-3.5 text-[#5CE0D2]" /> Team Leader</p>
            {unread > 0 && <span className="text-[9px] font-semibold bg-red/15 text-red px-1.5 py-0.5 rounded-full">{unread} unread</span>}
          </div>
          <div className="flex gap-1 mb-2">
            {([["chats", `Chats${threads.length ? ` · ${threads.length}` : ""}`], ["new", `New members${members ? ` · ${(members).filter((m) => m.joinedAt >= cutoff).length}` : ""}`], ["all", "All members"]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setList(k)} aria-pressed={list === k} className={cn("px-2.5 py-1 rounded-full text-[10px] font-medium border transition", list === k ? "bg-[#5CE0D2]/15 border-[#5CE0D2]/40 text-[#5CE0D2]" : "bg-canvas border-border text-text-muted hover:text-text")}>{label}</button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-text-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members" className="w-full bg-canvas border border-border rounded-lg pl-8 pr-3 py-2 text-[11px] text-text outline-none focus:border-[#5CE0D2]/50 placeholder:text-text-subtle" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto" style={{ maxHeight: "calc(100dvh - 330px)", minHeight: 240 }}>
          {list === "chats" && (chatRows.length === 0 ? (
            <p className="text-[11px] text-text-subtle text-center py-8 m-0 px-4">No conversations yet. Pick someone from New members or All members and send the first message.</p>
          ) : chatRows.map((t) => {
            const un = isDmUnread(t, "tl");
            return (
              <button key={t.memberUid} onClick={() => setSelected(memberOf(t.memberUid, t.name, t.photo))} className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 text-left border-b border-border transition", selected?.uid === t.memberUid ? "bg-[#5CE0D2]/10" : "hover:bg-card-elev")}>
                <Avatar src={t.photo} name={t.name} id={t.memberUid} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2"><p className={cn("text-[12px] m-0 truncate text-text", un && "font-semibold")}>{t.name}</p><span className="text-[9px] text-text-subtle shrink-0">{formatRelative(t.lastAt)}</span></div>
                  <p className={cn("text-[10px] m-0 truncate mt-0.5", un ? "text-text-muted" : "text-text-subtle")}>{t.lastFrom === me.uid ? "You: " : ""}{t.lastText}</p>
                </div>
                {un && <span className="w-2 h-2 rounded-full bg-red shrink-0" />}
              </button>
            );
          }))}
          {list !== "chats" && (members === null ? (
            loadErr ? <p className="text-[11px] text-red text-center py-8 m-0 px-4">{loadErr}</p> : <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-text-subtle" /></div>
          ) : (list === "new" ? newMembers : allMembers).length === 0 ? (
            <p className="text-[11px] text-text-subtle text-center py-8 m-0 px-4">{list === "new" ? `No one joined in the last ${NEW_DAYS} days.` : "No members match."}</p>
          ) : (list === "new" ? newMembers : allMembers).map((m) => (
            <div key={m.uid} className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border">
              <Avatar src={m.photoURL} name={m.name} id={m.uid} size={32} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] m-0 truncate text-text flex items-center gap-1.5">
                  <span className="truncate">{m.name}</span>
                  {m.joinedAt >= cutoff && <span className="text-[8px] font-semibold uppercase tracking-wide bg-green/15 text-green px-1.5 py-px rounded-full shrink-0 flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" /> New</span>}
                </p>
                <p className="text-[10px] text-text-subtle m-0 truncate mt-0.5">{m.joinedAt ? `Joined ${formatRelative(m.joinedAt)} ago` : "Member"} · {m.placed ? "has placed" : "no placement yet"}</p>
              </div>
              <button onClick={() => setSelected(m)} className="text-[10px] px-2.5 py-1 rounded-md bg-[#5CE0D2]/15 text-[#5CE0D2] font-medium shrink-0">{threads.some((t) => t.memberUid === m.uid) ? "Open" : "Message"}</button>
            </div>
          )))}
        </div>
      </Card>

      <div className={cn(!selected && "max-lg:hidden")}>
        {selected ? (
          <ChatView
            key={selected.uid}
            header={
              <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border shrink-0">
                <button onClick={() => setSelected(null)} className="lg:hidden w-8 h-8 -ml-1 flex items-center justify-center text-blue" aria-label="Back"><ArrowLeft className="w-5 h-5" /></button>
                <Avatar src={selected.photoURL} name={selected.name} id={selected.uid} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold m-0 truncate">{selected.name}</p>
                  <p className="text-[10px] text-text-subtle m-0 truncate">{selected.joinedAt ? `Joined ${formatRelative(selected.joinedAt)} ago · ` : ""}{selected.placed ? "has placed" : "no placement yet"}</p>
                </div>
              </div>
            }
            messages={feed.messages}
            loading={feed.loading}
            meUid={me.uid}
            uploaderUid={me.uid}
            uploadFolder={`inbox/${me.uid}`}
            maxImageBytes={caps.imageMB * 1024 * 1024}
            maxVideoBytes={caps.videoMB * 1024 * 1024}
            maxVideoSeconds={caps.videoSeconds}
            emptyText={`Say hello to ${selected.name.split(" ")[0]}. They can reply once you've written first.`}
            canSend={canSend}
            allowVideo
            maxText={1000}
            hasMore={feed.hasMore}
            loadingOlder={feed.loadingOlder}
            onLoadOlder={feed.loadOlder}
            tlBadges={badge}
            onSend={(p) => sendDm(me, { uid: selected.uid, name: selected.name, photo: selected.photoURL }, true, p)}
            onReact={(m: ChatItem, emoji) => reactToDm(me.uid, selected.uid, m.id, me.uid, emoji)}
            onDelete={(m: ChatItem) => (m.senderId === me.uid ? deleteDmMessage(me.uid, selected.uid, m.id) : Promise.resolve())}
          />
        ) : (
          <div className="bg-card border border-border rounded-xl flex items-center justify-center" style={{ height: "calc(100dvh - 235px)", minHeight: 420 }}>
            <div className="text-center px-6">
              <MessageCircle className="w-8 h-8 text-text-subtle mx-auto mb-2" />
              <p className="text-[12px] text-text-muted m-0">Pick a conversation, or a member to write to.</p>
              <p className="text-[10px] text-text-subtle m-0 mt-1 flex items-center justify-center gap-1"><Users className="w-3 h-3" /> New members are marked for 30 days.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
