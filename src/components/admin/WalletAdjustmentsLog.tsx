"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { Loader2, Download, RefreshCw } from "lucide-react";
import { Card, CardHeader } from "@/components/Card";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { cn, formatPHP } from "@/lib/utils";
import { getFirebase } from "@/lib/firebase";

export type AdjustmentRow = {
  id: string;
  uid: string;
  userName: string;
  direction: "add" | "remove";
  amount: number;
  tag: string;
  message: string;
  note: string;
  walletBefore: number;
  walletAfter: number;
  notified: boolean;
  byName: string;
  at: number;
};

const manila = (ms: number) => new Date(ms + 8 * 3_600_000).toISOString();
const fmtWhen = (ms: number) => new Date(ms).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Every admin wallet adjustment (from admin_audit), with tag / direction / date filters and an Excel export. */
export function WalletAdjustmentsLog({ search, reloadKey }: { search: string; reloadKey: number }) {
  const [rows, setRows] = useState<AdjustmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tag, setTag] = useState("");
  const [dir, setDir] = useState<"" | "add" | "remove">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    const { db } = getFirebase();
    if (!db) return;
    setLoading(true); setError(null);
    try {
      const snap = await getDocs(query(collection(db, "admin_audit"), where("type", "==", "wallet_adjusted"), limit(1000)));
      const list = snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          uid: String(x.uid ?? ""),
          userName: String(x.userName ?? ""),
          direction: x.direction === "remove" ? "remove" : "add",
          amount: Number(x.amount) || 0,
          tag: String(x.tag ?? ""),
          message: String(x.message ?? ""),
          note: String(x.note ?? ""),
          walletBefore: Number(x.walletBefore) || 0,
          walletAfter: Number(x.walletAfter) || 0,
          notified: x.notified === true,
          byName: String(x.byName ?? "Admin"),
          at: typeof x.at === "number" ? x.at : 0,
        } as AdjustmentRow;
      });
      list.sort((a, b) => b.at - a.at);
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load adjustments.");
    } finally { setLoading(false); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads on open and after each adjustment
  useEffect(() => { void load(); }, [load, reloadKey]);

  const tags = useMemo(() => [...new Set(rows.map((r) => r.tag))].sort((a, b) => a.localeCompare(b)), [rows]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromMs = from ? Date.parse(`${from}T00:00:00+08:00`) : null;
    const toMs = to ? Date.parse(`${to}T23:59:59.999+08:00`) : null;
    return rows.filter((r) =>
      (!tag || r.tag === tag) &&
      (!dir || r.direction === dir) &&
      (fromMs === null || r.at >= fromMs) &&
      (toMs === null || r.at <= toMs) &&
      (!q || [r.userName, r.tag, r.message, r.note, r.byName].some((s) => s.toLowerCase().includes(q))),
    );
  }, [rows, tag, dir, from, to, search]);

  const totals = useMemo(() => shown.reduce((t, r) => (r.direction === "add" ? { ...t, added: t.added + r.amount } : { ...t, removed: t.removed + r.amount }), { added: 0, removed: 0 }), [shown]);

  const [exporting, setExporting] = useState(false);
  async function exportExcel() {
    if (exporting || shown.length === 0) return;
    setExporting(true);
    try {
      const { default: writeExcelFile } = await import("write-excel-file/browser");
      const bold = (value: string) => ({ value, fontWeight: "bold" as const, backgroundColor: "#E8F5EE" });
      const header = ["Date", "Time", "Member", "Tag", "Added (PHP)", "Removed (PHP)", "Wallet before", "Wallet after", "Member sees", "Admin note", "By", "Notified"].map(bold);
      const money = (n: number) => ({ value: n, type: Number, format: "#,##0.00" });
      const body = shown.map((r) => {
        const iso = manila(r.at);
        return [
          { value: iso.slice(0, 10), type: String },
          { value: iso.slice(11, 16), type: String },
          { value: r.userName, type: String },
          { value: r.tag, type: String },
          r.direction === "add" ? money(r.amount) : null,
          r.direction === "remove" ? money(r.amount) : null,
          money(r.walletBefore),
          money(r.walletAfter),
          { value: r.message, type: String },
          { value: r.note, type: String },
          { value: r.byName, type: String },
          { value: r.notified ? "Yes" : "No", type: String },
        ];
      });
      const blob = await writeExcelFile([header, ...body], {
        sheet: "Wallet adjustments",
        columns: [{ width: 12 }, { width: 8 }, { width: 24 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 40 }, { width: 40 }, { width: 18 }, { width: 10 }],
        stickyRowsCount: 1,
      }).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wallet-adjustments_${manila(Date.now()).slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally { setExporting(false); }
  }

  const ctl = "text-[11px] px-2.5 py-1.5 bg-canvas border border-border rounded-lg outline-none text-text [color-scheme:dark]";

  return (
    <Card>
      <CardHeader
        title={`Wallet adjustments (${shown.length})`}
        subtitle={`Added ${formatPHP(totals.added)} · Removed ${formatPHP(totals.removed)}`}
        right={
          <div className="flex items-center gap-1.5">
            <button onClick={() => void load()} title="Reload" className="p-1.5 rounded-lg border border-border text-text-muted hover:text-text"><RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} /></button>
            <button onClick={exportExcel} disabled={exporting || shown.length === 0} className="text-[11px] px-3 py-1.5 border border-border rounded-full text-text-muted hover:text-text flex items-center gap-1.5 disabled:opacity-50">
              {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} Excel
            </button>
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag" className={ctl}>
          <option value="">All tags</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={dir} onChange={(e) => setDir(e.target.value as "" | "add" | "remove")} aria-label="Added or removed" className={ctl}>
          <option value="">Added and removed</option>
          <option value="add">Added</option>
          <option value="remove">Removed</option>
        </select>
        <label className="flex items-center gap-1 text-[11px] text-text-muted">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={ctl} /></label>
        <label className="flex items-center gap-1 text-[11px] text-text-muted">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={ctl} /></label>
      </div>

      {error && <p className="text-[11px] text-red m-0 mb-2">{error}</p>}
      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-gold animate-spin" /></div>
      ) : (
        <ResponsiveTable>
          <table className="w-full text-[11px] table-fixed min-w-[820px]">
            <colgroup>
              <col style={{ width: "15%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "30%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead>
              <tr className="text-text-subtle text-left">
                <th className="font-normal py-2 px-1">When</th>
                <th className="font-normal py-2 px-1">Member</th>
                <th className="font-normal py-2 px-1">Tag</th>
                <th className="font-normal py-2 px-1 text-right">Amount</th>
                <th className="font-normal py-2 px-1">Member sees · admin note</th>
                <th className="font-normal py-2 px-1 text-right">Wallet after</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="py-2 px-1 text-text-muted">{fmtWhen(r.at)}<p className="m-0 text-[9px] text-text-subtle">by {r.byName}</p></td>
                  <td className="py-2 px-1"><p className="m-0 truncate font-medium">{r.userName}</p>{!r.notified && <p className="m-0 text-[9px] text-text-subtle">not notified</p>}</td>
                  <td className="py-2 px-1"><span className="inline-block max-w-full truncate px-2 py-0.5 rounded-full border border-border text-text-muted text-[10px]">{r.tag}</span></td>
                  <td className={cn("py-2 px-1 text-right font-mono", r.direction === "add" ? "text-green" : "text-red")}>{r.direction === "add" ? "+" : "−"}{formatPHP(r.amount)}</td>
                  <td className="py-2 px-1">
                    <p className="m-0 truncate">{r.message || <span className="text-text-subtle">—</span>}</p>
                    {r.note && <p className="m-0 text-[10px] text-text-subtle truncate" title={r.note}>Note: {r.note}</p>}
                  </td>
                  <td className={cn("py-2 px-1 text-right font-mono", r.walletAfter < 0 && "text-red")}>{formatPHP(r.walletAfter)}<p className="m-0 text-[9px] text-text-subtle">was {formatPHP(r.walletBefore)}</p></td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={6} className="text-center text-text-subtle py-8">{rows.length === 0 ? "No wallet adjustments yet. Use Adjust on the Balances list to make one." : "No adjustments match these filters."}</td></tr>
              )}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </Card>
  );
}
