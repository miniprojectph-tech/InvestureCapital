"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, Tag as TagIcon, ArrowRight } from "lucide-react";
import { Card, CardHeader } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { cn, formatPHP } from "@/lib/utils";
import type { InvestorRow } from "@/lib/adminQueries";
import { TAG_COLORS, TAG_COLOR_KEYS, MAX_TAG_NAME, saveAccountTag, deleteAccountTag, type AccountTag, type TagColor } from "@/lib/accountTags";
import { TagChip } from "@/components/admin/TagChips";

type Summary = { accounts: number; active: number; deployed: number; wallet: number; due: number; earned: number };
const empty = (): Summary => ({ accounts: 0, active: 0, deployed: 0, wallet: 0, due: 0, earned: 0 });
const add = (s: Summary, r: InvestorRow) => {
  s.accounts++; s.deployed += r.deployed; s.wallet += r.wallet; s.due += r.bonusesDue; s.earned += r.totalEarned;
  if (r.activePlansCount > 0) s.active++;
};

/**
 * Admin › Investors › Tags: make the tags, and a report per tag (accounts,
 * capital placed, wallets, Locked-In due, earned). Tags never leave the admin side.
 */
export function AccountTagsPanel({ rows, tags, links, counts, onOpenTag }: {
  rows: InvestorRow[];
  tags: AccountTag[];
  links: Map<string, string[]>;
  counts: Map<string, number>;
  /** Show the Joined list filtered to this tag ("none" = accounts with no tag). */
  onOpenTag: (tagId: string) => void;
}) {
  const [editing, setEditing] = useState<{ id?: string; name: string; color: TagColor } | null>(null);
  const [deleting, setDeleting] = useState<AccountTag | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const report = useMemo(() => {
    const per = new Map<string, Summary>();
    const none = empty(), all = empty();
    const known = new Set(tags.map((t) => t.id));
    for (const r of rows) {
      if (r.isAdmin) continue;
      add(all, r);
      const ids = (links.get(r.uid) ?? []).filter((id) => known.has(id));
      if (!ids.length) add(none, r);
      for (const id of ids) { const s = per.get(id) ?? empty(); add(s, r); per.set(id, s); }
    }
    return { per, none, all };
  }, [rows, tags, links]);

  async function save() {
    if (!editing) return;
    setBusy(true); setError(null);
    try {
      await saveAccountTag(editing, tags);
      setMsg(editing.id ? "Tag saved." : `Tag "${editing.name.trim()}" created.`);
      setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the tag."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true); setError(null);
    try {
      await deleteAccountTag(deleting, links);
      setMsg(`Tag "${deleting.name}" deleted.`);
      setDeleting(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete the tag."); }
    finally { setBusy(false); }
  }

  const summaryRow = (key: string, label: React.ReactNode, s: Summary, open?: () => void) => (
    <tr key={key} className="border-t border-border">
      <td className="py-2 px-1">{label}</td>
      <td className="py-2 px-1 text-right font-mono">{s.accounts.toLocaleString()}</td>
      <td className="py-2 px-1 text-right font-mono text-text-muted">{s.active.toLocaleString()}</td>
      <td className="py-2 px-1 text-right font-mono text-green">{formatPHP(s.deployed, { short: true })}</td>
      <td className="py-2 px-1 text-right font-mono">{formatPHP(s.wallet, { short: true })}</td>
      <td className="py-2 px-1 text-right font-mono text-vault">{formatPHP(s.due, { short: true })}</td>
      <td className="py-2 px-1 text-right font-mono">{formatPHP(s.earned, { short: true })}</td>
      <td className="py-2 px-1 text-right">
        {open && s.accounts > 0 && (
          <button onClick={open} className="text-[10px] text-text-muted hover:text-text inline-flex items-center gap-1 whitespace-nowrap">List <ArrowRight className="w-3 h-3" /></button>
        )}
      </td>
    </tr>
  );

  return (
    <div className="flex flex-col gap-3">
      {msg && <p className="m-0 px-3 py-2 rounded-lg text-[11px] bg-green/10 border border-green/30 text-green">{msg}</p>}

      <Card>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-text m-0">Account tags</p>
            <p className="text-[10px] text-text-subtle mt-0.5 m-0">Labels for grouping people in admin reports, like a team or test accounts. Only admins see them. Nothing changes for the member.</p>
          </div>
          <button onClick={() => { setMsg(null); setError(null); setEditing({ name: "", color: TAG_COLOR_KEYS[(tags.length + 1) % TAG_COLOR_KEYS.length] }); }} className="shrink-0 text-[11px] px-3 py-1.5 rounded-full bg-gold text-gold-dark font-medium inline-flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> New tag
          </button>
        </div>
        {tags.length === 0 ? (
          <p className="text-[11px] text-text-subtle m-0 py-4 text-center flex items-center justify-center gap-1.5"><TagIcon className="w-3.5 h-3.5" /> No tags yet. Create one, then tag accounts from the Joined tab.</p>
        ) : (
          <div className="flex flex-col">
            {tags.map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-2 border-t border-border first:border-t-0">
                <TagChip tag={t} />
                <span className="text-[10px] text-text-subtle flex-1">{(counts.get(t.id) ?? 0).toLocaleString()} account{counts.get(t.id) === 1 ? "" : "s"}</span>
                <button onClick={() => onOpenTag(t.id)} className="text-[10px] text-text-muted hover:text-text">List</button>
                <button onClick={() => { setMsg(null); setError(null); setEditing({ id: t.id, name: t.name, color: t.color }); }} className="p-1 text-text-subtle hover:text-gold" aria-label={`Edit ${t.name}`}><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => { setMsg(null); setError(null); setDeleting(t); }} className="p-1 text-text-subtle hover:text-red" aria-label={`Delete ${t.name}`}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Report by tag" subtitle="Members only, admins left out. An account with two tags counts in both." />
        <ResponsiveTable>
          <table className="w-full text-[11px] min-w-[720px]">
            <thead>
              <tr className="text-text-subtle text-left">
                <th className="font-normal py-2 px-1">Tag</th>
                <th className="font-normal py-2 px-1 text-right">Accounts</th>
                <th className="font-normal py-2 px-1 text-right">With placement</th>
                <th className="font-normal py-2 px-1 text-right">Capital placed</th>
                <th className="font-normal py-2 px-1 text-right">Wallets</th>
                <th className="font-normal py-2 px-1 text-right">Locked-In due</th>
                <th className="font-normal py-2 px-1 text-right">Total earned</th>
                <th className="font-normal py-2 px-1" />
              </tr>
            </thead>
            <tbody>
              {tags.map((t) => summaryRow(t.id, <TagChip tag={t} />, report.per.get(t.id) ?? empty(), () => onOpenTag(t.id)))}
              {summaryRow("none", <span className="text-text-muted">No tag</span>, report.none, () => onOpenTag("none"))}
              <tr className="border-t border-border-strong font-medium">
                <td className="py-2 px-1">All members</td>
                <td className="py-2 px-1 text-right font-mono">{report.all.accounts.toLocaleString()}</td>
                <td className="py-2 px-1 text-right font-mono text-text-muted">{report.all.active.toLocaleString()}</td>
                <td className="py-2 px-1 text-right font-mono text-green">{formatPHP(report.all.deployed, { short: true })}</td>
                <td className="py-2 px-1 text-right font-mono">{formatPHP(report.all.wallet, { short: true })}</td>
                <td className="py-2 px-1 text-right font-mono text-vault">{formatPHP(report.all.due, { short: true })}</td>
                <td className="py-2 px-1 text-right font-mono">{formatPHP(report.all.earned, { short: true })}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </ResponsiveTable>
      </Card>

      <Modal open={!!editing} onClose={() => !busy && setEditing(null)} title={editing?.id ? "Edit tag" : "New tag"}>
        {editing && (
          <div className="flex flex-col gap-3">
            <input autoFocus value={editing.name} maxLength={MAX_TAG_NAME} onChange={(e) => setEditing({ ...editing, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="Team Alpha" className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40" />
            <div className="flex flex-wrap gap-2">
              {TAG_COLOR_KEYS.map((c) => (
                <button key={c} type="button" onClick={() => setEditing({ ...editing, color: c })} aria-label={c} className={cn("w-7 h-7 rounded-full border-2", editing.color === c ? "border-text" : "border-transparent")} style={{ background: TAG_COLORS[c].dot }} />
              ))}
            </div>
            <p className="text-[11px] text-text-muted m-0 flex items-center gap-2">Preview <TagChip tag={{ id: "x", name: editing.name.trim() || "Tag name", color: editing.color, createdAt: 0 }} /></p>
            {error && <p className="text-[11px] text-red m-0">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(null)} disabled={busy} className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted">Cancel</button>
              <button type="button" onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-lg bg-gold text-gold-dark text-[12px] font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {editing.id ? "Save" : "Create tag"}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!deleting} onClose={() => !busy && setDeleting(null)} title="Delete this tag?">
        {deleting && (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] text-text m-0 flex items-center gap-2 flex-wrap"><TagChip tag={deleting} /> comes off {(counts.get(deleting.id) ?? 0).toLocaleString()} account{counts.get(deleting.id) === 1 ? "" : "s"}. The accounts themselves are not touched.</p>
            {error && <p className="text-[11px] text-red m-0">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setDeleting(null)} disabled={busy} className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted">Cancel</button>
              <button type="button" onClick={remove} disabled={busy} className="flex-1 py-2.5 rounded-lg bg-red text-white text-[12px] font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Delete tag</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
