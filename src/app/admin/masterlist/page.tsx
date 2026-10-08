"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { Plus, Upload, Download, FileSpreadsheet, RefreshCw, Loader2, CheckCircle2, AlertCircle, Pencil, Trash2, Search, X, ChevronLeft, ChevronRight, ListOrdered, Eye } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { AdminTabs, useHashTab } from "@/components/admin/AdminTabs";
import { Card, CardHeader } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { cn, formatPHP } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { useSettings, saveSettings } from "@/lib/settings";
import { maskName } from "@/lib/maskName";
import {
  useMasterIndex,
  useMasterMonth,
  saveEntry,
  deleteEntries,
  importEntries,
  rebuildMasterlist,
  downloadTemplate,
  parseUpload,
  exportRows,
  cutoffMonth,
  monthLabel,
  dayLabel,
  manilaNoon,
  SOURCE_LABEL,
  MAX_WINDOW_MONTHS,
  type AdminRow,
  type EntryInput,
  type MonthDoc,
  type ParsedRow,
} from "@/lib/masterlist";

const input = "w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40";
const SOURCE_CHIP: Record<AdminRow["s"], string> = { portal: "bg-green/15 text-green", offline: "bg-[#F5C66B]/15 text-[#F5C66B]", old: "bg-blue/15 text-blue" };
const DEFAULT_NOTE = "Archived. If you had a placement in these months and want a copy, message the admin.";
const errText = (e: unknown) => (e instanceof Error ? e.message.replace(/^[A-Z_]+:\s*/, "") : "Something went wrong. Please try again.");
const isoDay = (ms: number) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);

type Note = { ok: boolean; text: string };
type Editing = { id?: string; name: string; date: string; amount: string; term: string; source: "offline" | "old"; note: string };
const blankEntry = (): Editing => ({ name: "", date: isoDay(Date.now()), amount: "", term: "1", source: "offline", note: "" });
type Tab = "entries" | "upload" | "settings";
const TAB_IDS: Tab[] = ["entries", "upload", "settings"];

export default function AdminMasterlistPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { index, loading } = useMasterIndex();
  const [month, setMonth] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminRow | null>(null);
  // list view: 25 a page by default, filter by where a row came from, tick rows to remove several at once
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(25);
  const [sourceFilter, setSourceFilter] = useState<"all" | AdminRow["s"]>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  // set when the confirm was opened by "Delete all …" — names exactly what is about to go
  const [bulkLabel, setBulkLabel] = useState<string | null>(null);
  const [bulkTyped, setBulkTyped] = useState("");
  const [tab, setTab] = useHashTab<Tab>(TAB_IDS, "entries");

  // settings
  const savedWindow = Math.min(settings.masterlist?.windowMonths ?? MAX_WINDOW_MONTHS, MAX_WINDOW_MONTHS);
  const savedNote = settings.masterlist?.archiveNote ?? "";
  const [windowMonths, setWindowMonths] = useState<string | null>(null);
  const [archiveNote, setArchiveNote] = useState<string | null>(null);
  const w = windowMonths ?? String(savedWindow);
  const n = archiveNote ?? savedNote;
  const settingsDirty = w !== String(savedWindow) || n !== savedNote;

  // import
  const fileInput = useRef<HTMLInputElement>(null);
  const [importSource, setImportSource] = useState<"offline" | "old">("old");
  const [parsed, setParsed] = useState<{ file: string; rows: ParsedRow[] } | null>(null);
  const [importDone, setImportDone] = useState(0);

  const months = index?.months ?? [];
  useEffect(() => { if (!month && months.length) setMonth(months[0].month); }, [months, month]);
  const { data, loading: monthLoading } = useMasterMonth<AdminRow>("masterlist_admin", month);
  const cutoff = cutoffMonth(savedWindow);

  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let list = data?.rows ?? [];
    if (sourceFilter !== "all") list = list.filter((r) => r.s === sourceFilter);
    return f ? list.filter((r) => r.n.toLowerCase().includes(f) || (r.note ?? "").toLowerCase().includes(f)) : list;
  }, [data, filter, sourceFilter]);

  // Paging. The search and the source filter look through the WHOLE month; only the drawing is paged.
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(page, pageCount);
  const pageRows = rows.slice((current - 1) * perPage, current * perPage);
  const counts = useMemo(() => {
    const c = { portal: 0, offline: 0, old: 0 };
    for (const r of data?.rows ?? []) c[r.s]++;
    return c;
  }, [data]);
  // Only offline / old rows can be removed here; portal rows are real placements.
  const removableOnPage = pageRows.filter((r) => r.id).map((r) => r.id as string);
  const removableMatching = rows.filter((r) => r.id).map((r) => r.id as string);
  const allOnPageTicked = removableOnPage.length > 0 && removableOnPage.every((id) => selected.has(id));
  const tick = (ids: string[], on: boolean) => setSelected((prev) => { const next = new Set(prev); for (const id of ids) { if (on) next.add(id); else next.delete(id); } return next; });

  async function removeSelected() {
    const ids = [...selected];
    setConfirmBulk(false);
    setBulkLabel(null);
    setBulkTyped("");
    if (ids.length === 0) return;
    await run("bulk", async () => {
      // the server takes up to 400 at a time
      for (let i = 0; i < ids.length; i += 400) await deleteEntries(ids.slice(i, i + 400));
      setSelected(new Set());
      return `Removed ${ids.length.toLocaleString()} entr${ids.length === 1 ? "y" : "ies"}.`;
    });
  }

  async function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    setNote(null);
    try {
      const text = await fn();
      if (text) setNote({ ok: true, text });
    } catch (e) {
      setNote({ ok: false, text: errText(e) });
    } finally {
      setBusy(null);
    }
  }

  async function saveSettingsNow() {
    const { db } = getFirebase();
    if (!db || !user) return;
    const months = Math.round(Number(w));
    if (!Number.isFinite(months) || months < 1 || months > MAX_WINDOW_MONTHS) return setNote({ ok: false, text: `Members can go back between 1 and ${MAX_WINDOW_MONTHS} months.` });
    await run("settings", async () => {
      await saveSettings(db, { masterlist: { windowMonths: months, archiveNote: n.trim().slice(0, 240) } }, user.uid);
      await rebuildMasterlist(); // re-stamps which months are open
      setWindowMonths(null); setArchiveNote(null);
      return "Saved. Members see the change straight away.";
    });
  }

  async function submitEntry() {
    if (!editing) return;
    setFormError(null);
    const name = editing.name.replace(/\s+/g, " ").trim();
    if (name.length < 2) return setFormError("Enter the person's full name.");
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(editing.date);
    if (!m) return setFormError("Choose the date placed.");
    const amount = Number(editing.amount);
    if (!Number.isFinite(amount) || amount <= 0) return setFormError("Enter an amount more than 0.");
    const term = Math.round(Number(editing.term));
    if (!Number.isFinite(term) || term < 1 || term > 120) return setFormError("The term is a number of months, 1 to 120.");
    const entry: EntryInput = { name, placedAt: manilaNoon(+m[1], +m[2], +m[3]), amount, termMonths: term, source: editing.source, ...(editing.note.trim() ? { note: editing.note.trim() } : {}) };
    setBusy("entry");
    try {
      await saveEntry(entry, editing.id);
      setEditing(null);
      setMonth(entry.placedAt ? new Date(entry.placedAt + 8 * 3_600_000).toISOString().slice(0, 7) : month);
      setNote({ ok: true, text: editing.id ? "Entry updated." : `Added ${name} to the Masterlist.` });
    } catch (e) {
      setFormError(errText(e));
    } finally {
      setBusy(null);
    }
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    await run("parse", async () => {
      const result = await parseUpload(file, importSource);
      setImportDone(0);
      setParsed({ file: file.name, rows: result });
    });
  }

  async function confirmImport() {
    if (!parsed) return;
    const good = parsed.rows.filter((r) => r.entry).map((r) => r.entry as EntryInput);
    if (good.length === 0) return;
    setBusy("import");
    try {
      const done = await importEntries(good, setImportDone);
      setParsed(null);
      setNote({ ok: true, text: `Imported ${done.toLocaleString()} row${done === 1 ? "" : "s"}.` });
    } catch (e) {
      setNote({ ok: false, text: `${errText(e)} ${importDone > 0 ? `${importDone.toLocaleString()} row(s) were saved before it stopped; press Refresh to see them.` : "Nothing was saved."}` });
      setParsed(null);
    } finally {
      setBusy(null);
    }
  }

  async function exportAll() {
    const { db } = getFirebase();
    if (!db) return;
    await run("export", async () => {
      const all: AdminRow[] = [];
      for (const m of months) {
        const s = await getDoc(doc(db, "masterlist_admin", m.month));
        if (s.exists()) all.push(...((s.data() as MonthDoc<AdminRow>).rows ?? []));
      }
      await exportRows(all, "masterlist-all");
      return `Exported ${all.length.toLocaleString()} rows.`;
    });
  }

  const good = parsed?.rows.filter((r) => r.entry).length ?? 0;
  const bad = parsed?.rows.filter((r) => r.error) ?? [];

  return (
    <div>
      <TopHeader title="Masterlist" subtitle="Every placement by month — portal members, offline investors and old records" />

      <AdminTabs
        tabs={[
          { id: "entries", label: "Entries", icon: ListOrdered, count: months.reduce((s, m) => s + m.count, 0) || undefined },
          { id: "upload", label: "Upload & export", icon: Upload },
          { id: "settings", label: "What members see", icon: Eye, hint: `${savedWindow} mo`, hintTone: settingsDirty ? "warn" : undefined },
        ]}
        value={tab}
        onChange={setTab}
        right={
          <>
            <button onClick={() => { setFormError(null); setEditing(blankEntry()); }} className="px-3 py-1.5 rounded-lg bg-gold text-gold-dark text-[11px] font-medium flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add entry</button>
            <button onClick={() => run("rebuild", async () => { const r = await rebuildMasterlist(); return `Refreshed: ${r.rows.toLocaleString()} rows in ${r.months} month${r.months === 1 ? "" : "s"}.`; })} disabled={!!busy} className="text-[11px] text-text-muted hover:text-text flex items-center gap-1.5 disabled:opacity-50">
              <RefreshCw className={cn("w-3 h-3", busy === "rebuild" && "animate-spin")} /> Refresh
            </button>
          </>
        }
      />
      {note && (
        <p className={cn("text-[11px] m-0 mb-3 flex items-start gap-1.5", note.ok ? "text-green" : "text-red")}>
          {note.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />} {note.text}
        </p>
      )}

      {tab === "upload" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card>
            <CardHeader title="Upload an Excel file" subtitle="Offline investors and old records, many at a time. You check the rows before anything is saved." />
            <input ref={fileInput} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pickFile(f); }} />
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => fileInput.current?.click()} disabled={!!busy} className="px-3 py-2 rounded-lg bg-gold text-gold-dark text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-50">
                {busy === "parse" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload Excel
              </button>
              <button onClick={() => run("template", async () => { await downloadTemplate(); })} disabled={!!busy} className="px-3 py-2 rounded-lg border border-border text-[12px] text-text-muted hover:text-text flex items-center gap-1.5 disabled:opacity-50"><FileSpreadsheet className="w-3.5 h-3.5" /> Blank template</button>
            </div>
            <label className="text-[11px] text-text-muted flex flex-wrap items-center gap-1.5 mt-3">
              Rows with no Type are saved as
              <select value={importSource} onChange={(e) => setImportSource(e.target.value as "offline" | "old")} className="bg-canvas border border-border rounded-md px-1.5 py-1 text-[11px] text-text outline-none">
                <option value="old">Old record</option>
                <option value="offline">Offline</option>
              </select>
            </label>
            <p className="text-[10px] text-text-subtle m-0 mt-3 leading-relaxed">Uploads add rows; they never replace. To replace a month, open Entries, choose the month and use Delete all, then upload again.</p>
          </Card>
          <Card>
            <CardHeader title="Export" subtitle="Excel copies of what is in the Masterlist today" />
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={exportAll} disabled={!!busy || months.length === 0} className="px-3 py-2 rounded-lg border border-border-strong text-[12px] text-text flex items-center gap-1.5 disabled:opacity-50">
                {busy === "export" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Export all months
              </button>
              <button onClick={() => month && data && run("exportMonth", async () => { await exportRows(data.rows, `masterlist-${month}`); return `Exported ${monthLabel(month)}.`; })} disabled={!data || !!busy} className="px-3 py-2 rounded-lg border border-border text-[12px] text-text-muted hover:text-text flex items-center gap-1.5 disabled:opacity-50">
                <Download className="w-3.5 h-3.5" /> Export {month ? monthLabel(month) : "this month"}
              </button>
            </div>
            <p className="text-[10px] text-text-subtle m-0 mt-3">{months.length.toLocaleString()} month{months.length === 1 ? "" : "s"} · {months.reduce((s, m) => s + m.count, 0).toLocaleString()} placements in all.</p>
          </Card>
        </div>
      )}

      {/* what members see */}
      {tab === "settings" && (
      <Card className="mb-3">
        <CardHeader title="What members see" subtitle={`Members can go back ${savedWindow} month${savedWindow === 1 ? "" : "s"} · one day per page, masked names, no totals${settingsDirty ? " · unsaved changes" : ""}`} />
        <div>
        <p className="text-[11px] text-text-muted m-0 mb-3 leading-relaxed max-w-2xl">One day per page: masked names, amount and term, with Previous day and Next day. They never see totals, the source, the note, or anyone&apos;s full name but their own.</p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-text">How far back members can choose a date (up to {MAX_WINDOW_MONTHS} months)</span>
            <span className="flex items-center gap-2">
              <input type="number" min={1} max={MAX_WINDOW_MONTHS} value={w} onChange={(e) => setWindowMonths(e.target.value)} className={cn(input, "w-20 font-mono")} />
              <span className="text-[11px] text-text-subtle">this month and the {Math.max(0, (Math.round(Number(w)) || 1) - 1)} before it</span>
            </span>
          </label>
        </div>
        <label className="flex flex-col gap-1 mt-3">
          <span className="text-[11px] font-medium text-text">Message on archived months</span>
          <input value={n} maxLength={240} onChange={(e) => setArchiveNote(e.target.value)} placeholder={DEFAULT_NOTE} className={input} />
        </label>
        <div className="flex items-center gap-3 mt-3">
          <button onClick={saveSettingsNow} disabled={!settingsDirty || !!busy} className="px-3.5 py-2 rounded-lg bg-gold text-gold-dark text-[12px] font-medium disabled:opacity-40 flex items-center gap-1.5">
            {busy === "settings" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
          </button>
          <span className="text-[10px] text-text-subtle">New portal placements appear here by themselves within about 10 minutes.</span>
        </div>
        </div>
      </Card>
      )}

      {tab === "entries" && (
      <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-3 items-start">
        {/* months */}
        <Card className="!p-2">
          {loading && <p className="text-[11px] text-text-subtle p-2 m-0">Loading…</p>}
          {!loading && months.length === 0 && <p className="text-[11px] text-text-subtle p-2 m-0 leading-relaxed">Nothing yet. Press <span className="text-gold">Refresh</span> to build the list from current placements, or add an entry.</p>}
          {months.map((m) => (
            <button key={m.month} onClick={() => { setMonth(m.month); setFilter(""); setSourceFilter("all"); setPage(1); setSelected(new Set()); }} className={cn("w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition", month === m.month ? "bg-card-elev" : "hover:bg-card-elev/50")}>
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] truncate">{monthLabel(m.month)}</span>
                <span className="block text-[10px] text-text-subtle">{m.count.toLocaleString()} placement{m.count === 1 ? "" : "s"}</span>
              </span>
              <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full shrink-0", m.month >= cutoff ? "bg-green/15 text-green" : "bg-card-elev text-text-subtle")}>{m.month >= cutoff ? "Open" : "Archived"}</span>
            </button>
          ))}
        </Card>

        {/* rows */}
        <Card className="!p-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
            <p className="text-[13px] font-medium m-0 flex-1 min-w-[140px]">
              {month ? monthLabel(month) : "Masterlist"}
              {data && data.rows.length > 0 && <span className="font-normal text-[11px] text-text-subtle"> · {formatPHP(data.rows.reduce((s, r) => s + r.a, 0), { short: true })} placed (admin only)</span>}
            </p>
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 bg-canvas border border-border rounded-lg">
              <Search className="w-3 h-3 text-text-subtle" />
              <input value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} placeholder="Search name or note" className="bg-transparent text-[11px] text-text outline-none w-36" />
            </span>
            <button onClick={() => month && data && run("exportMonth", async () => { await exportRows(data.rows, `masterlist-${month}`); return `Exported ${monthLabel(month)}.`; })} disabled={!data || !!busy} className="text-[11px] text-gold hover:underline flex items-center gap-1 disabled:opacity-40">
              <Download className="w-3 h-3" /> Export this month
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-border">
            {(["all", "portal", "offline", "old"] as const).map((k) => {
              const n = k === "all" ? (data?.rows.length ?? 0) : counts[k];
              const on = sourceFilter === k;
              return (
                <button key={k} type="button" onClick={() => { setSourceFilter(k); setPage(1); }} aria-pressed={on} className={cn("px-2.5 py-1 rounded-full text-[10px] font-medium border transition", on ? "bg-gold/15 border-gold/40 text-gold" : "bg-canvas border-border text-text-muted hover:text-text")}>
                  {k === "all" ? "All" : SOURCE_LABEL[k]} <span className="font-mono font-normal">{n.toLocaleString()}</span>
                </button>
              );
            })}
            {(() => {
              // Everything removable in this month for the chosen source (ignores the search box on purpose:
              // "delete all" should mean all, not just what a half-typed search happens to show).
              const ids = (data?.rows ?? []).filter((r) => r.id && (sourceFilter === "all" || r.s === sourceFilter)).map((r) => r.id as string);
              if (sourceFilter === "portal" || ids.length === 0) return null;
              const what = sourceFilter === "old" ? "old records" : sourceFilter === "offline" ? "offline rows" : "offline + old rows";
              return (
                <button
                  type="button"
                  onClick={() => { setSelected(new Set(ids)); setBulkLabel(`all ${ids.length.toLocaleString()} ${what} in ${month ? monthLabel(month) : "this month"}`); setConfirmBulk(true); }}
                  disabled={!!busy}
                  className="ml-auto px-2.5 py-1 rounded-full text-[10px] font-medium border border-red/40 text-red hover:bg-red/10 flex items-center gap-1 disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" /> Delete all {ids.length.toLocaleString()} {what}
                </button>
              );
            })()}
            <label className="text-[10px] text-text-subtle flex items-center gap-1.5">
              Rows per page
              <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} className="bg-canvas border border-border rounded-md px-1.5 py-1 text-[11px] text-text outline-none">
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-border bg-red/5">
              <span className="text-[11px] text-text">{selected.size.toLocaleString()} selected</span>
              {removableMatching.length > selected.size && (
                <button type="button" onClick={() => tick(removableMatching, true)} className="text-[11px] text-gold hover:underline">
                  Select all {removableMatching.length.toLocaleString()} offline / old rows {filter || sourceFilter !== "all" ? "that match" : "in this month"}
                </button>
              )}
              <button type="button" onClick={() => setSelected(new Set())} className="text-[11px] text-text-muted hover:text-text">Clear</button>
              <button type="button" onClick={() => { setBulkLabel(null); setBulkTyped(""); setConfirmBulk(true); }} disabled={!!busy} className="ml-auto px-3 py-1.5 rounded-lg bg-red/15 border border-red/40 text-red text-[11px] font-medium flex items-center gap-1.5 disabled:opacity-50">
                {busy === "bulk" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Remove selected
              </button>
            </div>
          )}
          {monthLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-4 h-4 text-gold animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="text-[11px] text-text-subtle m-0 px-4 py-6">{filter || sourceFilter !== "all" ? "No rows match." : "No rows for this month."}</p>
          ) : (
            <ResponsiveTable>
              <table className="w-full text-[12px] min-w-[720px]">
                <thead>
                  <tr className="text-text-subtle text-left">
                    <th className="py-2 pl-4 pr-1 w-8">
                      <input type="checkbox" aria-label="Select the offline and old rows on this page" checked={allOnPageTicked} disabled={removableOnPage.length === 0} onChange={(e) => tick(removableOnPage, e.target.checked)} className="accent-[#F87171]" />
                    </th>
                    <th className="font-normal py-2 px-2">Full name</th>
                    <th className="font-normal py-2 px-2">Members see</th>
                    <th className="font-normal py-2 px-2">Date placed</th>
                    <th className="font-normal py-2 px-2 text-right">Amount</th>
                    <th className="font-normal py-2 px-2 text-right">Term</th>
                    <th className="font-normal py-2 px-2">Source</th>
                    <th className="font-normal py-2 pl-2 pr-4 text-right">&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => (
                    <tr key={`${r.k}-${i}`} className={cn("border-t border-border align-top", r.id && selected.has(r.id) && "bg-red/5")}>
                      <td className="py-2 pl-4 pr-1">
                        {r.id ? (
                          <input type="checkbox" aria-label={`Select ${r.n}`} checked={selected.has(r.id)} onChange={(e) => tick([r.id as string], e.target.checked)} className="accent-[#F87171]" />
                        ) : null}
                      </td>
                      <td className="py-2 px-2">
                        {r.n}
                        {r.note && <span className="block text-[10px] text-text-subtle">{r.note}</span>}
                      </td>
                      <td className="py-2 px-2 font-mono text-text-muted">{maskName(r.n)}</td>
                      <td className="py-2 px-2 text-text-muted whitespace-nowrap">{dayLabel(r.d, true)}</td>
                      <td className="py-2 px-2 text-right font-mono whitespace-nowrap">{formatPHP(r.a)}</td>
                      <td className="py-2 px-2 text-right text-text-muted whitespace-nowrap">{r.t > 0 ? `${r.t} mo` : "—"}</td>
                      <td className="py-2 px-2"><span className={cn("text-[9px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap", SOURCE_CHIP[r.s])}>{SOURCE_LABEL[r.s]}</span></td>
                      <td className="py-2 pl-2 pr-4 text-right whitespace-nowrap">
                        {r.id ? (
                          <span className="inline-flex gap-1">
                            <button onClick={() => { setFormError(null); setEditing({ id: r.id, name: r.n, date: isoDay(r.d), amount: String(r.a), term: String(r.t || 1), source: r.s === "offline" ? "offline" : "old", note: r.note ?? "" }); }} aria-label={`Edit ${r.n}`} className="w-7 h-7 rounded-md border border-border text-text-muted hover:text-text inline-flex items-center justify-center"><Pencil className="w-3 h-3" /></button>
                            <button onClick={() => setConfirmDelete(r)} aria-label={`Remove ${r.n}`} className="w-7 h-7 rounded-md border border-red/30 text-red hover:bg-red/10 inline-flex items-center justify-center"><Trash2 className="w-3 h-3" /></button>
                          </span>
                        ) : (
                          <span className="text-[10px] text-text-dim" title="A real placement — manage it under Active placements">from placement</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          )}
          {rows.length > 0 && !monthLoading && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-border">
              <span className="text-[11px] text-text-subtle">
                Showing {((current - 1) * perPage + 1).toLocaleString()}–{Math.min(current * perPage, rows.length).toLocaleString()} of {rows.length.toLocaleString()}
              </span>
              <Pager page={current} pages={pageCount} onPage={setPage} />
            </div>
          )}
        </Card>
      </div>
      )}

      {/* add / edit one entry */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit entry" : "Add an entry"}>
        {editing && (
          <div className="flex flex-col gap-3">
            <p className="text-[11px] text-text-muted m-0 leading-relaxed">For an offline investor or an old record. It is a record only: it earns no payouts and has no wallet.</p>
            <label className="flex flex-col gap-1"><span className="text-[11px] font-medium">Full name</span>
              <input autoFocus value={editing.name} maxLength={80} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Maria Clara Santos" className={input} />
              {editing.name.trim().length >= 2 && <span className="text-[10px] text-text-subtle">Members will see: <span className="font-mono text-text">{maskName(editing.name)}</span></span>}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1"><span className="text-[11px] font-medium">Date placed</span>
                <input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} className={cn(input, "[color-scheme:dark]")} />
              </label>
              <label className="flex flex-col gap-1"><span className="text-[11px] font-medium">Amount (₱)</span>
                <input type="number" min={1} value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} placeholder="10000" className={cn(input, "font-mono")} />
              </label>
              <label className="flex flex-col gap-1"><span className="text-[11px] font-medium">Term (months)</span>
                <input type="number" min={1} max={120} value={editing.term} onChange={(e) => setEditing({ ...editing, term: e.target.value })} className={cn(input, "font-mono")} />
              </label>
              <label className="flex flex-col gap-1"><span className="text-[11px] font-medium">Type</span>
                <select value={editing.source} onChange={(e) => setEditing({ ...editing, source: e.target.value as "offline" | "old" })} className={input}>
                  <option value="offline">Offline investor</option>
                  <option value="old">Old record</option>
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1"><span className="text-[11px] font-medium">Note <span className="font-normal text-text-subtle">(only admins see this)</span></span>
              <input value={editing.note} maxLength={200} onChange={(e) => setEditing({ ...editing, note: e.target.value })} placeholder="e.g. Paid in cash at the office" className={input} />
            </label>
            {formError && <p className="text-[11px] text-red m-0 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {formError}</p>}
            <div className="flex gap-2">
              <button onClick={() => setEditing(null)} className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted">Cancel</button>
              <button onClick={submitEntry} disabled={busy === "entry"} className="flex-1 py-2.5 rounded-lg bg-gold text-gold-dark text-[12px] font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">
                {busy === "entry" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {editing.id ? "Save changes" : "Add to Masterlist"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* review an upload before anything is saved */}
      <Modal open={!!parsed} onClose={() => busy !== "import" && setParsed(null)} title="Check the upload" maxWidth="max-w-lg">
        {parsed && (
          <div className="flex flex-col gap-3">
            <p className="text-[11px] text-text-muted m-0 truncate">{parsed.file}</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-green/10 border border-green/30 p-3"><p className="text-[18px] font-mono font-medium m-0 text-green">{good.toLocaleString()}</p><p className="text-[10px] text-text-muted m-0">row{good === 1 ? "" : "s"} ready to import</p></div>
              <div className={cn("rounded-lg border p-3", bad.length ? "bg-red/10 border-red/30" : "bg-canvas border-border")}><p className={cn("text-[18px] font-mono font-medium m-0", bad.length ? "text-red" : "text-text-subtle")}>{bad.length.toLocaleString()}</p><p className="text-[10px] text-text-muted m-0">row{bad.length === 1 ? "" : "s"} with a problem (skipped)</p></div>
            </div>
            {bad.length > 0 && (
              <div className="border border-border rounded-lg max-h-[180px] overflow-y-auto">
                {bad.slice(0, 100).map((r) => (
                  <p key={r.line} className="text-[11px] m-0 px-3 py-1.5 border-b border-border last:border-b-0"><span className="font-mono text-text-subtle">Line {r.line}</span> · <span className="text-text">{r.raw}</span> — <span className="text-red">{r.error}</span></p>
                ))}
                {bad.length > 100 && <p className="text-[10px] text-text-subtle m-0 px-3 py-1.5">…and {bad.length - 100} more.</p>}
              </div>
            )}
            {good > 0 && (
              <div className="border border-border rounded-lg max-h-[150px] overflow-y-auto">
                {parsed.rows.filter((r) => r.entry).slice(0, 6).map((r) => (
                  <p key={r.line} className="text-[11px] m-0 px-3 py-1.5 border-b border-border last:border-b-0 flex flex-wrap gap-x-2">
                    <span className="text-text">{r.entry!.name}</span><span className="text-text-subtle">{dayLabel(r.entry!.placedAt, true)}</span><span className="font-mono">{formatPHP(r.entry!.amount)}</span><span className="text-text-subtle">{r.entry!.termMonths} mo · {SOURCE_LABEL[r.entry!.source]}</span>
                  </p>
                ))}
                {good > 6 && <p className="text-[10px] text-text-subtle m-0 px-3 py-1.5">…and {(good - 6).toLocaleString()} more.</p>}
              </div>
            )}
            <p className="text-[10px] text-text-subtle m-0 leading-relaxed">Fix the problem rows in the file and upload it again later if you need them; uploading the same file twice adds its rows twice.</p>
            <div className="flex gap-2">
              <button onClick={() => setParsed(null)} disabled={busy === "import"} className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted disabled:opacity-50">Cancel</button>
              <button onClick={confirmImport} disabled={good === 0 || busy === "import"} className="flex-1 py-2.5 rounded-lg bg-gold text-gold-dark text-[12px] font-medium disabled:opacity-40 flex items-center justify-center gap-1.5">
                {busy === "import" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importing {importDone.toLocaleString()} / {good.toLocaleString()}</> : `Import ${good.toLocaleString()} row${good === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* remove several */}
      <Modal open={confirmBulk} onClose={() => { setConfirmBulk(false); if (bulkLabel) setSelected(new Set()); setBulkLabel(null); setBulkTyped(""); }} title={bulkLabel ? "Delete all of these?" : `Remove ${selected.size.toLocaleString()} entr${selected.size === 1 ? "y" : "ies"}?`}>
        <div className="flex flex-col gap-3">
          {bulkLabel && (
            <>
              <p className="text-[13px] m-0">You are about to delete <span className="font-medium text-red">{bulkLabel}</span>.</p>
              <label className="text-[11px] font-medium text-text block">
                Type DELETE to confirm
                <input value={bulkTyped} onChange={(e) => setBulkTyped(e.target.value)} autoComplete="off" autoFocus className="mt-1 w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[13px] font-mono text-text outline-none focus:border-red/50" />
              </label>
            </>
          )}
          <p className="text-[11px] text-text-muted m-0 leading-relaxed">
            They are taken off the Masterlist for you and for members. Only offline and old-record rows are removed; real portal placements are never touched. This can&apos;t be undone.
          </p>
          <div className="flex gap-2">
            <button onClick={() => { setConfirmBulk(false); if (bulkLabel) setSelected(new Set()); setBulkLabel(null); setBulkTyped(""); }} className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted">Keep them</button>
            <button onClick={removeSelected} disabled={!!bulkLabel && bulkTyped.trim().toUpperCase() !== "DELETE"} className="flex-1 py-2.5 rounded-lg bg-red/15 border border-red/40 text-red text-[12px] font-medium flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"><Trash2 className="w-3.5 h-3.5" /> Remove {selected.size.toLocaleString()}</button>
          </div>
        </div>
      </Modal>

      {/* remove */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Remove this entry?">
        {confirmDelete && (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] m-0">{confirmDelete.n} · {formatPHP(confirmDelete.a)} · {dayLabel(confirmDelete.d, true)}</p>
            <p className="text-[11px] text-text-muted m-0">It is taken off the Masterlist for you and for members. This can&apos;t be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted">Keep it</button>
              <button
                onClick={() => { const r = confirmDelete; setConfirmDelete(null); if (r.id) run("delete", async () => { await deleteEntries([r.id as string]); return `Removed ${r.n}.`; }); }}
                className="flex-1 py-2.5 rounded-lg bg-red/15 border border-red/40 text-red text-[12px] font-medium flex items-center justify-center gap-1.5"
              ><X className="w-3.5 h-3.5" /> Remove</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Numbered pages: ‹ 1 … 4 5 6 … 24 › */
function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  const want = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  if (page <= 3) [2, 3, 4].forEach((p) => p <= pages && want.add(p));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((p) => p >= 1 && want.add(p));
  const list = [...want].sort((a, b) => a - b);
  const btn = "min-w-[28px] h-7 px-1.5 rounded-md text-[11px] flex items-center justify-center transition";
  return (
    <nav className="flex items-center gap-1" aria-label="Pages">
      <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page" className={cn(btn, "border border-border text-text-muted hover:text-text disabled:opacity-30")}><ChevronLeft className="w-3.5 h-3.5" /></button>
      {list.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 && p - list[i - 1] > 1 && <span className="text-[11px] text-text-subtle px-0.5">…</span>}
          <button type="button" onClick={() => onPage(p)} aria-current={p === page ? "page" : undefined} className={cn(btn, p === page ? "bg-gold text-gold-dark font-medium" : "border border-border text-text-muted hover:text-text")}>{p}</button>
        </span>
      ))}
      <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page" className={cn(btn, "border border-border text-text-muted hover:text-text disabled:opacity-30")}><ChevronRight className="w-3.5 h-3.5" /></button>
    </nav>
  );
}
