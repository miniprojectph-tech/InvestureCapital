"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, Plus, X } from "lucide-react";
import { Modal } from "@/components/Modal";
import { cn, formatPHP } from "@/lib/utils";
import { importEntries, manilaNoon, type EntryInput } from "@/lib/masterlist";

type Source = "offline" | "old";
type Row = { id: number; name: string; date: string; amount: string; term: string; source: Source; note: string };
type Defaults = { date: string; term: string; source: Source };
export const MAX_BATCH_ROWS = 50;

const input = "w-full bg-canvas border border-border rounded-md px-2 py-1.5 text-[11px] text-text outline-none focus:border-gold/40";
const todayInput = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
let nextId = 1;
const blank = (d: Defaults): Row => ({ id: nextId++, name: "", date: d.date, amount: "", term: d.term, source: d.source, note: "" });

/** Accepts 2026-10-20, 10/20/2026, 20-10-2026 and Excel-style 10/20/26. */
function parseDate(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(t);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const a = Number(m[1]), b = Number(m[2]);
    // month first unless the first number can only be a day
    const [mm, dd] = a > 12 ? [b, a] : [a, b];
    return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  return null;
}
function parseSource(s: string): Source | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (t.startsWith("off")) return "offline";
  if (t.startsWith("old")) return "old";
  return null;
}
/** One row's problem, or null when it can save. */
function problemOf(r: Row): string | null {
  const name = r.name.replace(/\s+/g, " ").trim();
  if (name.length < 2) return "Name needed";
  if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(r.date)) return "Date needed";
  const amount = Number(r.amount);
  if (!Number.isFinite(amount) || amount <= 0) return "Amount needed";
  const term = Math.round(Number(r.term));
  if (!Number.isFinite(term) || term < 1 || term > 120) return "Term 1–120";
  return null;
}
function toEntry(r: Row): EntryInput {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.date)!;
  const note = r.note.trim();
  return { name: r.name.replace(/\s+/g, " ").trim(), placedAt: manilaNoon(+m[1], +m[2], +m[3]), amount: Number(r.amount), termMonths: Math.round(Number(r.term)), source: r.source, ...(note ? { note } : {}) };
}
const isEmpty = (r: Row) => !r.name.trim() && !r.amount.trim() && !r.note.trim();

/**
 * Masterlist › Add entries › Several: a small grid for a handful of offline or
 * old records at once. Shared defaults, per-row fixes, paste from a sheet, one
 * batched save through the same server call the Excel import uses.
 */
export function MasterlistBatchModal({ open, onClose, onSwitchToOne, onSaved }: {
  open: boolean;
  onClose: () => void;
  onSwitchToOne: () => void;
  onSaved: (count: number, total: number, latestPlacedAt: number) => void;
}) {
  const [defaults, setDefaults] = useState<Defaults>(() => ({ date: todayInput(), term: "1", source: "offline" }));
  const [rows, setRows] = useState<Row[]>(() => { const d = { date: todayInput(), term: "1", source: "offline" as Source }; return [blank(d), blank(d), blank(d)]; });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRefs = useRef(new Map<number, HTMLInputElement>());

  const filled = rows.filter((r) => !isEmpty(r));
  const ready = useMemo(() => filled.filter((r) => !problemOf(r)), [filled]);
  const bad = filled.length - ready.length;
  const total = ready.reduce((s, r) => s + Number(r.amount), 0);

  const setRow = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRows = (n: number) => setRows((rs) => rs.length >= MAX_BATCH_ROWS ? rs : [...rs, ...Array.from({ length: Math.min(n, MAX_BATCH_ROWS - rs.length) }, () => blank(defaults))]);
  const removeRow = (id: number) => setRows((rs) => (rs.length === 1 ? [blank(defaults)] : rs.filter((r) => r.id !== id)));
  const applyDefaults = (d: Defaults) => {
    setDefaults(d);
    // untouched (empty) rows follow the defaults; filled rows keep what was typed
    setRows((rs) => rs.map((r) => (isEmpty(r) ? { ...r, date: d.date, term: d.term, source: d.source } : r)));
  };

  /** A block pasted from Excel / Sheets: one line per row, columns name · date · amount · term · type · note. */
  function onPaste(e: React.ClipboardEvent<HTMLInputElement>, rowId: number) {
    const text = e.clipboardData.getData("text/plain");
    const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim());
    if (lines.length < 2 && !text.includes("\t")) return; // a plain name: let the input take it
    e.preventDefault();
    const parsedRows = lines.map((line) => {
      const c = line.split("\t").map((x) => x.trim());
      const date = c[1] ? parseDate(c[1]) : null;
      return {
        name: c[0] ?? "",
        date: date ?? defaults.date,
        amount: c[2] ? String(c[2]).replace(/[₱,\s]/g, "") : "",
        term: c[3] && /^\d+$/.test(c[3]) ? c[3] : defaults.term,
        source: (c[4] && parseSource(c[4])) || defaults.source,
        note: c[5] ?? "",
      };
    });
    setRows((rs) => {
      const at = rs.findIndex((r) => r.id === rowId);
      const before = rs.slice(0, at);
      const after = rs.slice(at + 1).filter((r) => !isEmpty(r));
      const pasted = parsedRows.map((p) => ({ ...blank(defaults), ...p }));
      return [...before, ...pasted, ...after].slice(0, MAX_BATCH_ROWS);
    });
  }

  /** Enter on the last row adds one and moves the cursor into it (focus lands once the row exists). */
  const focusLast = useRef(false);
  function onKeyDown(e: React.KeyboardEvent, isLast: boolean) {
    if (e.key !== "Enter" || !isLast) return;
    e.preventDefault();
    focusLast.current = true;
    addRows(1);
  }
  useEffect(() => {
    if (!focusLast.current) return;
    focusLast.current = false;
    nameRefs.current.get(rows[rows.length - 1]?.id)?.focus();
  }, [rows]);

  async function save() {
    if (ready.length === 0) return;
    setBusy(true); setError(null);
    try {
      const entries = ready.map(toEntry);
      await importEntries(entries);
      onSaved(entries.length, total, Math.max(...entries.map((x) => x.placedAt)));
      setRows([blank(defaults), blank(defaults), blank(defaults)]);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not save the entries.");
    } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="Add entries" maxWidth="max-w-4xl">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-text-muted m-0 leading-relaxed">For offline investors or old records. Records only: no payouts, no wallet. Set the defaults once; each row can still differ.</p>
          <div className="flex gap-1 p-1 rounded-lg bg-canvas border border-border shrink-0">
            <button type="button" onClick={onSwitchToOne} className="px-3 py-1 rounded-md text-[11px] text-text-muted hover:text-text">One</button>
            <button type="button" className="px-3 py-1 rounded-md text-[11px] font-medium bg-gold/15 text-gold">Several</button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 bg-canvas border border-border rounded-lg p-2.5">
          <label className="flex flex-col gap-1"><span className="text-[10px] text-text-muted">Default date placed</span><input type="date" value={defaults.date} onChange={(e) => applyDefaults({ ...defaults, date: e.target.value })} className={cn(input, "[color-scheme:dark] font-mono")} /></label>
          <label className="flex flex-col gap-1"><span className="text-[10px] text-text-muted">Default term (months)</span><input type="number" min={1} max={120} value={defaults.term} onChange={(e) => applyDefaults({ ...defaults, term: e.target.value })} className={cn(input, "font-mono")} /></label>
          <label className="flex flex-col gap-1"><span className="text-[10px] text-text-muted">Default type</span><select value={defaults.source} onChange={(e) => applyDefaults({ ...defaults, source: e.target.value as Source })} className={input}><option value="offline">Offline investor</option><option value="old">Old record</option></select></label>
        </div>

        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-[11px] min-w-[700px]">
            <thead>
              <tr className="text-[10px] text-text-subtle text-left">
                <th className="font-medium py-1 pr-1.5 w-[26%]">Full name</th><th className="font-medium py-1 pr-1.5">Date placed</th><th className="font-medium py-1 pr-1.5">Amount (₱)</th><th className="font-medium py-1 pr-1.5 w-[64px]">Term</th><th className="font-medium py-1 pr-1.5">Type</th><th className="font-medium py-1 pr-1.5">Note</th><th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const prob = isEmpty(r) ? null : problemOf(r);
                return (
                  <tr key={r.id} className="align-top">
                    <td className="py-1 pr-1.5">
                      <input ref={(el) => { if (el) nameRefs.current.set(r.id, el); else nameRefs.current.delete(r.id); }} value={r.name} maxLength={80} placeholder="Full name" onChange={(e) => setRow(r.id, { name: e.target.value })} onPaste={(e) => onPaste(e, r.id)} onKeyDown={(e) => onKeyDown(e, i === rows.length - 1)} className={cn(input, prob === "Name needed" && "border-red/60")} />
                      {prob && <p className="text-[9px] text-red m-0 mt-0.5">{prob}</p>}
                    </td>
                    <td className="py-1 pr-1.5"><input type="date" value={r.date} onChange={(e) => setRow(r.id, { date: e.target.value })} className={cn(input, "[color-scheme:dark] font-mono", prob === "Date needed" && "border-red/60")} /></td>
                    <td className="py-1 pr-1.5"><input type="number" min={1} value={r.amount} placeholder="10000" onChange={(e) => setRow(r.id, { amount: e.target.value })} className={cn(input, "font-mono", prob === "Amount needed" && "border-red/60")} /></td>
                    <td className="py-1 pr-1.5"><input type="number" min={1} max={120} value={r.term} onChange={(e) => setRow(r.id, { term: e.target.value })} className={cn(input, "font-mono", prob === "Term 1–120" && "border-red/60")} /></td>
                    <td className="py-1 pr-1.5 min-w-[112px]"><select value={r.source} onChange={(e) => setRow(r.id, { source: e.target.value as Source })} className={input}><option value="offline">Offline</option><option value="old">Old record</option></select></td>
                    <td className="py-1 pr-1.5"><input value={r.note} maxLength={200} placeholder="admins only" onChange={(e) => setRow(r.id, { note: e.target.value })} className={input} /></td>
                    <td className="py-1"><button type="button" onClick={() => removeRow(r.id)} className="p-1 text-text-subtle hover:text-red" aria-label="Remove row"><X className="w-3.5 h-3.5" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => addRows(1)} disabled={rows.length >= MAX_BATCH_ROWS} className="text-[11px] px-2.5 py-1.5 rounded-md border border-border-strong text-text flex items-center gap-1 disabled:opacity-40"><Plus className="w-3 h-3" /> Add row</button>
          <button type="button" onClick={() => addRows(5)} disabled={rows.length >= MAX_BATCH_ROWS} className="text-[11px] px-2.5 py-1.5 rounded-md border border-border-strong text-text disabled:opacity-40">+ 5 rows</button>
          <p className="text-[10px] text-text-subtle m-0 flex-1 min-w-[220px]">Paste a block from Excel or a sheet into a name box (name, date, amount, term, type, note) and the rows fill in. Enter on the last row adds one. Up to {MAX_BATCH_ROWS} at a time; use the Excel upload for more.</p>
        </div>

        {error && <p className="text-[11px] text-red m-0 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
          <p className="text-[11px] text-text-muted m-0">
            <span className="text-text font-medium">{ready.length}</span> ready · <span className="font-mono text-text">{formatPHP(total, { short: true })}</span>
            {bad > 0 && <span className="text-red"> · {bad} row{bad === 1 ? "" : "s"} need{bad === 1 ? "s" : ""} a fix</span>}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 border border-border-strong rounded-lg text-[12px] text-text-muted disabled:opacity-50">Cancel</button>
            <button type="button" onClick={save} disabled={busy || ready.length === 0} className="px-4 py-2 rounded-lg bg-gold text-gold-dark text-[12px] font-medium disabled:opacity-40 flex items-center gap-1.5">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Add {ready.length} to Masterlist
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
