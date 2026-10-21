"use client";

import { useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { Plus, Pencil, Eye, EyeOff, Trash2, Loader2, AlertCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { Switch } from "@/components/Switch";
import { cn } from "@/lib/utils";
import { getFirebase } from "@/lib/firebase";
import {
  useRooms, saveRoom, setRoomHidden, deleteRoom,
  ROOM_AUDIENCE_LABEL, ROOM_POSTING_LABEL, ROOM_HISTORY_LABEL,
  type RoomConfig, type RoomAudience, type RoomPosting, type RoomHistory,
} from "@/lib/community";

type Draft = Omit<RoomConfig, "id" | "createdAt" | "createdBy"> & { id?: string };
const blank = (order: number): Draft => ({ name: "", blurb: "", audience: "all", posting: "members", media: true, history: "join", dateEdit: false, hidden: false, order });
const input = "w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40";

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border overflow-hidden">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)} className={cn("px-2.5 py-1.5 text-[11px] transition", value === v ? "bg-gold text-gold-dark font-medium" : "text-text-muted hover:text-text")}>{label}</button>
      ))}
    </div>
  );
}

async function audit(type: string, title: string, subtitle: string, by: string) {
  const { db } = getFirebase();
  if (!db) return;
  await addDoc(collection(db, "admin_audit"), { type, title, subtitle, by, at: Date.now() }).catch(() => {});
}

/** Admin › Community › Rooms: the extra rooms beside the Community Room. */
export function RoomsCard({ uid }: { uid: string }) {
  const rooms = useRooms();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<RoomConfig | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const edit = (r: RoomConfig) => { setError(null); setDraft({ id: r.id, name: r.name, blurb: r.blurb, audience: r.audience, posting: r.posting, media: r.media, history: r.history, dateEdit: r.dateEdit, hidden: r.hidden, order: r.order }); };

  async function save() {
    if (!draft) return;
    if (draft.name.trim().length < 1) return setError("Give the room a name.");
    setBusy(true); setError(null);
    try {
      const id = await saveRoom(draft, uid);
      await audit(draft.id ? "room_updated" : "room_created", `Room ${draft.id ? "updated" : "created"}: ${draft.name.trim()}`, `${ROOM_AUDIENCE_LABEL[draft.audience]} · ${ROOM_POSTING_LABEL[draft.posting]} · ${ROOM_HISTORY_LABEL[draft.history]}`, uid);
      setNote(draft.id ? "Room updated." : `"${draft.name.trim()}" is open.`);
      setDraft(null);
      void id;
    } catch (e) { setError(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not save the room."); }
    finally { setBusy(false); }
  }

  async function toggleHidden(r: RoomConfig) {
    await setRoomHidden(r.id, !r.hidden);
    await audit(r.hidden ? "room_shown" : "room_hidden", `Room ${r.hidden ? "shown" : "hidden"}: ${r.name}`, "", uid);
  }

  async function remove() {
    if (!confirm) return;
    setBusy(true);
    try {
      await deleteRoom(confirm.id);
      await audit("room_deleted", `Room deleted: ${confirm.name}`, "messages removed", uid);
      setNote(`"${confirm.name}" and its messages are gone.`);
      setConfirm(null);
    } catch (e) { setNote(e instanceof Error ? e.message : "Could not delete the room."); }
    finally { setBusy(false); }
  }

  const row = (label: string, sub: string | null, control: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-b-0">
      <div className="min-w-0"><p className="text-[13px] m-0">{label}</p>{sub && <p className="text-[11px] text-text-subtle m-0">{sub}</p>}</div>
      {control}
    </div>
  );

  return (
    <Card>
      <CardHeader
        title="Rooms"
        subtitle="Extra chats beside the Community Room, each with its own audience, posting rule and history"
        right={<button type="button" onClick={() => { setError(null); setDraft(blank(rooms.length + 1)); }} className="px-3 py-1.5 rounded-lg bg-gold text-gold-dark text-[11px] font-medium flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> New room</button>}
      />
      <div className="flex flex-col">
        <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border">
          <div className="min-w-0">
            <p className="text-[13px] m-0">Community Room <span className="text-[9px] font-bold tracking-[0.06em] uppercase text-text-subtle bg-canvas border border-border px-1.5 py-0.5 rounded-full ml-1">main</span></p>
            <p className="text-[11px] text-text-subtle m-0">Everyone · members post · history from join date. Managed in the Room and Posting rules tabs.</p>
          </div>
          <span className="text-[11px] text-text-subtle">fixed</span>
        </div>
        {rooms.length === 0 && <p className="text-[11px] text-text-subtle m-0 py-3">No extra rooms yet. A Testimonials room with “React only” and “Everything” history is a good first one.</p>}
        {rooms.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-b-0">
            <div className="min-w-0">
              <p className={cn("text-[13px] m-0 truncate", r.hidden && "text-text-subtle")}>{r.name}{r.hidden && <span className="text-[9px] font-bold tracking-[0.06em] uppercase text-text-subtle bg-canvas border border-border px-1.5 py-0.5 rounded-full ml-1.5">hidden</span>}</p>
              <p className="text-[11px] text-text-subtle m-0 truncate">{ROOM_AUDIENCE_LABEL[r.audience]} · {ROOM_POSTING_LABEL[r.posting].toLowerCase()} · {r.history === "all" ? "full history" : "from join date"}{r.media ? " · media" : ""}{r.dateEdit ? " · post dates" : ""}{r.blurb ? ` · “${r.blurb}”` : ""}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => edit(r)} className="w-7 h-7 rounded-md border border-border text-text-muted hover:text-text inline-flex items-center justify-center" aria-label={`Edit ${r.name}`}><Pencil className="w-3 h-3" /></button>
              <button type="button" onClick={() => toggleHidden(r)} className="w-7 h-7 rounded-md border border-border text-text-muted hover:text-text inline-flex items-center justify-center" aria-label={r.hidden ? `Show ${r.name}` : `Hide ${r.name}`} title={r.hidden ? "Show" : "Hide"}>{r.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}</button>
              <button type="button" onClick={() => setConfirm(r)} className="w-7 h-7 rounded-md border border-border text-text-muted hover:text-red inline-flex items-center justify-center" aria-label={`Delete ${r.name}`}><Trash2 className="w-3 h-3" /></button>
            </div>
          </div>
        ))}
      </div>
      {note && <p className="text-[11px] text-text-muted m-0 mt-2">{note}</p>}

      <Modal open={!!draft} onClose={() => !busy && setDraft(null)} title={draft?.id ? "Edit room" : "New room"} maxWidth="max-w-lg">
        {draft && (
          <div className="flex flex-col">
            <label className="flex flex-col gap-1 py-2"><span className="text-[11px] font-medium">Name</span><input autoFocus value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Testimonials" className={input} /></label>
            <label className="flex flex-col gap-1 py-2"><span className="text-[11px] font-medium">Short line under the name <span className="font-normal text-text-subtle">(optional)</span></span><input value={draft.blurb} maxLength={80} onChange={(e) => setDraft({ ...draft, blurb: e.target.value })} placeholder="Real results from members" className={input} /></label>
            {row("Who can see it", "Admins are always inside", <Seg<RoomAudience> value={draft.audience} options={[["all", "Everyone"], ["tl", "Team Leaders"], ["mods", "Moderators"], ["admins", "Admins"]]} onChange={(v) => setDraft({ ...draft, audience: v })} />)}
            {row("Who can post", draft.posting === "react" ? "Members can react, not write" : draft.posting === "read" ? "Members can only read" : "Members chat as in the Community Room", <Seg<RoomPosting> value={draft.posting} options={[["members", "Members"], ["react", "React only"], ["read", "Read only"]]} onChange={(v) => setDraft({ ...draft, posting: v })} />)}
            {row("Pictures and video", "for members' posts; admin posts always may", <Switch checked={draft.media} onChange={(v) => setDraft({ ...draft, media: v })} label="Pictures and video" />)}
            {row("History", "what a member sees from before they joined", <Seg<RoomHistory> value={draft.history} options={[["join", "From join date"], ["all", "Everything"]]} onChange={(v) => setDraft({ ...draft, history: v })} />)}
            {row("Post dates", "admin can set or change a post's date", <Switch checked={draft.dateEdit} onChange={(v) => setDraft({ ...draft, dateEdit: v })} label="Post dates" />)}
            {row("Order in the chat list", "lower comes first", <input type="number" value={draft.order} onChange={(e) => setDraft({ ...draft, order: Number(e.target.value) || 0 })} className={cn(input, "w-[72px] font-mono")} />)}
            {error && <p className="text-[11px] text-red m-0 mt-2 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {error}</p>}
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => setDraft(null)} disabled={busy} className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted">Cancel</button>
              <button type="button" onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-lg bg-gold text-gold-dark text-[12px] font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {draft.id ? "Save changes" : "Create room"}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!confirm} onClose={() => !busy && setConfirm(null)} title="Delete this room?">
        {confirm && (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] m-0">“{confirm.name}” and every message in it will be removed for everyone. This cannot be undone. To keep the history, hide the room instead.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirm(null)} disabled={busy} className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted">Keep it</button>
              <button type="button" onClick={() => { toggleHidden(confirm); setConfirm(null); }} disabled={busy} className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text">Hide instead</button>
              <button type="button" onClick={remove} disabled={busy} className="flex-1 py-2.5 rounded-lg bg-red text-white text-[12px] font-medium disabled:opacity-50">{busy ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
