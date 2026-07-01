"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Trophy,
  Fish as FishIcon,
  Flame,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  ScrollText,
  ChevronLeft,
  Timer,
  X,
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

const AMBIENT = [
  { emoji: "🐟", top: "58%", dur: 26, delay: 0, size: 18 },
  { emoji: "🐠", top: "70%", dur: 34, delay: 6, size: 24, rev: true },
  { emoji: "🐡", top: "82%", dur: 30, delay: 12, size: 20 },
];
const CLOUDS = [
  { top: "8%", dur: 90, delay: 0, scale: 1 },
  { top: "18%", dur: 130, delay: 20, scale: 0.7 },
  { top: "4%", dur: 110, delay: 50, scale: 1.3 },
];

export default function PlayPage() {
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
  const [reveal, setReveal] = useState<CastResult | null>(null);
  const [isNewCatch, setIsNewCatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyQuest, setBusyQuest] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());

  const meterRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);

  // Lightweight clock for countdowns.
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);

  const fishById = useMemo(() => new Map(fish.map((f) => [f.id, f])), [fish]);
  const emojiFor = (id: string) => fishById.get(id)?.emoji ?? "🐟";
  const rarityMeta = (rarityId: string) =>
    config.rarities.find((r) => r.id === rarityId) ?? config.rarities[0];

  const assets = config.assets ?? {};
  const fullBg = assets.bgVideo || assets.bgFull;
  const hasLayers = !!(assets.bgSky || assets.bgSea || assets.bgWater || assets.bgForeground);
  const noAssetBg = !fullBg && !hasLayers;

  // Render a fish as its uploaded image if present, else the emoji.
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

  // ---- Audio (starts on first user gesture per browser autoplay rules) ----
  const ambientRef = useRef<HTMLAudioElement | null>(null);
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
  useEffect(() => {
    return () => {
      ambientRef.current?.pause();
      ambientRef.current = null;
    };
  }, []);

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

  // ---- Cast power meter ----
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

  // Release even if the pointer leaves the button.
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
  const casting = phase === "casting";
  const charging = phase === "charging";
  // lure vertical position: idle bobs near shore, cast flies out toward horizon
  const lureTop = casting ? 34 : 52;

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
          className="relative overflow-hidden rounded-2xl border border-border-strong select-none"
          style={{ height: "min(72vh, 560px)" }}
        >
          {/* ===== uploaded background ===== */}
          {assets.bgVideo ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              className="absolute inset-0 w-full h-full object-cover"
              src={assets.bgVideo}
              autoPlay
              loop
              muted
              playsInline
            />
          ) : assets.bgFull ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="absolute inset-0 w-full h-full object-cover" src={assets.bgFull} alt="" />
          ) : hasLayers ? (
            <>
              {[assets.bgSky, assets.bgSea, assets.bgWater, assets.bgForeground].map(
                (u, i) =>
                  u ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} className="absolute inset-0 w-full h-full object-cover" src={u} alt="" />
                  ) : null
              )}
            </>
          ) : null}

          {noAssetBg && (
          <>
          {/* ===== SKY ===== */}
          <div
            className="absolute inset-x-0 top-0"
            style={{
              height: "52%",
              background: "linear-gradient(180deg,#3aa0c9 0%,#6cc3dd 45%,#a7e0ec 100%)",
            }}
          >
            {/* sun */}
            <div
              className="absolute rounded-full"
              style={{
                top: "8%",
                right: "12%",
                width: 90,
                height: 90,
                background: "radial-gradient(circle,#fff6cf,rgba(255,246,207,0) 70%)",
              }}
            />
            {CLOUDS.map((c, i) => (
              <div
                key={i}
                className="absolute rounded-full bg-white/80"
                style={{
                  top: c.top,
                  left: "-20%",
                  width: 120 * c.scale,
                  height: 34 * c.scale,
                  filter: "blur(6px)",
                  animation: `reef-swim ${c.dur}s linear ${c.delay}s infinite`,
                }}
              />
            ))}
          </div>

          {/* ===== WATER ===== */}
          <div
            className="absolute inset-x-0"
            style={{
              top: "46%",
              bottom: 0,
              background: "linear-gradient(180deg,#2bb6c4 0%,#158aa3 40%,#0c5f79 75%,#083c50 100%)",
            }}
          >
            {/* sun reflection column */}
            <div
              className="absolute top-0 bottom-0"
              style={{
                right: "16%",
                width: 70,
                background: "linear-gradient(180deg,rgba(255,246,207,0.5),transparent 60%)",
                filter: "blur(4px)",
              }}
            />
            {/* shimmer lines */}
            {[20, 40, 60, 80].map((top, i) => (
              <div
                key={i}
                className="absolute inset-x-0 h-px bg-white/20"
                style={{ top: `${top}%`, animation: `reef-ray ${5 + i}s ease-in-out ${i}s infinite` }}
              />
            ))}
            {/* ambient fish */}
            {AMBIENT.map((a, i) => (
              <span
                key={i}
                className="absolute opacity-40 pointer-events-none"
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
            {Array.from({ length: 12 }).map((_, i) => {
              const size = 4 + (i % 4) * 3;
              return (
                <span
                  key={i}
                  className="absolute rounded-full bg-white/25 pointer-events-none"
                  style={{
                    bottom: 20,
                    left: `${(i * 8 + 5) % 96}%`,
                    width: size,
                    height: size,
                    animation: `reef-bubble ${5 + (i % 5)}s linear ${(i % 6) * 0.8}s infinite`,
                  }}
                  aria-hidden
                />
              );
            })}
          </div>

          </>
          )}

          {/* uploaded rod */}
          {assets.rod && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assets.rod}
              alt=""
              className="absolute bottom-10 left-4 w-16 z-[4] pointer-events-none object-contain"
            />
          )}

          {/* ===== FISHING LINE + LURE ===== */}
          <div
            className="absolute left-[46%] w-px bg-white/50"
            style={{ top: 0, height: `${lureTop}%`, transition: "height 0.6s cubic-bezier(0.4,0,0.2,1)" }}
          />
          <div
            className="absolute left-[46%] -translate-x-1/2"
            style={{
              top: `${lureTop}%`,
              transition: "top 0.6s cubic-bezier(0.4,0,0.2,1)",
              animation: casting || charging ? "none" : "reef-bob 2.6s ease-in-out infinite",
            }}
          >
            {assets.lure ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={assets.lure} alt="" className="w-7 h-7 object-contain" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full bg-gold shadow-[0_0_10px_rgba(61,213,152,0.8)] border-2 border-white/80" />
            )}
            {casting && (
              <>
                <span
                  className="absolute left-1/2 top-3 w-12 h-2.5 rounded-[50%] border border-white/60"
                  style={{ animation: "reef-ripple 0.7s ease-out" }}
                />
                <span
                  className="absolute left-1/2 top-3 w-12 h-2.5 rounded-[50%] border border-white/40"
                  style={{ animation: "reef-ripple 0.7s ease-out 0.25s" }}
                />
              </>
            )}
          </div>

          {/* ===== FOREGROUND DECK (only when no uploaded background) ===== */}
          {noAssetBg && (
          <div
            className="absolute inset-x-0 bottom-0 h-16"
            style={{ background: "linear-gradient(180deg,#6b4426 0%,#3f2714 100%)" }}
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-[#8a5a30]" />
            <div className="flex items-start justify-around px-2">
              {["🌿", "🌿", "🪸", "🌿", "🐚", "🌿", "🪸", "🌿"].map((s, i) => (
                <span
                  key={i}
                  className="-mt-2 opacity-80"
                  style={{
                    fontSize: 18 + (i % 3) * 6,
                    transformOrigin: "bottom center",
                    animation: `reef-sway ${3 + (i % 4)}s ease-in-out ${i * 0.3}s infinite`,
                  }}
                  aria-hidden
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
          )}

          {/* ===== HUD: top-left currency + refill ===== */}
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/15">
              <Sparkles className="w-3.5 h-3.5 text-vault" />
              <span className="text-[13px] font-mono font-medium text-white">{points.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 backdrop-blur-sm border border-white/10">
              <Timer className="w-3 h-3 text-white/70" />
              <span className="text-[10px] text-white/80">New casts in {msToRefill(clock)}</span>
            </div>
          </div>

          {/* streak top-center */}
          {streak > 0 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-sm border border-white/15">
              <Flame className="w-3.5 h-3.5 text-gold" />
              <span className="text-[11px] text-white font-medium">{streak} day streak</span>
            </div>
          )}

          {/* right-side buttons */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
            <SceneButton icon={<ScrollText className="w-4 h-4" />} label="Tasks" badge={claimable} onClick={() => setQuestsOpen(true)} />
            <SceneButton icon={<Trophy className="w-4 h-4" />} label="Ranking" onClick={() => setView("leaderboard")} />
          </div>

          {/* fish of the hour */}
          {fothActive && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-border-gold">
              <span className="text-base">{emojiFor(foth!.fishId)}</span>
              <span className="text-[10px] text-gold font-medium">
                Fish of the hour: {foth!.fishName} · {Math.max(0, Math.round((foth!.endsAt - clock) / 60000))}m
              </span>
            </div>
          )}

          {/* gallery bottom-left */}
          <button
            onClick={() => setView("collection")}
            className="absolute bottom-20 left-3 z-10 flex flex-col items-center gap-0.5"
          >
            <span className="w-11 h-11 rounded-xl bg-black/40 backdrop-blur-sm border border-white/15 flex items-center justify-center text-gold">
              <BookOpen className="w-5 h-5" />
            </span>
            <span className="text-[9px] text-white/80 font-mono">
              {totalCaught}/{fish.length}
            </span>
          </button>

          {/* ===== CAST BUTTON + POWER METER (bottom-right) ===== */}
          <div className="absolute bottom-20 right-3 z-10 flex items-end gap-2">
            {/* power meter */}
            <div className="h-24 w-2.5 rounded-full bg-black/40 border border-white/15 overflow-hidden relative self-center">
              <div
                className="absolute inset-x-0 bottom-0 rounded-full"
                style={{
                  height: `${(charging ? meter : 0) * 100}%`,
                  background: "linear-gradient(180deg,#F5C66B,#3DD598)",
                  transition: charging ? "none" : "height 0.2s",
                }}
              />
            </div>
            <div className="flex flex-col items-center">
              <div className="relative">
                <span
                  className="absolute inset-0 rounded-full bg-gold/40 blur-md"
                  style={{ animation: "reef-glow-pulse 2.4s ease-in-out infinite" }}
                  aria-hidden
                />
                <button
                  onPointerDown={startCharge}
                  onPointerUp={releaseCharge}
                  disabled={casting || (energy <= 0 && !charging)}
                  className={cn(
                    "relative w-20 h-20 rounded-full text-gold-dark font-semibold flex flex-col items-center justify-center gap-0.5 transition disabled:opacity-50 shadow-lg shadow-black/40 border-4 border-white/60",
                    charging ? "bg-gold scale-95" : "bg-gold hover:brightness-110"
                  )}
                  style={{ touchAction: "none" }}
                >
                  {casting ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : charging ? (
                    <span className="text-[11px]">Release!</span>
                  ) : (
                    <>
                      <FishIcon className="w-6 h-6" />
                      <span className="text-[9px]">Cast</span>
                    </>
                  )}
                </button>
                <span className="absolute -bottom-1 -right-1 text-[10px] font-mono font-bold bg-black/70 text-white px-1.5 py-0.5 rounded-full border border-white/20">
                  x{energy}
                </span>
              </div>
              <p className="text-[9px] text-white/70 mt-2 m-0 text-center max-w-[90px]">
                {charging ? "Release to cast!" : "Hold to power up"}
              </p>
            </div>
          </div>
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

      {/* ===== Quests drawer ===== */}
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

      {/* ===== Reveal overlay ===== */}
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
              {assets.revealRays ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={assets.revealRays}
                  alt=""
                  className="absolute -z-10 w-80 h-80 object-contain"
                  style={{ animation: "reef-spin 10s linear infinite", opacity: 0.85 }}
                />
              ) : (
                <div
                  className="absolute -z-10 w-72 h-72 rounded-full"
                  style={{
                    background: `conic-gradient(from 0deg, ${reveal.rarity.color}00, ${reveal.rarity.color}55, ${reveal.rarity.color}00, ${reveal.rarity.color}55, ${reveal.rarity.color}00)`,
                    filter: "blur(2px)",
                    animation: "reef-spin 9s linear infinite",
                    opacity: 0.55,
                  }}
                />
              )}
              <div
                className="absolute -z-10 w-52 h-52 rounded-full"
                style={{ background: `radial-gradient(circle, ${reveal.rarity.color}44, transparent 70%)` }}
              />
              {reveal.rarity.frame && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={reveal.rarity.frame} alt="" className="absolute -z-10 w-64 h-64 object-contain" />
              )}
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
                {creature(reveal.fish.id, 110)}
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
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SceneButton({
  icon,
  label,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-0.5">
      <span className="relative w-11 h-11 rounded-xl bg-black/40 backdrop-blur-sm border border-white/15 flex items-center justify-center text-gold">
        {icon}
        {badge && badge > 0 ? (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red text-white text-[9px] flex items-center justify-center font-bold">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="text-[9px] text-white/80">{label}</span>
    </button>
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
                        "aspect-square rounded-lg border flex flex-col items-center justify-center gap-0.5 relative transition",
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
                        <img src={f.image} alt={f.name} className="w-8 h-8 object-contain" />
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
