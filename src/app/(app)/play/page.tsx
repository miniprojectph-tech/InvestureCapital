"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle, ChevronLeft, X, Gift } from "lucide-react";
import { Card, CardHeader } from "@/components/Card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  useGameState,
  useGameConfig,
  useGamesSettings,
  useFish,
  useFishOfHour,
  useLeaderboard,
  castLine,
  claimQuest,
  effectiveDailyCredits,
  type CastResult,
} from "@/lib/game";
import { useRewards, redeemReward, type Reward } from "@/lib/rewards";

type View = "cast" | "collection" | "leaderboard";
type Phase = "idle" | "charging" | "casting" | "waiting" | "biting" | "reeling" | "landing";
type BiteStage = "nibble" | "test" | "aggressive";
type AiState = "swim" | "run" | "dive" | "jump";

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
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function vibrate(p: number | number[]) {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* unsupported */
  }
}

// ── Tunable positions over the HUD art (% of the 1672×941 stage). Nudge if art shifts. ──
const HOT = {
  cast: "left-[83%] top-[75%] w-[15%] h-[23%]",
  // Top-bar icon row (new HUD): shield · book · crown · crate.
  quests: "left-[61.2%] top-[2.5%] w-[4.6%] h-[9.5%]",
  galleryTop: "left-[65.6%] top-[2.5%] w-[4.6%] h-[9.5%]",
  ranking: "left-[70%] top-[2.5%] w-[4.6%] h-[9.5%]",
  shop: "left-[74.4%] top-[2.5%] w-[4.6%] h-[9.5%]",
  gallery: "left-[0.5%] top-[16.5%] w-[15.5%] h-[67%]",
  autoFish: "left-[11%] top-[84.5%] w-[10%] h-[13%]",
};
// Readable labels overlaid on the top-bar icons (baked art labels are illegible).
// left = icon center %, top = the label-pill row. Tunable.
const TOP_ICON_LABELS = [
  { key: "quests", left: "63.4%", text: "Quests" },
  { key: "collection", left: "67.8%", text: "Collection" },
  { key: "ranking", left: "72.2%", text: "Ranking" },
  { key: "shop", left: "76.6%", text: "Shop" },
];
const TOP_ICON_LABEL_TOP = "7.6%";
// Rod placement (tunable). Pivot at the handle; line hangs from the tip.
// tipLeft/tipTop mark the rod tip within the art (measured: tip is the
// top-right corner of rod.webp, ~99% / 0%). Nudge if the line's base drifts.
const ROD = {
  wrap: "left-[20%] bottom-[3%] w-[15%]",
  origin: "18% 82%",
  tipTop: "1%",
  tipLeft: "98%",
};
// Line origin (rod tip) and where the lure lands out in the ocean, in stage %.
const TIP = { x: 40, y: 45 };
const LAND = { x: 55, y: 37 };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// CURRENT FISH left-panel overlay positions (tunable, stage %).
const PANEL = {
  preview: { left: "2.6%", top: "19.5%", width: "12%", height: "17%" },
  valueLeft: "8%",
  rarityTop: "43.5%",
  weightTop: "49.2%",
  recordTop: "55%",
  // LOCATION / WEATHER / TIME info rows (values sit just under the baked labels).
  infoLeft: "9%",
  locationTop: "71.5%",
  weatherTop: "77.3%",
  timeTop: "83%",
};
const REEF_LOCATIONS = [
  "Azure Shallows",
  "Coral Gardens",
  "Sunken Atoll",
  "Mistvale Cove",
  "Emerald Lagoon",
  "Dragon's Reef",
  "Pearl Bay",
];
const REEF_WEATHERS = ["Sunny", "Clear skies", "Breezy", "Calm", "Misty", "Golden haze"];
// ── Reel Phase-2 tunables ──────────────────────────────────────────────
// Bite sub-stage durations (ms). The hookset window opens at the start of the
// "aggressive" stage; a tap inside it is a perfect hook. Missing it auto-hooks.
const BITE = { nibble: 750, test: 650, aggressive: 950, hooksetWindow: 520 };
// Fish-fight rates. Progress always climbs to 100 (you always land the catch);
// these only shape rhythm + the tension bar. Rates are per second.
const FISHAI = {
  reelGain: 30, // progress while holding, neutral (÷ difficulty)
  runReelGain: 9, // progress while holding during a run (fish resists)
  tensionUp: 27, // tension gain while holding, neutral
  tensionRun: 66, // tension gain while holding during a run
  tensionDecay: 46, // tension shed when you ease off
  runPull: 24, // tension the fish adds on its own during a run
  careful: 72,
  danger: 86,
};
// Reveal cinematics per rarity index (0 common … 6 divine). Color comes from the
// rarity itself; these scale the theatrics on top.
const REVEAL_TIERS = [
  { rays: 0.0, particles: 0, shake: 0, bg: false }, // common
  { rays: 0.18, particles: 6, shake: 0, bg: false }, // uncommon
  { rays: 0.45, particles: 12, shake: 0, bg: false }, // rare (blue)
  { rays: 0.65, particles: 18, shake: 3, bg: false }, // epic (purple)
  { rays: 0.9, particles: 26, shake: 6, bg: true }, // legendary (gold)
  { rays: 1.0, particles: 36, shake: 9, bg: true }, // mythic
  { rays: 1.0, particles: 48, shake: 12, bg: true }, // divine
];
const tierFor = (idx: number) => REVEAL_TIERS[Math.min(Math.max(idx, 0), 6)];
// A clean reel (green-time ratio ≥ this) keeps the combo alive.
const COMBO = { cleanRating: 0.82 };
// Ambient depth decoration (cosmetic, static positions so they don't re-randomize).
const AMBIENT_RAYS = [
  { left: "22%", width: "5%", dur: 11, delay: 0 },
  { left: "48%", width: "7%", dur: 14, delay: 2.5 },
  { left: "68%", width: "4%", dur: 9, delay: 1.2 },
];
const AMBIENT_BUBBLES = [
  { left: "30%", size: "6px", dur: 7, delay: 0 },
  { left: "40%", size: "4px", dur: 9, delay: 1.5 },
  { left: "52%", size: "5px", dur: 8, delay: 3 },
  { left: "58%", size: "3px", dur: 6, delay: 0.8 },
  { left: "64%", size: "7px", dur: 10, delay: 2.2 },
  { left: "46%", size: "4px", dur: 8.5, delay: 4 },
];

export default function PlayPage() {
  const router = useRouter();
  const { user, demoMode } = useAuth();
  const { state, loading } = useGameState();
  const { config } = useGameConfig();
  const { settings: gamesSettings } = useGamesSettings();
  const { fish } = useFish();
  const foth = useFishOfHour();
  const { rows: leaderboard } = useLeaderboard();

  const [view] = useState<View>("cast");
  const [questsOpen, setQuestsOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const { rewards } = useRewards();
  const [shopReward, setShopReward] = useState<Reward | null>(null);
  const [shopStage, setShopStage] = useState<"list" | "confirm" | "processing" | "done" | "error">("list");
  const [shopErr, setShopErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [meter, setMeter] = useState(0);
  const [castPower, setCastPower] = useState(0);
  const [castT, setCastT] = useState(0);
  const [rodAngle, setRodAngle] = useState(0);
  const [aiming, setAiming] = useState(false);
  const aimRef = useRef({ active: false, startX: 0, startAngle: 0 });
  // Interactive reel state
  const [progress, setProgress] = useState(0); // fish reeled in (0-100)
  const [tension, setTension] = useState(0); // line tension (0-100)
  const [reelRating, setReelRating] = useState(1);
  const [lastCatch, setLastCatch] = useState<
    { fishId: string; name: string; rarityLabel: string; color: string; weight: number } | null
  >(null);
  const [bestRecord, setBestRecord] = useState(0);
  const progressRef = useRef(0);
  const tensionRef = useRef(0);
  const reelHoldRef = useRef(false);
  const reelRafRef = useRef<number | null>(null);
  const pendingCatchRef = useRef<CastResult | null>(null);
  const greenTimeRef = useRef(0);
  const totalTimeRef = useRef(0);
  // Phase-2: bite stages, fish AI, combo, juice
  const [biteStage, setBiteStage] = useState<BiteStage | null>(null);
  const [aiState, setAiState] = useState<AiState>("swim");
  const [fishPos, setFishPos] = useState({ x: LAND.x, y: LAND.y });
  const [hooked, setHooked] = useState<CastResult["fish"] | null>(null);
  const [combo, setCombo] = useState(0);
  const [perfectHook, setPerfectHook] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [shakePx, setShakePx] = useState(0);
  const [portraitHint, setPortraitHint] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const perfectHookRef = useRef(false);
  const hooksetArmedRef = useRef(false);
  const biteTimersRef = useRef<number[]>([]);
  const fishRef = useRef({ x: LAND.x, y: LAND.y, state: "swim" as AiState, dir: 1 });
  const [autoFish, setAutoFish] = useState(false);
  const autoFishRef = useRef(false);
  useEffect(() => {
    autoFishRef.current = autoFish;
  }, [autoFish]);
  const [reveal, setReveal] = useState<CastResult | null>(null);
  const [isNewCatch, setIsNewCatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyQuest, setBusyQuest] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());

  const meterRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const ambientRef = useRef<HTMLAudioElement | null>(null);
  // Live rod-tip tracking so the line always starts at the (rotating) rod tip.
  const stageRef = useRef<HTMLDivElement>(null);
  const rodTipRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState(TIP);

  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const v = Number(localStorage.getItem("reef-best-weight") || 0);
    if (v) setBestRecord(v);
  }, []);
  useEffect(() => {
    return () => {
      ambientRef.current?.pause();
      ambientRef.current = null;
    };
  }, []);
  // Landscape-first: nudge portrait phones to rotate for the full reef stage.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(orientation: portrait) and (max-width: 900px)");
    const apply = () => setPortraitHint(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  // Measure the rod tip's live screen position (relative to the stage, in %).
  const measureTip = useCallback(() => {
    const stage = stageRef.current;
    const marker = rodTipRef.current;
    if (!stage || !marker) return;
    const s = stage.getBoundingClientRect();
    const m = marker.getBoundingClientRect();
    if (s.width <= 0 || s.height <= 0) return;
    const x = ((m.left + m.width / 2 - s.left) / s.width) * 100;
    const y = ((m.top + m.height / 2 - s.top) / s.height) * 100;
    setTip((prev) => (Math.abs(prev.x - x) > 0.04 || Math.abs(prev.y - y) > 0.04 ? { x, y } : prev));
  }, []);

  // Keep the fishing-line origin pinned to the rod tip. The rod rotates on
  // aim/cast/bend, so a fixed origin visibly detaches. Track continuously while
  // the rod moves; when it settles to idle, measure for a short beat (until the
  // spring finishes) then stop so we don't re-render at rest. Re-runs when the
  // game finishes loading (rod appears) and on resize. Idle breathing ignored.
  useEffect(() => {
    if (view !== "cast" || loading) return;
    let raf = 0;
    let stop = false;
    const moving = phase !== "idle" || aiming;
    if (moving) {
      const loop = () => {
        measureTip();
        if (!stop) raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    } else {
      const start = performance.now();
      const settle = () => {
        measureTip();
        if (!stop && performance.now() - start < 900) raf = requestAnimationFrame(settle);
      };
      raf = requestAnimationFrame(settle);
    }
    const onResize = () => measureTip();
    window.addEventListener("resize", onResize);
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [view, phase, aiming, loading, measureTip]);

  const fishById = useMemo(() => new Map(fish.map((f) => [f.id, f])), [fish]);
  // Pre-computed particle burst for the reveal (stable across re-renders).
  const revealBurst = useMemo(() => {
    if (!reveal) return [] as { id: number; dx: number; dy: number; delay: number }[];
    const idx = Math.max(0, config.rarities.findIndex((r) => r.id === reveal.fish.rarity));
    const n = tierFor(idx).particles;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + Math.random() * 0.6;
      const d = 90 + Math.random() * 150;
      return { id: i, dx: Math.cos(a) * d, dy: Math.sin(a) * d, delay: Math.random() * 0.2 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal, config.rarities]);
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
  const dailyCredits = effectiveDailyCredits(config.dailyEnergy, gamesSettings.universalDailyCredits);
  const energy = state?.energy ?? dailyCredits;
  const points = state?.points ?? 0;
  const activeRewards = rewards.filter((r) => r.active);
  const streak = state?.streak ?? 0;
  const questsToday =
    state?.quests?.day === today ? state.quests : { day: today, progress: {}, claimed: {} };
  const claimable = config.quests.filter(
    (q) => (questsToday.progress?.[q.id] ?? 0) >= q.target && !questsToday.claimed?.[q.id]
  ).length;
  const totalCaught = fish.filter((f) => state?.collection?.[f.id]).length;

  // Ambient panel flavor: live Manila time, plus a day-stable location & weather.
  const manilaNow = new Date(clock + 8 * 3_600_000);
  const mh = manilaNow.getUTCHours();
  const timeStr = `${((mh + 11) % 12) + 1}:${String(manilaNow.getUTCMinutes()).padStart(2, "0")} ${mh < 12 ? "AM" : "PM"}`;
  const dayIndex = Math.floor((clock + 8 * 3_600_000) / 86_400_000);
  const locationStr = REEF_LOCATIONS[dayIndex % REEF_LOCATIONS.length];
  const weatherStr = mh >= 18 || mh < 5 ? "Moonlit" : REEF_WEATHERS[mh % REEF_WEATHERS.length];

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
    await runCast(meterRef.current);
  }

  // Run one full cast → wait → bite → reel cycle at the given power. Used by both
  // the manual charge release and AUTO FISH (which drives it hands-free).
  async function runCast(power: number) {
    if (demoMode) {
      setError("Casting isn't available in demo mode — sign in to play.");
      setAutoFish(false);
      return;
    }
    setError(null);
    setCastPower(power);
    setMeter(0);
    meterRef.current = 0;
    setPhase("casting"); // rod whips forward, lure flies out
    startAmbient();
    playSfx(assets.castSfx);
    let res: CastResult;
    try {
      const castPromise = castLine(power);
      castPromise.catch(() => {}); // avoid unhandled-rejection warning; re-thrown on await
      await wait(650); // cast arc
      setPhase("waiting"); // lure settles, suspense
      res = await castPromise;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cast failed");
      setPhase("idle");
      setAutoFish(false);
      return;
    }
    await wait(400 + Math.random() * 500); // fish approaches
    runBiteSequence(res); // nibble → test → aggressive, then reel
  }

  function toggleAutoFish() {
    if (demoMode) {
      setError("Casting isn't available in demo mode — sign in to play.");
      return;
    }
    if (autoFish) {
      setAutoFish(false); // stop after the current cast finishes
      return;
    }
    if (energy <= 0) {
      setError("Out of energy — new casts tomorrow!");
      return;
    }
    setAutoFish(true);
    if (phase === "idle") runCast(0.85 + Math.random() * 0.1);
  }

  function clearBiteTimers() {
    biteTimersRef.current.forEach((id) => clearTimeout(id));
    biteTimersRef.current = [];
  }

  // ── Bite stages: nibble → test → aggressive. Tapping inside the aggressive
  // window sets a perfect hook (calmer reel start); missing it auto-hooks. The
  // catch is already decided server-side, so the hookset only affects feel. ──
  function runBiteSequence(res: CastResult) {
    pendingCatchRef.current = res;
    perfectHookRef.current = false;
    hooksetArmedRef.current = false;
    setPerfectHook(false);
    setPhase("biting");
    setBiteStage("nibble");
    playSfx(assets.fxNibble ?? assets.biteSfx, 0.5);
    vibrate(15);
    const T = biteTimersRef.current;
    T.push(
      window.setTimeout(() => {
        setBiteStage("test");
        playSfx(assets.biteSfx, 0.6);
        vibrate(25);
      }, BITE.nibble)
    );
    T.push(
      window.setTimeout(() => {
        setBiteStage("aggressive");
        playSfx(assets.fxBigBite ?? assets.biteSfx, 0.85);
        vibrate([30, 40, 30]);
        hooksetArmedRef.current = true;
        T.push(window.setTimeout(() => (hooksetArmedRef.current = false), BITE.hooksetWindow));
        T.push(window.setTimeout(() => startReel(res), BITE.aggressive)); // auto-hook if missed
      }, BITE.nibble + BITE.test)
    );
  }

  function tryHookset() {
    if (phase !== "biting" || biteStage !== "aggressive") return;
    if (hooksetArmedRef.current) {
      perfectHookRef.current = true;
      setPerfectHook(true);
      playSfx(assets.fxPerfectHook ?? assets.catchSfx, 0.5);
      vibrate(60);
    }
    clearBiteTimers();
    hooksetArmedRef.current = false;
    startReel(pendingCatchRef.current!);
  }

  // ── Interactive reel-in with fish AI. Hold to reel; ease off when it runs.
  // One rAF drives tension, progress and the fish's swim/run/dive/jump. Progress
  // always reaches 100 — you always land what the server already hooked. ──
  function startReel(res: CastResult) {
    clearBiteTimers();
    pendingCatchRef.current = res;
    setHooked(res.fish);
    setBiteStage(null);
    progressRef.current = 0;
    tensionRef.current = perfectHookRef.current ? 0 : 14; // perfect hook = calmer start
    greenTimeRef.current = 0;
    totalTimeRef.current = 0;
    reelHoldRef.current = false;
    setProgress(0);
    setTension(tensionRef.current);
    setPhase("reeling");
    vibrate(20);

    const rarityIdx = Math.max(0, config.rarities.findIndex((r) => r.id === res.fish.rarity));
    const difficulty = 1 + rarityIdx * 0.35; // rarer = tougher / longer fight
    const fish = fishRef.current;
    fish.x = LAND.x;
    fish.y = LAND.y;
    fish.state = "swim";
    fish.dir = Math.random() < 0.5 ? -1 : 1;
    setFishPos({ x: LAND.x, y: LAND.y });
    setAiState("swim");

    let last = performance.now();
    let stateEnd = last + 700 + Math.random() * 600;

    const nextState = (t: number, pr: number) => {
      const roll = Math.random();
      const aggro = Math.min(0.78, 0.24 + rarityIdx * 0.08 + pr / 320);
      if (roll < aggro * 0.5) {
        fish.state = "run";
        fish.dir = Math.random() < 0.5 ? -1 : 1;
        stateEnd = t + 450 + Math.random() * 500;
        vibrate(35);
      } else if (roll < aggro * 0.78) {
        fish.state = "dive";
        stateEnd = t + 500 + Math.random() * 450;
      } else if (roll < aggro && pr > 25) {
        fish.state = "jump";
        stateEnd = t + 620;
        vibrate([20, 30]);
      } else {
        fish.state = "swim";
        stateEnd = t + 600 + Math.random() * 700;
      }
      setAiState(fish.state);
    };

    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      totalTimeRef.current += dt;
      if (t > stateEnd) nextState(t, progressRef.current);
      const running = fish.state === "run";
      const diving = fish.state === "dive";
      let tn = tensionRef.current;
      let pr = progressRef.current;
      // AUTO FISH reels itself: hold while tension is safe, ease off near the red.
      const hold = autoFishRef.current ? tn < FISHAI.careful : reelHoldRef.current;
      if (hold) {
        const gain =
          (running ? FISHAI.runReelGain : diving ? FISHAI.reelGain * 0.6 : FISHAI.reelGain) / difficulty;
        pr += gain * dt * (tn > FISHAI.danger ? 0.3 : 1);
        tn += (running ? FISHAI.tensionRun : diving ? FISHAI.tensionUp * 1.2 : FISHAI.tensionUp) * dt;
      } else {
        tn -= FISHAI.tensionDecay * dt;
        if (running) tn += FISHAI.runPull * dt; // fish pulls even when you ease off
      }
      tn = clamp(tn, 0, 100);
      pr = clamp(pr, 0, 100);
      if (tn < FISHAI.careful) greenTimeRef.current += dt;
      tensionRef.current = tn;
      progressRef.current = pr;
      setTension(tn);
      setProgress(pr);

      // Fish shadow drifts from the landing spot toward the rod as it tires.
      const bx = lerp(LAND.x, TIP.x, pr / 100);
      const by = lerp(LAND.y, TIP.y, pr / 100);
      const wob = Math.sin(t / 200) * 1.1;
      const ox = running ? fish.dir * 5 : 0;
      const oy = diving ? 5 : fish.state === "jump" ? -6 : 0;
      fish.x = bx + ox + wob;
      fish.y = by + oy;
      setFishPos({ x: fish.x, y: fish.y });

      if (pr >= 100) {
        finishReel();
        return;
      }
      reelRafRef.current = requestAnimationFrame(loop);
    };
    reelRafRef.current = requestAnimationFrame(loop);
  }

  function triggerShake(px: number) {
    setShakePx(px);
    setShaking(false);
    requestAnimationFrame(() => setShaking(true));
  }

  function finishReel() {
    if (reelRafRef.current) cancelAnimationFrame(reelRafRef.current);
    reelRafRef.current = null;
    reelHoldRef.current = false;
    const res = pendingCatchRef.current;
    const rating = totalTimeRef.current > 0 ? greenTimeRef.current / totalTimeRef.current : 1;
    setReelRating(rating);
    const clean = rating >= COMBO.cleanRating;
    setCombo((c) => (clean ? c + 1 : 0));
    if (!res) {
      setPhase("idle");
      return;
    }
    setIsNewCatch(!state?.collection?.[res.fish.id]);
    // Cosmetic weight for the panel, scaled by rarity.
    const rIdx = Math.max(0, config.rarities.findIndex((r) => r.id === res.fish.rarity));
    const rarity = config.rarities.find((r) => r.id === res.fish.rarity) ?? config.rarities[0];
    const base = [1.5, 3, 6, 15, 40, 90, 220][Math.min(rIdx, 6)] ?? 5;
    const weight = Math.round(base * (0.6 + Math.random() * 0.9) * 10) / 10;
    setLastCatch({ fishId: res.fish.id, name: res.fish.name, rarityLabel: rarity.label, color: rarity.color, weight });
    setBestRecord((prev) => {
      const nb = Math.max(prev, weight);
      try {
        localStorage.setItem("reef-best-weight", String(nb));
      } catch {
        /* ignore */
      }
      return nb;
    });
    // A short "fish surfaces" beat before the cinematic reveal.
    setPhase("landing");
    vibrate(clean ? [40, 30, 60] : 40);
    const tier = tierFor(rIdx);
    window.setTimeout(() => {
      if (tier.shake > 0) triggerShake(tier.shake);
      playSfx(assets.catchSfx);
      setReveal(res);
      setPhase("idle");
      setHooked(null);
    }, 460);
  }

  useEffect(() => {
    return () => {
      if (reelRafRef.current) cancelAnimationFrame(reelRafRef.current);
      biteTimersRef.current.forEach((id) => clearTimeout(id));
    };
  }, []);
  // AUTO FISH: after a catch reveal, auto-dismiss and cast again while energy
  // remains and auto is still on. Stops when energy hits 0 or you toggle it off.
  useEffect(() => {
    if (!reveal || !autoFish) return;
    const t = window.setTimeout(() => {
      setReveal(null);
      if (autoFishRef.current && reveal.energy > 0) {
        runCast(0.85 + Math.random() * 0.1);
      } else {
        setAutoFish(false);
      }
    }, 1100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal, autoFish]);
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

  // Release the reel whenever the pointer lifts anywhere.
  useEffect(() => {
    if (phase !== "reeling") return;
    const up = () => {
      reelHoldRef.current = false;
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [phase]);

  // Animate the lure's flight while casting (0→1 over ~600ms).
  useEffect(() => {
    if (phase !== "casting") {
      setCastT(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const loop = (t: number) => {
      const p = Math.min(1, (t - start) / 600);
      setCastT(p);
      if (p < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  function startAim(e: React.PointerEvent) {
    aimRef.current = { active: true, startX: e.clientX, startAngle: rodAngle };
    setAiming(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function moveAim(e: React.PointerEvent) {
    if (!aimRef.current.active) return;
    const w = (e.currentTarget as HTMLElement).offsetWidth || 600;
    const dx = e.clientX - aimRef.current.startX;
    const next = Math.max(-18, Math.min(18, aimRef.current.startAngle + (dx / w) * 45));
    setRodAngle(next);
  }
  function endAim() {
    aimRef.current.active = false;
    setAiming(false);
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

  function openShop() {
    setShopReward(null);
    setShopStage("list");
    setShopErr(null);
    setShopOpen(true);
  }
  async function confirmRedeem() {
    if (!shopReward) return;
    if (demoMode) {
      setShopErr("Redeeming isn't available in demo mode.");
      setShopStage("error");
      return;
    }
    setShopStage("processing");
    try {
      await redeemReward(shopReward.id);
      setShopStage("done");
    } catch (e) {
      setShopErr(e instanceof Error ? e.message : "Redemption failed");
      setShopStage("error");
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
  const revealTier = revealRank >= 0 ? tierFor(revealRank) : REVEAL_TIERS[0];
  const showHint = portraitHint && !hintDismissed && view === "cast";
  const charging = phase === "charging";
  const inFlight = phase !== "idle" && phase !== "charging";
  const hookedImg = hooked ? fishById.get(hooked.id)?.image ?? hooked.image : undefined;
  // Extra rod rotation per phase — windback on charge, whip on cast, sharp bend
  // on the bite stages, then bend proportional to tension while reeling.
  const rodBend =
    phase === "charging"
      ? -6
      : phase === "casting"
      ? 13
      : phase === "waiting"
      ? 4
      : phase === "biting"
      ? biteStage === "aggressive"
        ? 22
        : biteStage === "test"
        ? 12
        : 6
      : phase === "reeling"
      ? 6 + tension * 0.16 + (aiState === "run" ? 6 : 0)
      : phase === "landing"
      ? 18
      : 0;
  // Lure position (stage %): arcs out to the ocean on cast, sits while waiting +
  // biting, then tracks the hooked fish shadow as you reel it in. At idle the
  // lure hangs just below the rod tip so a short line visibly connects them.
  const lurePos =
    phase === "casting"
      ? { x: lerp(tip.x, LAND.x, castT), y: lerp(tip.y, LAND.y, castT) - Math.sin(Math.PI * castT) * 14 }
      : phase === "waiting" || phase === "biting"
      ? LAND
      : phase === "reeling" || phase === "landing"
      ? fishPos
      : { x: tip.x, y: tip.y + 3 };
  // Line curve: slack (bows up) only when the lure is far out horizontally; a
  // near-straight drop when the lure hangs right under the tip.
  const lineBow = Math.min(9, Math.abs(lurePos.x - tip.x) * 0.35);
  const lineCtrlX = (tip.x + lurePos.x) / 2;
  const lineCtrlY = Math.min(tip.y, lurePos.y) - lineBow;

  return (
    <div className="fixed inset-0 z-40 bg-black overflow-y-auto overscroll-none">
      {/* leave the immersive game and return to the app */}
      <button
        onClick={() => {
          if (typeof window !== "undefined" && window.history.length > 1) router.back();
          else router.push("/dashboard");
        }}
        className="fixed top-3 left-3 z-[45] flex items-center gap-1 pl-2 pr-3 py-1.5 rounded-full bg-black/55 backdrop-blur-sm border border-white/20 text-white text-[12px] hover:bg-black/70 transition"
        aria-label="Back to app"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      {error && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[45] flex items-start gap-2 px-3 py-2 bg-red/90 border border-red/30 rounded-lg text-[11px] text-white shadow-lg max-w-[90vw]">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {view === "cast" && (
        <div className="min-h-[100dvh] w-full flex items-center justify-center">
        <div
          ref={stageRef}
          className={cn(
            "relative select-none overflow-hidden shadow-2xl shadow-black/60",
            shaking && "reef-shake"
          )}
          style={{
            aspectRatio: "1672 / 941",
            width: "min(100vw, 177.68dvh)",
            "--reef-shake": `${shakePx}px`,
          } as React.CSSProperties}
          onAnimationEnd={(e) => {
            if (e.animationName === "reef-shake") setShaking(false);
          }}
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

          {/* ambient depth — drifting light rays + rising bubbles (cosmetic) */}
          <div className="absolute inset-0 z-[2] pointer-events-none overflow-hidden">
            {AMBIENT_RAYS.map((r, i) => (
              <div
                key={`ray-${i}`}
                className="absolute top-0 h-full"
                style={{
                  left: r.left,
                  width: r.width,
                  background: "linear-gradient(180deg, rgba(255,255,255,0.16), transparent 70%)",
                  filter: "blur(6px)",
                  animation: `reef-ray-drift ${r.dur}s ease-in-out ${r.delay}s infinite`,
                }}
              />
            ))}
            {AMBIENT_BUBBLES.map((b, i) => (
              <div
                key={`bub-${i}`}
                className="absolute bottom-[6%] rounded-full bg-white/25"
                style={{
                  left: b.left,
                  width: b.size,
                  height: b.size,
                  animation: `reef-bubble ${b.dur}s ease-in ${b.delay}s infinite`,
                }}
              />
            ))}
          </div>

          {/* ── Fishing rod (drag the water to aim) — spring-driven for smooth
              whip + bend; a nested layer breathes gently while idle. ── */}
          {assets.rod && (
            <motion.div
              className={cn("absolute z-[12] pointer-events-none", ROD.wrap)}
              style={{ transformOrigin: ROD.origin, willChange: "transform" }}
              animate={{ rotate: rodAngle + rodBend }}
              transition={
                aiming
                  ? { type: "tween", duration: 0 }
                  : phase === "casting" || phase === "biting"
                  ? { type: "spring", stiffness: 210, damping: 12, mass: 0.5 }
                  : { type: "spring", stiffness: 120, damping: 15, mass: 0.6 }
              }
            >
              <div
                className="relative"
                style={{
                  transformOrigin: ROD.origin,
                  animation: phase === "idle" && !aiming ? "reef-rod-breathe 4.2s ease-in-out infinite" : "none",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={assets.rod}
                  alt=""
                  className="block w-full object-contain select-none"
                  onLoad={measureTip}
                />
                {/* invisible marker at the rod tip — the line is pinned here.
                    Nudge ROD.tipLeft / ROD.tipTop to sit it exactly on the tip. */}
                <div
                  ref={rodTipRef}
                  className="absolute w-0 h-0"
                  style={{ left: ROD.tipLeft, top: ROD.tipTop }}
                />
              </div>
            </motion.div>
          )}

          {/* fishing line — arcs from the rod tip out to the lure */}
          <svg
            className="absolute inset-0 w-full h-full z-[11] pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <path
              d={`M ${tip.x} ${tip.y} Q ${lineCtrlX} ${lineCtrlY} ${lurePos.x} ${lurePos.y}`}
              fill="none"
              stroke="rgba(255,255,255,0.75)"
              strokeWidth="1.2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.35))" }}
            />
          </svg>

          {/* hooked fish shadow — moves with its AI (swim/run/dive/jump). Kept
              dark + blurred underwater to preserve the reveal surprise. */}
          {(phase === "reeling" || phase === "landing") && hookedImg && (
            <div
              className="absolute z-[11] pointer-events-none"
              style={{ left: `${fishPos.x}%`, top: `${fishPos.y}%`, transform: "translate(-50%,-50%)" }}
            >
              {/* water disturbance the fish pushes as it fights */}
              <span
                className="absolute left-1/2 top-1/2 rounded-[50%] border border-white/25"
                style={{
                  width: "150px",
                  height: "46px",
                  transform: "translate(-50%,-50%)",
                  background: "radial-gradient(ellipse at center, rgba(180,225,255,0.28), transparent 68%)",
                  animation: "reef-wake 1.7s ease-out infinite",
                }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={hookedImg}
                alt=""
                className="relative w-[9vw] max-w-[128px] min-w-[56px] object-contain"
                style={{
                  filter:
                    aiState === "jump"
                      ? "brightness(0.5) blur(0.3px) drop-shadow(0 0 8px rgba(120,190,255,0.5))"
                      : "brightness(0.18) blur(1.1px) drop-shadow(0 4px 8px rgba(0,0,0,0.4))",
                  opacity: aiState === "jump" ? 0.9 : 0.62,
                  animation:
                    aiState === "jump"
                      ? "reef-jump 0.62s ease-out"
                      : aiState === "run"
                      ? "reef-sway 0.5s ease-in-out infinite"
                      : "reef-bob 2s ease-in-out infinite",
                }}
              />
              {(aiState === "run" || aiState === "jump") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/reef/splash-small.webp"
                  alt=""
                  className="absolute left-1/2 -translate-x-1/2 -top-2 w-[64px] object-contain opacity-80"
                  style={{ animation: "reef-splash 0.8s ease-out infinite" }}
                />
              )}
            </div>
          )}

          {/* lure + landing splash — anchored by its top (where the line ties),
              so the fishing line always meets the bobber's attachment point. */}
          <div
            className="absolute z-[12] pointer-events-none"
            style={{
              left: `${lurePos.x}%`,
              top: `${lurePos.y}%`,
              transform: "translate(-50%,0)",
              transition:
                phase === "casting" || phase === "reeling"
                  ? "none"
                  : "left 0.3s ease-out, top 0.3s ease-out",
            }}
          >
            <div
              style={{
                animation:
                  phase === "idle"
                    ? "reef-bob 2.6s ease-in-out infinite"
                    : phase === "biting"
                    ? biteStage === "nibble"
                      ? "reef-nibble 0.4s ease-in-out infinite"
                      : biteStage === "test"
                      ? "reef-testbite 0.6s ease-in-out infinite"
                      : "reef-testbite 0.32s ease-in-out infinite"
                    : "none",
              }}
            >
              {assets.lure ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assets.lure} alt="" className="block mx-auto w-[1.7vw] max-w-[22px] object-contain" />
              ) : (
                <div className="w-3 h-3 rounded-full bg-gold border-2 border-white/80" />
              )}
              {phase === "waiting" && (
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
                  className="absolute left-1/2 top-0 w-[110px] object-contain"
                  style={{ animation: "reef-splash 0.85s ease-out" }}
                />
              )}
            </div>
          </div>

          {/* aim catcher — drag over the open water to swing the rod */}
          <div
            className="absolute z-[13] left-[16%] top-[24%] w-[62%] h-[46%] cursor-grab active:cursor-grabbing"
            onPointerDown={startAim}
            onPointerMove={moveAim}
            onPointerUp={endAim}
            onPointerLeave={endAim}
            style={{ touchAction: "none" }}
          />

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

          {/* readable labels over the top-bar icons (baked labels are illegible) */}
          {assets.hud &&
            TOP_ICON_LABELS.map((l) => (
              <span
                key={l.key}
                className="absolute z-20 pointer-events-none text-[clamp(5px,0.58vw,9px)] font-semibold uppercase tracking-wide text-white whitespace-nowrap px-1 py-0.5 rounded-full border border-border-gold"
                style={{
                  left: l.left,
                  top: TOP_ICON_LABEL_TOP,
                  transform: "translate(-50%,-50%)",
                  background: "linear-gradient(180deg,rgba(12,26,46,0.96),rgba(7,14,26,0.98))",
                }}
              >
                {l.text}
              </span>
            ))}

          {/* ── CURRENT FISH panel: last catch ── */}
          {lastCatch && (
            <>
              <div
                className="absolute z-20 flex items-center justify-center pointer-events-none"
                style={{ left: PANEL.preview.left, top: PANEL.preview.top, width: PANEL.preview.width, height: PANEL.preview.height }}
              >
                {fishById.get(lastCatch.fishId)?.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={fishById.get(lastCatch.fishId)!.image}
                    alt=""
                    className="max-w-full max-h-full object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
                  />
                )}
              </div>
              <div className="absolute z-20 -translate-x-1/2 pointer-events-none" style={{ left: PANEL.valueLeft, top: PANEL.rarityTop }}>
                <span className="text-[clamp(6px,0.78vw,11px)] font-bold" style={{ color: lastCatch.color }}>
                  {lastCatch.rarityLabel}
                </span>
              </div>
              <div className="absolute z-20 -translate-x-1/2 pointer-events-none" style={{ left: PANEL.valueLeft, top: PANEL.weightTop }}>
                <span className="text-[clamp(6px,0.78vw,11px)] font-mono text-white">{lastCatch.weight} kg</span>
              </div>
              <div className="absolute z-20 -translate-x-1/2 pointer-events-none" style={{ left: PANEL.valueLeft, top: PANEL.recordTop }}>
                <span className="text-[clamp(6px,0.78vw,11px)] font-mono text-gold">{bestRecord} kg</span>
              </div>
            </>
          )}

          {/* ── panel info rows: location / weather / time ── */}
          <div className="absolute z-20 -translate-x-1/2 pointer-events-none" style={{ left: PANEL.infoLeft, top: PANEL.locationTop }}>
            <span className="text-[clamp(6px,0.74vw,10px)] font-medium text-white/90 whitespace-nowrap">{locationStr}</span>
          </div>
          <div className="absolute z-20 -translate-x-1/2 pointer-events-none" style={{ left: PANEL.infoLeft, top: PANEL.weatherTop }}>
            <span className="text-[clamp(6px,0.74vw,10px)] font-medium text-white/90 whitespace-nowrap">{weatherStr}</span>
          </div>
          <div className="absolute z-20 -translate-x-1/2 pointer-events-none" style={{ left: PANEL.infoLeft, top: PANEL.timeTop }}>
            <span className="text-[clamp(6px,0.74vw,10px)] font-mono text-white/90 whitespace-nowrap">{timeStr}</span>
          </div>

          {/* ── live HUD values (sit on the HUD top bar's empty middle) ── */}
          <div className="absolute z-20 left-[43%] -translate-x-1/2 top-[3.6%] flex items-center gap-1.5">
            <GlassChip>⚡ {energy}/{dailyCredits}</GlassChip>
            <GlassChip>✨ {points.toLocaleString()}</GlassChip>
            {streak > 0 && <GlassChip>🔥 {streak}</GlassChip>}
            {combo > 1 && <GlassChip>🎣 ×{combo}</GlassChip>}
            <GlassChip>⏱ {msToRefill(clock)}</GlassChip>
          </div>

          {/* ── interactive hotspots (over the HUD art) ── */}
          {phase === "reeling" ? (
            <button
              onPointerDown={() => {
                reelHoldRef.current = true;
              }}
              className={cn(
                "absolute z-20 rounded-full",
                HOT.cast,
                tension > 85 ? "ring-4 ring-red/70 animate-pulse" : "ring-4 ring-gold/50"
              )}
              style={{ touchAction: "none" }}
              aria-label="Reel in"
            />
          ) : phase === "biting" ? (
            <button
              onPointerDown={tryHookset}
              className={cn(
                "absolute z-20 rounded-full",
                HOT.cast,
                biteStage === "aggressive" ? "ring-4 ring-red/80 animate-pulse" : "ring-2 ring-white/30"
              )}
              style={{ touchAction: "none" }}
              aria-label="Set the hook"
            >
              <span className="absolute inset-0 flex items-center justify-center text-[clamp(9px,1vw,13px)] font-bold text-white drop-shadow">
                {biteStage === "aggressive" ? "HOOK!" : biteStage === "test" ? "Wait…" : "…"}
              </span>
            </button>
          ) : (
            <button
              onPointerDown={startCharge}
              onPointerUp={releaseCharge}
              disabled={inFlight || (energy <= 0 && !charging)}
              className={cn("absolute z-20 rounded-full", HOT.cast)}
              style={{ touchAction: "none" }}
              aria-label="Cast"
            >
              {(charging || inFlight) && (
                <span className="absolute inset-0 flex items-center justify-center">
                  {charging ? (
                    <span className="text-[clamp(9px,1vw,13px)] font-bold text-white drop-shadow">
                      {Math.round(meter * 100)}%
                    </span>
                  ) : (
                    <Loader2 className="w-6 h-6 text-white animate-spin drop-shadow" />
                  )}
                </span>
              )}
            </button>
          )}
          <button onClick={() => setQuestsOpen(true)} className={cn("absolute z-20", HOT.quests)} aria-label="Quests">
            {claimable > 0 && (
              <span className="absolute top-0 right-1 w-3.5 h-3.5 rounded-full bg-red text-white text-[8px] flex items-center justify-center font-bold">
                {claimable}
              </span>
            )}
          </button>
          <button onClick={() => setCollectionOpen(true)} className={cn("absolute z-20", HOT.galleryTop)} aria-label="Collection" />
          <button onClick={() => setRankingOpen(true)} className={cn("absolute z-20", HOT.ranking)} aria-label="Ranking" />
          <button onClick={openShop} className={cn("absolute z-20", HOT.shop)} aria-label="Shop" />
          <button onClick={() => setCollectionOpen(true)} className={cn("absolute z-20", HOT.gallery)} aria-label="Collection" />
          {/* AUTO FISH — casts + reels hands-free until energy runs out */}
          <button
            onClick={toggleAutoFish}
            className={cn(
              "absolute z-20 rounded-full transition",
              HOT.autoFish,
              autoFish ? "ring-4 ring-green/70 animate-pulse" : ""
            )}
            aria-label={autoFish ? "Stop auto fishing" : "Auto fish"}
          >
            {autoFish && (
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[clamp(7px,0.8vw,10px)] font-bold text-green bg-black/60 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                AUTO ON
              </span>
            )}
          </button>

          {/* charge hint */}
          {charging && (
            <div
              className="absolute z-20 -translate-x-1/2 text-[clamp(8px,0.9vw,12px)] text-gold font-semibold px-3 py-1 rounded-full border border-border-gold tracking-wide"
              style={{ left: "83%", top: "70%", background: "linear-gradient(180deg,rgba(14,32,56,0.9),rgba(8,17,32,0.9))", boxShadow: "0 0 14px rgba(245,198,107,0.25)" }}
            >
              Release to cast!
            </div>
          )}

          {/* bite prompt — builds toward the hookset */}
          {phase === "biting" && (
            <div
              className={cn(
                "absolute z-20 left-1/2 -translate-x-1/2 top-[19%] rounded-full font-semibold tracking-wide border backdrop-blur-sm",
                biteStage === "aggressive"
                  ? "px-4 py-1.5 text-[clamp(10px,1.1vw,15px)] text-white border-red/60 animate-pulse"
                  : "px-3 py-1 text-[clamp(8px,0.95vw,13px)] text-gold border-border-gold"
              )}
              style={{
                background:
                  biteStage === "aggressive"
                    ? "linear-gradient(180deg,rgba(120,20,20,0.85),rgba(60,10,10,0.9))"
                    : "linear-gradient(180deg,rgba(14,32,56,0.85),rgba(8,17,32,0.9))",
                boxShadow:
                  biteStage === "aggressive"
                    ? "0 0 22px rgba(248,113,113,0.55)"
                    : "0 0 14px rgba(245,198,107,0.25)",
              }}
            >
              {biteStage === "nibble"
                ? "🫧 Something's nibbling…"
                : biteStage === "test"
                ? "👀 It's testing the bait…"
                : "⚡ STRIKE — set the hook!"}
            </div>
          )}

          {/* ── reel-in HUD — compact VERTICAL panel tucked above the CAST
              button, so it never covers the fish being reeled in ── */}
          {phase === "reeling" && (
            <div
              className="absolute z-20 left-[82%] top-[16%] w-[15.5%] min-w-[140px] max-w-[220px] rounded-2xl border border-border-gold px-3 py-3"
              style={{
                background: "linear-gradient(180deg, rgba(14,32,56,0.94), rgba(8,17,32,0.94))",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                boxShadow: "inset 0 0 0 1px rgba(245,198,107,0.18), 0 10px 34px rgba(0,0,0,0.55)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-[clamp(9px,0.95vw,13px)] font-semibold tracking-wide text-gold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Reeling
                </span>
                <span
                  className={cn(
                    "text-[clamp(6px,0.7vw,10px)] font-bold px-1.5 py-0.5 rounded-full border tracking-wide",
                    tension > 85
                      ? "text-red border-red/50 bg-red/15 animate-pulse"
                      : tension > 72
                      ? "text-gold border-border-gold bg-gold/10"
                      : "text-green border-green/40 bg-green/10"
                  )}
                >
                  {tension > 85 ? "DANGER" : tension > 72 ? "CAREFUL" : "PERFECT"}
                </span>
              </div>

              {/* twin vertical meters (fill bottom → top) */}
              <div className="flex items-stretch justify-center gap-5" style={{ height: "clamp(160px,42vh,380px)" }}>
                {/* line tension */}
                <div className="flex flex-col items-center gap-1">
                  <div className="relative w-4 flex-1 rounded-full bg-black/60 border border-white/10 overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-[28%]" style={{ background: "linear-gradient(0deg, transparent, rgba(248,113,113,0.3))" }} />
                    <div
                      className="absolute bottom-0 inset-x-0 rounded-full"
                      style={{
                        height: `${tension}%`,
                        background:
                          tension > 85
                            ? "linear-gradient(0deg,#F87171,#ff4d4d)"
                            : tension > 72
                            ? "linear-gradient(0deg,#F5C66B,#e0a83a)"
                            : "linear-gradient(0deg,#3DD598,#2fb7a0)",
                      }}
                    />
                    <span className="absolute inset-x-0 h-px bg-white/50" style={{ bottom: "72%" }} />
                    <span className="absolute inset-x-0 h-px bg-red/70" style={{ bottom: "85%" }} />
                  </div>
                  <span className="text-[clamp(5px,0.6vw,8px)] uppercase tracking-wide text-white/45">Tension</span>
                  <span className="text-[clamp(6px,0.68vw,9px)] font-mono text-white/80">{Math.round(tension)}%</span>
                </div>
                {/* caught */}
                <div className="flex flex-col items-center gap-1">
                  <div className="relative w-4 flex-1 rounded-full bg-black/60 border border-white/10 overflow-hidden">
                    <div className="absolute bottom-0 inset-x-0 rounded-full" style={{ height: `${progress}%`, background: "linear-gradient(0deg,#4F8EF7,#7db0ff)" }}>
                      <span className="absolute inset-x-0 top-0 h-2" style={{ background: "linear-gradient(180deg,rgba(255,255,255,0.55),transparent)" }} />
                    </div>
                  </div>
                  <span className="text-[clamp(5px,0.6vw,8px)] uppercase tracking-wide text-white/45">Caught</span>
                  <span className="text-[clamp(6px,0.68vw,9px)] font-mono text-gold">{Math.round(progress)}%</span>
                </div>
              </div>

              <p className="text-center text-[clamp(6px,0.72vw,10px)] text-white/85 mt-2 mb-0 font-medium leading-tight">
                {aiState === "run"
                  ? "🏃 Ease off!"
                  : aiState === "dive"
                  ? "⬇️ Diving…"
                  : aiState === "jump"
                  ? "🐟 Jumped!"
                  : "Hold to reel"}
              </p>
              {(perfectHook || combo > 1) && (
                <div className="flex flex-col items-center gap-0.5 mt-1">
                  {perfectHook && <span className="text-[clamp(5px,0.65vw,9px)] text-gold font-semibold">✨ Perfect hook</span>}
                  {combo > 1 && <span className="text-[clamp(5px,0.65vw,9px)] text-gold font-semibold">🔥 Combo ×{combo}</span>}
                </div>
              )}
            </div>
          )}

          {/* landscape hint — portrait phones render this 16:9 stage tiny */}
          {showHint && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/80 backdrop-blur-sm text-center px-6">
              <div className="text-3xl" style={{ animation: "reef-sway 1.6s ease-in-out infinite" }}>
                📱↻
              </div>
              <p className="text-[13px] text-white font-medium m-0">Rotate to landscape</p>
              <p className="text-[11px] text-white/70 m-0 max-w-[240px]">
                Investure Reef plays best wide — turn your phone sideways for the full stage.
              </p>
              <button
                onClick={() => setHintDismissed(true)}
                className="mt-1 px-4 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-[11px] hover:bg-white/15 transition"
              >
                Play anyway
              </button>
            </div>
          )}
        </div>
        </div>
      )}

      {/* Collection popup */}
      <AnimatePresence>
        {collectionOpen && (
          <ModalShell key="collection" title="Collection book" onClose={() => setCollectionOpen(false)} wide>
            <CollectionBook fish={fish} rarities={config.rarities} caught={state?.collection ?? {}} />
          </ModalShell>
        )}
      </AnimatePresence>

      {/* Ranking popup */}
      <AnimatePresence>
        {rankingOpen && (
          <ModalShell key="ranking" title="Weekly ranking" subtitle="Top anglers · resets Monday" onClose={() => setRankingOpen(false)}>
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
          </ModalShell>
        )}
      </AnimatePresence>

      {/* Shop popup */}
      <AnimatePresence>
        {shopOpen && (
          <ModalShell key="shop" title="Rewards shop" subtitle={`${points.toLocaleString()} points`} onClose={() => setShopOpen(false)} wide>
            {shopStage === "list" &&
              (activeRewards.length === 0 ? (
                <p className="text-[11px] text-text-subtle text-center py-8 m-0">No rewards available yet — check back soon.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {activeRewards.map((r) => {
                    const affordable = points >= r.cost;
                    const soldOut = typeof r.stock === "number" && r.stock <= 0;
                    return (
                      <div key={r.id} className="p-2 bg-canvas border border-border rounded-lg flex flex-col">
                        {r.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.image} alt={r.name} className="w-full h-20 object-cover rounded mb-1.5" />
                        ) : (
                          <div className="w-full h-20 rounded mb-1.5 bg-card-elev flex items-center justify-center">
                            <Gift className="w-6 h-6 text-text-subtle" />
                          </div>
                        )}
                        <p className="text-[11px] font-medium m-0 truncate">{r.name}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[11px] font-mono text-vault">{r.cost.toLocaleString()}</span>
                          <button
                            onClick={() => {
                              setShopReward(r);
                              setShopStage("confirm");
                            }}
                            disabled={!affordable || soldOut}
                            className="text-[10px] px-2 py-1 rounded-md bg-gold text-gold-dark font-medium disabled:opacity-40"
                          >
                            {soldOut ? "Sold out" : affordable ? "Redeem" : "Low"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            {shopStage === "confirm" && shopReward && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between px-3 py-2.5 bg-canvas border border-border rounded-lg">
                  <span className="text-[12px]">{shopReward.name}</span>
                  <span className="text-[12px] font-mono text-vault">{shopReward.cost.toLocaleString()} pts</span>
                </div>
                <p className="text-[10px] text-text-subtle m-0">
                  Balance after: <span className="font-mono">{(points - shopReward.cost).toLocaleString()} pts</span>
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setShopStage("list")} className="flex-1 py-2 border border-border-strong rounded-lg text-[12px] text-text-muted hover:bg-card-elev transition">
                    Back
                  </button>
                  <button onClick={confirmRedeem} className="flex-1 py-2 rounded-lg text-[12px] font-medium bg-gold text-gold-dark hover:brightness-110 transition">
                    Confirm redeem
                  </button>
                </div>
              </div>
            )}
            {shopStage === "processing" && (
              <div className="py-8 flex flex-col items-center gap-3">
                <Loader2 className="w-7 h-7 text-gold animate-spin" />
                <p className="text-[12px] text-text-muted m-0">Redeeming…</p>
              </div>
            )}
            {shopStage === "done" && (
              <div className="py-6 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-green/15 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-green" />
                </div>
                <p className="text-[14px] font-medium m-0">Redeemed!</p>
                <button onClick={() => setShopStage("list")} className="mt-2 px-5 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium">
                  Back to shop
                </button>
              </div>
            )}
            {shopStage === "error" && (
              <div className="py-6 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red/15 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red" />
                </div>
                <p className="text-[13px] font-medium m-0">Couldn&apos;t redeem</p>
                <p className="text-[11px] text-text-muted m-0">{shopErr}</p>
                <button onClick={() => setShopStage("list")} className="mt-2 px-5 py-2 bg-card-elev border border-border-strong rounded-lg text-[12px]">
                  Back
                </button>
              </div>
            )}
          </ModalShell>
        )}
      </AnimatePresence>

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
            {/* legendary+ get the cinematic backdrop */}
            {revealTier.bg && assets.eventLegendaryAlert && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={assets.eventLegendaryAlert}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none"
              />
            )}
            {/* god-rays — intensity scales with rarity tier */}
            {revealTier.rays > 0 && (
              <div
                className="absolute left-1/2 top-1/2 w-[130vmin] h-[130vmin] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  background: `conic-gradient(from 0deg, transparent 0deg, ${reveal.rarity.color}55 12deg, transparent 24deg, transparent 36deg, ${reveal.rarity.color}44 48deg, transparent 60deg)`,
                  opacity: revealTier.rays * 0.5,
                  animation: "reef-godrays 1.1s ease-out forwards",
                  maskImage: "radial-gradient(circle, black 0%, transparent 68%)",
                  WebkitMaskImage: "radial-gradient(circle, black 0%, transparent 68%)",
                }}
              />
            )}
            {/* radial particle burst */}
            {revealBurst.map((p) => (
              <span
                key={p.id}
                className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full pointer-events-none"
                style={
                  {
                    background: reveal.rarity.color,
                    boxShadow: `0 0 6px ${reveal.rarity.color}`,
                    "--px": `${p.dx}px`,
                    "--py": `${p.dy}px`,
                    animation: `reef-particle 1s ease-out ${p.delay}s forwards`,
                  } as React.CSSProperties
                }
              />
            ))}
            {/* spinning rarity rays behind the card */}
            <div
              className="absolute left-1/2 top-1/2 -z-[1] rounded-full pointer-events-none"
              style={{
                width: `${20 + revealRank * 1.6}rem`,
                height: `${20 + revealRank * 1.6}rem`,
                transform: "translate(-50%,-50%)",
                background: `conic-gradient(from 0deg, ${reveal.rarity.color}00, ${reveal.rarity.color}55, ${reveal.rarity.color}00, ${reveal.rarity.color}55, ${reveal.rarity.color}00)`,
                filter: "blur(3px)",
                animation: `reef-spin ${Math.max(4, 9 - revealRank)}s linear infinite`,
                opacity: 0.5,
              }}
            />
            <motion.div
              initial={{ scale: 0.5, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 240, damping: 16 }}
              className="relative flex flex-col items-center text-center rounded-[28px] px-8 py-7 max-w-[86vw]"
              style={{
                background: "linear-gradient(180deg, rgba(14,32,56,0.82), rgba(6,13,26,0.9))",
                border: `1px solid ${reveal.rarity.color}66`,
                boxShadow: `inset 0 0 0 1px rgba(245,198,107,0.14), 0 0 40px ${reveal.rarity.color}55, 0 20px 50px rgba(0,0,0,0.6)`,
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="absolute -z-[1] w-52 h-52 rounded-full"
                style={{
                  left: "50%",
                  top: "38%",
                  transform: "translate(-50%,-50%)",
                  background: `radial-gradient(circle, ${reveal.rarity.color}55, transparent 70%)`,
                }}
              />
              {reveal.isFoth && (
                <p className="text-[11px] text-gold m-0 mb-1 font-semibold tracking-wide">🔥 FISH OF THE HOUR</p>
              )}
              {isNewCatch && (
                <span className="mb-2 text-[9px] font-bold px-2.5 py-0.5 rounded-full bg-gold text-gold-dark tracking-wider shadow-[0_0_12px_rgba(245,198,107,0.5)]">
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
              {/* rarity ribbon */}
              <div
                className="mt-2 px-4 py-0.5 rounded-full text-[11px] uppercase tracking-[0.22em] font-bold"
                style={{
                  color: "#fff",
                  background: `linear-gradient(90deg, transparent, ${reveal.rarity.color}55, transparent)`,
                  textShadow: `0 0 12px ${reveal.rarity.color}`,
                }}
              >
                {rarityMeta(reveal.fish.rarity).label}
              </div>
              <p className="text-[22px] font-medium m-0 mt-0.5 text-white" style={{ fontFamily: "var(--font-display)" }}>
                {reveal.fish.name}
              </p>
              <p className="text-[15px] font-mono text-gold mt-2 m-0">+{reveal.gained} points</p>
              {reveal.streakBonus > 0 && (
                <p className="text-[10px] text-white/70 m-0 mt-1">includes +{reveal.streakBonus} streak bonus 🔥</p>
              )}
              {reelRating >= 0.85 && (
                <p className="text-[10px] text-gold m-0 mt-1 font-semibold">
                  ✨ Perfect reel!{combo > 1 ? ` · 🔥 Combo ×${combo}` : ""}
                </p>
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
                  className="px-7 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-semibold hover:brightness-110 transition shadow-[0_0_18px_rgba(245,198,107,0.4)]"
                >
                  Collect
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

// Shared in-game popup shell (backdrop + card) used for the quests/collection/
// ranking/shop overlays, so nothing leaves the game environment.
function ModalShell({
  title,
  subtitle,
  onClose,
  wide,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className={cn(
          "bg-card border border-border rounded-2xl w-full p-4 max-h-[85vh] overflow-y-auto",
          wide ? "max-w-2xl" : "max-w-md"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-[14px] font-medium m-0">{title}</h3>
            {subtitle && <p className="text-[10px] text-text-subtle m-0 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
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
