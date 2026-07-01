"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Zap,
  Trophy,
  Fish as FishIcon,
  Flame,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  useGameState,
  useGameConfig,
  useFish,
  useFishOfHour,
  useLeaderboard,
  castLine,
  claimQuest,
  type CastResult,
} from "@/lib/game";

type Tab = "cast" | "collection" | "leaderboard";

function manilaDay(ts = Date.now()): string {
  return new Date(ts + 8 * 3_600_000).toISOString().slice(0, 10);
}

export default function PlayPage() {
  const { user, demoMode } = useAuth();
  const { state, loading } = useGameState();
  const { config } = useGameConfig();
  const { fish } = useFish();
  const foth = useFishOfHour();
  const { rows: leaderboard } = useLeaderboard();

  const [tab, setTab] = useState<Tab>("cast");
  const [casting, setCasting] = useState(false);
  const [reveal, setReveal] = useState<CastResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyQuest, setBusyQuest] = useState<string | null>(null);

  const fishById = useMemo(() => {
    const m = new Map(fish.map((f) => [f.id, f]));
    return m;
  }, [fish]);

  const emojiFor = (id: string) => fishById.get(id)?.emoji ?? "🐟";
  const rarityMeta = (rarityId: string) =>
    config.rarities.find((r) => r.id === rarityId) ?? config.rarities[0];

  const today = manilaDay();
  const energy = state?.energy ?? config.dailyEnergy;
  const points = state?.points ?? 0;
  const streak = state?.streak ?? 0;
  const questsToday = state?.quests?.day === today ? state.quests : { day: today, progress: {}, claimed: {} };

  async function doCast() {
    if (demoMode) {
      setError("Casting isn't available in demo mode — sign in to play.");
      return;
    }
    if (energy <= 0) {
      setError("Out of energy — come back tomorrow!");
      return;
    }
    setCasting(true);
    setError(null);
    try {
      const res = await castLine();
      setReveal(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cast failed");
    } finally {
      setCasting(false);
    }
  }

  async function doClaim(questId: string) {
    setBusyQuest(questId);
    setError(null);
    try {
      await claimQuest(questId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setBusyQuest(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
      </div>
    );
  }

  const fothActive = foth && foth.endsAt > Date.now();

  return (
    <div>
      <TopHeader title="Investure Reef" subtitle="Cast a line · collect fish · earn points" />

      {/* Top stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Card className="lift">
          <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0 mb-1 flex items-center gap-1">
            <Zap className="w-3 h-3 text-gold" /> Energy
          </p>
          <p className="text-[18px] font-mono font-medium m-0 tabular-nums">
            {energy}
            <span className="text-text-subtle text-[12px]">/{config.dailyEnergy}</span>
          </p>
        </Card>
        <Card className="lift">
          <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0 mb-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-vault" /> Points
          </p>
          <p className="text-[18px] font-mono font-medium m-0 tabular-nums text-vault">{points.toLocaleString()}</p>
        </Card>
        <Card className="lift">
          <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0 mb-1 flex items-center gap-1">
            <Flame className="w-3 h-3 text-gold" /> Streak
          </p>
          <p className="text-[18px] font-mono font-medium m-0 tabular-nums">{streak}🔥</p>
        </Card>
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Fish of the hour banner */}
      {fothActive && (
        <div className="mb-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-gold/15 to-vault/10 border border-border-gold">
          <span className="text-2xl">{emojiFor(foth!.fishId)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium m-0">
              🔥 Fish of the hour: {foth!.fishName}
            </p>
            <p className="text-[10px] text-text-subtle m-0 mt-0.5">
              Boosted catch chance · ends in {Math.max(0, Math.round((foth!.endsAt - Date.now()) / 60000))}m
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-3">
        {([
          ["cast", "Cast", FishIcon],
          ["collection", "Collection", Sparkles],
          ["leaderboard", "Leaderboard", Trophy],
        ] as [Tab, string, typeof FishIcon][]).map(([t, label, Icon]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-[12px] transition",
              tab === t
                ? "bg-gold/15 border-border-gold text-gold font-medium"
                : "bg-card border-border text-text-muted hover:text-text"
            )}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === "cast" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3">
          {/* Cast panel */}
          <Card className="flex flex-col items-center justify-center py-10 relative overflow-hidden">
            <div className="text-[64px] mb-2 select-none" aria-hidden>
              🎣
            </div>
            <p className="text-[12px] text-text-muted m-0 mb-5 text-center max-w-[240px]">
              Every cast could land a Mythic. You have{" "}
              <span className="text-gold font-medium">{energy}</span> casts left today.
            </p>
            <button
              onClick={doCast}
              disabled={casting || energy <= 0}
              className="px-8 py-3 bg-gold text-gold-dark rounded-xl text-[14px] font-medium flex items-center gap-2 hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {casting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Casting…
                </>
              ) : (
                <>
                  <FishIcon className="w-4 h-4" /> Cast a line
                </>
              )}
            </button>
          </Card>

          {/* Daily quests */}
          <Card>
            <CardHeader title="Daily quests" subtitle="Reset every day" />
            <div className="flex flex-col gap-2">
              {config.quests.map((q) => {
                const progress = questsToday.progress?.[q.id] ?? 0;
                const claimed = !!questsToday.claimed?.[q.id];
                const done = progress >= q.target;
                const pct = Math.min(100, (progress / q.target) * 100);
                return (
                  <div key={q.id} className="p-2.5 bg-canvas border border-border rounded-lg">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[11px]">{q.label}</span>
                      <span className="text-[10px] font-mono text-vault">+{q.reward}</span>
                    </div>
                    <div className="h-1 bg-border rounded-full mb-1.5">
                      <div className="h-full bg-gold rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] text-text-subtle font-mono">
                        {Math.min(progress, q.target)}/{q.target}
                      </span>
                      {claimed ? (
                        <span className="text-[9px] text-green flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Claimed
                        </span>
                      ) : (
                        <button
                          onClick={() => doClaim(q.id)}
                          disabled={!done || busyQuest === q.id || demoMode}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-gold/15 text-gold disabled:opacity-40"
                        >
                          {busyQuest === q.id ? "…" : "Claim"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {tab === "collection" && (
        <CollectionBook
          fish={fish}
          rarities={config.rarities}
          caught={state?.collection ?? {}}
        />
      )}

      {tab === "leaderboard" && (
        <Card>
          <CardHeader title="Weekly leaderboard" subtitle="Top anglers · resets Monday" />
          {leaderboard.length === 0 ? (
            <p className="text-[11px] text-text-subtle text-center py-8 m-0">
              No scores yet this week. Be the first to cast!
            </p>
          ) : (
            <div className="flex flex-col">
              {leaderboard.map((r, i) => (
                <div
                  key={r.uid}
                  className={cn(
                    "flex items-center gap-3 py-2",
                    i < leaderboard.length - 1 && "border-b border-border",
                    r.uid === user?.uid && "bg-gold/5 -mx-2 px-2 rounded"
                  )}
                >
                  <span
                    className={cn(
                      "w-6 text-center text-[12px] font-mono font-medium",
                      i === 0 ? "text-gold" : i === 1 ? "text-text" : i === 2 ? "text-vault" : "text-text-subtle"
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 text-[12px] truncate">{r.name}</span>
                  <span className="text-[12px] font-mono text-vault">{r.weeklyScore.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Reveal overlay */}
      <AnimatePresence>
        {reveal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setReveal(null)}
          >
            <motion.div
              initial={{ scale: 0.6, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="bg-card border rounded-2xl px-8 py-8 text-center max-w-[320px] w-full"
              style={{ borderColor: reveal.rarity.color }}
              onClick={(e) => e.stopPropagation()}
            >
              {reveal.isFoth && (
                <p className="text-[10px] text-gold m-0 mb-1 font-medium">🔥 FISH OF THE HOUR</p>
              )}
              <div className="text-[72px] leading-none mb-2 select-none" aria-hidden>
                {emojiFor(reveal.fish.id)}
              </div>
              <p
                className="text-[10px] uppercase tracking-widest m-0 mb-1 font-medium"
                style={{ color: reveal.rarity.color }}
              >
                {rarityMeta(reveal.fish.rarity).label}
              </p>
              <p className="text-[18px] font-medium m-0" style={{ fontFamily: "var(--font-display)" }}>
                {reveal.fish.name}
              </p>
              <p className="text-[13px] font-mono text-vault mt-2 m-0">+{reveal.gained} points</p>
              {reveal.streakBonus > 0 && (
                <p className="text-[10px] text-gold m-0 mt-1">includes +{reveal.streakBonus} streak bonus 🔥</p>
              )}
              <button
                onClick={() => setReveal(null)}
                className="mt-5 px-5 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium"
              >
                {energy > 0 ? "Nice!" : "Done"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CollectionBook({
  fish,
  rarities,
  caught,
}: {
  fish: { id: string; name: string; rarity: string; emoji?: string }[];
  rarities: { id: string; label: string; color: string }[];
  caught: Record<string, { count: number; firstAt: number }>;
}) {
  const totalCaught = fish.filter((f) => caught[f.id]).length;
  const pct = fish.length ? Math.round((totalCaught / fish.length) * 100) : 0;

  return (
    <Card>
      <CardHeader
        title="Collection book"
        subtitle={`${totalCaught} of ${fish.length} species · ${pct}% complete`}
      />
      {fish.length === 0 ? (
        <p className="text-[11px] text-text-subtle text-center py-8 m-0">
          No fish in the sea yet — the admin needs to stock the reef.
        </p>
      ) : (
        rarities.map((r) => {
          const group = fish.filter((f) => f.rarity === r.id);
          if (group.length === 0) return null;
          return (
            <div key={r.id} className="mb-4 last:mb-0">
              <p className="text-[10px] uppercase tracking-wider m-0 mb-2 font-medium" style={{ color: r.color }}>
                {r.label}
              </p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {group.map((f) => {
                  const have = caught[f.id];
                  return (
                    <div
                      key={f.id}
                      className={cn(
                        "aspect-square rounded-lg border flex flex-col items-center justify-center gap-0.5 relative",
                        have ? "bg-canvas border-border" : "bg-card-elev/40 border-border opacity-40"
                      )}
                      title={have ? `${f.name} ×${have.count}` : "Not yet caught"}
                    >
                      <span className="text-2xl select-none" aria-hidden>
                        {have ? f.emoji ?? "🐟" : "❔"}
                      </span>
                      <span className="text-[8px] text-text-subtle truncate max-w-full px-1">
                        {have ? f.name : "???"}
                      </span>
                      {have && have.count > 1 && (
                        <span className="absolute top-0.5 right-1 text-[8px] font-mono text-text-subtle">
                          ×{have.count}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </Card>
  );
}
