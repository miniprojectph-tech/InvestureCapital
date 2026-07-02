"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle, ChevronLeft, X } from "lucide-react";
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

type View = "cast" | "collection" | "leaderboard";
type Phase = "idle" | "charging" | "casting";

function manilaDay(ts = Date.now()): string {
  return new Date(ts + 8 * 3_600_000).toISOString().slice(0, 10);
}
function msToRefill(now: number): string {
  const d = new Date(now + 8 * 3_600_000);
  const into = ((d.getUTCHours() * 60 + d.getUTCMinutes()) * 60 + d.getUTCSeconds()) * 1000;
  const left = 86_400_000 - into;
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Tunable positions over the HUD art (% of the 1672×941 stage). Nudge if art shifts. ──
const HOT = {
  cast: "left-[83%] top-[75%] w-[15%] h-[23%]",
  quests: "left-[67.8%] top-[12.5%] w-[6%] h-[9.5%]",
  ranking: "left-[73.6%] top-[12.5%] w-[6%] h-[9.5%]",
  shop: "left-[79.4%] top-[12.5%] w-[6%] h-[9.5%]",
  gallery: "left-[0.5%] top-[16.5%] w-[15.5%] h-[67%]",
};

export default function PlayPage() {
  const router = useRouter();
  const { user, demoMode } = useAuth();
  const { state, loading } = useGameState();
  const { config } = useGameConfig();
  const { fish } = useFish();
  const foth = useFishOfHour();
  const { rows: leaderboard } = useLeaderboard();

  const [view, setView] = useState<View>("cast");
  const [questsOpen, setQuestsOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [meter, setMeter] = useState(0);
  const [castPower, setCastPower] = useState(0);
  const [reveal, setReveal] = useState<CastResult | null>(null);
  const [isNewCatch, setIsNewCatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyQuest, setBusyQuest] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());

  const meterRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const ambientRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    return () => {
      ambientRef.current?.pause();
      ambientRef.current = null;
    };
  }, []);

  const fishById = useMemo(() => new Map(fish.map((f) => [f.id, f])), [fish]);
  const rarityMeta = (rarityId: string) =>
    config.rarities.find((r) => r.id === rarityId) ?? config.rarities[0];
  const assets = config.assets ?? {};

  function creature(id: string, size: number) {
    const f = fishById.get(id);
    if (f?.image) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={f.image} alt={f.name} style={{ width: size, height: size }} className="object-contain inline-block" />;
    }
    return (
      <span style={{ fontSize: size * 0.9 }} aria-hidden>
        {f?.emoji ?? "🐟"}
      </span>
    );
  }

  function playSfx(url?: string, vol = 0.7) {
    if (!url) return;
    try {
      const a = new Audio(url);
      a.volume = vol;
      a.play().catch(() => {});
    } catch {
      /* ignore */
    }
  }
  function startAmbient() {
    if (!assets.ambientAudio || ambientRef.current) return;
    try {
      const a = new Audio(assets.ambientAudio);
      a.loop = true;
      a.volume = 0.3;
      a.play().catch(() => {});
      ambientRef.current = a;
    } catch {
      /* ignore */
    }
  }

  const today = manilaDay();
  const energy = state?.energy ?? config.dailyEnergy;
  const points = state?.points ?? 0;
  const streak = state?.streak ?? 0;
  const questsToday =
    state?.quests?.day === today ? state.quests : { day: today, progress: {}, claimed: {} };
  const claimable = config.quests.filter(
    (q) => (questsToday.progress?.[q.id] ?? 0) >= q.target && !questsToday.claimed?.[q.id]
  ).length;
  const totalCaught = fish.filter((f) => state?.collection?.[f.id]).length;

  function stopRaf() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }
  function startCharge() {
    if (phase !== "idle") return;
    if (demoMode) {
      setError("Casting isn't available in demo mode — sign in to play.");
      return;
    }
    if (energy <= 0) {
      setError("Out of energy — new casts tomorrow!");
      return;
    }
    setError(null);
    setPhase("charging");
    startRef.current = performance.now();
    const loop = (t: number) => {
      const phaseT = ((t - startRef.current) % 1200) / 1200;
      const tri = phaseT < 0.5 ? phaseT * 2 : (1 - phaseT) * 2;
      meterRef.current = tri;
      setMeter(tri);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }
  async function releaseCharge() {
    if (phase !== "charging") return;
    stopRaf();
    const power = meterRef.current;
    setCastPower(power);
    setPhase("casting");
    startAmbient();
    playSfx(assets.castSfx);
    const biteTimer = setTimeout(() => playSfx(assets.biteSfx), 950);
    try {
      const [res] = await Promise.all([castLine(power), wait(1400)]);
      clearTimeout(biteTimer);
      setIsNewCatch(!state?.collection?.[res.fish.id]);
      playSfx(assets.catchSfx);
      setReveal(res);
    } catch (e) {
      clearTimeout(biteTimer);
      setError(e instanceof Error ? e.message : "Cast failed");
    } finally {
      setPhase("idle");
      setMeter(0);
      meterRef.current = 0;
    }
  }
  useEffect(() => {
    if (phase !== "charging") return;
    const up = () => releaseCharge();
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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

  const fothActive = foth && foth.endsAt > clock;
  const revealRank = reveal ? config.rarities.findIndex((r) => r.id === reveal.fish.rarity) : -1;
  const legendaryIdx = config.rarities.findIndex((r) => r.id === "legendary");
  const highTierReveal = revealRank >= 0 && legendaryIdx >= 0 && revealRank >= legendaryIdx;
  const casting = phase === "casting";
  const charging = phase === "charging";
  const lureTop = casting ? 60 : 44;

  return (
    <div>
      <TopHeader title="Investure Reef" subtitle="Cast a line · collect fish · earn points" />

      {error && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {view === "cast" && (
        <div
          className="relative w-full mx-auto select-none rounded-2xl overflow-hidden border border-border-strong"
          style={{ aspectRatio: "1672 / 941" }}
        >
          {/* background */}
          {assets.bgFull ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assets.bgFull} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(180deg,#3aa0c9,#0c5f79 60%,#05121f)" }}
            />
          )}

          {/* line + lure + splash in the open center */}
          <div
            className="absolute left-1/2 top-0 w-px bg-white/50"
            style={{ height: `${lureTop}%`, transition: "height 0.6s cubic-bezier(0.4,0,0.2,1)" }}
          />
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              top: `${lureTop}%`,
              transition: "top 0.6s cubic-bezier(0.4,0,0.2,1)",
              animation: casting || charging ? "none" : "reef-bob 2.6s ease-in-out infinite",
            }}
          >
            {assets.lure ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={assets.lure} alt="" className="w-[4vw] max-w-[46px] object-contain" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full bg-gold border-2 border-white/80" />
            )}
            {casting && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={
                  castPower >= 0.9
                    ? "/reef/perfect-hook.webp"
                    : castPower < 0.4
                    ? "/reef/splash-small.webp"
                    : castPower < 0.75
                    ? "/reef/splash-medium.webp"
                    : "/reef/splash-large.webp"
                }
                alt=""
                className="absolute left-1/2 top-0 w-[11vw] max-w-[150px] object-contain pointer-events-none"
                style={{ animation: "reef-splash 0.85s ease-out" }}
              />
            )}
          </div>

          {/* fish of the hour */}
          {fothActive && (
            <div className="absolute left-1/2 top-[23%] -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-sm border border-border-gold">
              {creature(foth!.fishId, 20)}
              <span className="text-[clamp(8px,0.9vw,11px)] text-gold font-medium">
                Fish of the hour: {foth!.fishName} · {Math.max(0, Math.round((foth!.endsAt - clock) / 60000))}m
              </span>
            </div>
          )}

          {/* HUD overlay skin */}
          {assets.hud && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assets.hud} alt="" className="absolute inset-0 w-full h-full object-cover z-10 pointer-events-none" />
          )}

          {/* ── live HUD values (sit on the HUD top bar's empty middle) ── */}
          <div className="absolute z-20 left-[43%] -translate-x-1/2 top-[3.6%] flex items-center gap-1.5">
            <GlassChip>⚡ {energy}/{config.dailyEnergy}</GlassChip>
            <GlassChip>✨ {points.toLocaleString()}</GlassChip>
            {streak > 0 && <GlassChip>🔥 {streak}</GlassChip>}
            <GlassChip>⏱ {msToRefill(clock)}</GlassChip>
          </div>

          {/* ── interactive hotspots (over the HUD art) ── */}
          <button
            onPointerDown={startCharge}
            onPointerUp={releaseCharge}
            disabled={casting || (energy <= 0 && !charging)}
            className={cn("absolute z-20 rounded-full", HOT.cast)}
            style={{ touchAction: "none" }}
            aria-label="Cast"
          >
            {(charging || casting) && (
              <span className="absolute inset-0 flex items-center justify-center">
                {casting ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin drop-shadow" />
                ) : (
                  <span className="text-[clamp(9px,1vw,13px)] font-bold text-white drop-shadow">
                    {Math.round(meter * 100)}%
                  </span>
                )}
              </span>
            )}
          </button>
          <button onClick={() => setQuestsOpen(true)} className={cn("absolute z-20", HOT.quests)} aria-label="Quests">
            {claimable > 0 && (
              <span className="absolute top-0 right-1 w-3.5 h-3.5 rounded-full bg-red text-white text-[8px] flex items-center justify-center font-bold">
                {claimable}
              </span>
            )}
          </button>
          <button onClick={() => setView("leaderboard")} className={cn("absolute z-20", HOT.ranking)} aria-label="Ranking" />
          <button onClick={() => router.push("/rewards")} className={cn("absolute z-20", HOT.shop)} aria-label="Shop" />
          <button onClick={() => setView("collection")} className={cn("absolute z-20", HOT.gallery)} aria-label="Collection" />

          {/* charge hint */}
          {charging && (
            <div
              className="absolute z-20 text-[clamp(8px,0.9vw,12px)] text-white font-medium bg-black/50 px-2 py-0.5 rounded-full"
              style={{ left: "80%", top: "71%" }}
            >
              Release to cast!
            </div>
          )}
        </div>
      )}

      {view === "collection" && (
        <div>
          <BackBar onBack={() => setView("cast")} label="Collection book" />
          <CollectionBook fish={fish} rarities={config.rarities} caught={state?.collection ?? {}} />
        </div>
      )}

      {view === "leaderboard" && (
        <div>
          <BackBar onBack={() => setView("cast")} label="Weekly ranking" />
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
                    <span className="w-6 text-center text-[13px]">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </span>
                    <span className="flex-1 text-[12px] truncate">{r.name}</span>
                    <span className="text-[12px] font-mono text-vault">{r.weeklyScore.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Quests drawer */}
      <AnimatePresence>
        {questsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setQuestsOpen(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="bg-card border border-border rounded-2xl w-full max-w-md p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-medium m-0">Daily quests</h3>
                <button onClick={() => setQuestsOpen(false)} className="text-text-muted hover:text-text">
                  <X className="w-4 h-4" />
                </button>
              </div>
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reveal overlay */}
      <AnimatePresence>
        {reveal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden"
            onClick={() => setReveal(null)}
          >
            {highTierReveal && assets.eventLegendaryAlert && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={assets.eventLegendaryAlert}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none"
              />
            )}
            <motion.div
              initial={{ scale: 0.5, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 240, damping: 16 }}
              className="relative flex flex-col items-center text-center"
              onClick={(e) => e.stopPropagation()}
            >
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
                className="leading-none select-none"
                initial={{ rotate: -8 }}
                animate={{ rotate: [-8, 6, -4, 0] }}
                transition={{ duration: 0.7 }}
              >
                {creature(reveal.fish.id, 150)}
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
              {reveal.treasure ? (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.35, type: "spring", stiffness: 300, damping: 14 }}
                  className="flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-gold/15 border border-border-gold"
                >
                  {assets.iconChest && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={assets.iconChest} alt="" className="w-6 h-6 object-contain" />
                  )}
                  <span className="text-[12px] font-mono text-gold font-semibold">
                    Treasure! +{reveal.treasure}
                  </span>
                </motion.div>
              ) : null}
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setReveal(null)}
                  className="px-5 py-2 bg-white/10 border border-white/20 text-white rounded-lg text-[12px] hover:bg-white/15 transition"
                >
                  Nice!
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GlassChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center leading-none whitespace-nowrap text-[clamp(8px,1vw,13px)] font-mono font-semibold text-white bg-[#0a1830]/80 backdrop-blur-sm border border-[#2a4a7a] rounded-full px-2 py-1">
      {children}
    </span>
  );
}

function BackBar({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button
      onClick={onBack}
      className="mb-3 flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text transition"
    >
      <ChevronLeft className="w-4 h-4" /> {label}
    </button>
  );
}

function CollectionBook({
  fish,
  rarities,
  caught,
}: {
  fish: { id: string; name: string; rarity: string; emoji?: string; image?: string }[];
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
                        "aspect-square rounded-lg border flex flex-col items-center justify-center gap-0.5 relative transition p-1",
                        have ? "bg-canvas" : "bg-card-elev/40 opacity-40"
                      )}
                      style={{
                        borderColor: have ? `${r.color}66` : undefined,
                        boxShadow: have ? `0 0 14px -4px ${r.color}88` : undefined,
                      }}
                      title={have ? `${f.name} ×${have.count}` : "Not yet caught"}
                    >
                      {have && f.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.image} alt={f.name} className="w-10 h-10 object-contain" />
                      ) : (
                        <span className="text-2xl select-none" aria-hidden>
                          {have ? f.emoji ?? "🐟" : "❔"}
                        </span>
                      )}
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
