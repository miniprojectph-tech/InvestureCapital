"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Check, Share2, Users, Coins, Zap, Award, Loader2, RefreshCw, AlertCircle, ShieldCheck } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { formatPHP, cn } from "@/lib/utils";
import { useReferralCode } from "@/lib/useReferrals";
import { useCompPlan, useReferralStats, useMyCommissions, peso, type Commission } from "@/lib/compplan";

const TYPE_LABEL: Record<Commission["type"], string> = { level: "Commission", fastStart: "Fast-Start", leadership: "Leadership" };
const TYPE_TONE: Record<Commission["type"], string> = { level: "bg-blue/15 text-blue", fastStart: "bg-vault/15 text-vault", leadership: "bg-gold/15 text-gold" };

export default function ReferralsPage() {
  const { cfg } = useCompPlan();
  const { link, loading: codeLoading } = useReferralCode();
  const { stats, loading: statsLoading, error, refresh } = useReferralStats();
  const commissions = useMyCommissions(200);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const paid = useMemo(() => commissions.filter((c) => c.status === "paid"), [commissions]);
  const earnedByLevel = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of paid) if (c.type === "level" && c.level) m.set(c.level, (m.get(c.level) ?? 0) + c.amount);
    return m;
  }, [paid]);
  const sum = (type: Commission["type"]) => paid.filter((c) => c.type === type).reduce((s, c) => s + c.amount, 0);
  const commissionTotal = sum("level");
  const fastStartTotal = sum("fastStart");
  const leadershipTotal = sum("leadership");
  const potentialLeadership = stats ? (stats.directs.reduce((s, d) => s + d.pendingLockedBonus, 0) * stats.leadershipPct) / 100 : 0;

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopyError("Couldn't copy — long-press the link to copy it manually.");
    }
  }

  return (
    <div>
      <TopHeader title="Referrals" subtitle={`Earn on ${cfg.referralLevels.length} levels — ${cfg.referralLevels.join(" / ")}% on every placement`} />

      {/* Referral link */}
      <Card className="mb-3">
        <CardHeader title="Your referral link" subtitle="Share it — new sign-ups are linked to you automatically" right={<Share2 className="w-4 h-4 text-gold" />} />
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 min-w-0 bg-canvas border border-border rounded-lg px-3 py-2.5 font-mono text-[12px] text-text truncate flex items-center">
            {codeLoading ? "Generating your link…" : link ?? "Sign in to get your link"}
          </div>
          <button
            onClick={copyLink}
            disabled={!link}
            className={cn("shrink-0 px-4 py-2.5 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-50", copied ? "bg-green text-white" : "bg-gold text-gold-dark hover:brightness-110")}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        {copyError && <p className="text-[10px] text-red m-0 mt-2">{copyError}</p>}
      </Card>

      {stats && !stats.selfActive && cfg.uplineMinActive > 0 && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2.5 bg-gold/10 border border-gold/25 rounded-lg text-[11px] text-text">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gold" />
          <span>
            You need an active placement of at least <span className="text-gold">{formatPHP(cfg.uplineMinActive)}</span> to receive commissions and bonuses.{" "}
            <Link href="/plans" className="text-gold underline">Place capital</Link> to start earning from your team.
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Stat icon={Users} label="Direct referrals" value={stats ? String(stats.directs.length) : "—"} sub={stats ? `${stats.totals.members} in your team` : undefined} tone="text" />
        <Stat icon={Coins} label="Commissions earned" value={formatPHP(commissionTotal)} tone="green" />
        <Stat icon={Zap} label="Fast-Start earned" value={formatPHP(fastStartTotal)} tone="vault" />
        <Stat icon={Award} label="Leadership earned" value={formatPHP(leadershipTotal)} sub={potentialLeadership > 0 ? `${formatPHP(potentialLeadership, { short: true })} pending` : undefined} tone="gold" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        {/* Levels */}
        <Card>
          <CardHeader
            title="Your team by level"
            subtitle="Commission is paid to your wallet the moment a placement is approved"
            right={
              <button onClick={refresh} className="text-text-subtle hover:text-text" aria-label="Refresh">
                <RefreshCw className={cn("w-3.5 h-3.5", statsLoading && "animate-spin")} />
              </button>
            }
          />
          {error ? (
            <p className="text-[11px] text-red m-0">{error}</p>
          ) : !stats ? (
            <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 text-gold animate-spin" /></div>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider text-text-subtle">
                  <th className="text-left font-medium py-1.5">Level</th>
                  <th className="text-right font-medium py-1.5">Rate</th>
                  <th className="text-right font-medium py-1.5">Members</th>
                  <th className="text-right font-medium py-1.5">Active</th>
                  <th className="text-right font-medium py-1.5">Earned</th>
                </tr>
              </thead>
              <tbody>
                {stats.levels.map((l) => (
                  <tr key={l.level} className="border-t border-border">
                    <td className="py-2 text-text">{l.level === 1 ? "Level 1 · Direct" : `Level ${l.level}`}</td>
                    <td className="py-2 text-right tabular-nums text-text-muted">{l.pct}%</td>
                    <td className="py-2 text-right tabular-nums">{l.members}</td>
                    <td className="py-2 text-right tabular-nums text-text-muted">{l.active}</td>
                    <td className="py-2 text-right tabular-nums text-green">{earnedByLevel.get(l.level) ? formatPHP(earnedByLevel.get(l.level)!) : "—"}</td>
                  </tr>
                ))}
                <tr className="border-t border-border-strong">
                  <td className="py-2 text-text font-medium">Total</td>
                  <td className="py-2 text-right tabular-nums text-text-muted">{cfg.referralLevels.reduce((s, v) => s + v, 0)}%</td>
                  <td className="py-2 text-right tabular-nums font-medium">{stats.totals.members}</td>
                  <td className="py-2 text-right tabular-nums text-text-muted">{stats.totals.active}</td>
                  <td className="py-2 text-right tabular-nums text-green font-medium">{formatPHP(commissionTotal)}</td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="text-[9px] text-text-subtle m-0 mt-2">
            Per ₱{cfg.increment.toLocaleString()} placed in your team: {cfg.referralLevels.map((p, i) => `L${i + 1} ${peso((cfg.increment * p) / 100)}`).join(" · ")}. Each upline receives one level per placement.
          </p>
        </Card>

        {/* Fast-Start */}
        <Card>
          <CardHeader title="Fast-Start Bonus" subtitle={`One-time bonus per tier once ${cfg.fastStartDirects} direct referrals have placed the minimum`} right={<Zap className="w-4 h-4 text-vault" />} />
          {!stats ? (
            <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 text-gold animate-spin" /></div>
          ) : (
            <div className="flex flex-col gap-3">
              {stats.fastStart.tiers.map((t) => {
                const pct = Math.min(100, (t.qualifying / stats.fastStart.directsRequired) * 100);
                const done = !!t.paidAt;
                return (
                  <div key={t.minPlacement}>
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <span className="text-[11px] text-text">
                        {stats.fastStart.directsRequired} directs with <span className="font-mono">{formatPHP(t.minPlacement, { short: true })}+</span> placed
                      </span>
                      <span className={cn("text-[11px] font-mono shrink-0", done ? "text-green" : "text-vault")}>
                        {done ? <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" /> {formatPHP(t.bonus)} paid</span> : `+${formatPHP(t.bonus)}`}
                      </span>
                    </div>
                    <div className="h-[5px] bg-border rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", done ? "bg-green" : "bg-vault")} style={{ width: `${done ? 100 : pct}%` }} />
                    </div>
                    <p className="text-[9px] text-text-subtle m-0 mt-1">
                      {done ? `Paid ${new Date(t.paidAt!).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}` : `${t.qualifying} of ${stats.fastStart.directsRequired} qualifying`}
                    </p>
                  </div>
                );
              })}
              <p className="text-[9px] text-text-subtle m-0">A direct counts toward a tier by their total active placements. You must be active to receive it.</p>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Directs */}
        <Card>
          <CardHeader title="Direct referrals" subtitle={`Leadership Bonus: ${cfg.leadershipPct}% of each direct's Locked-In Bonus when their term completes`} right={<Award className="w-4 h-4 text-gold" />} />
          {!stats ? (
            <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 text-gold animate-spin" /></div>
          ) : stats.directs.length === 0 ? (
            <p className="text-[11px] text-text-subtle m-0">No one has joined with your link yet. Share it to start building your team.</p>
          ) : (
            <div className="flex flex-col gap-1 max-h-[360px] overflow-y-auto">
              {stats.directs.map((d) => (
                <div key={d.uid} className="flex items-center gap-2.5 px-3 py-2 bg-canvas border border-border rounded-lg">
                  <div className={cn("w-7 h-7 rounded-full text-[10px] font-semibold flex items-center justify-center shrink-0", d.activePlaced > 0 ? "bg-green/15 text-green" : "bg-card-elev text-text-subtle")}>
                    {d.name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-text m-0 truncate">{d.name}</p>
                    <p className="text-[9px] text-text-subtle m-0">
                      {d.activePlaced > 0 ? `${formatPHP(d.activePlaced, { short: true })} active · ${d.placements} placement${d.placements === 1 ? "" : "s"}` : "No active placement"}
                      {d.joinedAt ? ` · joined ${new Date(d.joinedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}` : ""}
                    </p>
                  </div>
                  {d.pendingLockedBonus > 0 && (
                    <span className="text-[9px] text-gold font-mono shrink-0" title="Your Leadership Bonus when their term completes">
                      +{formatPHP((d.pendingLockedBonus * stats.leadershipPct) / 100, { short: true })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* History */}
        <Card>
          <CardHeader title="Commission history" subtitle="Everything paid to your wallet from your team" />
          {commissions.length === 0 ? (
            <p className="text-[11px] text-text-subtle m-0">Nothing yet — commissions appear here when someone in your team places capital.</p>
          ) : (
            <div className="flex flex-col gap-1 max-h-[360px] overflow-y-auto">
              {commissions.map((c) => (
                <div key={c.id} className="flex items-center gap-2 px-3 py-2 bg-canvas border border-border rounded-lg">
                  <span className={cn("text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0", TYPE_TONE[c.type])}>
                    {c.type === "level" ? `L${c.level}` : TYPE_LABEL[c.type]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-text m-0 truncate">
                      {c.fromUserName} <span className="text-text-subtle">· {c.placementId}</span>
                    </p>
                    <p className="text-[9px] text-text-subtle m-0 truncate">
                      {new Date(c.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                      {/* Leadership is a % of the direct's Locked-In Bonus, not of their placement. */}
                      {c.pct
                        ? c.type === "leadership"
                          ? ` · ${c.pct}% of ${formatPHP((c.amount * 100) / c.pct, { short: true })} Locked-In Bonus`
                          : ` · ${c.pct}% of ${formatPHP(c.placementAmount ?? 0, { short: true })}`
                        : ""}
                      {c.status === "skipped" && <span className="text-red"> · not paid: {c.reason}</span>}
                    </p>
                  </div>
                  <span className={cn("text-[11px] font-mono shrink-0", c.status === "paid" ? "text-green" : "text-text-subtle line-through")}>+{formatPHP(c.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <p className="text-[9px] text-text-subtle mt-3 m-0 flex items-center gap-1.5">
        <ShieldCheck className="w-3 h-3" /> All commissions and bonuses are credited directly to your wallet — nothing to claim or release.
      </p>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, tone }: { icon: typeof Users; label: string; value: string; sub?: string; tone: "text" | "green" | "gold" | "vault" }) {
  const color = tone === "green" ? "text-green" : tone === "gold" ? "text-gold" : tone === "vault" ? "text-vault" : "text-text";
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("w-3.5 h-3.5", color)} />
        <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0">{label}</p>
      </div>
      <p className={cn("text-[18px] font-mono font-medium m-0 tabular-nums", color)}>{value}</p>
      {sub && <p className="text-[9px] text-text-subtle m-0 mt-0.5">{sub}</p>}
    </Card>
  );
}
