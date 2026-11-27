"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { getSound } from "@/lib/sound";
import { useNow } from "@/lib/compplan";
import { christmasCountdown, countdownChip, type ChristmasConfig, type Countdown } from "@/lib/christmas";

/*
 * Santa's flyby: the sleigh crosses the top of the screen, drops a present that
 * bounces and opens into a small countdown card. Nothing stays on screen
 * afterwards except the header chip (SantaChip), which replays it.
 * Everything runs on the member's device; no reads or writes.
 */

const SLEIGH_SRC = "/christmas/sleigh.webp"; // Artlist AI art, 640×273, transparent
const RATIO = 273 / 640;
const NOSE: [number, number] = [0.037, 0.289]; // Rudolph's nose, as a share of the image
const SACK = 0.88; // where the present drops from (share of the width)
const CARD_MS = 9000; // the card closes itself after this

const noopSubscribe = () => () => {};

function cardText(c: Countdown): { top: string; big: string; unit: string; sub: string } {
  switch (c.phase) {
    case "days": return { top: "Santa stopped by", big: String(c.days), unit: c.days === 1 ? "day" : "days", sub: "until Christmas · Maligayang Pasko!" };
    case "eve": return c.hours >= 1
      ? { top: "Christmas Eve", big: String(c.hours), unit: c.hours === 1 ? "hour" : "hours", sub: "until Santa arrives tonight" }
      : { top: "Christmas Eve", big: String(Math.max(1, c.minutes)), unit: "minutes", sub: "until Santa arrives tonight" };
    case "day": return { top: "Santa is here", big: "Merry Christmas!", unit: "", sub: "Maligayang Pasko sa inyong lahat!" };
    default: return { top: "From all of us at Investure", big: "Merry Christmas", unit: "", sub: "and a happy New Year!" };
  }
}

/** Header chip with the days left; tapping it replays Santa. */
export function SantaChip({ cfg, onClick }: { cfg: ChristmasConfig; onClick: () => void }) {
  const now = useNow(60_000);
  const c = christmasCountdown(cfg, now);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Play Santa's flyby"
      title="Christmas countdown"
      className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[#F5C66B]/40 bg-[#F5C66B]/10 px-2.5 py-1 text-[11px] font-semibold text-[#F5C66B] hover:bg-[#F5C66B]/20 transition"
    >
      <span aria-hidden>🛷</span> {countdownChip(c)}
    </button>
  );
}

/** Mount while the season is on; bump `play` (1, 2, 3…) to send Santa across. */
export function SantaFlyby({ cfg, play }: { cfg: ChristmasConfig; play: number }) {
  // true only in the browser (the portal needs document.body)
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [card, setCard] = useState<Countdown | null>(null);
  const sleighRef = useRef<HTMLDivElement>(null);
  const giftRef = useRef<HTMLDivElement>(null);
  const lidRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<HTMLDivElement>(null);
  const spark = useCallback((x: number, y: number) => {
    const fx = fxRef.current;
    if (!fx) return;
    const d = document.createElement("div");
    const s = 2 + Math.random() * 3.5;
    const col = Math.random() < 0.55 ? "#F5C66B" : "#ffffff";
    d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;border-radius:50%;background:${col};box-shadow:0 0 6px ${col};transition:transform 1.2s ease-out,opacity 1.2s ease-out`;
    fx.appendChild(d);
    requestAnimationFrame(() => { d.style.transform = `translate(${(Math.random() - 0.2) * 40}px,${20 + Math.random() * 45}px)`; d.style.opacity = "0"; });
    window.setTimeout(() => d.remove(), 1300);
  }, []);

  const confetti = useCallback(() => {
    const fx = fxRef.current;
    if (!fx) return;
    const W = window.innerWidth, H = window.innerHeight;
    for (let i = 0; i < 70; i++) {
      window.setTimeout(() => {
        const d = document.createElement("div");
        d.style.cssText = `position:absolute;left:${Math.random() * W}px;top:-12px;width:6px;height:9px;background:${["#F5C66B", "#e23b4e", "#22c55e", "#ffffff"][i % 4]};transition:transform 2.4s linear,opacity 2.4s`;
        fx.appendChild(d);
        requestAnimationFrame(() => { d.style.transform = `translate(${(Math.random() - 0.5) * 90}px,${H + 30}px) rotate(${Math.random() * 720}deg)`; d.style.opacity = "0.2"; });
        window.setTimeout(() => d.remove(), 2500);
      }, i * 25);
    }
  }, []);

  const openCard = useCallback(() => {
    const c = christmasCountdown(cfg, Date.now());
    setCard(c);
    getSound().play("xmas/card", { volume: 0.8 });
    if (c.phase === "day") confetti();
  }, [cfg, confetti]);

  // auto-close
  useEffect(() => {
    if (!card) return;
    const t = window.setTimeout(() => setCard(null), CARD_MS);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCard(null); };
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [card]);

  // one flight per bump of `play`
  useEffect(() => {
    if (!play || !mounted) return;
    const sleigh = sleighRef.current, gift = giftRef.current, lid = lidRef.current;
    if (!sleigh || !gift || !lid) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const r = requestAnimationFrame(() => openCard());
      return () => cancelAnimationFrame(r);
    }

    getSound().play("xmas/sleigh-bells", { volume: 0.85 });
    const W = window.innerWidth, H = window.innerHeight;
    const SW = Math.round(Math.min(340, Math.max(220, W * 0.62)));
    const SH = SW * RATIO;
    const top = Math.min(110, Math.max(56, H * 0.09));
    const T = Math.min(5200, 3400 + W * 1.1);
    const floor = Math.min(H * 0.4, 320);
    sleigh.style.width = `${SW}px`;
    gift.style.opacity = "0";
    lid.style.transform = "";

    let raf = 0;
    let dropped = false, landed = false, opened = false, gy = 0, gv = 0, bounces = 0, landT = 0;
    const gx = W / 2 - 22;
    const t0 = performance.now();
    let first = true;
    const step = (now: number) => {
      if (first) { first = false; setCard(null); } // a replay closes the open card
      const t = (now - t0) / T;
      const x = W + 30 - t * (W + SW + 80);
      const y = top + Math.sin(t * 8) * 10 + Math.sin(now / 90) * 1.5;
      if (t <= 1.02) {
        sleigh.style.transform = `translate(${x}px,${y}px) rotate(${Math.cos(t * 8) * -3}deg)`;
        if (Math.random() < 0.85) spark(x + SW * 0.97, y + SH * 0.8);
      } else {
        sleigh.style.transform = `translate(-9999px,0)`;
      }
      if (!dropped && x + SW * SACK < W / 2 + 22) { dropped = true; gy = y + SH * 0.5; gv = -2; gift.style.opacity = "1"; }
      if (dropped && !landed) {
        gv += 0.5; gy += gv;
        if (gy > floor) { gy = floor; gv = -gv * 0.45; bounces++; if (bounces > 2) { landed = true; landT = now; } }
        gift.style.transform = `translate(${gx}px,${gy}px) rotate(${landed ? 0 : Math.sin(gy / 20) * 8}deg)`;
      }
      if (landed && !opened) {
        const k = (now - landT) / 400;
        lid.style.transform = `translate(${k * 6}px,${-k * 26}px) rotate(${k * 30}deg)`;
        if (k > 0.4 && k < 0.6) for (let i = 0; i < 6; i++) spark(W / 2 + (Math.random() - 0.5) * 30, floor + 10);
        if (k > 1) { opened = true; gift.style.opacity = "0"; openCard(); }
      }
      if (t < 1.02 || !opened) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); sleigh.style.transform = "translate(-9999px,0)"; gift.style.opacity = "0"; };
    // a new flight only when `play` is bumped
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, mounted]);

  if (!mounted) return null;
  const text = card ? cardText(card) : null;

  return createPortal(
    <div className="fixed inset-0 z-[90] pointer-events-none overflow-hidden" aria-hidden={!card}>
      <div ref={fxRef} className="absolute inset-0" />
      <div ref={sleighRef} className="absolute left-0 top-0 will-change-transform" style={{ transform: "translate(-9999px,0)", width: 300 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={SLEIGH_SRC} alt="" className="block w-full h-auto drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]" draggable={false} />
        <span
          className="absolute w-[22px] h-[22px] rounded-full animate-[xmas-nose_0.9s_ease-in-out_infinite]"
          style={{ left: `calc(${NOSE[0] * 100}% - 11px)`, top: `calc(${NOSE[1] * 100}% - 11px)`, background: "radial-gradient(circle, rgba(255,70,70,.95), rgba(255,40,40,0) 70%)" }}
        />
      </div>
      <div ref={giftRef} className="absolute left-0 top-0 w-11 h-10" style={{ opacity: 0 }}>
        <div ref={lidRef} className="absolute -left-[3px] top-0 w-[50px] h-3 rounded-[3px] bg-[#e23b4e]">
          <div className="absolute left-[21px] top-0 w-2 h-3 bg-[#F5C66B]" />
        </div>
        <div className="absolute left-0 top-[11px] w-11 h-[29px] rounded-[3px] bg-[#c92a3d]">
          <div className="absolute left-[18px] top-0 w-2 h-[29px] bg-[#F5C66B]" />
        </div>
      </div>

      {text && (
        <div className="absolute inset-x-0 top-[22%] flex justify-center px-5">
          <div
            role="dialog"
            aria-label="Christmas countdown"
            className="pointer-events-auto relative w-full max-w-[320px] rounded-2xl border border-border bg-card px-4 py-5 text-center shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-[xmas-card-in_0.45s_cubic-bezier(.2,1.4,.4,1)]"
          >
            <button type="button" onClick={() => setCard(null)} aria-label="Close" className="absolute right-2 top-2 w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:text-text">
              <X className="w-4 h-4" />
            </button>
            <p className="m-0 text-[12px] font-semibold tracking-wide text-[#F5C66B]">{text.top}</p>
            <p className="m-0 mt-1.5 flex items-baseline justify-center gap-2">
              <span className={text.unit ? "text-[48px] leading-none font-extrabold text-text animate-[xmas-flip_0.6s_ease]" : "text-[28px] leading-tight font-extrabold text-text animate-[xmas-flip_0.6s_ease]"}>{text.big}</span>
              {text.unit && <span className="text-[15px] text-text-muted">{text.unit}</span>}
            </p>
            <p className="m-0 mt-1.5 text-[13px] text-text-muted">{text.sub}</p>
            <button type="button" onClick={() => setCard(null)} className="mt-4 w-full h-10 rounded-xl bg-gold text-gold-dark text-[14px] font-semibold hover:brightness-110 transition">
              Got it
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
