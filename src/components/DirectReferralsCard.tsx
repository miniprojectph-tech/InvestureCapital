"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, Loader2, Clock, AlertTriangle, ChevronDown } from "lucide-react";
import { Card } from "@/components/Card";
import { formatPHP, cn } from "@/lib/utils";
import type { ReferralStats, DirectStat } from "@/lib/compplan";
import type { CompPlanConfig } from "@/lib/compplan-config";

// This theme's "gold" token is green, so the upcoming bonus and its warning use
// their own warm colours to stay apart from money already paid.
const UPCOMING = "text-[#F5C66B]";
const WARN = "text-[#F5A524]";

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

/**
 * Referrals › Your direct referrals. Each row keeps two amounts apart so members
 * don't read the upcoming Leadership Bonus as money already received:
 *   Commission paid  — level-1 commission already in the wallet (green, "+")
 *   Leadership Bonus — half of the direct's Locked-In Bonus, paid when each term
 *                      ends (gold, no "+", with the date or a warning)
 * Directs with two or more placements expand into one line per placement.
 */
export function DirectReferralsCard({ stats, cfg }: { stats: ReferralStats | null; cfg: CompPlanConfig }) {
  const [open, setOpen] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const pct = stats?.leadershipPct ?? cfg.leadershipPct;
  const needsPlacement = !!stats && cfg.requireActiveLeadership && cfg.uplineMinActive > 0 && !stats.selfActive;
  const leadershipOf = (lockedBonus: number) => Math.round(lockedBonus * pct) / 100;

  const totalCommission = stats ? stats.directs.reduce((s, d) => s + (d.commissionPaid ?? 0), 0) : 0;
  const totalLeadership = stats ? stats.directs.reduce((s, d) => s + leadershipOf(d.pendingLockedBonus), 0) : 0;
  const hasItems = !!stats?.directs.some((d) => d.items);

  return (
    <Card>
      {/* Own header: the shared one truncates the subtitle, and this one must be read in full. */}
      <div className="flex justify-between items-start mb-3 gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-text m-0">Your direct referrals</p>
          <p className="text-[10px] text-text-subtle mt-0.5 m-0">
            People who joined with your link. Commission is paid when they place. Their Leadership Bonus is paid to you when their term ends.
          </p>
        </div>
        <Users className="w-4 h-4 text-green shrink-0" />
      </div>
      {!stats ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 text-gold animate-spin" /></div>
      ) : stats.directs.length === 0 ? (
        <p className="text-[11px] text-text-subtle m-0">No one has joined with your link yet. Share it to start building your team.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1 max-h-[420px] overflow-y-auto">
            {stats.directs.map((d) => (
              <DirectRow key={d.uid} d={d} leadershipOf={leadershipOf} needsPlacement={needsPlacement} now={now} open={open === d.uid} onToggle={() => setOpen((o) => (o === d.uid ? null : d.uid))} />
            ))}
          </div>

          {hasItems && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mt-2.5 pt-2 border-t border-border text-[10px] text-text-muted">
              <span>Total commission paid <span className="font-mono text-green">{formatPHP(totalCommission)}</span></span>
              <span>Upcoming Leadership Bonus <span className={cn("font-mono", UPCOMING)}>{formatPHP(totalLeadership)}</span></span>
            </div>
          )}

          {needsPlacement && totalLeadership > 0 && (
            <div className="mt-2.5 flex items-start gap-2 px-3 py-2.5 bg-[#F5A524]/10 border border-[#F5A524]/30 rounded-lg text-[11px] text-text">
              <AlertTriangle className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", WARN)} />
              <span>
                You need an active placement of {formatPHP(cfg.uplineMinActive)} or more when each term ends to receive these bonuses.{" "}
                <Link href="/plans" className={cn("underline", UPCOMING)}>Place now</Link>
              </span>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function DirectRow({ d, leadershipOf, needsPlacement, now, open, onToggle }: {
  d: DirectStat;
  leadershipOf: (lockedBonus: number) => number;
  needsPlacement: boolean;
  now: number;
  open: boolean;
  onToggle: () => void;
}) {
  const items = (d.items ?? []).filter((i) => i.lockedBonus > 0);
  const leadership = leadershipOf(d.pendingLockedBonus);
  const commission = d.commissionPaid ?? 0;
  const next = items[0]?.endsAt ?? 0;
  const expandable = (d.items ?? []).length > 1;
  const payLabel = (endsAt: number) => (endsAt <= now ? "paying soon" : fmtDay(endsAt));
  const oldServer = d.items === undefined;

  const head = (
    <>
      <div className={cn("w-7 h-7 rounded-full text-[10px] font-semibold flex items-center justify-center shrink-0", d.activePlaced > 0 ? "bg-green/15 text-green" : "bg-card-elev text-text-subtle")}>
        {initials(d.name)}
      </div>
      <div className="flex-1 min-w-[120px]">
        <p className="text-[11px] text-text m-0 truncate flex items-center gap-1">
          <span className="truncate">{d.name}</span>
          {expandable && <ChevronDown className={cn("w-3 h-3 text-text-subtle shrink-0 transition-transform", open && "rotate-180")} />}
        </p>
        <p className="text-[9px] text-text-subtle m-0">
          {d.activePlaced > 0 ? `${formatPHP(d.activePlaced, { short: true })} active · ${d.placements} placement${d.placements === 1 ? "" : "s"}` : "No active placement"}
          {d.joinedAt ? ` · joined ${fmtDay(d.joinedAt)}` : ""}
        </p>
      </div>
      {!oldServer && (
        <div className="flex items-stretch shrink-0 ml-auto">
          <div className="text-right min-w-[84px]">
            <p className="text-[9px] text-text-subtle m-0">Commission paid</p>
            <p className={cn("text-[11px] font-mono m-0", commission > 0 ? "text-green" : "text-text-subtle")}>{commission > 0 ? `+${formatPHP(commission)}` : "—"}</p>
          </div>
          <div className="text-right min-w-[96px] border-l border-border pl-2.5 ml-2.5">
            <p className="text-[9px] text-text-subtle m-0">Leadership Bonus</p>
            <p className={cn("text-[11px] font-mono m-0", leadership <= 0 ? "text-text-subtle" : needsPlacement ? "text-text-muted" : UPCOMING)}>{leadership > 0 ? formatPHP(leadership) : "—"}</p>
            {leadership > 0 && (
              needsPlacement ? (
                <p className={cn("text-[9px] m-0 flex items-center justify-end gap-1", WARN)}><AlertTriangle className="w-2.5 h-2.5" /> needs your placement</p>
              ) : (
                <p className="text-[9px] text-text-subtle m-0 flex items-center justify-end gap-1"><Clock className="w-2.5 h-2.5" /> {items.length > 1 ? "next " : "pays "}{payLabel(next)}</p>
              )
            )}
          </div>
        </div>
      )}
      {oldServer && d.pendingLockedBonus > 0 && (
        <div className="text-right shrink-0 ml-auto">
          <p className="text-[9px] text-text-subtle m-0">Leadership Bonus</p>
          <p className={cn("text-[11px] font-mono m-0", UPCOMING)}>{formatPHP(leadership)}</p>
        </div>
      )}
    </>
  );

  return (
    <div className="bg-canvas border border-border rounded-lg">
      {expandable ? (
        <button type="button" data-viewas-ok onClick={onToggle} aria-expanded={open} className="w-full text-left flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-3 py-2">
          {head}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-3 py-2">{head}</div>
      )}
      {expandable && open && (
        <div className="px-3 pb-2 sm:pl-[46px]">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-3 text-[9px] text-text-subtle py-1">
            <span>Placement</span><span className="text-right">Commission</span><span className="text-right">Leadership</span><span className="text-right">Pays</span>
          </div>
          {(d.items ?? []).map((i) => (
            <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-3 text-[10px] py-1.5 border-t border-border items-center">
              <span className="text-text-muted truncate">{formatPHP(i.capital, { short: true })} · {i.termMonths} month{i.termMonths === 1 ? "" : "s"} · {fmtDay(i.startedAt)}</span>
              <span className={cn("font-mono text-right", i.commission > 0 ? "text-green" : "text-text-subtle")}>{i.commission > 0 ? `+${formatPHP(i.commission, { short: true })}` : "—"}</span>
              <span className={cn("font-mono text-right", i.lockedBonus > 0 ? (needsPlacement ? "text-text-muted" : UPCOMING) : "text-text-subtle")}>{i.lockedBonus > 0 ? formatPHP(leadershipOf(i.lockedBonus), { short: true }) : "—"}</span>
              <span className="text-right text-text-muted">{i.lockedBonus > 0 ? payLabel(i.endsAt) : "no bonus"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
