"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Clock, Sparkles } from "lucide-react";
import { cn, formatPHP } from "@/lib/utils";
import { useGameState } from "@/lib/game";
import { useUserState } from "@/lib/useUserState";
import Link from "next/link";
import { Lock } from "lucide-react";
import {
  spinWheel,
  useSpinner,
  useSpinWindow,
  countdown,
  spinChanceTotal,
  spinEligibility,
  type InvestureEvent,
  type SpinResult,
  type SpinWedge,
} from "@/lib/events";

const SPIN_MS = 4200;

/** Pure SVG wheel built from the wedges; `rotation` is applied by the parent. */
export function Wheel({ wedges, rotation, size = 250, spinning, highlight }: { wedges: SpinWedge[]; rotation: number; size?: number; spinning: boolean; highlight?: number | null }) {
  const total = spinChanceTotal(wedges) || 100;
  const n = wedges.length;
  // Equal-looking wedges: odds live in the server's pick, not in the geometry, so
  // the wheel stays readable with 1% prizes.
  const step = 360 / n;
  const paths = useMemo(
    () =>
      wedges.map((w, i) => {
        const a0 = ((i * step - 90) * Math.PI) / 180;
        const a1 = (((i + 1) * step - 90) * Math.PI) / 180;
        const r = 140;
        const x0 = 150 + r * Math.cos(a0), y0 = 150 + r * Math.sin(a0);
        const x1 = 150 + r * Math.cos(a1), y1 = 150 + r * Math.sin(a1);
        const mid = ((i + 0.5) * step - 90) * (Math.PI / 180);
        const lx = 150 + 95 * Math.cos(mid), ly = 150 + 95 * Math.sin(mid);
        return { d: `M150,150 L${x0.toFixed(2)},${y0.toFixed(2)} A140,140 0 ${step > 180 ? 1 : 0},1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`, lx, ly, angle: (i + 0.5) * step, w };
      }),
    [wedges, step],
  );
  void total;
  return (
    <svg
      viewBox="0 0 300 300"
      width={size}
      height={size}
      aria-label="Prize wheel"
      style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.8, 0.12, 1)` : "none" }}
    >
      <circle cx="150" cy="150" r="146" fill="#0A0F1F" stroke="#F5C66B" strokeWidth="4" />
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.w.color} stroke="#0A0F1F" strokeWidth="1.5" opacity={highlight == null || highlight === i ? 1 : 0.35} />
      ))}
      {paths.map((p, i) => {
        // Flip labels that will sit on the lower half once the wheel comes to rest, so
        // nothing reads upside-down after a spin (the label's on-screen angle is the
        // wedge angle plus the wheel's rotation).
        const onScreen = (((p.angle + rotation) % 360) + 360) % 360;
        const flip = onScreen > 90 && onScreen < 270;
        return (
        <text
          key={`t${i}`}
          x={p.lx}
          y={p.ly}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(${flip ? p.angle + 180 : p.angle} ${p.lx} ${p.ly})`}
          fontFamily="ui-monospace, Menlo, Consolas, monospace"
          fontSize={p.w.points === 0 ? 10 : n > 8 ? 11 : 13}
          fontWeight={700}
          fill={p.w.points >= 500 ? "#F5C66B" : p.w.points === 0 ? "#C9CFE3" : "#EDF0F5"}
        >
          {p.w.label}
        </text>
        );
      })}
      <circle cx="150" cy="150" r="26" fill="#131A2E" stroke="#F5C66B" strokeWidth="3" />
      <text x="150" y="155" textAnchor="middle" fontFamily="-apple-system, system-ui, sans-serif" fontSize="11" fontWeight={700} fill="#F5C66B">SPIN</text>
    </svg>
  );
}

/** The interactive part of a spin event: wheel, spins left, window pool, spin button, result. */
export function SpinPanel({ event, now }: { event: InvestureEvent; now: number }) {
  const sp = event.spin!;
  const spinner = useSpinner(event.id);
  const win = useSpinWindow(event.id, sp.windowsPerDay, now);
  const { state: gameState } = useGameState();
  const { state: userState } = useUserState();
  const elig = spinEligibility(event, userState?.placements);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [shown, setShown] = useState<SpinResult | null>(null); // result revealed after the animation
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const n = sp.wedges.length;
  const step = 360 / n;
  const today = new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
  const freeUsed = spinner && spinner.freeDay === today ? spinner.freeUsed : 0;
  const freeLeft = Math.max(0, sp.freeSpinsPerDay - freeUsed);
  const bonus = spinner?.bonus ?? 0;
  const canSpin = elig.ok && freeLeft + bonus > 0 && !busy && !spinning;
  const share = Math.floor(sp.dailyBudget / sp.windowsPerDay);
  const poolLeft = win.ledger ? Math.max(0, win.ledger.budget + win.ledger.carriedIn - win.ledger.spent) : share;
  const poolTotal = win.ledger ? win.ledger.budget + win.ledger.carriedIn : share;
  const midnight = (() => { const d = new Date(now + 8 * 3_600_000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - 8 * 3_600_000; })();

  async function spin() {
    if (!canSpin) return;
    setBusy(true);
    setError(null);
    setShown(null);
    try {
      const r = await spinWheel(event.id);
      setResult(r);
      if (r.status === "spun") {
        // Land the pointer (top, 12 o'clock) on the middle of the winning wedge: 5 full turns + offset.
        const target = 360 * 5 - (r.wedge + 0.5) * step;
        const base = Math.floor(rotation / 360) * 360;
        setSpinning(true);
        setRotation(base + target);
        timer.current = setTimeout(() => {
          setSpinning(false);
          setShown(r);
          setBusy(false);
        }, SPIN_MS + 150);
      } else {
        setShown(r);
        setBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not spin");
      setBusy(false);
    }
  }

  const won = shown?.status === "spun" ? shown : null;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: 250, height: 250 }}>
        <Wheel wedges={sp.wedges} rotation={rotation} spinning={spinning} highlight={won ? won.wedge : null} />
        <svg viewBox="0 0 24 28" width="24" height="28" className="absolute" style={{ left: 113, top: -8 }} aria-hidden="true">
          <path d="M12 28 L0 4 Q12 -4 24 4 Z" fill="#F5C66B" stroke="#0A0F1F" strokeWidth="2" />
        </svg>
      </div>

      {won && (
        <div className="text-center -mt-1">
          <p className="text-[10px] uppercase tracking-[0.14em] text-text-muted m-0">{won.points > 0 ? "You won" : "This time"}</p>
          <p className={cn("font-mono text-[34px] font-bold leading-none m-0", won.points > 0 ? "text-[#F5C66B]" : "text-text-muted")}>
            {won.points > 0 ? `+${won.points} GP` : won.label}
          </p>
          {won.points > 0 && (
            <p className="text-[11px] text-text-muted m-0 mt-1">Added to your Game Points · balance now <span className="font-mono text-text">{(gameState?.points ?? 0).toLocaleString()}</span></p>
          )}
        </div>
      )}
      {shown?.status === "exhausted" && (
        <p className="text-[11px] text-[#F5C66B] text-center m-0">
          Prizes for this window are gone — next window opens in {countdown(shown.nextWindowAt, now)}. Your spin was not used.
        </p>
      )}

      <div className="w-full grid grid-cols-2 gap-2">
        <div className="px-3 py-2 rounded-xl bg-canvas border border-border">
          <p className="text-[9px] uppercase tracking-wide text-text-subtle m-0">Your spins</p>
          <p className="font-mono text-[16px] text-[#F5C66B] m-0 leading-tight">{freeLeft}{bonus > 0 && <span className="text-[10px] text-text-subtle"> +{bonus} bonus</span>}</p>
          <p className="text-[9px] text-text-subtle m-0">{freeLeft === 0 ? `next free spin in ${countdown(midnight, now)}` : `${sp.freeSpinsPerDay} free per day`}</p>
        </div>
        <div className="px-3 py-2 rounded-xl bg-canvas border border-border">
          <p className="text-[9px] uppercase tracking-wide text-text-subtle m-0">Window prizes left</p>
          <p className="font-mono text-[16px] text-text m-0 leading-tight">{poolLeft.toLocaleString()} <span className="text-[10px] text-text-subtle">GP</span></p>
          <div className="h-1 rounded-full bg-border overflow-hidden mt-1"><div className="h-full bg-[#F5C66B]" style={{ width: `${poolTotal > 0 ? (poolLeft / poolTotal) * 100 : 0}%` }} /></div>
          <p className="text-[9px] text-text-subtle m-0 mt-0.5 flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> next window in {countdown(win.endsAt, now)}</p>
        </div>
      </div>

      {error && <p className="text-[11px] text-red m-0 text-center">{error}</p>}

      {!elig.ok && (
        <div className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-canvas border border-[#F5C66B]/40">
          <Lock className="w-4 h-4 text-[#F5C66B] shrink-0 mt-0.5" />
          <div className="text-[11px] text-text-muted">
            <span className="text-text">
              {elig.need > 0
                ? `Requires ${formatPHP(elig.need, { short: true })} active in ${elig.where}`
                : `Requires an active ${elig.termsLabel} placement`}
            </span>
            {elig.need > 0 && <> · you have <span className="font-mono text-text">{formatPHP(elig.have, { short: true })}</span></>}
            <Link href="/plans" className="block mt-1 text-[#F5C66B] font-semibold">Place capital →</Link>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={spin}
        disabled={!canSpin}
        className="w-full py-3 rounded-xl text-[13px] font-extrabold tracking-wide bg-[#F5C66B] text-[#2A1D05] hover:brightness-110 transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {!elig.ok ? "LOCKED" : spinning ? "SPINNING…" : won ? (freeLeft + bonus > 0 ? `SPIN AGAIN (${freeLeft + bonus} left)` : "NO SPINS LEFT") : freeLeft + bonus > 0 ? "SPIN NOW" : "NO SPINS LEFT"}
      </button>
      {(sp.bonusFor.placement || sp.bonusFor.referral || sp.bonusFor.withdrawal) && (
        <p className="text-[10px] text-text-subtle m-0 text-center">
          Bonus spin for every {[sp.bonusFor.placement && "placement", sp.bonusFor.referral && "referral who joins", sp.bonusFor.withdrawal && "released withdrawal"].filter(Boolean).join(", ")} · bank up to {sp.maxBankedBonus}.
        </p>
      )}
    </div>
  );
}
