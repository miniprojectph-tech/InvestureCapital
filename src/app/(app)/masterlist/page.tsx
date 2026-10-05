"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, Loader2, MessageCircle, Users } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card } from "@/components/Card";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { cn, formatPHP } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useUserState } from "@/lib/useUserState";
import { useSettings } from "@/lib/settings";
import { useMasterIndex, useMasterMonth, cutoffMonth, monthLabel, dayLabel, ownKey, type PublicRow } from "@/lib/masterlist";

const DEFAULT_ARCHIVE_NOTE = "Archived. If you had a placement in these months and want a copy, message the admin.";

/**
 * Masterlist: every placement by month. Other people's names arrive already
 * masked; the member's own rows are found by a private key and shown in full.
 * Only the most recent months can be opened — older ones are archived.
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

  const windowMonths = index?.windowMonths ?? 2;
  const cutoff = cutoffMonth(windowMonths);
  const open = (index?.months ?? []).filter((m) => m.month >= cutoff);
  const archived = (index?.months ?? []).filter((m) => m.month < cutoff);
  const note = settings.masterlist?.archiveNote?.trim() || DEFAULT_ARCHIVE_NOTE;

  return (
    <div>
      <TopHeader title="Masterlist" subtitle="Placements by month" />

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 text-gold animate-spin" /></div>
      ) : !index || index.months.length === 0 ? (
        <Card>
          <div className="py-12 flex flex-col items-center text-center gap-2">
            <Users className="w-7 h-7 text-text-subtle" />
            <p className="text-[13px] m-0">The Masterlist is being prepared.</p>
            <p className="text-[11px] text-text-subtle m-0">Placements will appear here by month.</p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {open.length === 0 && (
            <Card><p className="text-[12px] text-text-muted m-0 py-4 text-center">No placements in the last {windowMonths} month{windowMonths === 1 ? "" : "s"} yet.</p></Card>
          )}
          {open.map((m) => (
            <MonthBlock key={m.month} month={m.month} count={m.count} total={m.total} showTotals={index.showTotals} mine={mine} myName={user?.name ?? ""} />
          ))}

          {archived.length > 0 && (
            <div className="rounded-2xl border border-dashed border-border-strong bg-card/60 p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Archive className="w-4 h-4 text-text-subtle" />
                <p className="text-[13px] font-medium m-0">{monthLabel(archived[0].month)} and earlier</p>
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

function MonthBlock({ month, count, total, showTotals, mine, myName }: { month: string; count: number; total: number; showTotals: boolean; mine: Set<string>; myName: string }) {
  const { data, loading } = useMasterMonth<PublicRow>("masterlist_public", month);
  const rows = data?.rows ?? [];
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3 border-b border-border">
        <p className="text-[14px] font-medium m-0">{monthLabel(month)}</p>
        <p className="text-[11px] text-text-subtle m-0">
          {count.toLocaleString()} placement{count === 1 ? "" : "s"}
          {showTotals && total > 0 && <> · <span className="font-mono text-gold">{formatPHP(total, { short: true })}</span> placed</>}
        </p>
      </div>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 text-gold animate-spin" /></div>
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-text-subtle m-0 px-4 py-5">Nothing to show for this month.</p>
      ) : (
        <ResponsiveTable>
          <table className="w-full text-[12px] min-w-[420px]">
            <thead>
              <tr className="text-text-subtle text-left">
                <th className="font-normal py-2 pl-4 pr-2">Name</th>
                <th className="font-normal py-2 px-2">Date placed</th>
                <th className="font-normal py-2 px-2 text-right">Amount</th>
                <th className="font-normal py-2 pl-2 pr-4 text-right">Term</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const own = mine.has(r.k);
                return (
                  <tr key={`${r.k}-${i}`} className={cn("border-t border-border", own && "bg-gold/10")}>
                    <td className={cn("py-2 pl-4 pr-2", own ? "text-gold font-medium" : "font-mono text-text")}>
                      {own ? <>{myName || r.n} <span className="font-normal text-[10px]">· you</span></> : r.n}
                    </td>
                    <td className="py-2 px-2 text-text-muted whitespace-nowrap">{dayLabel(r.d)}</td>
                    <td className="py-2 px-2 text-right font-mono whitespace-nowrap">{formatPHP(r.a)}</td>
                    <td className="py-2 pl-2 pr-4 text-right text-text-muted whitespace-nowrap">{r.t > 0 ? `${r.t} mo` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </Card>
  );
}
