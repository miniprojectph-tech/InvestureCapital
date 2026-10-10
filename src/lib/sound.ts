"use client";

import { useCallback, useEffect, useState } from "react";
import { useGamesSettings } from "./game";

/**
 * Game sound engine. Every sound has a built-in synthesized version so the
 * games are never silent; a real sample at /sounds/<group>/<name>.mp3 (listed
 * in /sounds/manifest.json at build time) replaces it automatically.
 *
 * Phones keep audio locked until the first tap, so the engine wakes on the
 * first pointer/key event. Players mute per device (speaker button, kept in
 * localStorage); the admin can switch all game sounds off in Game Settings.
 */
export type SoundName =
  | "common/tap" | "common/toggle" | "common/count-tick" | "common/coin-shower" | "common/error"
  | "slot/spin-press" | "slot/reel-whir" | "slot/reel-stop-1" | "slot/reel-stop-2" | "slot/reel-stop-3" | "slot/reel-stop-4" | "slot/reel-stop-5"
  | "slot/symbol-burst" | "slot/cascade-1" | "slot/cascade-2" | "slot/cascade-3" | "slot/cascade-4" | "slot/orb-merge"
  | "slot/win-small" | "slot/win-big" | "slot/win-mega" | "slot/win-epic"
  | "slot/hw-trigger" | "slot/hw-coin-land" | "slot/hw-respin" | "slot/hw-heartbeat"
  | "slot/jackpot-mini" | "slot/jackpot-minor" | "slot/jackpot-major" | "slot/jackpot-grand" | "slot/ambience"
  | "color/chip-place" | "color/chip-other" | "color/countdown-tick" | "color/bets-closed"
  | "color/dice-rattle" | "color/dice-land-1" | "color/dice-land-2" | "color/dice-land-3"
  | "color/win-1" | "color/win-2" | "color/win-3" | "color/lose" | "color/jackpot-siren" | "color/rank-up" | "color/ambience";

type Opts = { volume?: number; rate?: number };
const LS_KEY = "investure:sound";

/* ───────────── synth helpers ───────────── */
type Ctx = AudioContext;
type Dest = AudioNode;
function env(ctx: Ctx, t0: number, a: number, d: number, g: number, sustainTo?: number): GainNode {
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.0001, t0);
  gn.gain.exponentialRampToValueAtTime(Math.max(0.0001, g), t0 + a);
  gn.gain.exponentialRampToValueAtTime(0.0001, t0 + a + (sustainTo ?? d));
  return gn;
}
function osc(ctx: Ctx, dest: Dest, o: { type?: OscillatorType; f: number; f1?: number; t0: number; dur: number; a?: number; g?: number; detune?: number }) {
  const n = ctx.createOscillator();
  n.type = o.type ?? "sine";
  n.frequency.setValueAtTime(o.f, o.t0);
  if (o.f1) n.frequency.exponentialRampToValueAtTime(o.f1, o.t0 + o.dur);
  if (o.detune) n.detune.value = o.detune;
  const g = env(ctx, o.t0, o.a ?? 0.005, o.dur, o.g ?? 0.3);
  n.connect(g).connect(dest);
  n.start(o.t0); n.stop(o.t0 + o.dur + 0.05);
}
let noiseBuf: AudioBuffer | null = null;
function noise(ctx: Ctx, dest: Dest, o: { t0: number; dur: number; g?: number; type?: BiquadFilterType; f?: number; f1?: number; q?: number; a?: number }) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = o.type ?? "lowpass"; flt.frequency.setValueAtTime(o.f ?? 1000, o.t0); flt.Q.value = o.q ?? 0.8;
  if (o.f1) flt.frequency.exponentialRampToValueAtTime(o.f1, o.t0 + o.dur);
  const g = env(ctx, o.t0, o.a ?? 0.003, o.dur, o.g ?? 0.2);
  src.connect(flt).connect(g).connect(dest);
  src.start(o.t0); src.stop(o.t0 + o.dur + 0.05);
}
/** A struck bell: a few inharmonic partials, each fading at its own speed. */
function bell(ctx: Ctx, dest: Dest, o: { f: number; t0: number; dur?: number; g?: number }) {
  const dur = o.dur ?? 0.8, g = o.g ?? 0.25;
  const parts: [number, number, number][] = [[1, 1, 1], [2.0, 0.45, 0.6], [2.76, 0.3, 0.45], [5.4, 0.12, 0.3]];
  for (const [r, a, dl] of parts) osc(ctx, dest, { type: "sine", f: o.f * r, t0: o.t0, dur: dur * dl, a: 0.002, g: g * a });
}
function chord(ctx: Ctx, dest: Dest, notes: number[], t0: number, dur: number, g: number, type: OscillatorType = "sawtooth") {
  for (const f of notes) { osc(ctx, dest, { type, f, t0, dur, a: 0.02, g: g / notes.length, detune: -6 }); osc(ctx, dest, { type, f, t0, dur, a: 0.02, g: g / notes.length, detune: 6 }); }
}
function coins(ctx: Ctx, dest: Dest, t0: number, dur: number, count: number, g = 0.12) {
  for (let i = 0; i < count; i++) {
    const t = t0 + Math.pow(i / count, 1.4) * dur;
    bell(ctx, dest, { f: 2200 + Math.random() * 3200, t0: t, dur: 0.25 + Math.random() * 0.2, g: g * (1 - (i / count) * 0.5) });
  }
}
const N = (semi: number, base = 523.25) => base * Math.pow(2, semi / 12); // C5 = 523.25
function fanfare(ctx: Ctx, dest: Dest, t0: number, size: 1 | 2 | 3 | 4) {
  // I – IV – V – I, each hit a little longer; bigger sizes add an octave, bells and coins
  const steps: [number[], number][] = [[[0, 4, 7], 0.22], [[5, 9, 12], 0.22], [[7, 11, 14], 0.26], [[12, 16, 19, 24], size >= 3 ? 1.4 : 0.9]];
  let t = t0;
  for (const [semis, len] of steps) {
    const notes = semis.map((s) => N(s, 261.63)).concat(size >= 2 ? semis.map((s) => N(s + 12, 261.63)) : []);
    chord(ctx, dest, notes, t, len, size >= 3 ? 0.5 : 0.38);
    if (size >= 2) for (const s of semis) bell(ctx, dest, { f: N(s + 24, 261.63), t0: t, dur: 0.5, g: 0.08 });
    t += len * 0.85;
  }
  if (size >= 2) coins(ctx, dest, t0 + 0.4, size >= 3 ? 2.2 : 1.2, size >= 3 ? 36 : 16);
  if (size >= 3) noise(ctx, dest, { t0, dur: 0.6, g: 0.25, type: "lowpass", f: 120, f1: 60 }); // orchestral thump
  if (size === 4) { noise(ctx, dest, { t0: t0 - 0.0, dur: 1.4, g: 0.35, type: "lowpass", f: 220, f1: 50, q: 2 }); osc(ctx, dest, { type: "sawtooth", f: 70, f1: 38, t0, dur: 1.3, a: 0.1, g: 0.25 }); } // the roar
}

/* ───────────── recipes ───────────── */
type Recipe = (ctx: Ctx, dest: Dest, t0: number) => number; // returns length in seconds
function buildRecipes(): Partial<Record<SoundName, Recipe>> {
const R: Partial<Record<SoundName, Recipe>> = {
  "common/tap": (c, d, t) => { noise(c, d, { t0: t, dur: 0.03, g: 0.18, type: "highpass", f: 2000 }); osc(c, d, { f: 1800, f1: 900, t0: t, dur: 0.04, g: 0.15 }); return 0.08; },
  "common/toggle": (c, d, t) => { osc(c, d, { f: 1200, f1: 700, t0: t, dur: 0.03, g: 0.18 }); osc(c, d, { f: 900, f1: 1400, t0: t + 0.06, dur: 0.04, g: 0.15 }); return 0.12; },
  "common/count-tick": (c, d, t) => { osc(c, d, { f: 2400, t0: t, dur: 0.02, a: 0.001, g: 0.12 }); return 0.03; },
  "common/coin-shower": (c, d, t) => { coins(c, d, t, 2.2, 40, 0.14); return 2.5; },
  "common/error": (c, d, t) => { osc(c, d, { type: "square", f: 180, f1: 150, t0: t, dur: 0.22, g: 0.08 }); noise(c, d, { t0: t, dur: 0.1, g: 0.12, f: 400 }); return 0.3; },

  "slot/spin-press": (c, d, t) => { osc(c, d, { f: 90, f1: 40, t0: t, dur: 0.2, g: 0.5 }); noise(c, d, { t0: t, dur: 0.08, g: 0.2, f: 900 }); bell(c, d, { f: 1400, t0: t + 0.05, dur: 0.15, g: 0.05 }); return 0.25; },
  "slot/symbol-burst": (c, d, t) => { noise(c, d, { t0: t, dur: 0.15, g: 0.22, type: "bandpass", f: 3000, f1: 8000, q: 1.2 }); bell(c, d, { f: 2637, t0: t + 0.02, dur: 0.3, g: 0.12 }); bell(c, d, { f: 3520, t0: t + 0.05, dur: 0.3, g: 0.08 }); return 0.4; },
  "slot/orb-merge": (c, d, t) => { osc(c, d, { type: "sawtooth", f: 80, f1: 600, t0: t, dur: 0.6, a: 0.05, g: 0.18 }); osc(c, d, { f: 160, f1: 1200, t0: t, dur: 0.6, a: 0.05, g: 0.12 }); bell(c, d, { f: 1568, t0: t + 0.55, dur: 0.5, g: 0.2 }); return 0.9; },
  "slot/win-small": (c, d, t) => { bell(c, d, { f: 880, t0: t, dur: 0.4, g: 0.2 }); bell(c, d, { f: 1109, t0: t + 0.09, dur: 0.45, g: 0.2 }); bell(c, d, { f: 3136, t0: t + 0.2, dur: 0.3, g: 0.1 }); return 0.6; },
  "slot/win-big": (c, d, t) => { fanfare(c, d, t, 1); coins(c, d, t + 0.3, 1.0, 10); return 2.0; },
  "slot/win-mega": (c, d, t) => { fanfare(c, d, t, 2); return 3.0; },
  "slot/win-epic": (c, d, t) => { fanfare(c, d, t, 4); return 4.0; },
  "slot/hw-trigger": (c, d, t) => { osc(c, d, { f: 120, f1: 30, t0: t, dur: 0.35, g: 0.6 }); noise(c, d, { t0: t + 0.1, dur: 1.0, g: 0.18, type: "bandpass", f: 200, f1: 3000, q: 1.5, a: 0.3 }); bell(c, d, { f: 196, t0: t, dur: 1.2, g: 0.15 }); return 1.2; },
  "slot/hw-coin-land": (c, d, t) => { noise(c, d, { t0: t, dur: 0.03, g: 0.15, type: "highpass", f: 3000 }); bell(c, d, { f: 2200, t0: t, dur: 0.3, g: 0.18 }); bell(c, d, { f: 3300, t0: t + 0.01, dur: 0.25, g: 0.1 }); return 0.3; },
  "slot/hw-respin": (c, d, t) => { noise(c, d, { t0: t, dur: 0.3, g: 0.15, type: "bandpass", f: 1200, f1: 4000, q: 1.2, a: 0.08 }); return 0.4; },
  "slot/jackpot-mini": (c, d, t) => { bell(c, d, { f: 1046, t0: t, dur: 0.6, g: 0.22 }); bell(c, d, { f: 1318, t0: t + 0.1, dur: 0.6, g: 0.22 }); bell(c, d, { f: 1568, t0: t + 0.2, dur: 0.9, g: 0.25 }); noise(c, d, { t0: t + 0.2, dur: 0.6, g: 0.08, type: "highpass", f: 6000 }); coins(c, d, t + 0.3, 0.8, 8); return 1.5; },
  "slot/jackpot-minor": (c, d, t) => { fanfare(c, d, t, 1); bell(c, d, { f: 2093, t0: t + 0.6, dur: 1.0, g: 0.2 }); coins(c, d, t + 0.4, 1.2, 14); return 2.0; },
  "slot/jackpot-major": (c, d, t) => { fanfare(c, d, t, 3); return 3.0; },
  "slot/jackpot-grand": (c, d, t) => { fanfare(c, d, t, 4); coins(c, d, t + 2.0, 2.5, 40, 0.12); fanfare(c, d, t + 2.4, 2); return 5.0; },

  "color/chip-place": (c, d, t) => { noise(c, d, { t0: t, dur: 0.04, g: 0.3, f: 1500 }); osc(c, d, { f: 900, f1: 500, t0: t, dur: 0.05, g: 0.2 }); osc(c, d, { f: 2400, f1: 1800, t0: t + 0.01, dur: 0.03, g: 0.08 }); return 0.1; },
  "color/chip-other": (c, d, t) => { noise(c, d, { t0: t, dur: 0.035, g: 0.14, f: 1100 }); osc(c, d, { f: 700, f1: 420, t0: t, dur: 0.045, g: 0.1 }); return 0.08; },
  "color/countdown-tick": (c, d, t) => { osc(c, d, { f: 1200, f1: 1000, t0: t, dur: 0.04, g: 0.2 }); noise(c, d, { t0: t, dur: 0.012, g: 0.15, type: "highpass", f: 3000 }); return 0.06; },
  "color/bets-closed": (c, d, t) => { bell(c, d, { f: 1760, t0: t, dur: 0.7, g: 0.3 }); return 0.7; },
  "color/dice-rattle": (c, d, t) => { let tt = t; for (let i = 0; i < 16; i++) { noise(c, d, { t0: tt, dur: 0.02, g: 0.12 + Math.random() * 0.1, f: 1800 + Math.random() * 1500 }); tt += 0.045 + Math.random() * 0.05; } return 1.2; },
  "color/dice-land-1": (c, d, t) => { noise(c, d, { t0: t, dur: 0.05, g: 0.28, f: 800 }); osc(c, d, { f: 220, f1: 120, t0: t, dur: 0.07, g: 0.25 }); return 0.12; },
  "color/dice-land-2": (c, d, t) => { noise(c, d, { t0: t, dur: 0.05, g: 0.26, f: 900 }); osc(c, d, { f: 250, f1: 130, t0: t, dur: 0.07, g: 0.22 }); noise(c, d, { t0: t + 0.09, dur: 0.03, g: 0.1, f: 800 }); return 0.14; },
  "color/dice-land-3": (c, d, t) => { noise(c, d, { t0: t, dur: 0.06, g: 0.3, f: 750 }); osc(c, d, { f: 200, f1: 110, t0: t, dur: 0.08, g: 0.26 }); noise(c, d, { t0: t + 0.1, dur: 0.03, g: 0.1, f: 700 }); noise(c, d, { t0: t + 0.17, dur: 0.02, g: 0.06, f: 700 }); return 0.22; },
  "color/win-1": (c, d, t) => { bell(c, d, { f: 1046, t0: t, dur: 0.45, g: 0.22 }); bell(c, d, { f: 1318, t0: t + 0.12, dur: 0.5, g: 0.22 }); coins(c, d, t + 0.2, 0.4, 4); return 0.8; },
  "color/win-2": (c, d, t) => { fanfare(c, d, t, 1); coins(c, d, t + 0.3, 0.9, 10); return 1.5; },
  "color/win-3": (c, d, t) => { fanfare(c, d, t, 3); return 2.5; },
  "color/lose": (c, d, t) => { osc(c, d, { type: "triangle", f: 440, f1: 420, t0: t, dur: 0.25, g: 0.15 }); osc(c, d, { type: "triangle", f: 330, f1: 300, t0: t + 0.25, dur: 0.35, g: 0.15 }); return 0.6; },
  "color/jackpot-siren": (c, d, t) => { for (let i = 0; i < 4; i++) { osc(c, d, { f: 600, f1: 1200, t0: t + i * 0.6, dur: 0.3, a: 0.02, g: 0.18 }); osc(c, d, { f: 1200, f1: 600, t0: t + i * 0.6 + 0.3, dur: 0.3, a: 0.02, g: 0.18 }); } for (let i = 0; i < 6; i++) bell(c, d, { f: N([0, 4, 7, 12, 16, 19][i], 1046), t0: t + 0.1 + i * 0.3, dur: 0.6, g: 0.14 }); coins(c, d, t + 1.0, 2.5, 30); return 4.0; },
  "color/rank-up": (c, d, t) => { bell(c, d, { f: 659, t0: t, dur: 0.3, g: 0.18 }); bell(c, d, { f: 784, t0: t + 0.1, dur: 0.3, g: 0.18 }); bell(c, d, { f: 1046, t0: t + 0.2, dur: 0.5, g: 0.22 }); return 0.7; },
};
for (let i = 1; i <= 5; i++) R[`slot/reel-stop-${i}` as SoundName] = (c, d, t) => { const k = 1 + 0.12 * (i - 1); noise(c, d, { t0: t, dur: 0.025, g: 0.25, f: 1200 }); osc(c, d, { f: 150 * k, f1: 90 * k, t0: t, dur: 0.12, g: 0.35 }); bell(c, d, { f: 1200 * k, t0: t + 0.01, dur: i === 5 ? 0.35 : 0.18, g: i === 5 ? 0.14 : 0.08 }); return 0.25; };
for (let i = 1; i <= 4; i++) R[`slot/cascade-${i}` as SoundName] = (c, d, t) => { const base = [523.25, 587.33, 659.25, 783.99][i - 1]; [0, 4, 7].forEach((s, k) => bell(c, d, { f: N(s, base), t0: t + k * 0.08, dur: 0.45 + i * 0.05, g: 0.18 })); if (i >= 3) noise(c, d, { t0: t + 0.1, dur: 0.4, g: 0.05, type: "highpass", f: 7000 }); if (i === 4) bell(c, d, { f: 130.8, t0: t + 0.2, dur: 1.2, g: 0.2 }); return 0.5 + i * 0.05; };
return R;
}
const R = buildRecipes();
/** Loops are scheduled piecewise; each returns the period in seconds. */
const LOOPS: Partial<Record<SoundName, Recipe>> = {
  "slot/reel-whir": (c, d, t) => { for (let i = 0; i < 8; i++) noise(c, d, { t0: t + i * 0.055, dur: 0.012, g: 0.08, type: "bandpass", f: 900 + (i % 2) * 300, q: 2 }); noise(c, d, { t0: t, dur: 0.44, g: 0.05, type: "bandpass", f: 400, q: 0.7, a: 0.05 }); return 0.44; },
  "slot/hw-heartbeat": (c, d, t) => { osc(c, d, { f: 60, f1: 35, t0: t, dur: 0.18, g: 0.5 }); osc(c, d, { f: 55, f1: 32, t0: t + 0.26, dur: 0.16, g: 0.38 }); return 1.0; },
};

/* ───────────── engine ───────────── */
class Engine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  fx: GainNode | null = null;
  /** sound name → file extension, for the real samples that exist. */
  manifest = new Map<string, string>();
  buffers = new Map<string, Promise<AudioBuffer | null>>();
  local = true;
  admin = true;
  listeners = new Set<() => void>();
  duckUntil = 0;
  constructor() {
    if (typeof window === "undefined") return;
    try { this.local = window.localStorage.getItem(LS_KEY) !== "off"; } catch { /* private mode */ }
    fetch("/sounds/manifest.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : [])).then((list: string[]) => { for (const f of list) { const m = /^(.*)\.(mp3|ogg|wav|m4a)$/i.exec(f); if (m) this.manifest.set(m[1], m[2]); } }).catch(() => {});
    const wake = () => { this.ensure(); window.removeEventListener("pointerdown", wake); window.removeEventListener("keydown", wake); window.removeEventListener("touchend", wake); };
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("keydown", wake);
    window.addEventListener("touchend", wake, { passive: true });
  }
  get on() { return this.local && this.admin; }
  ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
      this.fx = this.ctx.createGain(); this.fx.gain.value = 1; this.fx.connect(this.master);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }
  setLocal(v: boolean) { this.local = v; try { window.localStorage.setItem(LS_KEY, v ? "on" : "off"); } catch { /* ignore */ } this.emit(); }
  setAdmin(v: boolean) { if (this.admin !== v) { this.admin = v; this.emit(); } }
  emit() { this.listeners.forEach((l) => l()); }
  /** Lower the small sounds briefly so a big moment stands out. */
  duck(ms: number) {
    if (!this.ctx || !this.fx) return;
    const t = this.ctx.currentTime;
    this.fx.gain.cancelScheduledValues(t);
    this.fx.gain.setValueAtTime(this.fx.gain.value, t);
    this.fx.gain.linearRampToValueAtTime(0.35, t + 0.05);
    this.fx.gain.linearRampToValueAtTime(1, t + ms / 1000);
  }
  private sample(name: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(name);
    if (!p) {
      p = fetch(`/sounds/${name}.${this.manifest.get(name) ?? "mp3"}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("missing")))).then((ab) => this.ctx!.decodeAudioData(ab)).catch(() => null);
      this.buffers.set(name, p);
    }
    return p;
  }
  play(name: SoundName, o: Opts = {}): void {
    if (!this.on) return;
    const ctx = this.ensure();
    if (!ctx || !this.fx || !this.master) return;
    const big = /win-big|win-mega|win-epic|jackpot|win-3|siren/.test(name);
    const dest = ctx.createGain();
    dest.gain.value = o.volume ?? 1;
    dest.connect(big ? this.master : this.fx);
    if (big) this.duck(name.includes("grand") || name.includes("epic") ? 4500 : 2200);
    if (this.manifest.has(name)) {
      void this.sample(name).then((buf) => {
        if (!buf) { R[name]?.(ctx, dest, ctx.currentTime); return; }
        const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = o.rate ?? 1; s.connect(dest); s.start();
      });
      return;
    }
    R[name]?.(ctx, dest, ctx.currentTime + 0.001);
  }
  /** Start a looping sound; returns a function that stops it. */
  loop(name: SoundName, o: Opts = {}): () => void {
    if (!this.on) return () => {};
    const ctx = this.ensure();
    if (!ctx || !this.fx) return () => {};
    const dest = ctx.createGain(); dest.gain.value = o.volume ?? 1; dest.connect(this.fx);
    let stopped = false;
    let src: AudioBufferSourceNode | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (this.manifest.has(name)) {
      void this.sample(name).then((buf) => { if (stopped || !buf) return; src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(dest); src.start(); });
    } else {
      const rec = LOOPS[name];
      if (!rec) return () => {};
      let next = ctx.currentTime + 0.01;
      const tick = () => { if (stopped) return; while (next < ctx.currentTime + 0.3) next += rec(ctx, dest, next); timer = setTimeout(tick, 120); };
      tick();
    }
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      const t = ctx.currentTime;
      dest.gain.setValueAtTime(dest.gain.value, t); dest.gain.linearRampToValueAtTime(0.0001, t + 0.12);
      setTimeout(() => { try { src?.stop(); } catch { /* already stopped */ } dest.disconnect(); }, 200);
    };
  }
}
let engine: Engine | null = null;
export function getSound(): Engine { if (!engine) engine = new Engine(); return engine; }

/** The games' hook: play/loop plus the per-device switch; also feeds the admin switch into the engine. */
export function useSound() {
  const { settings } = useGamesSettings();
  const adminOn = (settings as { sounds?: { enabled?: boolean } }).sounds?.enabled !== false;
  const [, force] = useState(0);
  useEffect(() => { const e = getSound(); const l = () => force((n) => n + 1); e.listeners.add(l); return () => { e.listeners.delete(l); }; }, []);
  useEffect(() => { getSound().setAdmin(adminOn); }, [adminOn]);
  const e = getSound();
  const play = useCallback((name: SoundName, o?: Opts) => getSound().play(name, o), []);
  const loop = useCallback((name: SoundName, o?: Opts) => getSound().loop(name, o), []);
  const toggle = useCallback(() => { const s = getSound(); s.setLocal(!s.local); if (!s.local) return; s.play("common/toggle"); }, []);
  return { on: e.on, local: e.local, adminOn, play, loop, toggle };
}
