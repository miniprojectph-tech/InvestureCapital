"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Coins, Flame, Gift, Loader2, Lock, Fish, Spade, Dices } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card } from "@/components/Card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useGameAccess } from "@/lib/useGameAccess";
import {
  useGameState,
  useGameConfig,
  useGamesSettings,
  useFish,
  useLeaderboard,
  claimDailyEnergy,
  effectiveDailyCredits,
} from "@/lib/game";
import { useOpenRooms, MIN_CHALLENGE } from "@/lib/tongits";
import { rankTier, useMyMatchHistory } from "@/lib/tongits-social";
import { useColorGameState, useCurrentRound, useColorLeaderboard } from "@/lib/colorgame";
import { useRewards } from "@/lib/rewards";

const HOUR_MS = 3_600_000;
function manilaDay(ts = Date.now()): string {
  return new Date(ts + 8 * HOUR_MS).toISOString().slice(0, 10);
}
/** Time left until Monday 00:00 Manila — when weeklyReef pays the prizes. */
function untilWeeklyReset(now: number): string {
  const d = new Date(now + 8 * HOUR_MS);
  const dow = d.getUTCDay();
  const daysLeft = dow === 0 ? 1 : dow === 1 ? 7 : 8 - dow;
  const into = ((d.getUTCHours() * 60 + d.getUTCMinutes()) * 60 + d.getUTCSeconds()) * 1000;
  const left = daysLeft * 86_400_000 - into;
  const days = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / HOUR_MS);
  const m = Math.floor((left % HOUR_MS) / 60_000);
  return days > 0 ? `${days}d ${h}h` : `${h}h ${m}m`;
}
/** Start of the current Manila week (Monday 00:00), for "this week" sums. */
function weekStartMs(now: number): number {
  const d = new Date(now + 8 * HOUR_MS);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 8 * HOUR_MS;
  return midnight - dow * 86_400_000;
}

const mono = "font-mono tabular-nums";

export default function GamesHubPage() {
  const { user } = useAuth();
  const access = useGameAccess();
  const { state, loading: stateLoading, patchState } = useGameState();
  const { config } = useGameConfig();
  const { settings } = useGamesSettings();
  const { fish } = useFish();
  const { rows: leaders, loading: leadersLoading } = useLeaderboard(20);
  const { rooms: openRooms } = useOpenRooms();
  const { rows: matches } = useMyMatchHistory(100);
  const colorState = useColorGameState();
  const { live, timer } = useCurrentRound();
  const colorLeaders = useColorLeaderboard(200);
  const { rewards } = useRewards();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const points = state?.points ?? 0;
  const dailyCredits = effectiveDailyCredits(config.dailyEnergy, settings.universalDailyCredits);
  const today = manilaDay(now);
  const energyClaimed = state?.energyClaimedDay === today;
  const streak = state?.streak ?? 0;
  const streakLen = Math.max(1, config.streakBonus.length - 1);
  const nextStreakBonus = config.streakBonus[Math.min(streak + 1, config.streakBonus.length - 1)] ?? 0;

  // Reef
  const myRankIdx = leaders.findIndex((r) => r.uid === user?.uid);
  const myRank = myRankIdx >= 0 ? myRankIdx + 1 : null;
  const collectionCount = state?.collection ? Object.keys(state.collection).length : 0;
  const totalFish = fish.filter((f) => f.active !== false).length;

  // Tongits
  const tier = rankTier(state?.rankingPoints ?? 0);
  const wins = state?.tongitsWins ?? 0;
  const losses = state?.tongitsLosses ?? 0;
  const publicOpen = openRooms.filter((r) => !r.isPrivate).length;
  const wkStart = weekStartMs(now);
  const tongitsWeekNet = useMemo(
    () => matches.filter((m) => m.createdAt >= wkStart).reduce((s, m) => s + (m.pointsEarned ?? 0) - (m.pointsLost ?? 0), 0),
    [matches, wkStart]
  );

  // Color Game
  const colorMine = colorLeaders.find((r) => r.uid === user?.uid);
  const roundLabel =
    timer.phase === "betting"
      ? `Betting · ${Math.ceil(timer.remaining / 1000)}s`
      : timer.phase === "rolling"
        ? "Rolling…"
        : `Next round in ${Math.ceil(timer.remaining / 1000)}s`;

  // Rewards
  const activeRewards = rewards.filter((r) => r.active && (r.stock == null || r.stock > 0));
  const affordable = activeRewards.filter((r) => r.cost <= points).sort((a, b) => b.cost - a.cost)[0];
  const nearest = affordable ?? activeRewards.slice().sort((a, b) => a.cost - b.cost).find((r) => r.cost > points);
  const nearestPct = nearest ? Math.min(100, Math.round((points / nearest.cost) * 100)) : 0;

  async function onClaim() {
    if (claiming || energyClaimed) return;
    setClaiming(true);
    setClaimError(null);
    try {
      const { energy } = await claimDailyEnergy();
      patchState({ energy, energyClaimedDay: today });
    } catch (e: unknown) {
      setClaimError(e instanceof Error ? e.message : "Could not claim right now.");
    } finally {
      setClaiming(false);
    }
  }

  if (access.loading || stateLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
      </div>
    );
  }

  const locked = !access.allowed;
  const prizes = config.leaderboardPrizes;
  const prizePool = prizes.reduce((s, p) => s + p, 0);

  return (
    <div>
      <TopHeader title="Games" subtitle="Play, earn Game Points, redeem rewards." />

      {/* hero banner: balance + daily bonus over the games key art */}
      <div className="relative rounded-2xl overflow-hidden border border-border mb-3 p-3 sm:p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/games/games-hero.webp" alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-canvas/40 via-canvas/55 to-canvas/85" />
        <div className="relative grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-3">
        <Link
          href="/rewards"
          className="flex items-center gap-3 rounded-xl bg-card/85 backdrop-blur-sm border border-border-gold px-4 py-3 hover:bg-card-elev transition-colors"
        >
          <span className="w-9 h-9 rounded-lg bg-gold/15 flex items-center justify-center shrink-0">
            <Coins className="w-4 h-4 text-gold" />
          </span>
          <span className="flex flex-col">
            <span className={cn(mono, "text-[20px] leading-none text-text font-medium")}>{points.toLocaleString()}</span>
            <span className="text-[10px] uppercase tracking-wide text-text-subtle mt-1">Game Points · Rewards shop</span>
          </span>
        </Link>

        <Card className="bg-card/85 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="w-9 h-9 rounded-lg bg-[#F59E0B]/15 flex items-center justify-center shrink-0">
                <Flame className="w-4 h-4 text-[#F59E0B]" />
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-text">Daily bonus</div>
                <div className="text-[11px] text-text-muted truncate">
                  {streak > 0 ? `Day ${streak} streak` : "Start a streak today"}
                  {nextStreakBonus > 0 ? ` · +${nextStreakBonus} bonus per catch tomorrow` : ""}
                </div>
              </div>
            </div>
            <div className="flex gap-1 flex-1 min-w-[120px]">
              {Array.from({ length: streakLen }).map((_, i) => (
                <span key={i} className={cn("flex-1 h-[6px] rounded-full", i < Math.min(streak, streakLen) ? "bg-gold" : "bg-border")} />
              ))}
            </div>
            <button
              onClick={onClaim}
              disabled={locked || energyClaimed || claiming}
              className={cn(
                "shrink-0 px-4 py-2 rounded-full text-[12px] font-semibold transition-colors",
                energyClaimed ? "bg-card-elev text-text-subtle" : "bg-gold text-canvas hover:brightness-110 disabled:opacity-60"
              )}
            >
              {claiming ? "Claiming…" : energyClaimed ? `Claimed · ${state?.energy ?? 0} casts left` : `Claim ${dailyCredits} casts`}
            </button>
          </div>
          {claimError && <p className="text-[11px] text-red m-0 mt-2">{claimError}</p>}
        </Card>
        </div>
      </div>

      {locked && (
        <Card className="mb-3">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-gold/10 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-gold" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-text">Games are locked</div>
              <div className="text-[11px] text-text-muted">{access.reason}</div>
            </div>
            <Link href="/plans" className="text-[12px] font-semibold text-gold hover:underline shrink-0">View plans</Link>
          </div>
        </Card>
      )}

      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.14em] text-text-subtle">Choose a game</div>
        {!locked && <div className="text-[10px] text-text-subtle">Unlocked by your active placement</div>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <GameCard
          href="/play"
          cover="/games/reef-cover.webp"
          locked={locked}
          icon={Fish}
          tint="#5CE0D2"
          name="Investure Reef"
          blurb="Cast, reel, collect. Every catch counts toward the weekly board."
          pill="Weekly prizes Mon"
          hero={
            <>
              {state?.energy ?? 0} <span className="text-[14px] text-text-subtle">/ {dailyCredits}</span>
            </>
          }
          heroLabel="Casts left today"
          stats={[
            { v: myRank ? `#${myRank}` : (state?.weeklyScore ?? 0) > 0 ? "20+" : "—", l: "This week" },
            { v: (state?.weeklyScore ?? 0).toLocaleString(), l: "Score" },
            { v: totalFish ? `${collectionCount} / ${totalFish}` : `${collectionCount}`, l: "Collection" },
          ]}
          cta="Go fishing"
        />
        <GameCard
          href="/tongits"
          cover="/games/tongits-cover.webp"
          locked={locked}
          icon={Spade}
          tint="#7FADFF"
          name="Tongits"
          blurb="3-player card game. Stake GP, win the pot, climb the ranks."
          pill={publicOpen > 0 ? `${publicOpen} table${publicOpen === 1 ? "" : "s"} open` : "Open a table"}
          pillLive={publicOpen > 0}
          hero={tier.name}
          heroLabel={tier.nextAt ? `Your rank · ${(tier.nextAt - (state?.rankingPoints ?? 0)).toLocaleString()} RP to next` : "Your rank · top tier"}
          stats={[
            { v: `${wins} – ${losses}`, l: "Win – loss" },
            { v: `${MIN_CHALLENGE} GP`, l: "Min stake" },
            { v: `${tongitsWeekNet >= 0 ? "+" : ""}${tongitsWeekNet.toLocaleString()}`, l: "This week" },
          ]}
          cta="Find a table"
        />
        <GameCard
          href="/color-game"
          cover="/games/color-cover.webp"
          locked={locked}
          icon={Dices}
          tint="#FF8DB4"
          name="Color Game"
          blurb="Pick a colour, three dice roll every 29 seconds. Hit all three for the jackpot."
          pill={roundLabel}
          pillLive
          hero={
            <>
              {colorState.jackpotPool.toLocaleString()} <span className="text-[14px] text-text-subtle">GP</span>
            </>
          }
          heroLabel="Jackpot right now"
          stats={[
            { v: `${live?.totalBettors ?? 0}`, l: "Playing now" },
            { v: "5 – 500", l: "Bet range" },
            { v: colorMine ? `${colorMine.totalWon >= 0 ? "+" : ""}${colorMine.totalWon.toLocaleString()}` : "—", l: "All-time net" },
          ]}
          cta="Place a bet"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3">
        {/* Reef weekly ranking */}
        <Card>
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-[13px] font-medium text-text">Reef weekly ranking</div>
            <Link href="/play" className="text-[11px] text-gold hover:underline">Open the game</Link>
          </div>
          <p className="text-[11px] text-text-muted m-0 mb-3">
            Top {prizes.length} share <span className={cn(mono, "text-gold")}>{prizePool.toLocaleString()} GP</span> every Monday · resets in {untilWeeklyReset(now)}
          </p>
          {leadersLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-text-subtle" /></div>
          ) : leaders.length === 0 ? (
            <p className="text-[11px] text-text-subtle text-center py-6 m-0">Nobody has scored yet this week. First cast takes the lead!</p>
          ) : (
            <div className="flex flex-col gap-1">
              {leaders.slice(0, 5).map((r, i) => (
                <RankRow key={r.uid} rank={i + 1} name={r.name || "Angler"} score={r.weeklyScore} right={prizes[i] ? `+${prizes[i]} GP` : ""} me={r.uid === user?.uid} />
              ))}
              {myRank && myRank > 5 && (
                <RankRow rank={myRank} name="You" score={state?.weeklyScore ?? 0} right={prizes[myRank - 1] ? `+${prizes[myRank - 1]} GP` : `${Math.max(0, (leaders[4]?.weeklyScore ?? 0) - (state?.weeklyScore ?? 0) + 1).toLocaleString()} to #5`} me />
              )}
              {!myRank && (state?.weeklyScore ?? 0) > 0 && (
                <RankRow rank={null} name="You" score={state?.weeklyScore ?? 0} right="below #20" me />
              )}
            </div>
          )}
        </Card>

        {/* Nearest reward */}
        <Card gold>
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-lg bg-gold/15 flex items-center justify-center shrink-0">
              <Gift className="w-5 h-5 text-gold" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.12em] text-text-subtle">Nearest reward</div>
              {nearest ? (
                <>
                  <div className="text-[13px] font-medium text-text truncate">
                    {nearest.name} · <span className={cn(mono, "text-text-muted font-normal")}>{nearest.cost.toLocaleString()} GP</span>
                  </div>
                  <div className="h-[5px] bg-border rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-gold rounded-full" style={{ width: `${nearestPct}%` }} />
                  </div>
                  <div className="text-[11px] text-text-muted mt-1">
                    {affordable ? "You have enough." : `${(nearest.cost - points).toLocaleString()} GP to go.`}
                  </div>
                </>
              ) : (
                <div className="text-[12px] text-text-muted">No rewards listed yet.</div>
              )}
            </div>
            <Link
              href="/rewards"
              className={cn(
                "shrink-0 px-4 py-2 rounded-full text-[12px] font-semibold transition-colors",
                affordable ? "bg-gold text-canvas hover:brightness-110" : "border border-border-strong text-text hover:bg-card-elev"
              )}
            >
              {affordable ? "Redeem" : "All rewards"}
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function GameCard({
  href, cover, locked, icon: Icon, tint, name, blurb, pill, pillLive, hero, heroLabel, stats, cta,
}: {
  href: string;
  cover: string;
  locked: boolean;
  icon: typeof Fish;
  tint: string;
  name: string;
  blurb: string;
  pill: string;
  pillLive?: boolean;
  hero: React.ReactNode;
  heroLabel: string;
  stats: { v: string; l: string }[];
  cta: string;
}) {
  const inner = (
    <>
      {/* key art band: icon badge top-left, live pill top-right, fades into the card */}
      <div className="relative aspect-[16/9] -mx-4 -mt-4 mb-3 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-card" />
        <div className="absolute inset-x-4 top-4 flex items-start justify-between">
          <span className="w-11 h-11 rounded-xl flex items-center justify-center backdrop-blur-sm" style={{ background: `${tint}33`, boxShadow: `0 0 0 1px ${tint}55` }}>
            <Icon className="w-5 h-5" style={{ color: tint }} />
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-canvas/70 backdrop-blur-sm" style={{ color: tint, boxShadow: `0 0 0 1px ${tint}55` }}>
            {pillLive && <span className="w-1.5 h-1.5 rounded-full" style={{ background: tint }} />}
            {pill}
          </span>
        </div>
      </div>
      <div className="text-[16px] font-medium text-text">{name}</div>
      <p className="text-[11.5px] text-text-muted leading-snug m-0 mt-1 mb-4">{blurb}</p>
      <div className={cn(mono, "text-[28px] leading-none font-medium")} style={{ color: tint }}>{hero}</div>
      <div className="text-[9.5px] uppercase tracking-[0.1em] text-text-subtle mt-1 mb-3">{heroLabel}</div>
      <div className="flex gap-4 pt-3 border-t border-border mb-3">
        {stats.map((s) => (
          <div key={s.l} className="flex flex-col min-w-0">
            <span className={cn(mono, "text-[13px] text-text truncate")}>{s.v}</span>
            <span className="text-[9px] uppercase tracking-[0.08em] text-text-subtle">{s.l}</span>
          </div>
        ))}
      </div>
      <span
        className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[12px] font-semibold"
        style={{ background: `${tint}24`, color: tint }}
      >
        {locked ? <><Lock className="w-3.5 h-3.5" /> Locked</> : <>{cta} <ArrowRight className="w-3.5 h-3.5" /></>}
      </span>
    </>
  );
  const cls = "relative overflow-hidden rounded-xl bg-card border border-border p-4 block transition-colors";
  if (locked) return <div className={cn(cls, "opacity-70")}>{inner}</div>;
  return (
    <Link href={href} className={cn(cls, "hover:bg-card-elev")}>
      {inner}
    </Link>
  );
}

function RankRow({ rank, name, score, right, me }: { rank: number | null; name: string; score: number; right: string; me?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 px-2 py-1.5 rounded-lg text-[12px]", me ? "bg-gold/10 border border-gold/30" : "bg-canvas")}>
      <span className={cn(mono, "w-6 text-text-subtle", rank === 1 && "text-[#F5C66B]", me && "text-gold")}>{rank ?? "—"}</span>
      <span className={cn("flex-1 truncate", me ? "text-gold font-medium" : "text-text")}>{name}</span>
      <span className={cn(mono, "text-text")}>{score.toLocaleString()}</span>
      <span className={cn(mono, "w-16 text-right text-[11px]", right.startsWith("+") ? "text-[#5CE0D2]" : "text-text-subtle")}>{right}</span>
    </div>
  );
}
