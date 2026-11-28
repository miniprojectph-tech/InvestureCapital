"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Download, MessageCircle } from "lucide-react";
import { cn, formatPHP } from "@/lib/utils";
import { getFirebase } from "@/lib/firebase";
import type { InvestorRow } from "@/lib/adminQueries";

/**
 * Admin › Investors › No active plan: members who joined but never started a
 * plan, and members whose plans all finished with nothing running now.
 * Built from the accounts the Investors page already loaded; the only extra
 * read is the (small) list of placement requests still waiting for approval.
 * Admins, banned accounts and accounts tagged "dummy" are left out.
 */

type Group = "all" | "never" | "done";
type SortKey = "wallet" | "joinedNew" | "joinedOld" | "finishedNew" | "finishedOld";
type QuickFilter = "j7" | "j30" | "f30" | "wallet";

const DAY = 86_400_000;
const SORTS: { id: SortKey; label: string }[] = [
  { id: "wallet", label: "Wallet money (most first)" },
  { id: "joinedNew", label: "Joined (newest first)" },
  { id: "joinedOld", label: "Joined (oldest first)" },
  { id: "finishedNew", label: "Last finished (most recent first)" },
  { id: "finishedOld", label: "Last finished (longest ago first)" },
];
const QUICK: { id: QuickFilter; label: string }[] = [
  { id: "j7", label: "Joined last 7 days" },
  { id: "j30", label: "Joined last 30 days" },
  { id: "f30", label: "Finished last 30 days" },
  { id: "wallet", label: "Has wallet money" },
];

const fmt = (ms: number) => new Date(ms).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
const ago = (ms: number, now: number) => { const d = Math.max(0, Math.floor((now - ms) / DAY)); return d === 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`; };

/** Who belongs on the list, and why the others were left out. */
export function noActivePlanRows(rows: InvestorRow[], exclude: { banned: Set<string>; isDummy: (uid: string) => boolean }) {
  const hidden = { admins: 0, banned: 0, dummy: 0 };
  const list: InvestorRow[] = [];
  for (const r of rows) {
    if (r.activePlansCount > 0) continue;
    if (r.isAdmin) { hidden.admins++; continue; }
    if (exclude.banned.has(r.uid)) { hidden.banned++; continue; }
    if (exclude.isDummy(r.uid)) { hidden.dummy++; continue; }
    list.push(r);
  }
  return { list, hidden };
}

/** Members with a placement request still waiting for approval (admin read). */
function usePendingRequesters(): Set<string> {
  const [uids, setUids] = useState<Set<string>>(new Set());
  useEffect(() => {
    const { db } = getFirebase();
    if (!db) return;
    return onSnapshot(query(collection(db, "plan_requests"), where("status", "==", "pending")), (s) => {
      setUids(new Set(s.docs.map((d) => String(d.data().userId ?? ""))));
    }, () => {});
  }, []);
  return uids;
}

function csv(rows: Record<string, string | number>[], headers: string[], filename: string) {
  const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const text = [headers.map(esc).join(","), ...rows.map((r) => headers.map((h) => esc(r[h] ?? "")).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export function NoActivePlanPanel({ rows, allRows, banned, isDummy }: {
  /** Investors after the page's search and tag filter. */
  rows: InvestorRow[];
  /** Every investor, for the "Referred by" names. */
  allRows: InvestorRow[];
  banned: Set<string>;
  isDummy: (uid: string) => boolean;
}) {
  const [group, setGroup] = useState<Group>("all");
  const [sort, setSort] = useState<SortKey>("wallet");
  const [quick, setQuick] = useState<Set<QuickFilter>>(new Set());
  const [now] = useState(() => Date.now());
  const pending = usePendingRequesters();
  const nameOf = useMemo(() => new Map(allRows.map((r) => [r.uid, r.name])), [allRows]);

  const { list, hidden } = useMemo(() => noActivePlanRows(rows, { banned, isDummy }), [rows, banned, isDummy]);
  const never = list.filter((r) => r.completedPlansCount === 0);
  const done = list.filter((r) => r.completedPlansCount > 0);

  const shown = useMemo(() => {
    const base = group === "never" ? never : group === "done" ? done : list;
    const out = base.filter((r) => {
      if (quick.has("j7") && now - r.joinedAt > 7 * DAY) return false;
      if (quick.has("j30") && now - r.joinedAt > 30 * DAY) return false;
      if (quick.has("f30") && !(r.lastFinishedAt && now - r.lastFinishedAt <= 30 * DAY)) return false;
      if (quick.has("wallet") && !(r.wallet > 0)) return false;
      return true;
    });
    const fin = (r: InvestorRow) => r.lastFinishedAt ?? 0;
    return out.sort((a, b) => {
      switch (sort) {
        case "wallet": return b.wallet - a.wallet || b.joinedAt - a.joinedAt;
        case "joinedOld": return a.joinedAt - b.joinedAt;
        // members who never had a plan go last in both "finished" sorts
        case "finishedNew": return fin(b) - fin(a) || b.joinedAt - a.joinedAt;
        case "finishedOld": return (fin(a) || Infinity) - (fin(b) || Infinity) || b.joinedAt - a.joinedAt;
        case "joinedNew": default: return b.joinedAt - a.joinedAt;
      }
    });
  }, [group, never, done, list, quick, sort, now]);

  const walletSum = shown.reduce((s, r) => s + r.wallet, 0);
  const pendingCount = never.filter((r) => pending.has(r.uid)).length;
  const toggle = (q: QuickFilter) => { const n = new Set(quick); if (n.has(q)) n.delete(q); else n.add(q); setQuick(n); };

  const exportList = () => {
    const date = new Date().toISOString().slice(0, 10);
    csv(shown.map((r) => ({
      Name: r.name, Email: r.email, "Payout number": r.payoutNumber ?? "", Joined: r.joinedAt ? fmt(r.joinedAt) : "",
      Status: r.completedPlansCount ? "Finished" : "Never started", "Request pending": pending.has(r.uid) ? "Yes" : "",
      "Last finished": r.lastFinishedAt ? fmt(r.lastFinishedAt) : "", "Plans finished": r.completedPlansCount,
      "Total placed": r.totalPlaced ?? 0, "Total earned": Math.round(r.totalEarned * 100) / 100, Wallet: Math.round(r.wallet * 100) / 100,
      "Referred by": r.referredByUserId ? nameOf.get(r.referredByUserId) ?? "" : "",
    })), ["Name", "Email", "Payout number", "Joined", "Status", "Request pending", "Last finished", "Plans finished", "Total placed", "Total earned", "Wallet", "Referred by"], `no-active-plan-${date}`);
  };

  const chip = (id: Group, label: string, n: number) => (
    <button key={id} type="button" onClick={() => setGroup(id)} className={cn("px-3 py-1.5 rounded-full text-[12px] border transition", group === id ? "bg-gold/15 border-gold/50 text-gold" : "bg-card border-border text-text-muted hover:text-text")}>
      {label} <span className="font-mono">{n.toLocaleString()}</span>
    </button>
  );
  const hiddenText = [hidden.dummy && `${hidden.dummy} dummy`, hidden.banned && `${hidden.banned} banned`, hidden.admins && `${hidden.admins} admin`].filter(Boolean).join(", ");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {chip("all", "All with no active plan", list.length)}
        {chip("never", "Never started", never.length)}
        {chip("done", "Finished, no active plan", done.length)}
        <button type="button" onClick={exportList} className="ml-auto text-[11px] px-3 py-1.5 bg-gold text-gold-dark rounded-full font-medium flex items-center gap-1.5 hover:brightness-110">
          <Download className="w-3 h-3" /> Export this list
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        {[
          { label: "Never started", value: never.length.toLocaleString() },
          { label: "Finished, no active plan", value: done.length.toLocaleString() },
          { label: "Money in their wallets (shown)", value: formatPHP(walletSum) },
          { label: "Placement request pending", value: pendingCount.toLocaleString() },
        ].map((t) => (
          <div key={t.label} className="rounded-xl bg-card border border-border px-3 py-2.5">
            <p className="m-0 text-[11px] text-text-muted">{t.label}</p>
            <p className="m-0 mt-0.5 text-[18px] font-bold text-text tabular-nums">{t.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="text-[11px] text-text-muted mr-1">Quick filters:</span>
        {QUICK.map((q) => (
          <button key={q.id} type="button" onClick={() => toggle(q.id)} className={cn("px-2.5 py-1 rounded-full text-[11px] border", quick.has(q.id) ? "bg-[#F5C66B]/10 border-[#F5C66B]/50 text-[#F5C66B]" : "bg-card border-border text-text-muted hover:text-text")}>{q.label}</button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-text-muted">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="text-[11px] px-2.5 py-1.5 bg-card border border-border rounded-full text-text outline-none [color-scheme:dark]">
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-[12px] min-w-[900px]">
          <thead>
            <tr className="text-left text-text-muted border-b border-border">
              <th className="py-2.5 px-3 font-medium">Name</th>
              <th className="py-2.5 px-2 font-medium">GCash number</th>
              <th className="py-2.5 px-2 font-medium">Joined</th>
              <th className="py-2.5 px-2 font-medium">Status</th>
              <th className="py-2.5 px-2 font-medium text-right">Plans done</th>
              <th className="py-2.5 px-2 font-medium text-right">Total placed</th>
              <th className="py-2.5 px-2 font-medium text-right">Total earned</th>
              <th className="py-2.5 px-2 font-medium text-right">Wallet</th>
              <th className="py-2.5 px-2 font-medium">Referred by</th>
              <th className="py-2.5 px-3" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.uid} className="border-b border-border/60 last:border-0 hover:bg-card-elev/40">
                <td className="py-2 px-3">
                  <Link href={`/admin/member/${r.uid}`} className="font-semibold text-text hover:underline">{r.name}</Link>
                  <span className="block text-[10px] text-text-subtle truncate max-w-[200px]">{r.email}</span>
                </td>
                <td className="py-2 px-2 font-mono text-text-muted whitespace-nowrap">{r.payoutNumber ?? "–"}{r.payoutNumber && r.payoutType && r.payoutType !== "gcash" ? <span className="ml-1 text-[10px] text-text-subtle">({r.payoutType === "gotyme" ? "GoTyme" : "Bank"})</span> : null}</td>
                <td className="py-2 px-2 whitespace-nowrap">{r.joinedAt ? <>{fmt(r.joinedAt)} <span className="text-text-subtle">· {ago(r.joinedAt, now)}</span></> : "–"}</td>
                <td className="py-2 px-2 whitespace-nowrap">
                  {r.completedPlansCount === 0 ? (
                    <>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-card-elev text-text">Never started</span>
                      {pending.has(r.uid) && <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-[#F5C66B]/15 text-[#F5C66B]">Request pending</span>}
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-green/15 text-green">Finished {r.lastFinishedAt ? fmt(r.lastFinishedAt) : ""}</span>
                      {r.lastFinishedAt ? <span className="ml-1 text-text-subtle">{ago(r.lastFinishedAt, now)}</span> : null}
                    </>
                  )}
                </td>
                <td className="py-2 px-2 text-right tabular-nums">{r.completedPlansCount}</td>
                <td className="py-2 px-2 text-right tabular-nums">{r.totalPlaced ? formatPHP(r.totalPlaced) : "–"}</td>
                <td className="py-2 px-2 text-right tabular-nums">{r.totalEarned ? formatPHP(r.totalEarned) : "–"}</td>
                <td className={cn("py-2 px-2 text-right tabular-nums", r.wallet > 0 && "text-[#F5C66B] font-semibold")}>{formatPHP(r.wallet)}</td>
                <td className="py-2 px-2 text-text-muted whitespace-nowrap">{r.referredByUserId ? nameOf.get(r.referredByUserId) ?? "–" : "–"}</td>
                <td className="py-2 px-3 text-right">
                  <Link href={`/admin/community?thread=${r.uid}#inbox`} className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border border-border text-text hover:bg-card-elev whitespace-nowrap">
                    <MessageCircle className="w-3 h-3" /> Message
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="m-0 px-3 py-6 text-center text-[12px] text-text-muted">No members match these filters.</p>}
      </div>
      <p className="mt-2 text-[11px] text-text-subtle m-0">
        {shown.length.toLocaleString()} shown.{hiddenText ? ` Left out: ${hiddenText} account${hidden.dummy + hidden.banned + hidden.admins === 1 ? "" : "s"}.` : ""} The search box and tag filter above apply here too.
      </p>
    </div>
  );
}
