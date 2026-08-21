"use client";

import { useEffect, useRef } from "react";
import type { DieColor } from "@/lib/colorgame";

const FACE_MAP: Record<DieColor, string> = {
  red: "/colorgame/dice/die_face_red.png?v=2",
  blue: "/colorgame/dice/die_face_blue.png?v=2",
  yellow: "/colorgame/dice/die_face_yellow.png?v=2",
  pink: "/colorgame/dice/die_face_pink.png?v=2",
  white: "/colorgame/dice/die_face_white.png?v=2",
  green: "/colorgame/dice/die_face_green.png?v=2",
};

const FACE_ORDER: DieColor[] = ["red", "blue", "yellow", "pink", "white", "green"];

const FACE_TF: Record<DieColor, string> = {
  red: "rotateY(0deg)",
  blue: "rotateY(180deg)",
  yellow: "rotateY(-90deg)",
  pink: "rotateY(90deg)",
  white: "rotateX(90deg)",
  green: "rotateX(-90deg)",
};

const LAND: Record<DieColor, { x: number; y: number }> = {
  red: { x: 0, y: 0 },
  blue: { x: 0, y: 180 },
  yellow: { x: 0, y: 90 },
  pink: { x: 0, y: -90 },
  white: { x: -90, y: 0 },
  green: { x: 90, y: 0 },
};

// showcase (lid) — % of stage
const PLATFORM_Y = 19.5;
const FRAME_T = 2;
const FRAME_H = 25;
const FRAME_W = 82;

// dice + physics — fractions of stage
const DIE_FR = 0.155;
const REST_X = [0.32, 0.5, 0.68];
const REST_Y = 0.161;
const TRAY_FLOOR = 0.82;
const TRAY_L = 0.14;
const TRAY_R = 0.86;
const VIEW_TX = -32;
const VIEW_TY = 0;
const BET_TX = 0;
const BET_TY = 0;
// slide-and-coast motion (tuned in the interactive motion tuner)
const EDGE_Y = 0.4;         // lid bottom — dice drop off here into the tray
const SLIDE_ACC = 0.00028;  // gentle accel (x stage height) — no free fall
const SLIDE_CAP = 0.005;    // capped speed
const ROLL_SPIN = 14;       // forward crawl-roll per frame (x spinMul)
const MOMENTUM = 0.94;      // coast decay after the edge

type Die = {
  x: number; y: number; vx: number; vy: number;
  rx: number; ry: number; rz: number;
  arx: number; ary: number; arz: number;
  dropped: boolean; resting: boolean; bias: number; spinMul: number; floorY: number;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Which face ends up most upward on screen after the die + view rotation.
// (In the tilted tray view the player reads the TOP face, not the front.)
function topFace(rx: number, ry: number): DieColor {
  const N: Record<DieColor, [number, number, number]> = {
    red: [0, 0, 1], blue: [0, 0, -1], yellow: [-1, 0, 0],
    pink: [1, 0, 0], white: [0, -1, 0], green: [0, 1, 0],
  };
  const d = Math.PI / 180;
  const rotY = (v: number[], a: number) => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
  const rotX = (v: number[], a: number) => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)];
  let best: DieColor = "white";
  let bestY = Infinity; // screen-Y is positive downward, so the top face is the min
  (Object.keys(N) as DieColor[]).forEach((c) => {
    let v: number[] = N[c];
    v = rotY(v, ry * d); v = rotX(v, rx * d);
    v = rotY(v, VIEW_TY * d); v = rotX(v, VIEW_TX * d);
    if (v[1] < bestY) { bestY = v[1]; best = c; }
  });
  return best;
}

function step(dice: Die[], W: number, H: number) {
  const R = (DIE_FR * W) / 2;
  const ACC = SLIDE_ACC * H;
  const CAP = SLIDE_CAP * H;
  const edgeY = EDGE_Y * H;
  const left = TRAY_L * W;
  const right = TRAY_R * W;
  const sd = (cur: number, tgt: number) => ((tgt - cur + 540) % 360) - 180;
  const near90 = (v: number) => Math.round(v / 90) * 90;

  for (const d of dice) {
    if (d.resting) {
      // sit on the tray floor and ease the tumble to a stop on the nearest face
      d.y = d.floorY - R;
      d.vx *= 0.85;
      d.arx = d.arx * 0.8 + sd(d.rx, near90(d.rx)) * 0.1;
      d.ary = d.ary * 0.8 + sd(d.ry, near90(d.ry)) * 0.1;
      d.arz = d.arz * 0.8 + sd(d.rz, near90(d.rz)) * 0.1;
      d.x += d.vx; d.rx += d.arx; d.ry += d.ary; d.rz += d.arz;
      if (d.x - R < left) { d.x = left + R; d.vx *= -0.4; }
      if (d.x + R > right) { d.x = right - R; d.vx *= -0.4; }
      continue;
    }
    if (!d.dropped) {
      // slide down the lid, crawl-rolling forward at a capped speed (no free fall)
      d.vy = Math.min(d.vy + ACC, CAP);
      d.arx = -ROLL_SPIN * d.spinMul;
      if (d.y + R >= edgeY) { d.dropped = true; d.vx = d.bias; }
    } else {
      // coast into the tray on the slide momentum, gently decaying
      d.vy = Math.min(d.vy * MOMENTUM + ACC * 0.3, CAP);
      d.vx *= MOMENTUM;
      d.arx *= 0.985;
    }
    d.x += d.vx; d.y += d.vy; d.rx += d.arx; d.rz += d.arz;
    if (d.y + R > d.floorY) {
      d.y = d.floorY - R;
      if (d.vy > CAP * 0.25) { d.vy *= -0.22; d.vx *= 0.9; d.arx *= 0.5; }
      else { d.resting = true; d.vy = 0; }
    }
    if (d.x - R < left) { d.x = left + R; d.vx *= -0.4; }
    if (d.x + R > right) { d.x = right - R; d.vx *= -0.4; }
  }
  for (let i = 0; i < dice.length; i++) {
    for (let j = i + 1; j < dice.length; j++) {
      const a = dice[i], b = dice[j];
      if (!a.dropped || !b.dropped) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy), min = DIE_FR * W * 1.05;
      if (dist > 0 && dist < min) {
        const nx = dx / dist, ny = dy / dist, ov = (min - dist) / 2;
        a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
        const p = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (p > 0) { a.vx -= p * nx * 0.7; a.vy -= p * ny * 0.7; b.vx += p * nx * 0.7; b.vy += p * ny * 0.7; }
      }
    }
  }
}

function settled(dice: Die[]): boolean {
  return dice.every((d) =>
    d.resting && Math.abs(d.vx) < 0.1 &&
    Math.abs(d.arx) < 0.3 && Math.abs(d.ary) < 0.3 && Math.abs(d.arz) < 0.3);
}

function initialDice(rng: () => number, W: number, H: number): Die[] {
  return [0, 1, 2].map((i) => ({
    x: REST_X[i] * W,
    y: REST_Y * H,
    vx: 0, vy: 0,
    rx: 0, ry: 0, rz: (rng() - 0.5) * 6,
    arx: 0, ary: 0, arz: 0,
    dropped: false, resting: false,
    // drift left / centre / right with per-die variation -> varied spread and distance
    bias: (([-1, 0, 1][i] * (1.4 + rng() * 1.6)) + (rng() - 0.5) * 0.8) * (W / 331),
    spinMul: 0.8 + rng() * 0.5,
    floorY: (TRAY_FLOOR - rng() * 0.12) * H,
  }));
}

type Props = {
  results?: [DieColor, DieColor, DieColor];
  phase: string;
  // Fired once the dice physics come to rest (so the win overlay can wait
  // for the roll to finish instead of popping the instant results arrive).
  onSettled?: () => void;
};

export function ColorDice({ results, phase, onSettled }: Props) {
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const platformRef = useRef<HTMLDivElement>(null);
  const posRefs = useRef<(HTMLDivElement | null)[]>([]);
  const viewRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cubeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const faceRefs = useRef<(HTMLDivElement | null)[][]>([[], [], []]);
  const imgRefs = useRef<(HTMLImageElement | null)[][]>([[], [], []]);

  const dim = useRef({ w: 0, h: 0 });
  const resultsRef = useRef<Props["results"]>(results);
  const phaseRef = useRef(phase);
  const prevPhase = useRef("");
  const hasRolled = useRef(false);
  const betFaces = useRef<DieColor[]>([FACE_ORDER[0], FACE_ORDER[1], FACE_ORDER[2]]);
  const raf = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  resultsRef.current = results;

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const fns = useRef({ layoutStatic: (_betting: boolean) => {}, roll: () => {} });

  const sizeFaces = (i: number, diePx: number) => {
    FACE_ORDER.forEach((c, fi) => {
      const f = faceRefs.current[i]?.[fi];
      if (f) f.style.transform = `${FACE_TF[c]} translateZ(${diePx / 2}px)`;
    });
  };
  const paint = (i: number, map: Record<DieColor, DieColor>) => {
    FACE_ORDER.forEach((c, fi) => {
      const img = imgRefs.current[i]?.[fi];
      if (img) img.src = FACE_MAP[map[c]];
    });
  };
  const identityMap = () => Object.fromEntries(FACE_ORDER.map((c) => [c, c])) as Record<DieColor, DieColor>;

  fns.current.layoutStatic = (betting: boolean) => {
    const { w, h } = dim.current;
    if (!w || !h) return;
    const diePx = DIE_FR * w;
    const R = diePx / 2;

    const fr = frameRef.current;
    if (fr) {
      const fw = w * (FRAME_W / 100), fh = h * (FRAME_H / 100);
      fr.style.width = `${fw}px`; fr.style.height = `${fh}px`;
      fr.style.left = `${(w - fw) / 2}px`; fr.style.top = `${(FRAME_T / 100) * h}px`;
      fr.style.transition = "opacity 0.25s ease";
      fr.style.transform = "none";
      fr.style.opacity = betting ? "1" : "0";
    }
    const pf = platformRef.current;
    if (pf) {
      const pw = w * 0.6, ph = h * 0.035;
      pf.style.width = `${pw}px`; pf.style.height = `${ph}px`;
      pf.style.left = `${(w - pw) / 2}px`; pf.style.top = `${(PLATFORM_Y / 100) * h}px`;
      pf.style.transition = "opacity 0.25s ease";
      pf.style.transform = "translateY(0)";
      pf.style.opacity = betting ? "1" : "0";
    }
    const vtx = betting ? BET_TX : VIEW_TX;
    const vty = betting ? BET_TY : VIEW_TY;
    for (let i = 0; i < 3; i++) {
      const pos = posRefs.current[i];
      if (pos) { pos.style.width = `${diePx}px`; pos.style.height = `${diePx}px`; }
      const view = viewRefs.current[i];
      if (view) view.style.transform = `rotateX(${vtx}deg) rotateY(${vty}deg)`;
      sizeFaces(i, diePx);
    }
    if (!betting) return;
    for (let i = 0; i < 3; i++) {
      const pos = posRefs.current[i], cube = cubeRefs.current[i];
      if (!pos || !cube) continue;
      pos.style.transform = `translate(${REST_X[i] * w - R}px, ${REST_Y * h - R}px)`;
      // keep the cube at identity so every die seats the same on the ledge; show the
      // bet colour by swapping it onto the front (identity) face instead of rotating.
      const bf = betFaces.current[i];
      const map = identityMap();
      map.red = bf; map[bf] = "red";
      paint(i, map);
      cube.style.transform = "rotateX(0deg) rotateY(0deg)";
      // flat resting die: show only the front face so perspective can't reveal a side/bottom face
      faceRefs.current[i].forEach((f, fi) => { if (f) f.style.visibility = fi === 0 ? "visible" : "hidden"; });
    }
  };

  fns.current.roll = () => {
    const { w, h } = dim.current;
    if (!w || !h) return;
    if (raf.current) cancelAnimationFrame(raf.current);
    clearTimers();
    // dice stay resting (flat, on the platform) through the initial pause — don't fade/paint yet

    const res: DieColor[] = resultsRef.current
      ? [resultsRef.current[0], resultsRef.current[1], resultsRef.current[2]]
      : [FACE_ORDER[(Math.random() * 6) | 0], FACE_ORDER[(Math.random() * 6) | 0], FACE_ORDER[(Math.random() * 6) | 0]];
    const seed = (Date.now() & 0x7fffffff) ^ 0x9e3779b9;

    // headless pre-run to learn which face each die lands on
    const head = initialDice(mulberry32(seed), w, h);
    for (let n = 0; n < 900 && !settled(head); n++) step(head, w, h);
    const landColors = [0, 1, 2].map((i) =>
      topFace(Math.round(head[i].rx / 90) * 90, Math.round(head[i].ry / 90) * 90));

    // 0.40s: retract the support platform backward into its slot, fade the showcase
    timers.current.push(setTimeout(() => {
      const pf = platformRef.current;
      if (pf) {
        pf.style.transition = "transform 0.16s cubic-bezier(0.45,0,0.9,0.35), opacity 0.16s ease";
        pf.style.transform = `translateY(${-h * 0.11}px) scaleY(0.4)`;
        pf.style.opacity = "0";
      }
      const fr = frameRef.current;
      if (fr) { fr.style.transition = "opacity 0.22s ease"; fr.style.opacity = "0"; }
    }, 400));

    // 0.52s: support gone — reveal all faces, set result colours, start the physics drop
    timers.current.push(setTimeout(() => {
      for (let i = 0; i < 3; i++) {
        const map = identityMap();
        map[landColors[i]] = res[i];
        map[res[i]] = landColors[i];
        paint(i, map);
        faceRefs.current[i].forEach((f) => { if (f) f.style.visibility = "visible"; });
        const cube = cubeRefs.current[i];
        if (cube) cube.style.transition = "none";
        // switch to the tray 3D viewing angle for the tumble + landing
        const view = viewRefs.current[i];
        if (view) view.style.transform = `rotateX(${VIEW_TX}deg) rotateY(${VIEW_TY}deg)`;
      }
      const live = initialDice(mulberry32(seed), w, h);
      const R = (DIE_FR * w) / 2;
      const render = () => {
        for (let i = 0; i < 3; i++) {
          const pos = posRefs.current[i], cube = cubeRefs.current[i];
          if (!pos || !cube) continue;
          pos.style.transform = `translate(${live[i].x - R}px, ${live[i].y - R}px)`;
          cube.style.transform = `rotateX(${live[i].rx}deg) rotateY(${live[i].ry}deg) rotateZ(${live[i].rz}deg)`;
        }
      };
      let n = 0;
      const loop = () => {
        step(live, w, h);
        render();
        n++;
        if (n < 900 && !settled(live)) raf.current = requestAnimationFrame(loop);
        else { raf.current = null; onSettledRef.current?.(); }
      };
      render();
      raf.current = requestAnimationFrame(loop);
    }, 520));
  };

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      dim.current = { w: el.clientWidth, h: el.clientHeight };
      fns.current.layoutStatic(phaseRef.current === "betting" || phaseRef.current === "");
    });
    ro.observe(el);
    dim.current = { w: el.clientWidth, h: el.clientHeight };
    fns.current.layoutStatic(true);
    return () => { ro.disconnect(); if (raf.current) cancelAnimationFrame(raf.current); clearTimers(); };
  }, []);

  useEffect(() => {
    phaseRef.current = phase;
    const prev = prevPhase.current;
    prevPhase.current = phase;
    if (phase === "betting" && prev !== "betting") {
      hasRolled.current = false;
      betFaces.current = [FACE_ORDER[(Math.random() * 6) | 0], FACE_ORDER[(Math.random() * 6) | 0], FACE_ORDER[(Math.random() * 6) | 0]];
      if (raf.current) { cancelAnimationFrame(raf.current); raf.current = null; }
      clearTimers();
      fns.current.layoutStatic(true);
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "rolling" && phase !== "result") return;
    if (hasRolled.current) return;
    // Only roll once THIS round's real result is in hand, so the dice can't
    // tumble with the previous round's (stale) colours. Fall back to a roll
    // after a grace period if the server result is delayed.
    if (results) { hasRolled.current = true; fns.current.roll(); return; }
    const t = setTimeout(() => { if (!hasRolled.current) { hasRolled.current = true; fns.current.roll(); } }, 2500);
    return () => clearTimeout(t);
  }, [phase, results]);

  return (
    <div ref={rootRef} className="absolute inset-0" style={{ perspective: "1000px" }}>
      <div ref={frameRef} className="absolute" style={{
        borderRadius: "8%",
        background: "linear-gradient(#f7e6c8, #ecd0a4 60%, #e2c08c)",
        border: "3px solid #fff4e2",
        boxShadow: "0 4px 10px rgba(0,0,0,0.28), inset 0 2px 6px rgba(255,255,255,0.6), inset 0 -6px 10px rgba(160,110,60,0.35)",
      }} />
      <div ref={platformRef} className="absolute" style={{
        borderRadius: "10% / 45%",
        background: "linear-gradient(#c98a4b, #a9662f 55%, #86461d)",
        boxShadow: "0 4px 0 #6e3714, 0 6px 8px rgba(0,0,0,0.4), inset 0 2px 2px rgba(255,220,170,0.5)",
      }} />

      {[0, 1, 2].map((i) => (
        <div key={`die-${i}`} ref={(el) => { posRefs.current[i] = el; }} className="absolute top-0 left-0"
          style={{ transformStyle: "preserve-3d", willChange: "transform" }}>
          <div ref={(el) => { viewRefs.current[i] = el; }} className="absolute inset-0" style={{ transformStyle: "preserve-3d", transform: `rotateX(${BET_TX}deg) rotateY(${BET_TY}deg)` }}>
            <div ref={(el) => { cubeRefs.current[i] = el; }} className="absolute inset-0" style={{ transformStyle: "preserve-3d", willChange: "transform" }}>
              {FACE_ORDER.map((color, fi) => (
                <div key={color} ref={(el) => { faceRefs.current[i][fi] = el; }} className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
                  <img ref={(el) => { imgRefs.current[i][fi] = el; }} src={FACE_MAP[color]} alt="" draggable={false}
                    style={{ width: "100%", height: "100%", display: "block", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.28))" }} />
                  <div className="absolute inset-0 pointer-events-none" style={{
                    borderRadius: "16%",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 45%)",
                    opacity: 0.5,
                  }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
