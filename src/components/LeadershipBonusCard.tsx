"use client";

import { useState } from "react";
import Link from "next/link";
import { Award, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { Card } from "@/components/Card";
import { formatPHP, cn } from "@/lib/utils";
import type { Commission, ReferralStats } from "@/lib/compplan";
import type { CompPlanConfig } from "@/lib/compplan-config";

// This theme's "gold" token is green, so money not paid yet has its own warm colour.
export const UPCOMING = "text-[#F5C66B]";
const WARN = "text-[#F5A524]";
const PREVIEW = 4;
const DAY_MS = 86_400_000;

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

type Upcoming = { key: string; name: string; capital: number; termMonths: number; endsAt: number; amount: number };

/**
 * Both halves of the Leadership Bonus: what was paid (the commission records) and
 * what is still to come (the directs' running placements). The records are live
 * and the downline is loaded once, so a placement that already has a record is
 * left out of upcoming rather than counted in both.
 */
export function leadershipSummary(commissions: Commission[], stats: ReferralStats | null) {
  const records = commissions.filter((c) => c.type === "leadership");
  const completed = records.filter((c) => c.status === "paid").sort((a, b) => b.createdAt - a.createdAt);
  const settled = new Set(records.map((c) => `${c.fromUserId}|${c.placementId}`));
  const upcoming: Upcoming[] = (stats?.directs ?? [])
    .flatMap((d) =>
      (d.items ?? [])
        .filter((i) => i.lockedBonus > 0 && !settled.has(`${d.uid}|${i.id}`))
        .map((i) => ({
          key: `${d.uid}|${i.id}`,
          name: d.name,
          capital: i.capital,
          termMonths: i.termMonths,
          endsAt: i.endsAt,
          amount: Math.round(i.lockedBonus * (stats?.leadershipPct ?? 0)) / 100,
        })),
    )
    .sort((a, b) => a.endsAt - b.endsAt);

  return {
    completed,
    completedTotal: completed.reduce((s, c) => s + c.amount, 0),
    upcoming,
    upcomingTotal: upcoming.reduce((s, i) => s + i.amount, 0),
    upcomingDirects: new Set(upcoming.map((i) => i.key.split("|")[0])).size,
  };
}

/** Bonuses › Leadership Bonus. */
export function LeadershipBonusCard({ cfg, summary, stats, statsLoading, onRetry, recordsLoading, recordsError, now }: {
  cfg: CompPlanConfig;
  summary: ReturnType<typeof leadershipSummary>;
  stats: ReferralStats | null;
  statsLoading: boolean;
  onRetry: () => void;
  recordsLoading: boolean;
  recordsError: boolean;
  now: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const { completed, completedTotal, upcoming, upcomingTotal, upcomingDirects } = summary;
  const needsActive = cfg.requireActiveLeadership && cfg.uplineMinActive > 0;
  const needsPlacement = needsActive && !!stats && !stats.selfActive;
  const shown = showAll ? upcoming : upcoming.slice(0, PREVIEW);

  return (
    <Card>
      {/* Own header: the shared one truncates the subtitle, and this one must be read in full. */}
      <div className="flex justify-between items-start mb-3 gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-text m-0">Leadership Bonus</p>
          <p className="text-[10px] text-text-subtle mt-0.5 m-0">{cfg.leadershipPct}% of each direct referral&apos;s Locked-In Bonus, paid when their term completes</p>
        </div>
        <Award className="w-4 h-4 text-gold shrink-0" />
      </div>

      <section aria-label="Completed Leadership Bonuses">
        <Heading title="Completed" detail={completed.length ? `${completed.length} bonus${completed.length === 1 ? "" : "es"}` : ""} total={completed.length ? formatPHP(completedTotal) : ""} tone="text-green" />
        {recordsError ? (
          <p className="text-[11px] text-red m-0 py-1">Couldn&apos;t load completed bonuses. Refresh the page to try again.</p>
        ) : recordsLoading ? (
          <Spinner />
        ) : completed.length === 0 ? (
          <p className="text-[11px] text-text-subtle m-0 py-1">No completed bonuses yet.</p>
        ) : (
          <div className="flex flex-col gap-1 max-h-[420px] overflow-y-auto">
            {completed.map((c) => {
              // The record's offset is the term length in days.
              const months = c.schedOffsetMs ? Math.round(c.schedOffsetMs / DAY_MS / cfg.monthDays) : 0;
              const detail = [c.placementId, months ? `${months} mo` : "", c.placementAmount ? formatPHP(c.placementAmount, { short: true }) : "", `completed ${fmtDay(c.createdAt)}`].filter(Boolean).join(" · ");
              return <Row key={c.id} name={c.fromUserName} detail={detail} amount={`+${formatPHP(c.amount)}`} tone="text-green" />;
            })}
          </div>
        )}
      </section>

      <section aria-label="Upcoming Leadership Bonuses" className="mt-4">
        <Heading title="Upcoming" detail={upcoming.length ? `${plural(upcoming.length, "placement")} from ${plural(upcomingDirects, "direct")}` : ""} total={upcoming.length ? formatPHP(upcomingTotal) : ""} tone={UPCOMING} />
        {!stats ? (
          statsLoading ? (
            <Spinner />
          ) : (
            <p className="text-[11px] text-text-subtle m-0 py-1">
              Couldn&apos;t load upcoming bonuses.{" "}
              <button type="button" data-viewas-ok onClick={onRetry} className="text-gold hover:underline">Try again</button>
            </p>
          )
        ) : upcoming.length === 0 ? (
          <p className="text-[11px] text-text-subtle m-0 py-1">No upcoming bonuses.</p>
        ) : (
          <>
            <div className={cn("flex flex-col gap-1", showAll && "max-h-[320px] overflow-y-auto")}>
              {shown.map((i) => (
                <Row
                  key={i.key}
                  name={i.name}
                  detail={`${i.termMonths} mo · ${formatPHP(i.capital, { short: true })} · ${i.endsAt <= now ? "paying soon" : `pays ${fmtDay(i.endsAt)}`}`}
                  amount={formatPHP(i.amount)}
                  tone={needsPlacement ? "text-text-muted" : UPCOMING}
                />
              ))}
            </div>
            {upcoming.length > PREVIEW && (
              <button type="button" data-viewas-ok aria-expanded={showAll} onClick={() => setShowAll((v) => !v)} className="w-full pt-2 text-[11px] text-gold hover:underline">
                {showAll ? "Show fewer" : `Show all ${upcoming.length}`}
              </button>
            )}
            {needsPlacement ? (
              <div className="mt-2 flex items-start gap-2 px-3 py-2.5 bg-[#F5A524]/10 border border-[#F5A524]/30 rounded-lg text-[11px] text-text">
                <AlertTriangle className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", WARN)} />
                <span>
                  You need an active placement of {formatPHP(cfg.uplineMinActive)} or more when each term ends to receive these bonuses.{" "}
                  <Link href="/plans" className={cn("underline", UPCOMING)}>Place now</Link>
                </span>
              </div>
            ) : needsActive ? (
              <p className="text-[9px] text-text-subtle m-0 mt-2">You need at least {formatPHP(cfg.uplineMinActive, { short: true })} in active placements when each bonus pays.</p>
            ) : null}
          </>
        )}
      </section>

      <p className="text-[11px] text-text m-0 mt-4 mb-1.5">How much you earn</p>
      <div className="flex flex-col gap-1.5">
        {cfg.terms.filter((t) => t.lockedBonusPerUnit > 0).map((t) => (
          <div key={t.months} className="flex items-center justify-between gap-2 text-[11px] px-3 py-2 bg-canvas border border-border rounded-lg">
            <span className="text-text-muted">Direct completes {t.months} mo per ₱{cfg.increment.toLocaleString()}</span>
            <span className="font-mono text-gold">+{formatPHP((t.lockedBonusPerUnit * cfg.leadershipPct) / 100)}</span>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-text-subtle m-0 mt-2">Funded separately — never deducted from your referral&apos;s bonus.</p>
      <Link href="/referrals" className="mt-2 inline-flex items-center gap-1 text-[11px] text-gold hover:underline">View your directs <ArrowRight className="w-3 h-3" /></Link>
    </Card>
  );
}

function Heading({ title, detail, total, tone }: { title: string; detail: string; total: string; tone: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 mb-1.5">
      <p className="text-[11px] text-text m-0">
        {title}
        {detail && <span className="text-[10px] text-text-subtle"> · {detail}</span>}
      </p>
      {total && <span className={cn("text-[12px] font-mono tabular-nums", tone)}>{total}</span>}
    </div>
  );
}

function Row({ name, detail, amount, tone }: { name: string; detail: string; amount: string; tone: string }) {
  return (
    <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-canvas border border-border rounded-lg">
      <div className="min-w-0">
        <p className="text-[11px] text-text m-0 truncate">{name}</p>
        <p className="text-[9px] text-text-subtle m-0 break-words">{detail}</p>
      </div>
      <span className={cn("text-[11px] font-mono tabular-nums shrink-0", tone)}>{amount}</span>
    </div>
  );
}

function Spinner() {
  return <div className="py-3 flex justify-center"><Loader2 className="w-4 h-4 text-gold animate-spin" /></div>;
}
