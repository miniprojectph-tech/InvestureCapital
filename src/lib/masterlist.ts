"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";
import { useAuth } from "./auth";

/**
 * Masterlist (see functions/src/masterlist.ts). Members read prepared monthly
 * documents with masked names; admins read the full copy and manage offline /
 * old-record entries, by hand or from an Excel file.
 */

export type MasterSource = "portal" | "offline" | "old";
export const SOURCE_LABEL: Record<MasterSource, string> = { portal: "Portal", offline: "Offline", old: "Old record" };

/** A row as members get it: masked name, date placed, amount, term (months). `k` lets a member spot their own. */
export type PublicRow = { k: string; n: string; d: number; a: number; t: number };
/** A row as the admin gets it: full name, plus where it came from. */
export type AdminRow = PublicRow & { s: MasterSource; note?: string; id?: string; uid?: string };
export type MonthDoc<R> = { month: string; count: number; total: number; rows: R[]; updatedAt?: number };
export type MasterIndex = { months: { month: string; count: number; total: number }[]; windowMonths: number; showTotals: boolean; updatedAt?: number };

export type EntryInput = { name: string; placedAt: number; amount: number; termMonths: number; source: "offline" | "old"; note?: string };

const HOUR = 3_600_000;

/** "2026-10" on the Manila calendar. */
export function monthKeyOf(ms: number): string {
  return new Date(ms + 8 * HOUR).toISOString().slice(0, 7);
}
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
}
export function dayLabel(ms: number, withYear = false): string {
  return new Date(ms).toLocaleDateString("en-PH", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "Asia/Manila" });
}
/** Noon (Manila) of a calendar day — safely inside the day whatever the time zone of the viewer. */
export function manilaNoon(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d, 4);
}
/** The oldest month members may open: this month and the (window − 1) before it. */
export function cutoffMonth(windowMonths: number, now = Date.now()): string {
  const [y, m] = monthKeyOf(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 - (Math.max(1, windowMonths) - 1), 15)).toISOString().slice(0, 7);
}

/** The same short hash the server stores on a member's own rows. */
export async function ownKey(uid: string, placementId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${uid}:${placementId}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// ===== Reading =====

export function useMasterIndex(): { index: MasterIndex | null; loading: boolean } {
  const { user } = useAuth();
  const [index, setIndex] = useState<MasterIndex | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    const { db } = getFirebase();
    if (!db) { setLoading(false); return; }
    return onSnapshot(
      doc(db, "masterlist_public", "_index"),
      (s) => {
        const d = s.data() as Partial<MasterIndex> | undefined;
        setIndex(d ? { months: Array.isArray(d.months) ? d.months : [], windowMonths: d.windowMonths ?? 2, showTotals: d.showTotals !== false, updatedAt: d.updatedAt } : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user]);
  return { index, loading };
}

/** One month's rows. `collection` = "masterlist_public" (members) or "masterlist_admin" (admins). */
export function useMasterMonth<R>(collectionName: "masterlist_public" | "masterlist_admin", month: string | null): { data: MonthDoc<R> | null; loading: boolean } {
  const { user } = useAuth();
  const [data, setData] = useState<MonthDoc<R> | null>(null);
  const [loading, setLoading] = useState(!!month);
  useEffect(() => {
    if (!user || !month) { setData(null); setLoading(false); return; }
    const { db } = getFirebase();
    if (!db) { setLoading(false); return; }
    setLoading(true);
    return onSnapshot(
      doc(db, collectionName, month),
      (s) => { setData(s.exists() ? (s.data() as MonthDoc<R>) : null); setLoading(false); },
      () => { setData(null); setLoading(false); }, // an archived month is refused by the rules
    );
  }, [user, collectionName, month]);
  return { data, loading };
}

// ===== Admin actions =====

function call<I, O>(name: string, data: I): Promise<O> {
  const { functions } = getFirebase();
  if (!functions) return Promise.reject(new Error("Firebase not initialized"));
  return httpsCallable<I, O>(functions, name, { timeout: 300_000 })(data).then((r) => r.data);
}

export const saveEntry = (entry: EntryInput, id?: string) => call<{ entries: EntryInput[]; id?: string }, { ok: boolean }>("adminMasterlistSave", { entries: [entry], ...(id ? { id } : {}) });
export const deleteEntries = (ids: string[]) => call<{ ids: string[] }, { ok: boolean; removed: number }>("adminMasterlistDelete", { ids });
export const rebuildMasterlist = () => call<Record<string, never>, { ok: boolean; months: number; rows: number }>("adminMasterlistRebuild", {});

/** Save many rows (an Excel upload) in chunks; the list is rebuilt once, after the last chunk. */
export async function importEntries(entries: EntryInput[], onProgress?: (done: number) => void): Promise<number> {
  const SIZE = 300;
  let done = 0;
  for (let i = 0; i < entries.length; i += SIZE) {
    const chunk = entries.slice(i, i + SIZE);
    const last = i + SIZE >= entries.length;
    await call<{ entries: EntryInput[]; rebuild: boolean }, { ok: boolean }>("adminMasterlistSave", { entries: chunk, rebuild: last });
    done += chunk.length;
    onProgress?.(done);
  }
  return done;
}

// ===== Excel =====

const TEMPLATE_HEADERS = ["Full name", "Date placed", "Amount", "Term (months)", "Type", "Note"];

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const isoDay = (ms: number) => new Date(ms + 8 * HOUR).toISOString().slice(0, 10);

/** The blank file to fill in: the right columns, two example rows, and the rules in plain words. */
export async function downloadTemplate(): Promise<void> {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const head = TEMPLATE_HEADERS.map((h) => ({ value: h, fontWeight: "bold" as const, backgroundColor: "#E8F5EE" }));
  const text = (v: string) => ({ value: v, type: String });
  const rows = [
    head,
    [text("Maria Clara Santos"), text("2025-03-14"), { value: 50000, type: Number }, { value: 6, type: Number }, text("Old record"), text("Example row — delete it before uploading")],
    [text("Pedro Dela Cruz"), text("2026-10-01"), { value: 10000, type: Number }, { value: 3, type: Number }, text("Offline"), text("Example row — delete it before uploading")],
  ];
  const blob = await writeExcelFile(rows, {
    sheet: "Masterlist",
    columns: [{ width: 30 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 44 }],
    stickyRowsCount: 1,
  }).toBlob();
  download(blob, "masterlist-template.xlsx");
}

export type ParsedRow = { line: number; entry?: EntryInput; error?: string; raw: string };

function parseDate(v: unknown): number | null {
  let y = 0, m = 0, d = 0;
  if (v instanceof Date && !isNaN(v.getTime())) {
    y = v.getUTCFullYear(); m = v.getUTCMonth() + 1; d = v.getUTCDate();
  } else if (typeof v === "number" && v > 20000 && v < 80000) {
    // an Excel date that arrived as its serial number
    const t = new Date(Math.round((v - 25569) * 86_400_000));
    y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = t.getUTCDate();
  } else if (typeof v === "string") {
    const s = v.trim();
    let r = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
    if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
    else if ((r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))) { m = +r[1]; d = +r[2]; y = +r[3]; } // month/day/year
    else {
      const t = new Date(s);
      if (isNaN(t.getTime())) return null;
      y = t.getFullYear(); m = t.getMonth() + 1; d = t.getDate();
    }
  } else return null;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const ms = manilaNoon(y, m, d);
  return isoDay(ms) === `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` ? ms : null; // rejects 31 February etc.
}
const parseNumber = (v: unknown): number => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[₱,\s]/g, "")));
function parseSource(v: unknown, fallback: "offline" | "old"): "offline" | "old" | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return fallback;
  if (s.startsWith("off")) return "offline";
  if (s.startsWith("old") || s.includes("record") || s.includes("past") || s.includes("archive")) return "old";
  return null;
}

/**
 * Read an uploaded .xlsx (or .csv) into rows, each either ready to save or with a plain
 * reason it can't be. Nothing is saved here — the admin reviews the result first.
 */
export async function parseUpload(file: File, defaultSource: "offline" | "old"): Promise<ParsedRow[]> {
  let table: unknown[][];
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
    const text = await file.text();
    table = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
      const out: string[] = [];
      let cur = "", q = false;
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
        else if (c === '"') q = true;
        else if (c === ",") { out.push(cur); cur = ""; }
        else cur += c;
      }
      out.push(cur);
      return out;
    });
  } else {
    const { readSheet } = await import("read-excel-file/browser");
    table = (await readSheet(file)) as unknown[][];
  }
  if (table.length === 0) throw new Error("That file is empty.");

  // Find the header row and which column is which (so column order doesn't matter).
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const headerAt = table.findIndex((r) => r.some((c) => norm(c).includes("name")) && r.some((c) => norm(c).includes("amount")));
  if (headerAt < 0) throw new Error("Couldn't find the column titles. Use the blank template: it has the right columns.");
  const header = table[headerAt].map(norm);
  const col = (...words: string[]) => header.findIndex((h) => words.some((w) => h.includes(w)));
  const C = { name: col("name"), date: col("date", "placed"), amount: col("amount"), term: col("term", "month"), type: col("type", "source"), note: col("note", "remark") };
  if (C.name < 0 || C.date < 0 || C.amount < 0 || C.term < 0) throw new Error("The file needs these columns: Full name, Date placed, Amount, Term (months).");

  const out: ParsedRow[] = [];
  for (let i = headerAt + 1; i < table.length; i++) {
    const r = table[i] ?? [];
    const name = String(r[C.name] ?? "").replace(/\s+/g, " ").trim();
    if (!name && r.every((c) => c === null || c === undefined || String(c).trim() === "")) continue; // blank line
    const line = i + 1;
    const raw = name || "(no name)";
    if (/example row/i.test(String(C.note >= 0 ? r[C.note] ?? "" : ""))) continue; // the template's own samples
    if (name.length < 2) { out.push({ line, raw, error: "The name is missing." }); continue; }
    const placedAt = parseDate(r[C.date]);
    if (placedAt === null) { out.push({ line, raw, error: "The date placed is missing or not a real date. Write it like 2025-03-14." }); continue; }
    const amount = Math.round(parseNumber(r[C.amount]) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) { out.push({ line, raw, error: "The amount must be a number more than 0." }); continue; }
    const termMonths = Math.round(parseNumber(r[C.term]));
    if (!Number.isFinite(termMonths) || termMonths < 1 || termMonths > 120) { out.push({ line, raw, error: "The term must be a number of months, 1 to 120." }); continue; }
    const source = parseSource(C.type >= 0 ? r[C.type] : "", defaultSource);
    if (!source) { out.push({ line, raw, error: "The type must be Offline or Old record." }); continue; }
    const note = C.note >= 0 ? String(r[C.note] ?? "").trim().slice(0, 200) : "";
    out.push({ line, raw, entry: { name: name.slice(0, 80), placedAt, amount, termMonths, source, ...(note ? { note } : {}) } });
  }
  if (out.length === 0) throw new Error("No rows found under the column titles.");
  return out;
}

/** Admin export: full names and sources, for one month or everything. */
export async function exportRows(rows: AdminRow[], fileBase: string): Promise<void> {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const head = ["Full name", "Date placed", "Amount (PHP)", "Term (months)", "Source", "Note"].map((h) => ({ value: h, fontWeight: "bold" as const, backgroundColor: "#E8F5EE" }));
  const body = rows.map((r) => [
    { value: r.n, type: String },
    { value: isoDay(r.d), type: String },
    { value: r.a, type: Number, format: "#,##0.00" },
    { value: r.t, type: Number },
    { value: SOURCE_LABEL[r.s], type: String },
    { value: r.note ?? "", type: String },
  ]);
  const blob = await writeExcelFile([head, ...body], {
    sheet: "Masterlist",
    columns: [{ width: 30 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 12 }, { width: 40 }],
    stickyRowsCount: 1,
  }).toBlob();
  download(blob, `${fileBase}.xlsx`);
}
