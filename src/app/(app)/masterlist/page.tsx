"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, ChevronLeft, ChevronRight, Loader2, MessageCircle, Users } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card } from "@/components/Card";
import { cn, formatPHP } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useUserState } from "@/lib/useUserState";
import { useSettings } from "@/lib/settings";
import {
  useMasterIndex,
  useMasterMonth,
  cutoffMonth,
  monthKeyOf,
  monthLabel,
  dayKeyOf,
  longDayLabel,
  lastDayOfMonth,
  ownKey,
  MAX_WINDOW_MONTHS,
  type PublicRow,
} from "@/lib/masterlist";

const DEFAULT_ARCHIVE_NOTE = "Older records are archived. If you had a placement before this and want a copy, message the admin.";
const field = "bg-canvas border border-border rounded-lg px-3 py-2 text-[13px] text-text outline-none focus:border-gold/40 [color-scheme:dark]";

/**
 * Masterlist: one day per page. It opens on the most recent day that has
 * placements; Previous day / Next day step between days that have some, and a
 * month list or a date picker jumps straight to a day. Dates more than the
 * allowed number of months back can't be chosen (the server refuses them too).
 * Other people's names arrive already masked; the member's own rows are found
 * by a private key and shown in full.
 */
export default function MasterlistPage() {
  const { user } = useAuth();
  const { state } = useUserState();
  const { settings } = useSettings();
  const { index, loading } = useMasterIndex();

  // Keys of this member's own rows (same hash the server stores), so they can be highlighted.
  const [mine, setMine] = useState<Set<string>>(new Set());
  const ownIds = useMemo(
    () => [...(state?.placements ?? []), ...(state?.completedPlacements ?? [])].map((p) => p.id).filter(Boolean).join("|"),
    [state?.placements, state?.completedPlacements],
  );
  useEffect(() => {
    let cancelled = false;
    if (!user || !ownIds) { setMine(new Set()); return; }
    Promise.all(ownIds.split("|").map((id) => ownKey(user.uid, id)))
      .then((keys) => { if (!cancelled) setMine(new Set(keys)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user, ownIds]);

  const windowMonths = index?.windowMonths ?? MAX_WINDOW_MONTHS;
  const today = dayKeyOf(Date.now());
  const cutoff = cutoffMonth(windowMonths);
  const minDay = `${cutoff}-01`;

  // The months that can be chosen (this month back to the cut-off), newest first.
  const monthChoices = useMemo(() => {
    const out: string[] = [];
    const [y, m] = monthKeyOf(Date.now()).split("-").map(Number);
    for (let i = 0; i < windowMonths; i++) out.push(new Date(Date.UTC(y, m - 1 - i, 15)).toISOString().slice(0, 7));
    return out;
  }, [windowMonths]);

  // Every day inside the window that has at least one placement, oldest first.
  const activeDays = useMemo(() => {
    const out: string[] = [];
    for (const m of index?.months ?? []) {
      if (m.month < cutoff) continue;
      for (const d of m.days) {
        const key = `${m.month}-${String(d).padStart(2, "0")}`;
        if (key <= today) out.push(key);
      }
    }
    return out.sort();
  }, [index?.months, cutoff, today]);

  const [picked, setPicked] = useState<string | null>(null);
  // Opens on the most recent day that has placements (today, when today has some).
  const day = picked ?? activeDays[activeDays.length - 1] ?? today;
  const month = day.slice(0, 7);
  const prevDay = [...activeDays].reverse().find((d) => d < day) ?? null;
  const nextDay = activeDays.find((d) => d > day) ?? null;

  function chooseMonth(m: string) {
    // Jump to that month's latest day with placements; an empty month shows its last day (or today).
    const inMonth = activeDays.filter((d) => d.startsWith(m));
    const fallback = lastDayOfMonth(m);
    setPicked(inMonth[inMonth.length - 1] ?? (fallback > today ? today : fallback));
  }
  function chooseDate(v: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    setPicked(v < minDay ? minDay : v > today ? today : v); // keeps typed dates inside the allowed range
  }

  const hasArchive = (index?.months ?? []).some((m) => m.month < cutoff);
  const note = settings.masterlist?.archiveNote?.trim() || DEFAULT_ARCHIVE_NOTE;

  return (
    <div>
      <TopHeader title="Masterlist" subtitle="Placements by day" />

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 text-gold animate-spin" /></div>
      ) : !index || index.months.length === 0 ? (
        <Card>
          <div className="py-12 flex flex-col items-center text-center gap-2">
            <Users className="w-7 h-7 text-text-subtle" />
            <p className="text-[13px] m-0">The Masterlist is being prepared.</p>
            <p className="text-[11px] text-text-subtle m-0">Placements will appear here by day.</p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {/* jump to a month or a date */}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-text-subtle">Month</span>
              <select value={month} onChange={(e) => chooseMonth(e.target.value)} className={cn(field, "min-w-[170px]")}>
                {monthChoices.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-text-subtle">Or pick a date</span>
              <input type="date" value={day} min={minDay} max={today} onChange={(e) => chooseDate(e.target.value)} className={cn(field, "min-w-[170px]")} />
            </label>
            <button
              type="button"
              onClick={() => setPicked(today)}
              disabled={day === today}
              className="px-3.5 py-2 rounded-lg border border-border-strong text-[12px] text-text hover:bg-card-elev transition disabled:opacity-40"
            >
              Today
            </button>
          </div>

          <DayBlock month={month} day={day} isToday={day === today} mine={mine} myName={user?.name ?? ""} />

          {/* pages */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => prevDay && setPicked(prevDay)}
              disabled={!prevDay}
              className="px-3.5 py-2.5 rounded-lg border border-border-strong text-[12px] text-text hover:bg-card-elev transition disabled:opacity-35 flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" /> Previous day
            </button>
            <span className="text-[11px] text-text-subtle text-center">
              {prevDay || nextDay ? "Skips days with no placements" : ""}
            </span>
            <button
              type="button"
              onClick={() => nextDay && setPicked(nextDay)}
              disabled={!nextDay}
              className="px-3.5 py-2.5 rounded-lg border border-border-strong text-[12px] text-text hover:bg-card-elev transition disabled:opacity-35 flex items-center gap-1.5"
            >
              Next day <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {hasArchive && (
            <div className="rounded-2xl border border-dashed border-border-strong bg-card/60 p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Archive className="w-4 h-4 text-text-subtle" />
                <p className="text-[13px] font-medium m-0">Before {monthLabel(cutoff)}</p>
              </div>
              <p className="text-[12px] text-text-muted m-0 mb-3 leading-relaxed max-w-xl">{note}</p>
              <Link href="/community#admin" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gold text-gold-dark text-[12px] font-medium hover:brightness-110 transition">
                <MessageCircle className="w-3.5 h-3.5" /> Message the admin
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One day's rows, taken from that month's prepared list. */
function DayBlock({ month, day, isToday, mine, myName }: { month: string; day: string; isToday: boolean; mine: Set<string>; myName: string }) {
  const { data, loading } = useMasterMonth<PublicRow>("masterlist_public", month);
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => dayKeyOf(r.d) === day), [data, day]);
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-[14px] font-medium m-0">
          {longDayLabel(day)}
          {isToday && <span className="font-normal text-[12px] text-text-subtle"> · today</span>}
        </p>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-4 h-4 text-gold animate-spin" /></div>
      ) : rows.length === 0 ? (
        <p className="text-[12px] text-text-muted m-0 px-4 py-8 text-center">No placements on this day.</p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-text-subtle text-left">
              <th className="font-normal py-2 pl-4 pr-2">Name</th>
              <th className="font-normal py-2 px-2 text-right">Amount</th>
              <th className="font-normal py-2 pl-2 pr-4 text-right">Term</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const own = mine.has(r.k);
              return (
                <tr key={`${r.k}-${i}`} className={cn("border-t border-border", own && "bg-gold/10")}>
                  <td className={cn("py-2.5 pl-4 pr-2 break-all", own ? "text-gold font-medium" : "font-mono text-text")}>
                    {own ? <>{myName || r.n} <span className="font-normal text-[10px]">· you</span></> : r.n}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">{formatPHP(r.a)}</td>
                  <td className="py-2.5 pl-2 pr-4 text-right text-text-muted whitespace-nowrap">{r.t > 0 ? `${r.t} mo` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}
