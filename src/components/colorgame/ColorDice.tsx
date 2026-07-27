"use client";

import { useEffect, useRef } from "react";
import type { DieColor } from "@/lib/colorgame";

const FACE_MAP: Record<DieColor, string> = {
  red: "/colorgame/dice/die_face_red.png",
  blue: "/colorgame/dice/die_face_blue.png",
  yellow: "/colorgame/dice/die_face_yellow.png",
  pink: "/colorgame/dice/die_face_pink.png",
  white: "/colorgame/dice/die_face_white.png",
  green: "/colorgame/dice/die_face_green.png",
};

const FACE_ORDER: DieColor[] = ["red", "blue", "yellow", "pink", "white", "green"];

// which cube face each color occupies
const FACE_TF: Record<DieColor, string> = {
  red: "rotateY(0deg)",
  blue: "rotateY(180deg)",
  yellow: "rotateY(-90deg)",
  pink: "rotateY(90deg)",
  white: "rotateX(90deg)",
  green: "rotateX(-90deg)",
};

// cube rotation (x,y deg) that brings a color's face to the FRONT
const LAND: Record<DieColor, { x: number; y: number }> = {
  red: { x: 0, y: 0 },
  blue: { x: 0, y: 180 },
  yellow: { x: 0, y: 90 },
  pink: { x: 0, y: -90 },
  white: { x: -90, y: 0 },
  green: { x: 90, y: 0 },
};

// ---- tuned layout constants (verified against the background art) ----
const PLATFORM_Y = 21;              // ledge Y (% of stage height)
const DIE_SIZE = 24;                // % of stage width
const REST_X = [28, 50, 72];        // resting die centers (% of stage width)
const BANDS = [24, 50, 76];         // landing bands (% of stage width)
const FRAME_T = 2;                  // showcase window top (% of stage height)
const FRAME_H = 25;                 // showcase window height (% of stage height)
const FRAME_W = 82;                 // showcase window width (% of stage width)

function pick(): DieColor {
  return FACE_ORDER[(Math.random() * 6) | 0];
}
function faceRot(color: DieColor, z: number): string {
  const l = LAND[color];
  return `rotateZ(${z}deg) rotateX(${l.x}deg) rotateY(${l.y}deg)`;
}

type Props = {
  results?: [DieColor, DieColor, DieColor];
  phase: string; // "betting" | "rolling" | "result"
};

export function ColorDice({ results, phase }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const platformRef = useRef<HTMLDivElement>(null);
  const posRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dropRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cubeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shadowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  const dim = useRef({ w: 0, h: 0 });
  const land = useRef([
    { x: 50, y: 65, z: 0 },
    { x: 50, y: 65, z: 0 },
    { x: 50, y: 65, z: 0 },
  ]);
  const betFaces = useRef<DieColor[]>([pick(), pick(), pick()]);
  const resultsRef = useRef<Props["results"]>(results);
  const phaseRef = useRef(phase);
  const prevPhase = useRef("");
  const hasRolled = useRef(false);
  const rollN = useRef(0);

  resultsRef.current = results;

  // stable holder for the latest closures (used by ResizeObserver + timers)
  const fns = useRef({ place: (_betting: boolean) => {}, roll: () => {} });

  fns.current.place = (betting: boolean) => {
    const { w, h } = dim.current;
    if (!w || !h) return;
    const diePx = (DIE_SIZE / 100) * w;
    const half = diePx / 2;

    const fr = frameRef.current;
    if (fr) {
      const fw = w * (FRAME_W / 100);
      const fh = h * (FRAME_H / 100);
      fr.style.width = `${fw}px`;
      fr.style.height = `${fh}px`;
      fr.style.left = `${(w - fw) / 2}px`;
      fr.style.top = `${(FRAME_T / 100) * h}px`;
      fr.style.transition = "none";
      fr.style.opacity = betting ? "1" : "0";
    }

    const pf = platformRef.current;
    if (pf) {
      const pw = w * 0.66;
      const ph = h * 0.035;
      pf.style.width = `${pw}px`;
      pf.style.height = `${ph}px`;
      pf.style.left = `${(w - pw) / 2}px`;
      pf.style.top = `${(PLATFORM_Y / 100) * h}px`;
      pf.style.transition = "none";
      pf.style.transform = "translateY(0)";
      pf.style.opacity = betting ? "1" : "0";
    }

    const restY = PLATFORM_Y - (diePx * 0.5) / h * 100;

    for (let i = 0; i < 3; i++) {
      const pos = posRefs.current[i];
      const drop = dropRefs.current[i];
      const cube = cubeRefs.current[i];
      const shadow = shadowRefs.current[i];
      if (!pos || !drop || !cube) continue;

      pos.style.width = `${diePx}px`;
      pos.style.height = `${diePx}px`;
      [...cube.children].forEach((f) => {
        const el = f as HTMLElement;
        el.style.transform = `${FACE_TF[el.dataset.color as DieColor]} translateZ(${half}px)`;
      });

      const l = land.current[i];
      const ax = betting ? REST_X[i] : l.x;
      const ay = betting ? restY : l.y;
      pos.style.left = `${(ax / 100) * w - half}px`;
      pos.style.top = `${(ay / 100) * h - half}px`;

      drop.style.animation = "none";
      drop.style.transform = "translate(0px,0px)";

      cube.style.animation = "none";
      const color = betting ? betFaces.current[i] : (resultsRef.current?.[i] ?? betFaces.current[i]);
      cube.style.transform = betting ? faceRot(color, -4) : faceRot(color, l.z);

      if (shadow) {
        shadow.style.width = `${diePx * 0.9}px`;
        shadow.style.height = `${diePx * 0.32}px`;
        shadow.style.left = `${(ax / 100) * w - diePx * 0.45}px`;
        shadow.style.top = `${(ay / 100) * h + diePx * 0.32}px`;
        shadow.style.transition = "none";
        shadow.style.opacity = betting ? "0" : "0.7";
      }
    }
  };

  fns.current.roll = () => {
    const { w, h } = dim.current;
    if (!w || !h) return;
    rollN.current += 1;
    const n = rollN.current;
    const diePx = (DIE_SIZE / 100) * w;
    const half = diePx / 2;
    const restY = PLATFORM_Y - (diePx * 0.5) / h * 100;

    // showcase window fades away as the dice drop
    const fr = frameRef.current;
    if (fr) {
      fr.style.transition = "opacity 0.3s ease";
      fr.style.opacity = "0";
    }

    // platform lifts up & fades out
    const pf = platformRef.current;
    if (pf) {
      pf.style.transition = "transform 0.35s cubic-bezier(0.4,0,0.9,0.3), opacity 0.35s ease";
      pf.style.transform = `translateY(${-(PLATFORM_Y / 100) * h - 40}px)`;
      pf.style.opacity = "0";
    }

    const cols: DieColor[] = resultsRef.current
      ? [resultsRef.current[0], resultsRef.current[1], resultsRef.current[2]]
      : [pick(), pick(), pick()];

    const order = [0, 1, 2].sort(() => Math.random() - 0.5);
    let css = "";

    for (let i = 0; i < 3; i++) {
      const pos = posRefs.current[i];
      const drop = dropRefs.current[i];
      const cube = cubeRefs.current[i];
      const shadow = shadowRefs.current[i];
      if (!pos || !drop || !cube) continue;

      const color = cols[i];
      const lx = BANDS[order[i]] + (Math.random() * 12 - 6);
      const ly = 60 + Math.random() * 20;
      const lz = Math.random() * 40 - 20;
      land.current[i] = { x: lx, y: ly, z: lz };

      pos.style.left = `${(lx / 100) * w - half}px`;
      pos.style.top = `${(ly / 100) * h - half}px`;

      if (shadow) {
        shadow.style.width = `${diePx * 0.9}px`;
        shadow.style.height = `${diePx * 0.32}px`;
        shadow.style.left = `${(lx / 100) * w - diePx * 0.45}px`;
        shadow.style.top = `${(ly / 100) * h + diePx * 0.32}px`;
      }

      const offX = ((REST_X[i] - lx) / 100) * w;
      const offY = ((restY - ly) / 100) * h;
      const dropName = `cgdrop${n}_${i}`;
      css += `@keyframes ${dropName}{
        0%{transform:translate(${offX}px,${offY}px);}
        12%{transform:translate(${offX * 0.96}px,${offY - 18}px);}
        70%{transform:translate(${offX * 0.22}px,8px);}
        84%{transform:translate(${offX * 0.05}px,-10px);}
        93%{transform:translate(0px,4px);}
        100%{transform:translate(0px,0px);}
      }`;

      const end = faceRot(color, lz);
      const sx = (720 + Math.random() * 720) * (Math.random() < 0.5 ? -1 : 1);
      const sy = (720 + Math.random() * 720) * (Math.random() < 0.5 ? -1 : 1);
      const sz = (360 + Math.random() * 360) * (Math.random() < 0.5 ? -1 : 1);
      const start = `rotateZ(${lz + sz}deg) rotateX(${LAND[color].x + sx}deg) rotateY(${LAND[color].y + sy}deg)`;
      const tumName = `cgtum${n}_${i}`;
      css += `@keyframes ${tumName}{0%{transform:${start};}100%{transform:${end};}}`;

      const delay = i * 130;
      drop.style.animation = `${dropName} 1.7s cubic-bezier(0.3,0.05,0.4,1) ${delay}ms forwards`;
      cube.style.animation = `${tumName} 1.5s cubic-bezier(0.2,0.6,0.3,1) ${delay}ms forwards`;
      if (shadow) {
        shadow.style.transition = `opacity 0.4s ease ${delay + 1000}ms`;
        shadow.style.opacity = "0.7";
      }
    }
    if (styleRef.current) styleRef.current.textContent = css;
  };

  // measure the stage and (re)apply the current static state on resize
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      dim.current = { w: el.clientWidth, h: el.clientHeight };
      fns.current.place(phaseRef.current === "betting" || phaseRef.current === "");
    });
    ro.observe(el);
    dim.current = { w: el.clientWidth, h: el.clientHeight };
    fns.current.place(true);
    return () => ro.disconnect();
  }, []);

  // react to phase transitions
  useEffect(() => {
    phaseRef.current = phase;
    const prev = prevPhase.current;
    prevPhase.current = phase;
    if (phase === "betting" && prev !== "betting") {
      hasRolled.current = false;
      betFaces.current = [pick(), pick(), pick()];
      fns.current.place(true);
    }
  }, [phase]);

  // trigger the roll once results are known (or fall back after a short wait)
  useEffect(() => {
    if (phase !== "rolling" && phase !== "result") return;
    if (hasRolled.current) return;
    if (results || phase === "result") {
      hasRolled.current = true;
      fns.current.roll();
      return;
    }
    const t = setTimeout(() => {
      if (!hasRolled.current) {
        hasRolled.current = true;
        fns.current.roll();
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [phase, results]);

  return (
    <div ref={rootRef} className="absolute inset-0" style={{ perspective: "900px" }}>
      <style ref={styleRef} />

      {/* dice showcase window at the top of the lid */}
      <div
        ref={frameRef}
        className="absolute"
        style={{
          borderRadius: "8%",
          background: "linear-gradient(#f7e6c8, #ecd0a4 60%, #e2c08c)",
          border: "3px solid #fff4e2",
          boxShadow:
            "0 4px 10px rgba(0,0,0,0.28), inset 0 2px 6px rgba(255,255,255,0.6), inset 0 -6px 10px rgba(160,110,60,0.35)",
        }}
      />

      {/* thin wooden ledge inside the frame; lifts on roll */}
      <div
        ref={platformRef}
        className="absolute"
        style={{
          borderRadius: "10% / 45%",
          background: "linear-gradient(#c98a4b, #a9662f 55%, #86461d)",
          boxShadow:
            "0 4px 0 #6e3714, 0 6px 8px rgba(0,0,0,0.4), inset 0 2px 2px rgba(255,220,170,0.5)",
          willChange: "transform",
        }}
      />

      {[0, 1, 2].map((i) => (
        <div key={`shadow-${i}`}>
          <div
            ref={(el) => { shadowRefs.current[i] = el; }}
            className="absolute"
            style={{
              borderRadius: "50%",
              background: "radial-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0))",
              opacity: 0,
              willChange: "transform, opacity",
            }}
          />
          <div ref={(el) => { posRefs.current[i] = el; }} className="absolute">
            <div
              ref={(el) => { dropRefs.current[i] = el; }}
              className="absolute inset-0"
              style={{ willChange: "transform" }}
            >
              <div
                ref={(el) => { cubeRefs.current[i] = el; }}
                className="absolute inset-0"
                style={{ transformStyle: "preserve-3d", willChange: "transform" }}
              >
                {FACE_ORDER.map((color) => (
                  <div
                    key={color}
                    data-color={color}
                    className="absolute inset-0 overflow-hidden"
                    style={{
                      backfaceVisibility: "hidden",
                      borderRadius: "16%",
                      border: "2px solid rgba(255,255,255,0.28)",
                      boxShadow: "inset 0 2px 6px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.3)",
                    }}
                  >
                    <img
                      src={FACE_MAP[color]}
                      alt={color}
                      draggable={false}
                      style={{ width: "100%", height: "100%", display: "block" }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
