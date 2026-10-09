"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Info, Loader2, Minus, Plus, X, Zap, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  slotSpin, orbImage, potCoinImage, SYMBOL_IMAGE, SYMBOL_NAME, POT_KEYS, POT_LABEL, POT_COLOR, ART, REELS, ROWS, DEFAULT_BETS,
  type SpinResponse, type Cell, type PotKey, type Sym, type Step, type HoldWinResult,
} from "@/lib/slot";

/* ───────────────────────── timing ───────────────────────── */
const T = {
  reelSpin: 650, reelStagger: 140, highlight: 650, burst: 320, drop: 480, between: 160,
  orbMerge: 900, winCount: 900, bigWin: 2800, feature: 2200, hwRound: 1100, hwReveal: 1800, freeGap: 800,
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Tile = { id: string; sym: Sym; orb?: number; fresh?: boolean };
type Phase = "idle" | "spinning" | "cascade" | "holdwin" | "done";
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

function tierOf(win: number, bet: number): Tier {
  const x = win / Math.max(1, bet);
  return x >= 150 ? "epic" : x >= 50 ? "mega" : x >= 15 ? "big" : "win";
}

export function DragonSpireGame({
  uid,
  points,
  bets = DEFAULT_BETS,
  pots,
  freeSpinsLeft,
  freeTotal,
  testing,
  onSpin,
  initialBet,
}: {
  uid: string;
  points: number;
  bets?: number[];
  pots: Record<PotKey, number>;
  freeSpinsLeft: number;
  freeTotal: number;
  testing: boolean;
  /** Defaults to the real callable; the preview route passes a fake. */
  onSpin?: (bet: number) => Promise<SpinResponse>;
  initialBet?: number;
}) {
  const spinFn = onSpin ?? slotSpin;
  const [betIdx, setBetIdx] = useState(() => Math.max(0, bets.indexOf(initialBet ?? 25) >= 0 ? bets.indexOf(initialBet ?? 25) : Math.min(2, bets.length - 1)));
  const bet = bets[betIdx] ?? bets[0];
  const [tiles, setTiles] = useState<Tile[][]>(() => Array.from({ length: REELS }, (_, r) => Array.from({ length: ROWS }, (_, y) => ({ id: `init-${r}-${y}`, sym: RANDOM_SYMS[(r * 3 + y * 5) % RANDOM_SYMS.length] }))));
  const [phase, setPhase] = useState<Phase>("idle");
  const [spinningReels, setSpinningReels] = useState<boolean[]>(Array(REELS).fill(false));
  const [lit, setLit] = useState<Set<number>>(new Set());
  const [bursting, setBursting] = useState<Set<number>>(new Set());
  const [stepMult, setStepMult] = useState<number | null>(null);
  const [orbSum, setOrbSum] = useState<number | null>(null);
  const [runningWin, setRunningWin] = useState(0);
  const [shownWin, setShownWin] = useState(0);
  const [bigWin, setBigWin] = useState<{ tier: Tier; amount: number } | null>(null);
  const [feature, setFeature] = useState<{ kind: "free" | "holdwin"; text: string } | null>(null);
  const [hw, setHw] = useState<{ coins: Map<number, number | PotKey>; respins: number; total: number | null; potsHit: PotKey[]; landing: Set<number>; grand: boolean } | null>(null);
  const [localPoints, setLocalPoints] = useState(points);
  const [localPots, setLocalPots] = useState(pots);
  const [localFree, setLocalFree] = useState({ left: freeSpinsLeft, total: freeTotal, bet: bet });
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [paytable, setPaytable] = useState(false);
  const [scatterTease, setScatterTease] = useState(false);
  const busy = useRef(false);
  const autoRef = useRef(auto);
  const turboRef = useRef(turbo);
  useEffect(() => { autoRef.current = auto; }, [auto]);
  useEffect(() => { turboRef.current = turbo; }, [turbo]);
  const mounted = useRef(true);
  // set on mount too: React's dev-mode double effect would otherwise leave it false for good
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!busy.current) setLocalPoints(points); }, [points]);
  useEffect(() => { if (!busy.current) setLocalPots(pots); }, [pots]);
  useEffect(() => { if (!busy.current) setLocalFree((f) => ({ ...f, left: freeSpinsLeft, total: freeTotal })); }, [freeSpinsLeft, freeTotal]);

  const t = useCallback((ms: number) => sleep(turboRef.current ? Math.round(ms * 0.45) : ms), []);
  const inFree = localFree.left > 0;
  const canAfford = testing || inFree || localPoints >= bet;

  const runSpinRef = useRef<() => Promise<void>>(async () => {});

  const playHoldWin = useCallback(async (h: HoldWinResult) => {
    setPhase("holdwin");
    setFeature({ kind: "holdwin", text: "HOLD & WIN" });
    await t(T.feature);
    setFeature(null);
    const coins = new Map<number, number | PotKey>();
    const order = h.coins;
    // the triggering coins are those not in any round's landed list
    const landedKeys = new Set(h.rounds.flatMap((r) => r.landed.map(([r2, y]) => r2 * 10 + y)));
    for (const c of order) if (!landedKeys.has(c.reel * 10 + c.row)) coins.set(c.reel * 10 + c.row, c.value);
    setHw({ coins: new Map(coins), respins: 3, total: null, potsHit: [], landing: new Set(), grand: false });
    await t(T.hwRound);
    for (const round of h.rounds) {
      // spin empty cells
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
    const wasFree = localFree.left > 0;
    if (!wasFree && !testing) setLocalPoints((p) => p - bet);
    setSpinningReels(Array(REELS).fill(true));

    let res: SpinResponse;
    const started = Date.now();
    try {
      res = await spinFn(bet);
    } catch (e) {
      if (!mounted.current) return;
      setSpinningReels(Array(REELS).fill(false));
      setPhase("idle");
      if (!wasFree && !testing) setLocalPoints((p) => p + bet);
      setError(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Spin failed. Please try again.");
      setAuto(false);
      busy.current = false;
      return;
    }
    if (!mounted.current) return;
    const { result } = res;
    const steps = result.steps;

    // reels stop left to right once the server has answered (never before the minimum spin time)
    const minStop = T.reelSpin - (Date.now() - started);
    if (minStop > 0) await t(minStop);
    const first = tilesFrom(steps[0].grid);
    // anticipation: two scatters on the first four reels → the last reel spins longer with a heartbeat
    const scattersEarly = steps[0].grid.slice(0, 4).flat().filter((c) => c.sym === "S").length;
    for (let r = 0; r < REELS; r++) {
      const tease = r === REELS - 1 && scattersEarly >= 2;
      if (tease) setScatterTease(true);
      await t(tease ? T.reelStagger * 6 : T.reelStagger);
      setTiles((cur) => cur.map((col, i) => (i === r ? first[r] : col)));
      setSpinningReels((s) => s.map((v, i) => (i === r ? false : v)));
    }
    setScatterTease(false);

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

    /* orbs multiply the whole chain */
    if (result.orbSum > 0 && result.lineWin > 0) {
      setOrbSum(result.orbSum);
      await t(T.orbMerge);
    }
    setStepMult(null);

    /* line win total */
    const lineTotal = Math.round(result.orbSum > 0 ? result.lineWin * result.orbSum : result.lineWin);
    if (lineTotal > 0) {
      setShownWin(lineTotal);
      await t(T.winCount);
    }

    /* free spins */
    if (result.freeSpinsAwarded > 0) {
      setFeature({ kind: "free", text: result.mode === "free" ? `+${result.freeSpinsAwarded} MORE FREE SPINS` : `${result.freeSpinsAwarded} FREE SPINS` });
      await t(T.feature);
      setFeature(null);
    }

    /* hold & win */
    if (result.holdWin) {
      await playHoldWin(result.holdWin);
    }

    /* celebration */
    const win = res.win || (testing ? Math.round(result.totalWin) : 0);
    const shownTotal = testing ? Math.round(result.totalWin) : win;
    if (shownTotal > 0) {
      setShownWin(shownTotal);
      const tier = tierOf(shownTotal, result.bet);
      if (tier !== "win") {
        setBigWin({ tier, amount: shownTotal });
        await t(T.bigWin);
        setBigWin(null);
      }
    }

    if (!mounted.current) return;
    setLocalPoints(res.points);
    setLocalPots(res.pots);
    setLocalFree({ left: res.freeSpinsLeft, total: res.freeTotal, bet: result.bet });
    setPhase("idle");
    busy.current = false;


    /* free spins keep going by themselves; autoplay continues while it can */
    if (res.freeSpinsLeft > 0) {
      await t(T.freeGap);
      if (mounted.current) void runSpinRef.current();
    } else if (autoRef.current && (testing || res.points >= bet)) {
      await t(T.between * 3);
      if (mounted.current && autoRef.current) void runSpinRef.current();
    } else if (autoRef.current) {
      setAuto(false);
    }
  }, [bet, localFree.left, spinFn, t, testing, playHoldWin]);

  // free spins and autoplay call the next spin through this ref (a callback can't name itself)
  useEffect(() => { runSpinRef.current = runSpin; }, [runSpin]);

  /* ─────────── render ─────────── */
  const reelImgs = useMemo(() => RANDOM_SYMS.map((s) => SYMBOL_IMAGE[s]), []);
  const idle = phase === "idle";
  const bg = hw ? `${ART}/bg-holdwin.jpg` : inFree ? `${ART}/bg-freespins.jpg` : `${ART}/bg-base.jpg`;

  return (
    <div className="relative min-h-[100dvh] bg-[#070C19] text-white overflow-hidden select-none" style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}>
      {/* background art, crossfaded by state */}
      <AnimatePresence initial={false}>
        <motion.div key={bg} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${bg})` }} />
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70 pointer-events-none" />
      {scatterTease && <div className="absolute inset-0 pointer-events-none animate-pulse bg-[radial-gradient(60%_60%_at_50%_50%,rgba(201,181,255,0.18),transparent_70%)]" />}

      <div className="relative mx-auto max-w-[520px] min-h-[100dvh] flex flex-col px-3 pt-2 pb-[max(env(safe-area-inset-bottom),12px)]">
        {/* top bar */}
        <div className="flex items-center justify-between gap-2 h-10">
          <Link href="/games" className="w-9 h-9 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-white/80 hover:text-white" aria-label="Back to Games"><ArrowLeft className="w-4 h-4" /></Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${ART}/logo.png`} alt="Dragon Spire" className="h-12 w-auto drop-shadow-[0_2px_12px_rgba(245,198,107,0.35)]" />
          <button type="button" onClick={() => setPaytable(true)} className="w-9 h-9 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-white/80 hover:text-white" aria-label="How it pays"><Info className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 flex flex-col justify-center min-h-0">
        {/* pots */}
        <div className="grid grid-cols-4 gap-1 mt-1">
          {(["grand", "major", "minor", "mini"] as PotKey[]).map((k) => (
            <div key={k} className={cn("relative h-[46px] bg-contain bg-no-repeat bg-center flex flex-col items-center justify-center", hw?.potsHit.includes(k) && "animate-pulse")} style={{ backgroundImage: `url(${ART}/pot-${k}.png)` }}>
              <span className="text-[7px] font-extrabold tracking-[0.2em] leading-none mt-0.5" style={{ color: POT_COLOR[k] }}>{POT_LABEL[k]}</span>
              <span className="text-[12px] font-bold font-mono tabular-nums leading-tight text-[#F8EFD4] drop-shadow">{Math.round(localPots[k]).toLocaleString()}</span>
            </div>
          ))}
        </div>

        {/* status line */}
        <div className="flex items-center justify-between text-[10px] text-white/70 px-1 mt-1 h-5">
          {inFree ? (
            <span className="text-[#C9B5FF] font-semibold">FREE SPINS · {localFree.left} left · won {Math.round(localFree.total).toLocaleString()}</span>
          ) : testing ? (
            <span className="text-[#7FE8C4]">Test mode · spins are free and pay nothing</span>
          ) : (
            <span className="truncate">1,024 ways · cascades · 3 eyes = free spins · 6 medallions = Hold &amp; Win</span>
          )}
          {stepMult !== null && <span className="text-[#F5C66B] font-bold">×{stepMult}{orbSum ? ` · orbs ×${orbSum}` : ""}</span>}
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
                              <img src={tile.sym === "O" && tile.orb ? orbImage(tile.orb) : SYMBOL_IMAGE[tile.sym]} alt={SYMBOL_NAME[tile.sym]} draggable={false} className={cn("w-[92%] h-[92%] object-contain", tile.sym === "W" && "drop-shadow-[0_0_10px_rgba(245,198,107,0.9)]", tile.sym === "S" && "drop-shadow-[0_0_10px_rgba(201,181,255,0.9)]", tile.sym === "O" && "drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]")} />
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

          {/* hold & win respin counter / total */}
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
              <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[11px] text-white/45">{idle ? (inFree ? "Free spin coming…" : "Good luck, adventurer") : ""}</motion.div>
            )}
          </AnimatePresence>
        </div>
        </div>

        {/* controls */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-[0.14em] text-white/55">Bet</span>
            <div className="flex items-center gap-1">
              <button type="button" disabled={!idle || inFree || betIdx === 0} onClick={() => setBetIdx((i) => Math.max(0, i - 1))} className="w-8 h-8 rounded-full bg-black/50 border border-white/15 flex items-center justify-center disabled:opacity-30" aria-label="Lower bet"><Minus className="w-3.5 h-3.5" /></button>
              <span className="w-14 text-center text-[15px] font-bold font-mono tabular-nums">{(inFree ? localFree.bet : bet).toLocaleString()}</span>
              <button type="button" disabled={!idle || inFree || betIdx >= bets.length - 1} onClick={() => setBetIdx((i) => Math.min(bets.length - 1, i + 1))} className="w-8 h-8 rounded-full bg-black/50 border border-white/15 flex items-center justify-center disabled:opacity-30" aria-label="Raise bet"><Plus className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex gap-1 mt-0.5">
              <button type="button" onClick={() => setAuto((a) => !a)} className={cn("px-2 py-1 rounded-full text-[9px] font-bold tracking-wider border flex items-center gap-1", auto ? "bg-[#3DD598]/20 border-[#3DD598] text-[#3DD598]" : "bg-black/40 border-white/15 text-white/70")}><Repeat className="w-3 h-3" /> AUTO</button>
              <button type="button" onClick={() => setTurbo((v) => !v)} className={cn("px-2 py-1 rounded-full text-[9px] font-bold tracking-wider border flex items-center gap-1", turbo ? "bg-[#F5C66B]/20 border-[#F5C66B] text-[#F5C66B]" : "bg-black/40 border-white/15 text-white/70")}><Zap className="w-3 h-3" /> TURBO</button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { if (auto && !idle) { setAuto(false); return; } void runSpin(); }}
            disabled={!idle && !auto || (idle && !canAfford)}
            className={cn("relative w-[88px] h-[88px] rounded-full transition active:scale-95 disabled:opacity-50", !idle && "animate-[spin_1.6s_linear_infinite]")}
            aria-label={inFree ? "Free spin" : "Spin"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${ART}/spin-button.png`} alt="" aria-hidden className="w-full h-full object-contain drop-shadow-[0_0_18px_rgba(61,213,152,0.55)]" />
          </button>

          <div className="flex flex-col items-end gap-1">
            <span className="text-[9px] uppercase tracking-[0.14em] text-white/55">Balance</span>
            <span className="text-[15px] font-bold font-mono tabular-nums">{Math.round(localPoints).toLocaleString()} <span className="text-[10px] text-white/60">GP</span></span>
            <span className="text-[9px] text-white/45">{testing ? "test mode" : inFree ? `free spin · bet ${localFree.bet}` : auto ? "auto · tap spin to stop" : " "}</span>
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
              <img src={feature.kind === "free" ? `${ART}/scatter-eye.png` : `${ART}/coin-grand.png`} alt="" className="w-28 h-28 mx-auto drop-shadow-[0_0_30px_rgba(201,181,255,0.9)]" />
              <div className="mt-2 text-[34px] font-black tracking-wide text-[#F5C66B] drop-shadow-[0_0_20px_rgba(245,198,107,0.8)]" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{feature.text}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* big win */}
      <AnimatePresence>
        {bigWin && (
          <motion.div key="bigwin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none bg-black/60 overflow-hidden">
            <CoinShower />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <motion.img src={`${ART}/bigwin-dragon.png`} alt="" initial={{ y: 80, scale: 0.7, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 180, damping: 16 }} className="w-[80%] max-w-[420px] drop-shadow-[0_0_40px_rgba(245,198,107,0.6)]" />
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: [0.5, 1.15, 1] }} transition={{ duration: 0.6 }} className="-mt-6 text-center">
              <div className="text-[13px] font-bold tracking-[0.3em] text-white/80">{bigWin.tier === "epic" ? "EPIC WIN" : bigWin.tier === "mega" ? "MEGA WIN" : "BIG WIN"}</div>
              <CountUp to={bigWin.amount} className="text-[44px] font-black text-[#F5C66B] font-mono tabular-nums drop-shadow-[0_0_24px_rgba(245,198,107,0.9)]" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* paytable */}
      <AnimatePresence>
        {paytable && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" onClick={() => setPaytable(false)}>
            <div className="w-full max-w-[460px] max-h-[86dvh] overflow-y-auto rounded-2xl bg-[#0E1A2C] border border-[#F5C66B]/30 p-4 text-[12px]" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <p className="m-0 text-[15px] font-bold text-[#F5C66B]">How Dragon Spire pays</p>
                <button type="button" onClick={() => setPaytable(false)} aria-label="Close"><X className="w-5 h-5 text-white/70" /></button>
              </div>
              <ul className="m-0 pl-4 flex flex-col gap-1.5 text-white/80 leading-relaxed">
                <li><b className="text-white">1,024 ways.</b> A symbol pays when it lands on reels 1, 2 and 3 or more in a row, in any row. More of the same symbol on a reel multiplies the ways.</li>
                <li><b className="text-white">Cascades.</b> Winning symbols burst and new ones fall in. Each cascade raises the multiplier: ×1, ×2, ×3, ×5 (×2, ×4, ×6, ×10 in free spins).</li>
                <li><b className="text-white">Orbs.</b> Multiplier orbs that land during a winning chain are added together and multiply the whole chain.</li>
                <li><b className="text-white">Free spins.</b> 3, 4 or 5 dragon eyes anywhere give 10, 12 or 15 free spins. 3 more eyes during free spins add 5.</li>
                <li><b className="text-white">Hold &amp; Win.</b> 6 or more medallions start 3 respins. Every new medallion resets the respins. Medallions show a Game Points value or a jackpot name. Fill all 20 for the Grand.</li>
                <li><b className="text-white">Jackpots</b> grow with every spin by everyone. A bet of 100 GP wins the full pot; smaller bets win a proportional share.</li>
                <li><b className="text-white">Wild</b> (golden dragon) stands in for any paying symbol on reels 2, 3 and 4.</li>
              </ul>
              <div className="grid grid-cols-4 gap-2 mt-3">
                {(["H4", "H3", "H2", "H1", "L4", "L3", "L2", "L1"] as Sym[]).map((s) => (
                  <div key={s} className="flex flex-col items-center gap-0.5 bg-black/30 rounded-lg p-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={SYMBOL_IMAGE[s]} alt={SYMBOL_NAME[s]} className="w-12 h-12 object-contain" />
                    <span className="text-[9px] text-white/60 text-center leading-tight">{SYMBOL_NAME[s]}</span>
                    <span className="text-[9px] font-mono text-[#F5C66B]">{PAY_HINT[s]}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-white/50 m-0 mt-3">Pays shown per way as a multiple of the bet for 3 / 4 / 5 reels. Maximum win 5,000× the bet.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const PAY_HINT: Record<Sym, string> = {
  H4: "0.13 · 0.35 · 1.1", H3: "0.09 · 0.22 · 0.65", H2: "0.065 · 0.18 · 0.45", H1: "0.045 · 0.11 · 0.28",
  L4: "0.027 · 0.055 · 0.14", L3: "0.027 · 0.055 · 0.14", L2: "0.022 · 0.045 · 0.11", L1: "0.022 · 0.045 · 0.11",
  W: "", S: "", O: "", C: "",
};

/** A reel in motion: a stack of symbols scrolling fast with a blur. */
function ReelBlur({ imgs, offset, small }: { imgs: string[]; offset: number; small?: boolean }) {
  return (
    <div className="relative flex-1 min-h-0 overflow-hidden rounded-md">
      <motion.div
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={{ y: 0 }}
        animate={{ y: ["0%", "-50%"] }}
        transition={{ duration: small ? 0.35 : 0.42, ease: "linear", repeat: Infinity }}
        style={{ filter: "blur(1.5px)" }}
      >
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
