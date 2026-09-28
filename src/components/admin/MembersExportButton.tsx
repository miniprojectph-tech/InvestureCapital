"use client";

import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { exportMembers, MEMBER_FILTER_LABEL, type MemberExportFilter, type MemberExportFormat } from "@/lib/membersExport";

const FILTERS: MemberExportFilter[] = ["all", "active", "withPayout", "noPayout"];

/** Admin › Investors: download the member directory (name, email, phone, mode of payout…). */
export function MembersExportButton() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<MemberExportFilter>("all");
  const [format, setFormat] = useState<MemberExportFormat>("xlsx");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const n = await exportMembers(filter, format);
      setMsg({ ok: true, text: n === 0 ? "No members match that filter." : `${n.toLocaleString()} member${n === 1 ? "" : "s"} exported. Check your downloads.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message.replace(/^[A-Z_]+:\s*/, "") : "Export failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => { setOpen((o) => !o); setMsg(null); }}
        className="text-[11px] px-3 py-1.5 bg-gold text-gold-dark rounded-full font-medium hover:brightness-110 flex items-center gap-1.5"
        aria-expanded={open}
      >
        <FileSpreadsheet className="w-3.5 h-3.5" /> Export members <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 w-[300px] max-w-[calc(100vw-32px)] bg-card border border-border-strong rounded-xl p-3.5 shadow-2xl shadow-black/60">
          <p className="text-[12px] font-medium m-0">Member directory</p>
          <p className="text-[10px] text-text-subtle m-0 mt-0.5 mb-3">Name, email, phone, mode of payout, account details, wallet, placements, sponsor.</p>

          <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle m-0 mb-1.5">Who to include</p>
          <div className="flex flex-col gap-1 mb-3">
            {FILTERS.map((f) => (
              <label key={f} className={cn("flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer border", filter === f ? "border-gold/40 bg-gold/10 text-text" : "border-transparent text-text-muted hover:bg-card-elev")}>
                <input type="radio" name="member-filter" className="accent-[#3DD598]" checked={filter === f} onChange={() => setFilter(f)} />
                {MEMBER_FILTER_LABEL[f]}
              </label>
            ))}
          </div>

          <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle m-0 mb-1.5">Format</p>
          <div className="inline-flex rounded-full bg-canvas border border-border p-0.5 mb-3">
            {(["xlsx", "csv"] as const).map((f) => (
              <button key={f} onClick={() => setFormat(f)} className={cn("px-3 py-1 rounded-full text-[11px] font-semibold", format === f ? "bg-gold text-gold-dark" : "text-text-muted hover:text-text")}>
                {f === "xlsx" ? "Excel (.xlsx)" : "CSV"}
              </button>
            ))}
          </div>

          {msg && (
            <p className={cn("text-[11px] m-0 mb-2.5 flex items-start gap-1.5", msg.ok ? "text-green" : "text-red")}>
              {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />} {msg.text}
            </p>
          )}

          <button onClick={run} disabled={busy} className="w-full py-2 rounded-lg bg-gold text-gold-dark text-[12px] font-medium hover:brightness-110 disabled:opacity-60 flex items-center justify-center gap-1.5">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />} {busy ? "Preparing file…" : "Download"}
          </button>
          <p className="text-[9px] text-text-subtle m-0 mt-2 leading-relaxed">
            Phone is the member&apos;s GCash number. It is blank for bank and GoTyme payouts. This file contains account details: each download is logged with your name and the time.
          </p>
        </div>
      )}
    </div>
  );
}
