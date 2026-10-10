"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Info, X, Zap, Repeat, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  slotSpin, orbImage, potCoinImage, SYMBOL_IMAGE, SYMBOL_NAME, POT_LABEL, POT_COLOR, ART, REELS, ROWS,
  type SpinResponse, type Cell, type PotKey, type Sym, type Step, type HoldWinResult, type DayState,
} from "@/lib/slot";

/* ───────────────────────── timing ───────────────────────── */
const T = {
  reelSpin: 650, reelStagger: 140, highlight: 650, burst: 320, drop: 480, between: 160,
  orbMerge: 900, winCount: 900, bigWin: 2800, feature: 2200, hwRound: 1100, hwReveal: 1800, gap: 700,
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const HOUR_MS = 3_600_000;

type Tile = { id: string; sym: Sym; orb?: number; fresh?: boolean };
type Phase = "idle" | "spinning" | "cascade" | "holdwin";
type Tier = "win" | "big" | "mega" | "epic";
const RANDOM_SYMS: Sym[] = ["L1", "L2", "L3", "L4", "H1", "H2", "H3", "H4"];

function tilesFrom(grid: Cell[][], prev?: Tile[][], removed?: [number, number][]): Tile[][] {
  // survivors keep their ids so framer can slide them down; new cells come in from the top
  if (!prev || !removed) return grid.map((col, r) => col.map((c, y) => ({ id: `${r}-${y}-${Math.random().toString(36).slice(2, 7)}`, sym: c.sym, orb: c.orb })));
  const gone = new Set(removed.map(([r, y]) => r * 10 + y));
  return grid.map((col, r) => {
    const survivors = prev[r].filter((_, y) => !gone.has(r * 10 + y));
    const freshCount = ROWS - survivors.length;
    return col.map((c, y) =>
      y < freshCount
        ? { id: `${r}-n-${Math.random().toString(36).slice(2, 7)}`, sym: c.sym, orb: c.orb, fresh: true }
        : { ...survivors[y - freshCount], sym: c.sym, orb: c.orb, fresh: false },
    );
  });
}
function tierOf(win: number, spinValue: number): Tier {
  const x = win / Math.max(1, spinValue);
  return x >= 150 ? "epic" : x >= 50 ? "mega" : x >= 15 ? "big" : "win";
}
function untilMidnight(now: number): string {
  const d = new Date(now + 8 * HOUR_MS);
  const left = 86_400_000 - (((d.getUTCHours() * 60 + d.getUTCMinutes()) * 60 + d.getUTCSeconds()) * 1000);
  return `${Math.floor(left / HOUR_MS)}h ${Math.floor((left % HOUR_MS) / 60_000)}m`;
}

/**
 * Dragon Spire, daily free spins. The member spins the day's allotment; the
 * server hands back each result (cascades, everyday Hold & Win, pot drops,
 * the Grand) and this screen animates it.
 */
export function DragonSpireGame({
  points,
  pots,
  day,
  spinValue = 20,
  testing,
  onSpin,
}: {
  points: number;
  /** Fixed pot amounts from admin, shown at the top. */
  pots: Record<PotKey, number>;
  day: DayState;
  spinValue?: number;
  testing: boolean;
  /** Defaults to the real callable; the preview route passes a fake. */
  onSpin?: () => Promise<SpinResponse>;
}) {
  const spinFn = useMemo(() => onSpin ?? (() => slotSpin()), [onSpin]);
  const [tiles, setTiles] = useState<Tile[][]>(() => Array.from({ length: REELS }, (_, r) => Array.from({ length: ROWS }, (_, y) => ({ id: `init-${r}-${y}`, sym: RANDOM_SYMS[(r * 3 + y * 5) % RANDOM_SYMS.length] }))));
  const [phase, setPhase] = useState<Phase>("idle");
  const [spinningReels, setSpinningReels] = useState<boolean[]>(Array(REELS).fill(false));
  const [lit, setLit] = useState<Set<number>>(new Set());
  const [bursting, setBursting] = useState<Set<number>>(new Set());
  const [stepMult, setStepMult] = useState<number | null>(null);
  const [orbSum, setOrbSum] = useState<number | null>(null);
  const [runningWin, setRunningWin] = useState(0);
  const [shownWin, setShownWin] = useState(0);
  const [bigWin, setBigWin] = useState<{ tier: Tier; amount: number; label?: string } | null>(null);
  const [feature, setFeature] = useState<{ text: string; img: string } | null>(null);
  const [hw, setHw] = useState<{ coins: Map<number, number | PotKey>; respins: number; total: number | null; potsHit: PotKey[]; landing: Set<number>; grand: boolean } | null>(null);
  const [localPoints, setLocalPoints] = useState(points);
  const [localDay, setLocalDay] = useState({ total: day.spinsTotal, used: day.spinsUsed, won: day.wonToday });
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [paytable, setPaytable] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const busy = useRef(false);
  const autoRef = useRef(auto);
  const turboRef = useRef(turbo);
  useEffect(() => { autoRef.current = auto; }, [auto]);
  useEffect(() => { turboRef.current = turbo; }, [turbo]);
  const mounted = useRef(true);
  // set on mount too: React's dev-mode double effect would otherwise leave it false for good
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!busy.current) setLocalPoints(points); }, [points]);
  useEffect(() => { if (!busy.current) setLocalDay({ total: day.spinsTotal, used: day.spinsUsed, won: day.wonToday }); }, [day.spinsTotal, day.spinsUsed, day.wonToday]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);

  const t = useCallback((ms: number) => sleep(turboRef.current ? Math.round(ms * 0.45) : ms), []);
  const spinsLeft = Math.max(0, localDay.total - localDay.used);
  const runSpinRef = useRef<() => Promise<void>>(async () => {});

  const playHoldWin = useCallback(async (h: HoldWinResult) => {
    setPhase("holdwin");
    setFeature({ text: "HOLD & WIN", img: `${ART}/coin-grand.png` });
    await t(T.feature);
    setFeature(null);
    const coins = new Map<number, number | PotKey>();
    const order = h.coins;
    const landedKeys = new Set(h.rounds.flatMap((r) => r.landed.map(([r2, y]) => r2 * 10 + y)));
    for (const c of order) if (!landedKeys.has(c.reel * 10 + c.row)) coins.set(c.reel * 10 + c.row, c.value);
    setHw({ coins: new Map(coins), respins: 3, total: null, potsHit: [], landing: new Set(), grand: false });
    await t(T.hwRound);
    for (const round of h.rounds) {
      setHw((s) => s && { ...s, landing: new Set(Array.from({ length: REELS * ROWS }, (_, i) => Math.floor(i / ROWS) * 10 + (i % ROWS)).filter((k) => !s.coins.has(k))) });
      await t(T.hwRound * 0.7);
      for (const [r, y] of round.landed) {
        const c = order.find((o) => o.reel === r && o.row === y && !coins.has(r * 10 + y));
        if (c) coins.set(r * 10 + y, c.value);
      }
      setHw((s) => s && { ...s, coins: new Map(coins), respins: round.respinsLeft, landing: new Set() });
      await t(T.hwRound * 0.6);
    }
    setHw((s) => s && { ...s, total: h.total, potsHit: h.potsHit, grand: h.grandFilled });
    await t(T.hwReveal + (h.potsHit.length ? 900 : 0));
    setHw(null);
    setPhase("cascade");
  }, [t]);

  /* ─────────── one spin, fully animated ─────────── */
  const runSpin = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setBigWin(null);
    setOrbSum(null);
    setStepMult(null);
    setRunningWin(0);
    setShownWin(0);
    setPhase("spinning");
    setSpinningReels(Array(REELS).fill(true));

    let res: SpinResponse;
    const started = Date.now();
    try {
      res = await spinFn();
    } catch (e) {
      if (!mounted.current) return;
      setSpinningReels(Array(REELS).fill(false));
      setPhase("idle");
      setError(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Spin failed. Please try again.");
      setAuto(false);
      busy.current = false;
      return;
    }
    if (!mounted.current) return;
    const { result } = res;
    const steps = result.steps;
    const minStop = T.reelSpin - (Date.now() - started);
    if (minStop > 0) await t(minStop);
    const first = tilesFrom(steps[0].grid);
    for (let r = 0; r < REELS; r++) {
      await t(T.reelStagger);
      setTiles((cur) => cur.map((col, i) => (i === r ? first[r] : col)));
      setSpinningReels((s) => s.map((v, i) => (i === r ? false : v)));
    }
    let cur = first;
    let total = 0;

    /* cascades */
    for (let i = 0; i < steps.length; i++) {
      const step: Step = steps[i];
      if (step.wins.length === 0) break;
      setPhase("cascade");
      setStepMult(step.mult);
      const cells = new Set(step.removed.map(([r, y]) => r * 10 + y));
      setLit(cells);
      total += step.stepWin;
      setRunningWin(total);
      await t(T.highlight);
      setBursting(cells);
      await t(T.burst);
      setLit(new Set());
      setBursting(new Set());
      const next = steps[i + 1];
      if (!next) break;
      cur = tilesFrom(next.grid, cur, step.removed);
      setTiles(cur);
      await t(T.drop + T.between);
    }
    if (result.orbSum > 0 && result.lineWin > 0) {
      setOrbSum(result.orbSum);
      await t(T.orbMerge);
    }
    setStepMult(null);
    const lineTotal = Math.round(result.orbSum > 0 ? result.lineWin * result.orbSum : result.lineWin);
    if (lineTotal > 0) {
      setShownWin(lineTotal);
      await t(T.winCount);
    }

    /* hold & win (everyday coins, a pot drop, or the Grand) */
    if (result.holdWin) await playHoldWin(result.holdWin);

    /* celebration */
    const shownTotal = testing ? Math.round(result.totalWin) : res.win;
    if (shownTotal > 0) {
      setShownWin(shownTotal);
      const tier = res.drop ? (res.drop.pot === "grand" ? "epic" : res.drop.pot === "major" ? "mega" : "big") : tierOf(shownTotal, spinValue);
      if (tier !== "win") {
        setBigWin({ tier, amount: shownTotal, label: res.drop ? `${POT_LABEL[res.drop.pot]} JACKPOT` : undefined });
        await t(T.bigWin + (res.drop ? 800 : 0));
        setBigWin(null);
      }
    }

    if (!mounted.current) return;
    setLocalPoints(res.points);
    setLocalDay({ total: res.spinsTotal, used: res.spinsUsed, won: res.wonToday });
    setPhase("idle");
    busy.current = false;

    if (autoRef.current && res.spinsUsed < res.spinsTotal) {
      await t(T.gap);
      if (mounted.current && autoRef.current) void runSpinRef.current();
    } else if (autoRef.current) {
      setAuto(false);
    }
  }, [spinFn, t, testing, playHoldWin, spinValue]);
  useEffect(() => { runSpinRef.current = runSpin; }, [runSpin]);

  /* ─────────── render ─────────── */
  const reelImgs = useMemo(() => RANDOM_SYMS.map((s) => SYMBOL_IMAGE[s]), []);
  const idle = phase === "idle";
  const bg = hw ? `${ART}/bg-holdwin.jpg` : `${ART}/bg-base.jpg`;
  const noSpinsToday = localDay.total === 0;
  const allPlayed = !noSpinsToday && spinsLeft === 0;

  return (
    <div className="relative min-h-[100dvh] bg-[#070C19] text-white overflow-hidden select-none" style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}>
      <AnimatePresence initial={false}>
        <motion.div key={bg} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${bg})` }} />
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70 pointer-events-none" />

      <div className="relative mx-auto max-w-[520px] min-h-[100dvh] flex flex-col px-3 pt-2 pb-[max(env(safe-area-inset-bottom),12px)]">
        {/* top bar */}
        <div className="flex items-center justify-between gap-2 h-10">
          <Link href="/games" className="w-9 h-9 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-white/80 hover:text-white" aria-label="Back to Games"><ArrowLeft className="w-4 h-4" /></Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${ART}/logo.png`} alt="Dragon Spire" className="h-12 w-auto drop-shadow-[0_2px_12px_rgba(245,198,107,0.35)]" />
          <button type="button" onClick={() => setPaytable(true)} className="w-9 h-9 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-white/80 hover:text-white" aria-label="How it works"><Info className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 flex flex-col justify-center min-h-0">
        {/* pots */}
        <div className="grid grid-cols-4 gap-1 mt-1">
          {(["grand", "major", "minor", "mini"] as PotKey[]).map((k) => (
            <div key={k} className={cn("relative h-[46px] bg-contain bg-no-repeat bg-center flex flex-col items-center justify-center", hw?.potsHit.includes(k) && "animate-pulse")} style={{ backgroundImage: `url(${ART}/pot-${k}.png)` }}>
              <span className="text-[7px] font-extrabold tracking-[0.2em] leading-none mt-0.5" style={{ color: POT_COLOR[k] }}>{POT_LABEL[k]}</span>
              <span className="text-[12px] font-bold font-mono tabular-nums leading-tight text-[#F8EFD4] drop-shadow">{Math.round(pots[k]).toLocaleString()}</span>
            </div>
          ))}
        </div>

        {/* today's spins */}
        <div className={cn("mt-1.5 flex items-center gap-2 rounded-xl px-3 py-1.5 border", allPlayed ? "bg-black/40 border-white/10" : "bg-[#F5C66B]/10 border-[#F5C66B]/40")}>
          <Gift className="w-4 h-4 text-[#F5C66B] shrink-0" />
          <div className="flex-1 min-w-0 leading-tight">
            {noSpinsToday ? (
              <>
                <p className="m-0 text-[11px] font-semibold">No free spins today</p>
                <p className="m-0 text-[9px] text-white/55">An active placement of at least ₱{day.minActive.toLocaleString()} gives you daily spins.</p>
              </>
            ) : allPlayed ? (
              <>
                <p className="m-0 text-[11px] font-semibold">All {localDay.total} spins played</p>
                <p className="m-0 text-[9px] text-white/55">Won today: <span className="text-[#F5C66B] font-mono">{Math.round(localDay.won).toLocaleString()}</span> GP · new spins at midnight ({untilMidnight(now)})</p>
              </>
            ) : (
              <>
                <p className="m-0 text-[11px] font-semibold text-[#F5C66B]">{localDay.total} free spins today</p>
                <p className="m-0 text-[9px] text-white/55">₱{day.capital.toLocaleString()} active · unused spins are gone at midnight ({untilMidnight(now)})</p>
              </>
            )}
          </div>
          {stepMult !== null && <span className="text-[#F5C66B] font-bold text-[11px] shrink-0">×{stepMult}{orbSum ? ` · ×${orbSum}` : ""}</span>}
          {testing && <span className="text-[8px] text-[#7FE8C4] shrink-0">TEST</span>}
        </div>

        {/* reels inside the frame */}
        <div className="relative w-full mt-1" style={{ aspectRatio: "10 / 9" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${ART}/reel-frame.png`} alt="" aria-hidden className="absolute inset-0 w-full h-full pointer-events-none z-10" />
          <div className="absolute z-0 rounded-md overflow-hidden" style={{ left: "8.2%", right: "8.2%", top: "9.6%", bottom: "15.4%", background: "radial-gradient(80% 80% at 50% 40%, rgba(20,16,40,0.92), rgba(5,8,20,0.96))" }}>
            <div className="grid grid-cols-5 gap-[2%] w-full h-full p-[2%]">
              {tiles.map((col, r) => (
                <div key={r} className="relative flex flex-col gap-[3%] min-h-0">
                  {spinningReels[r] ? (
                    <ReelBlur imgs={reelImgs} offset={r} />
                  ) : (
                    <AnimatePresence initial={false}>
                      {col.map((tile, y) => {
                        const key = r * 10 + y;
                        const isLit = lit.has(key);
                        const isBurst = bursting.has(key);
                        const hwCoin = hw?.coins.get(key);
                        const hwLanding = hw?.landing.has(key);
                        return (
                          <motion.div
                            key={tile.id}
                            layout
                            initial={tile.fresh ? { y: -140, opacity: 0 } : false}
                            animate={{ y: 0, opacity: isBurst ? 0 : 1, scale: isBurst ? 1.35 : isLit ? 1.06 : 1 }}
                            transition={{ layout: { type: "spring", stiffness: 420, damping: 32 }, y: { type: "spring", stiffness: 380, damping: 26 }, opacity: { duration: 0.25 }, scale: { duration: 0.25 } }}
                            className={cn("relative flex-1 min-h-0 rounded-md flex items-center justify-center", isLit && "ring-2 ring-[#F5C66B] shadow-[0_0_18px_rgba(245,198,107,0.7)] bg-[#F5C66B]/10", hw && !hwCoin && "opacity-25")}
                          >
                            {hw && hwCoin !== undefined ? (
                              <HwCoin value={hwCoin} />
                            ) : hw && hwLanding ? (
                              <ReelBlur imgs={[`${ART}/coin-blank.png`, `${ART}/rune-fire.png`, `${ART}/coin-blank.png`, `${ART}/rune-ice.png`]} offset={key} small />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={tile.sym === "O" && tile.orb ? orbImage(tile.orb) : SYMBOL_IMAGE[tile.sym]} alt={SYMBOL_NAME[tile.sym]} draggable={false} className={cn("w-[92%] h-[92%] object-contain", tile.sym === "W" && "drop-shadow-[0_0_10px_rgba(245,198,107,0.9)]", tile.sym === "C" && "drop-shadow-[0_0_8px_rgba(245,198,107,0.7)]", tile.sym === "O" && "drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]")} />
                            )}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  )}
                </div>
              ))}
            </div>
          </div>
          {hw && (
            <div className="absolute left-0 right-0 -bottom-1 z-20 flex justify-center">
              <div className="px-4 py-1.5 rounded-full bg-black/70 border border-[#F5C66B]/50 text-[12px] font-bold text-[#F5C66B]">
                {hw.total === null ? `RESPINS ${hw.respins}` : hw.grand ? "GRAND JACKPOT!" : hw.potsHit.length ? `${hw.potsHit.map((p) => POT_LABEL[p]).join(" + ")} JACKPOT` : `+${hw.total.toLocaleString()} GP`}
              </div>
            </div>
          )}
        </div>

        {/* win line */}
        <div className="h-9 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {shownWin > 0 || runningWin > 0 ? (
              <motion.div key={`${shownWin}-${runningWin}`} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="text-[20px] font-extrabold text-[#F5C66B] font-mono tabular-nums drop-shadow-[0_0_12px_rgba(245,198,107,0.6)]">
                +{Math.round(shownWin || runningWin).toLocaleString()} <span className="text-[11px] font-semibold text-white/80">GP</span>
              </motion.div>
            ) : (
              <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[11px] text-white/45">{idle ? (spinsLeft > 0 ? "Good luck, adventurer" : "") : ""}</motion.div>
            )}
          </AnimatePresence>
        </div>
        </div>

        {/* controls */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-[0.14em] text-white/55">Spins left</span>
            <span className="text-[18px] font-bold font-mono tabular-nums leading-none">{spinsLeft} <span className="text-[10px] text-white/50 font-normal">/ {localDay.total}</span></span>
            <div className="flex gap-1 mt-1">
              <button type="button" onClick={() => setAuto((a) => !a)} disabled={spinsLeft === 0} className={cn("px-2 py-1 rounded-full text-[9px] font-bold tracking-wider border flex items-center gap-1 disabled:opacity-40", auto ? "bg-[#3DD598]/20 border-[#3DD598] text-[#3DD598]" : "bg-black/40 border-white/15 text-white/70")}><Repeat className="w-3 h-3" /> AUTO</button>
              <button type="button" onClick={() => setTurbo((v) => !v)} className={cn("px-2 py-1 rounded-full text-[9px] font-bold tracking-wider border flex items-center gap-1", turbo ? "bg-[#F5C66B]/20 border-[#F5C66B] text-[#F5C66B]" : "bg-black/40 border-white/15 text-white/70")}><Zap className="w-3 h-3" /> TURBO</button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { if (auto && !idle) { setAuto(false); return; } void runSpin(); }}
            disabled={(!idle && !auto) || (idle && spinsLeft === 0)}
            className={cn("relative w-[88px] h-[88px] rounded-full transition active:scale-95 disabled:opacity-40", !idle && "animate-[spin_1.6s_linear_infinite]")}
            aria-label="Free spin"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${ART}/spin-button.png`} alt="" aria-hidden className="w-full h-full object-contain drop-shadow-[0_0_18px_rgba(61,213,152,0.55)]" />
            {idle && spinsLeft > 0 && <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black tracking-wider text-[#06301e] pointer-events-none">FREE<br />SPIN</span>}
          </button>

          <div className="flex flex-col items-end gap-1">
            <span className="text-[9px] uppercase tracking-[0.14em] text-white/55">Balance</span>
            <span className="text-[15px] font-bold font-mono tabular-nums">{Math.round(localPoints).toLocaleString()} <span className="text-[10px] text-white/60">GP</span></span>
            <span className="text-[9px] text-white/45">{testing ? "test mode" : auto ? "auto · tap to stop" : localDay.won > 0 ? `won today ${Math.round(localDay.won).toLocaleString()}` : " "}</span>
          </div>
        </div>
        {error && <p className="text-[11px] text-[#FF6B8A] text-center m-0 mt-2">{error}</p>}
      </div>

      {/* feature banner */}
      <AnimatePresence>
        {feature && (
          <motion.div key={feature.text} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none bg-black/50">
            <motion.div initial={{ scale: 0.6, rotate: -4 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={feature.img} alt="" className="w-28 h-28 mx-auto drop-shadow-[0_0_30px_rgba(245,198,107,0.9)]" />
              <div className="mt-2 text-[34px] font-black tracking-wide text-[#F5C66B] drop-shadow-[0_0_20px_rgba(245,198,107,0.8)]" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{feature.text}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* big win / jackpot */}
      <AnimatePresence>
        {bigWin && (
          <motion.div key="bigwin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none bg-black/60 overflow-hidden">
            <CoinShower />
            <motion.img src={`${ART}/bigwin-dragon.png`} alt="" initial={{ y: 80, scale: 0.7, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 180, damping: 16 }} className="w-[80%] max-w-[420px] drop-shadow-[0_0_40px_rgba(245,198,107,0.6)]" />
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: [0.5, 1.15, 1] }} transition={{ duration: 0.6 }} className="-mt-6 text-center">
              <div className="text-[13px] font-bold tracking-[0.3em] text-white/80">{bigWin.label ?? (bigWin.tier === "epic" ? "EPIC WIN" : bigWin.tier === "mega" ? "MEGA WIN" : "BIG WIN")}</div>
              <CountUp to={bigWin.amount} className="text-[44px] font-black text-[#F5C66B] font-mono tabular-nums drop-shadow-[0_0_24px_rgba(245,198,107,0.9)]" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* how it works */}
      <AnimatePresence>
        {paytable && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" onClick={() => setPaytable(false)}>
            <div className="w-full max-w-[460px] max-h-[86dvh] overflow-y-auto rounded-2xl bg-[#0E1A2C] border border-[#F5C66B]/30 p-4 text-[12px]" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <p className="m-0 text-[15px] font-bold text-[#F5C66B]">How Dragon Spire works</p>
                <button type="button" onClick={() => setPaytable(false)} aria-label="Close"><X className="w-5 h-5 text-white/70" /></button>
              </div>
              <ul className="m-0 pl-4 flex flex-col gap-1.5 text-white/80 leading-relaxed">
                <li><b className="text-white">Free spins every day.</b> An active placement of ₱{day.minActive.toLocaleString()} gives you daily spins; every extra ₱1,000 adds more. Unused spins are gone at midnight.</li>
                <li><b className="text-white">1,024 ways.</b> A symbol pays when it lands on reels 1, 2 and 3 or more in a row, in any row.</li>
                <li><b className="text-white">Cascades.</b> Winning symbols burst and new ones fall in. Each cascade raises the multiplier: ×1, ×2, ×3, ×5.</li>
                <li><b className="text-white">Orbs.</b> Multiplier orbs that land during a winning chain are added together and multiply the whole chain.</li>
                <li><b className="text-white">Hold &amp; Win.</b> Six or more medallions start 3 respins. Every new medallion resets the respins. Medallions show Game Points or a jackpot name.</li>
                <li><b className="text-white">Jackpots.</b> Mini, Minor and Major medallions pay the amounts shown at the top. Fill all 20 spaces for the Grand.</li>
                <li><b className="text-white">Everything you win</b> goes straight to your Game Points.</li>
              </ul>
              <div className="grid grid-cols-4 gap-2 mt-3">
                {(["H4", "H3", "H2", "H1", "L4", "L3", "L2", "L1"] as Sym[]).map((s) => (
                  <div key={s} className="flex flex-col items-center gap-0.5 bg-black/30 rounded-lg p-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={SYMBOL_IMAGE[s]} alt={SYMBOL_NAME[s]} className="w-12 h-12 object-contain" />
                    <span className="text-[9px] text-white/60 text-center leading-tight">{SYMBOL_NAME[s]}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A reel in motion: a stack of symbols scrolling fast with a blur. */
function ReelBlur({ imgs, offset, small }: { imgs: string[]; offset: number; small?: boolean }) {
  return (
    <div className="relative flex-1 min-h-0 overflow-hidden rounded-md">
      {/* the stack moves DOWN, like a real reel falling past the window */}
      <motion.div className="absolute inset-x-0 top-0 flex flex-col" initial={{ y: "-50%" }} animate={{ y: ["-50%", "0%"] }} transition={{ duration: small ? 0.35 : 0.42, ease: "linear", repeat: Infinity }} style={{ filter: "blur(1.5px)" }}>
        {[...imgs, ...imgs].map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={imgs[(i + offset) % imgs.length] ?? src} alt="" aria-hidden className={cn("w-full object-contain opacity-80", small ? "h-full" : "h-[25%]")} style={{ aspectRatio: "1 / 1" }} />
        ))}
      </motion.div>
    </div>
  );
}

function HwCoin({ value }: { value: number | PotKey }) {
  const pot = typeof value !== "number";
  return (
    <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }} className="relative w-[94%] h-[94%] flex items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pot ? potCoinImage(value) : `${ART}/coin-blank.png`} alt={pot ? POT_LABEL[value] : `${value} points`} className="w-full h-full object-contain drop-shadow-[0_0_10px_rgba(245,198,107,0.8)]" />
      {!pot && <span className="absolute text-[13px] font-black text-[#3a2a05] font-mono tabular-nums drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">{value.toLocaleString()}</span>}
    </motion.div>
  );
}

function CountUp({ to, className }: { to: number; className?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 1400;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <div className={className}>+{v.toLocaleString()}</div>;
}

/** Falling coins, pure CSS so it costs nothing to run. */
function CoinShower() {
  const coins = useMemo(() => Array.from({ length: 28 }, (_, i) => ({ left: (i * 37) % 100, delay: (i % 7) * 0.18, dur: 1.6 + (i % 5) * 0.25, size: 18 + (i % 4) * 8, rot: (i * 53) % 360 })), []);
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      <style>{`@keyframes dsCoinFall{0%{transform:translateY(-12vh) rotate(0deg);opacity:0}10%{opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:.9}}`}</style>
      {coins.map((c, i) => (
        <span key={i} className="absolute top-0 rounded-full" style={{ left: `${c.left}%`, width: c.size, height: c.size, background: "radial-gradient(circle at 35% 35%, #ffe9a8, #d5ae68 55%, #8a6322)", boxShadow: "0 0 10px rgba(245,198,107,0.8)", animation: `dsCoinFall ${c.dur}s linear ${c.delay}s infinite`, transform: `rotate(${c.rot}deg)` }} />
      ))}
    </div>
  );
}
