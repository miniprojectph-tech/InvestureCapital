"use client";

import { useEffect, useMemo, useState } from "react";
import { Coins, RefreshCw, Search, Loader2, FileSpreadsheet, ImageOff, AlertCircle, Calendar } from "lucide-react";
import { Card } from "@/components/Card";
import { cn, formatPHP } from "@/lib/utils";
import { getFirebase } from "@/lib/firebase";
import { listAllPlacements, type PlacementRow } from "@/lib/adminQueries";
import { listAllUsers, type PlanRequest } from "@/lib/planRequests";
import { buildPlacedRows, rangeBounds, downloadPlacedExcel, RANGE_LABEL, type PlacedRow, type PlacedSource, type RangeKey } from "@/lib/placementsReport";

type SourceFilter = "all" | PlacedSource;
const SOURCE_OPTS: [SourceFilter, string][] = [["all", "All placements"], ["paid", "Paid in"], ["wallet", "Reinvested from wallet"]];
const RANGES: RangeKey[] = ["all", "today", "week", "month", "lastMonth", "custom"];
const fmtWhen = (ms: number) => new Date(ms).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const inputCls = "bg-canvas border border-border rounded-full px-3 py-1.5 text-[11px] text-text outline-none focus:border-gold/40 [color-scheme:dark]";

/**
 * Placement requests › Approved: approved requests plus placements made without
 * a request (wallet reinvests, manual activations), with a source filter, a
 * date range, totals per source, and an Excel download of what is on screen.
 */
export function PlacedPanel({ approved, requestsLoading, onViewReceipt }: { approved: PlanRequest[]; requestsLoading: boolean; onViewReceipt: (r: PlanRequest) => void }) {
  const [placements, setPlacements] = useState<PlacementRow[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const { db } = getFirebase();
    if (!db) return;
    let cancelled = false;
    Promise.all([listAllPlacements(db), listAllUsers(db)])
      .then(([p, u]) => { if (!cancelled) { setPlacements(p); setNames(new Map(u.map((x) => [x.uid, x.name]))); } })
      .catch((e) => { if (!cancelled) { setLoadError(e instanceof Error ? e.message : "Could not load placements."); setPlacements([]); } });
    return () => { cancelled = true; };
  }, []);

  const all = useMemo(() => (placements ? buildPlacedRows(approved, placements, (uid) => names.get(uid) ?? uid.slice(0, 8)) : []), [approved, placements, names]);
  return <PlacedView all={all} loading={requestsLoading || placements === null} loadError={loadError} onViewReceipt={onViewReceipt} />;
}

/** The filters, totals, list and download for a ready list of placed rows. */
export function PlacedView({ all, loading, loadError, onViewReceipt }: { all: PlacedRow[]; loading: boolean; loadError: string | null; onViewReceipt: (r: PlanRequest) => void }) {
  const [source, setSource] = useState<SourceFilter>("all");
  const [range, setRange] = useState<RangeKey>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [now] = useState(() => Date.now());

  // date range + search first (the totals use these), then the source filter for the list
  const inRange = useMemo(() => {
    const [a, b] = rangeBounds(range, now, from, to);
    const s = q.trim().toLowerCase();
    return all.filter((r) => r.at >= a && r.at < b && (!s || r.userName.toLowerCase().includes(s) || r.userEmail.toLowerCase().includes(s) || (r.placementId ?? "").toLowerCase().includes(s)));
  }, [all, range, now, from, to, q]);
  const shown = useMemo(() => (source === "all" ? inRange : inRange.filter((r) => r.source === source)), [inRange, source]);

  const sum = (list: PlacedRow[]) => ({ amount: list.reduce((s, r) => s + r.amount, 0), n: list.length });
  const paid = sum(inRange.filter((r) => r.source === "paid"));
  const wallet = sum(inRange.filter((r) => r.source === "wallet"));
  const total = sum(inRange);
  const share = total.amount > 0 ? Math.round((wallet.amount / total.amount) * 100) : 0;
  const rangeText = range === "custom" ? (from || to ? `${from || "start"} to ${to || "today"}` : "custom dates") : RANGE_LABEL[range].toLowerCase();

  async function download() {
    if (!shown.length) return setMsg({ ok: false, text: "Nothing to download for this filter." });
    setBusy(true); setMsg(null);
    try {
      await downloadPlacedExcel(shown, `${source}_${range === "custom" ? `${from || "start"}-${to || "today"}` : range}`);
      setMsg({ ok: true, text: `${shown.length.toLocaleString()} placement${shown.length === 1 ? "" : "s"} downloaded. Check your downloads.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Download failed." });
    } finally { setBusy(false); }
  }


  return (
    <div className="flex flex-col gap-3">
      {/* filters */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex flex-wrap rounded-full border border-border overflow-hidden">
            {SOURCE_OPTS.map(([v, label]) => (
              <button key={v} type="button" onClick={() => setSource(v)} className={cn("px-3 py-1.5 text-[11px] transition", source === v ? "bg-gold text-gold-dark font-medium" : "text-text-muted hover:text-text")}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
              <Calendar className="w-3.5 h-3.5" />
              <select value={range} onChange={(e) => setRange(e.target.value as RangeKey)} aria-label="Date range" className={inputCls}>
                {RANGES.map((r) => <option key={r} value={r}>{RANGE_LABEL[r]}</option>)}
              </select>
            </label>
            {range === "custom" && (
              <>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" className={inputCls} />
                <span className="text-[11px] text-text-subtle">to</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" className={inputCls} />
              </>
            )}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-canvas border border-border rounded-full">
              <Search className="w-3 h-3 text-text-subtle" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Member or Plan ID" className="bg-transparent text-[11px] outline-none w-32 text-text placeholder:text-text-subtle" />
            </div>
            <button onClick={download} disabled={busy || loading} className="text-[11px] px-3 py-1.5 bg-gold text-gold-dark rounded-full font-medium inline-flex items-center gap-1.5 disabled:opacity-60">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />} Download Excel
            </button>
          </div>
        </div>
        {msg && <p className={cn("text-[11px] m-0 mt-2", msg.ok ? "text-green" : "text-red")}>{msg.text}</p>}
      </Card>

      {/* totals for the period */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="bg-card border border-border rounded-xl px-3.5 py-2.5">
          <p className="text-[10px] text-text-subtle m-0">Paid in (new money)</p>
          <p className="text-[17px] font-mono m-0 mt-0.5 text-green">{formatPHP(paid.amount)}</p>
          <p className="text-[10px] text-text-subtle m-0">{paid.n.toLocaleString()} placement{paid.n === 1 ? "" : "s"}</p>
        </div>
        <div className="bg-card border border-[#F5C66B]/35 rounded-xl px-3.5 py-2.5">
          <p className="text-[10px] text-text-subtle m-0">Reinvested from wallet</p>
          <p className="text-[17px] font-mono m-0 mt-0.5 text-[#F5C66B]">{formatPHP(wallet.amount)}</p>
          <p className="text-[10px] text-text-subtle m-0">{wallet.n.toLocaleString()} placement{wallet.n === 1 ? "" : "s"} · {share}% of all</p>
        </div>
        <div className="bg-card border border-border rounded-xl px-3.5 py-2.5">
          <p className="text-[10px] text-text-subtle m-0">All placements</p>
          <p className="text-[17px] font-mono m-0 mt-0.5">{formatPHP(total.amount)}</p>
          <p className="text-[10px] text-text-subtle m-0">{total.n.toLocaleString()} placement{total.n === 1 ? "" : "s"} · {rangeText}</p>
        </div>
      </div>

      {/* list */}
      <Card>
        <p className="text-[12px] font-medium m-0">{SOURCE_OPTS.find(([v]) => v === source)?.[1]} · {shown.length.toLocaleString()}</p>
        <p className="text-[10px] text-text-subtle m-0 mt-0.5 mb-2">
          {source === "wallet" ? "Placed straight from the member's income wallet. No receipt, approved automatically." : source === "paid" ? "Approved requests with a receipt, and placements an admin activated by hand." : "Approved requests, manual activations and wallet reinvests together."}
        </p>
        {loadError && <p className="text-[11px] text-red m-0 mb-2 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> {loadError} Only approved requests are shown.</p>}
        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 text-vault animate-spin" /></div>
        ) : shown.length === 0 ? (
          <p className="text-[11px] text-text-subtle text-center py-8 m-0">Nothing for this filter and date range.</p>
        ) : (
          <div className="flex flex-col">
            {shown.slice(0, 500).map((r) => {
              const isWallet = r.source === "wallet";
              return (
                <div key={r.key} className="flex flex-wrap items-center gap-3 py-2.5 border-t border-border first:border-t-0">
                  <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", isWallet ? "bg-[#F5C66B]/15 text-[#F5C66B]" : "bg-green/15 text-green")}>
                    {isWallet ? <RefreshCw className="w-4 h-4" /> : <Coins className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] m-0 flex flex-wrap items-center gap-1.5">
                      <span className="truncate">{r.userName}</span>
                      <span className={cn("text-[9px] px-1.5 py-px rounded-full", isWallet ? "bg-[#F5C66B]/15 text-[#F5C66B]" : "bg-green/15 text-green")}>{isWallet ? "Wallet reinvest" : r.request ? "Paid in" : "Manual"}</span>
                      {r.event && <span className="text-[9px] px-1.5 py-px rounded-full bg-vault/15 text-vault">Event slot</span>}
                    </p>
                    <p className="text-[10px] text-text-subtle m-0 mt-0.5 truncate">
                      {r.placementId && <span className="font-mono">{r.placementId} · </span>}
                      {r.termMonths ? `${r.termMonths} month${r.termMonths === 1 ? "" : "s"} · ` : ""}{fmtWhen(r.at)}
                      {r.status ? ` · ${r.status}` : ""} · {r.method}
                      {r.reference ? ` · ref ${r.reference}` : ""}
                    </p>
                  </div>
                  {r.request && (
                    <button onClick={() => r.request?.receiptUrl && onViewReceipt(r.request)} disabled={!r.request.receiptUrl} className={cn("w-10 h-10 rounded-md overflow-hidden border flex items-center justify-center shrink-0", r.request.receiptUrl ? "border-border-strong cursor-zoom-in" : "border-border cursor-not-allowed")} aria-label={r.request.receiptUrl ? "View receipt" : "No receipt"}>
                      {r.request.receiptUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={r.request.receiptUrl} alt="Receipt" className="w-full h-full object-cover bg-white" />
                      ) : (
                        <ImageOff className="w-4 h-4 text-text-dim" />
                      )}
                    </button>
                  )}
                  <p className={cn("text-[13px] font-mono m-0 shrink-0 text-right min-w-[90px]", isWallet ? "text-[#F5C66B]" : "text-green")}>{formatPHP(r.amount)}</p>
                </div>
              );
            })}
            {shown.length > 500 && <p className="text-[10px] text-text-subtle m-0 pt-2">Showing the newest 500. The Excel file has all {shown.length.toLocaleString()}.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
