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

// Decorative ambient sea life drifting across the scene.
const AMBIENT = [
  { emoji: "🐟", top: "22%", dur: 26, delay: 0, size: 20 },
  { emoji: "🐠", top: "42%", dur: 34, delay: 6, size: 26, rev: true },
  { emoji: "🐡", top: "62%", dur: 30, delay: 12, size: 22 },
  { emoji: "🐟", top: "74%", dur: 40, delay: 3, size: 16, rev: true },
];
const SEABED = ["🪸", "🌿", "🐚", "🪸", "🌿", "🪨", "🌿", "🪸"];
const BUBBLES = Array.from({ length: 16 });

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
  const [isNewCatch, setIsNewCatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyQuest, setBusyQuest] = useState<string | null>(null);

  const fishById = useMemo(() => new Map(fish.map((f) => [f.id, f])), [fish]);
  const emojiFor = (id: string) => fishById.get(id)?.emoji ?? "🐟";
  const rarityMeta = (rarityId: string) =>
    config.rarities.find((r) => r.id === rarityId) ?? config.rarities[0];

  const today = manilaDay();
  const energy = state?.energy ?? config.dailyEnergy;
  const points = state?.points ?? 0;
  const streak = state?.streak ?? 0;
  const questsToday =
    state?.quests?.day === today ? state.quests : { day: today, progress: {}, claimed: {} };

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
      const hadBefore = !!state?.collection;
      const res = await castLine();
      setIsNewCatch(!hadBefore || !state?.collection?.[res.fish.id]);
      // brief line-drop beat before the reveal pops
      setTimeout(() => setReveal(res), 550);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cast failed");
    } finally {
      setTimeout(() => setCasting(false), 550);
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

      {error && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-3">
        {([
          ["cast", "Fishing", FishIcon],
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
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3">
          {/* ===== The underwater scene ===== */}
          <div
            className="relative overflow-hidden rounded-2xl border border-border-strong min-h-[440px] flex flex-col"
            style={{
              background:
                "linear-gradient(180deg,#0e4657 0%,#0b3049 38%,#071f36 72%,#05121f 100%)",
            }}
          >
            {/* light rays */}
            {[12, 34, 58, 80].map((left, i) => (
              <div
                key={i}
                className="absolute -top-10 w-24 h-[130%] pointer-events-none"
                style={{
                  left: `${left}%`,
                  background:
                    "linear-gradient(180deg, rgba(180,255,235,0.35), transparent 70%)",
                  transform: "rotate(14deg)",
                  filter: "blur(6px)",
                  animation: `reef-ray ${7 + i}s ease-in-out ${i}s infinite`,
                }}
              />
            ))}

            {/* ambient fish */}
            {AMBIENT.map((a, i) => (
              <span
                key={i}
                className="absolute select-none pointer-events-none opacity-40"
                style={{
                  top: a.top,
                  left: 0,
                  fontSize: a.size,
                  animation: `${a.rev ? "reef-swim-rev" : "reef-swim"} ${a.dur}s linear ${a.delay}s infinite`,
                }}
                aria-hidden
              >
                {a.emoji}
              </span>
            ))}

            {/* bubbles */}
            {BUBBLES.map((_, i) => {
              const size = 4 + (i % 5) * 3;
              return (
                <span
                  key={i}
                  className="absolute rounded-full bg-white/20 pointer-events-none"
                  style={{
                    bottom: 40,
                    left: `${(i * 6.5 + 4) % 96}%`,
                    width: size,
                    height: size,
                    animation: `reef-bubble ${5 + (i % 6)}s linear ${(i % 7) * 0.9}s infinite`,
                  }}
                  aria-hidden
                />
              );
            })}

            {/* HUD chips */}
            <div className="relative z-10 flex items-start justify-between p-3">
              <HudChip icon={<Zap className="w-3.5 h-3.5 text-gold" />} label="Energy" value={`${energy}/${config.dailyEnergy}`} />
              <HudChip icon={<Sparkles className="w-3.5 h-3.5 text-vault" />} label="Points" value={points.toLocaleString()} accent />
              <HudChip icon={<Flame className="w-3.5 h-3.5 text-gold" />} label="Streak" value={`${streak}`} />
            </div>

            {/* fish of the hour banner */}
            {fothActive && (
              <div className="relative z-10 mx-3 -mt-1 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/35 backdrop-blur-sm border border-border-gold self-center">
                <span className="text-base">{emojiFor(foth!.fishId)}</span>
                <span className="text-[10px] text-gold font-medium">
                  Fish of the hour: {foth!.fishName} · {Math.max(0, Math.round((foth!.endsAt - Date.now()) / 60000))}m left
                </span>
              </div>
            )}

            {/* fishing line + bobber */}
            <div className="relative z-[5] flex-1 flex justify-center">
              <div
                className="absolute top-0 w-px bg-white/25"
                style={{ height: casting ? "72%" : "46%", transition: "height 0.5s cubic-bezier(0.4,0,0.2,1)" }}
              />
              <div
                className="absolute -translate-x-1/2 left-1/2"
                style={{
                  top: casting ? "70%" : "44%",
                  transition: "top 0.5s cubic-bezier(0.4,0,0.2,1)",
                  animation: casting ? "none" : "reef-bob 2.6s ease-in-out infinite",
                }}
              >
                <div className="w-3.5 h-3.5 rounded-full bg-gold shadow-[0_0_10px_rgba(61,213,152,0.7)] border-2 border-white/70" />
                {casting && (
                  <span
                    className="absolute left-1/2 top-3 w-10 h-2 rounded-[50%] border border-white/40"
                    style={{ animation: "reef-ripple 0.6s ease-out" }}
                  />
                )}
              </div>
            </div>

            {/* seabed */}
            <div className="relative z-[4] flex items-end justify-around px-2 pb-2 h-12 pointer-events-none">
              {SEABED.map((s, i) => (
                <span
                  key={i}
                  className="select-none opacity-60"
                  style={{
                    fontSize: 20 + (i % 3) * 6,
                    transformOrigin: "bottom center",
                    animation: `reef-sway ${3 + (i % 4)}s ease-in-out ${i * 0.3}s infinite`,
                  }}
                  aria-hidden
                >
                  {s}
                </span>
              ))}
            </div>

            {/* cast button */}
            <div className="relative z-10 flex flex-col items-center pb-5 pt-1">
              <div className="relative">
                <span
                  className="absolute inset-0 rounded-full bg-gold/40 blur-md"
                  style={{ animation: "reef-glow-pulse 2.4s ease-in-out infinite" }}
                  aria-hidden
                />
                <button
                  onClick={doCast}
                  disabled={casting || energy <= 0}
                  className="relative px-9 py-3.5 bg-gold text-gold-dark rounded-full text-[15px] font-semibold flex items-center gap-2 hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-black/40"
                >
                  {casting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Reeling…
                    </>
                  ) : energy <= 0 ? (
                    "Out of energy"
                  ) : (
                    <>
                      🎣 Cast a line
                    </>
                  )}
                </button>
              </div>
              <p className="text-[10px] text-white/60 mt-2 m-0">{energy} casts left today</p>
            </div>
          </div>

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
        <CollectionBook fish={fish} rarities={config.rarities} caught={state?.collection ?? {}} />
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
                      "w-6 text-center text-[13px]",
                      i > 2 && "font-mono text-text-subtle text-[12px]"
                    )}
                  >
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
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
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setReveal(null)}
          >
            <motion.div
              initial={{ scale: 0.5, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 240, damping: 16 }}
              className="relative flex flex-col items-center text-center"
              onClick={(e) => e.stopPropagation()}
            >
              {/* rarity rays behind the fish */}
              <div
                className="absolute -z-10 w-72 h-72 rounded-full"
                style={{
                  background: `conic-gradient(from 0deg, ${reveal.rarity.color}00, ${reveal.rarity.color}55, ${reveal.rarity.color}00, ${reveal.rarity.color}55, ${reveal.rarity.color}00)`,
                  filter: "blur(2px)",
                  animation: "reef-spin 9s linear infinite",
                  opacity: 0.55,
                }}
              />
              <div
                className="absolute -z-10 w-52 h-52 rounded-full"
                style={{ background: `radial-gradient(circle, ${reveal.rarity.color}44, transparent 70%)` }}
              />

              {reveal.isFoth && (
                <p className="text-[11px] text-gold m-0 mb-1 font-semibold tracking-wide">🔥 FISH OF THE HOUR</p>
              )}
              {isNewCatch && (
                <span className="mb-2 text-[9px] font-bold px-2 py-0.5 rounded-full bg-gold text-gold-dark tracking-wider">
                  NEW SPECIES!
                </span>
              )}

              <motion.div
                className="text-[96px] leading-none select-none"
                initial={{ rotate: -8 }}
                animate={{ rotate: [-8, 6, -4, 0] }}
                transition={{ duration: 0.7 }}
                aria-hidden
              >
                {emojiFor(reveal.fish.id)}
              </motion.div>

              <p
                className="text-[11px] uppercase tracking-[0.2em] m-0 mt-1 font-semibold"
                style={{ color: reveal.rarity.color, textShadow: `0 0 12px ${reveal.rarity.color}` }}
              >
                {rarityMeta(reveal.fish.rarity).label}
              </p>
              <p className="text-[22px] font-medium m-0 mt-0.5 text-white" style={{ fontFamily: "var(--font-display)" }}>
                {reveal.fish.name}
              </p>
              <p className="text-[15px] font-mono text-gold mt-2 m-0">+{reveal.gained} points</p>
              {reveal.streakBonus > 0 && (
                <p className="text-[10px] text-white/70 m-0 mt-1">includes +{reveal.streakBonus} streak bonus 🔥</p>
              )}

              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setReveal(null)}
                  className="px-5 py-2 bg-white/10 border border-white/20 text-white rounded-lg text-[12px] hover:bg-white/15 transition"
                >
                  Nice!
                </button>
                {energy > 0 && (
                  <button
                    onClick={() => {
                      setReveal(null);
                      setTimeout(doCast, 120);
                    }}
                    className="px-5 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium hover:brightness-110 transition"
                  >
                    Cast again 🎣
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HudChip({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/35 backdrop-blur-sm border",
        accent ? "border-border-vault" : "border-white/10"
      )}
    >
      {icon}
      <div className="leading-none">
        <p className="text-[8px] text-white/50 uppercase tracking-wider m-0">{label}</p>
        <p className={cn("text-[12px] font-mono font-medium m-0 mt-0.5", accent ? "text-vault" : "text-white")}>
          {value}
        </p>
      </div>
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
              <p
                className="text-[10px] uppercase tracking-wider m-0 mb-2 font-medium"
                style={{ color: r.color }}
              >
                {r.label}
              </p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {group.map((f) => {
                  const have = caught[f.id];
                  return (
                    <div
                      key={f.id}
                      className={cn(
                        "aspect-square rounded-lg border flex flex-col items-center justify-center gap-0.5 relative transition",
                        have ? "bg-canvas" : "bg-card-elev/40 opacity-40"
                      )}
                      style={{
                        borderColor: have ? `${r.color}66` : undefined,
                        boxShadow: have ? `0 0 14px -4px ${r.color}88` : undefined,
                      }}
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
