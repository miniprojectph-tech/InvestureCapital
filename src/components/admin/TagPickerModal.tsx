"use client";

import { useState } from "react";
import { Loader2, Minus, Check } from "lucide-react";
import { Modal } from "@/components/Modal";
import { cn } from "@/lib/utils";
import { setAccountTags, type AccountTag } from "@/lib/accountTags";
import { TagDot } from "@/components/admin/TagChips";

type Member = { uid: string; name: string };
type State = "on" | "off" | "some";

/**
 * Pick the tags for one account or several. With several, a tag that only some
 * of them carry shows a dash; leaving it untouched keeps it as it is.
 */
export function TagPickerModal({ members, tags, links, onClose, onDone, onManage }: {
  members: Member[] | null;
  tags: AccountTag[];
  links: Map<string, string[]>;
  onClose: () => void;
  onDone: (message: string) => void;
  onManage: () => void;
}) {
  const title = !members ? "Tags" : members.length === 1 ? `Tags for ${members[0].name}` : `Tags for ${members.length} accounts`;
  return (
    <Modal open={!!members && members.length > 0} onClose={onClose} title={title}>
      {members && members.length > 0 && (
        <PickerForm key={members.map((m) => m.uid).join(",")} members={members} tags={tags} links={links} onClose={onClose} onDone={onDone} onManage={onManage} />
      )}
    </Modal>
  );
}

function PickerForm({ members, tags, links, onClose, onDone, onManage }: {
  members: Member[];
  tags: AccountTag[];
  links: Map<string, string[]>;
  onClose: () => void;
  onDone: (message: string) => void;
  onManage: () => void;
}) {
  const initial = (id: string): State => {
    const n = members.filter((m) => (links.get(m.uid) ?? []).includes(id)).length;
    return n === 0 ? "off" : n === members.length ? "on" : "some";
  };
  const [state, setState] = useState<Record<string, State>>(() => Object.fromEntries(tags.map((t) => [t.id, initial(t.id)])));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => setState((s) => ({ ...s, [id]: s[id] === "on" ? "off" : "on" }));

  async function save() {
    const add = tags.filter((t) => state[t.id] === "on" && initial(t.id) !== "on").map((t) => t.id);
    const remove = tags.filter((t) => state[t.id] === "off" && initial(t.id) !== "off").map((t) => t.id);
    if (!add.length && !remove.length) return onClose();
    setBusy(true); setError(null);
    try {
      await setAccountTags(members, { add, remove, note }, links, new Map(tags.map((t) => [t.id, t.name])));
      onDone(members.length === 1 ? `Tags updated for ${members[0].name}.` : `Tags updated for ${members.length} accounts.`);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not save the tags.");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-text-muted m-0">Only admins see tags. Nothing changes for the member.</p>
      {tags.length === 0 ? (
        <p className="text-[12px] text-text-muted m-0">
          No tags yet. <button type="button" onClick={onManage} className="text-gold underline">Create one in the Tags tab</button>
        </p>
      ) : (
        <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
          {tags.map((t) => {
            const s = state[t.id];
            return (
              <button key={t.id} type="button" onClick={() => toggle(t.id)} className={cn("flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[12px] border", s === "on" ? "border-gold/40 bg-gold/5" : "border-transparent hover:bg-card-elev")}>
                <span className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", s === "off" ? "border-border-strong" : "border-gold bg-gold text-gold-dark")}>
                  {s === "on" && <Check className="w-3 h-3" />}
                  {s === "some" && <Minus className="w-3 h-3" />}
                </span>
                <TagDot tag={t} />
                <span className="truncate">{t.name}</span>
                {s === "some" && <span className="text-[10px] text-text-subtle ml-auto shrink-0">some of them</span>}
              </button>
            );
          })}
        </div>
      )}
      <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Note for the admin audit (optional)" className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40" />
      {error && <p className="text-[11px] text-red m-0">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} disabled={busy} className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted">Cancel</button>
        <button type="button" onClick={save} disabled={busy || tags.length === 0} className="flex-1 py-2.5 rounded-lg bg-gold text-gold-dark text-[12px] font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save tags
        </button>
      </div>
    </div>
  );
}
