"use client";

import { useEffect, useRef, useState } from "react";
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

const FACE_TRANSFORMS: string[] = [
  "rotateY(0deg)",      // front
  "rotateY(180deg)",    // back
  "rotateY(-90deg)",    // left
  "rotateY(90deg)",     // right
  "rotateX(90deg)",     // top
  "rotateX(-90deg)",    // bottom
];

const LANDING: Record<DieColor, string> = {
  red:    "rotateX(0deg) rotateY(0deg)",
  blue:   "rotateX(0deg) rotateY(180deg)",
  yellow: "rotateX(0deg) rotateY(90deg)",
  pink:   "rotateX(0deg) rotateY(-90deg)",
  white:  "rotateX(-90deg) rotateY(0deg)",
  green:  "rotateX(90deg) rotateY(0deg)",
};

type Props = {
  results?: [DieColor, DieColor, DieColor];
  rolling: boolean;
  size?: number;
};

export function ColorDice({ results, rolling, size = 90 }: Props) {
  const half = size / 2;

  return (
    <div className="flex items-end justify-center gap-2" style={{ perspective: size * 6 }}>
      {[0, 1, 2].map((i) => (
        <SingleDie
          key={i}
          result={results?.[i]}
          rolling={rolling}
          size={size}
          half={half}
          delay={i * 250}
          yOffset={i === 1 ? -8 : 0}
        />
      ))}
    </div>
  );
}

function SingleDie({
  result,
  rolling,
  size,
  half,
  delay,
  yOffset,
}: {
  result?: DieColor;
  rolling: boolean;
  size: number;
  half: number;
  delay: number;
  yOffset: number;
}) {
  const [animKey, setAnimKey] = useState(0);
  const randRef = useRef({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    if (rolling) {
      randRef.current = {
        x: 720 + Math.random() * 720,
        y: 720 + Math.random() * 720,
        z: 360 + Math.random() * 360,
      };
      setAnimKey((p) => p + 1);
    }
  }, [rolling]);

  const landRotation = result ? LANDING[result] : "rotateX(-20deg) rotateY(25deg)";
  const { x, y, z } = randRef.current;
  const anim = `diceRoll${animKey}d${delay}`;

  return (
    <div style={{ width: size, height: size, marginBottom: yOffset }}>
      <style>{`
        @keyframes ${anim} {
          0%   { transform: rotateX(0) rotateY(0) rotateZ(0) translateY(0); }
          10%  { transform: rotateX(${x * 0.15}deg) rotateY(${y * 0.15}deg) rotateZ(${z * 0.1}deg) translateY(-30px); }
          30%  { transform: rotateX(${x * 0.45}deg) rotateY(${y * 0.45}deg) rotateZ(${z * 0.35}deg) translateY(-15px); }
          55%  { transform: rotateX(${x * 0.75}deg) rotateY(${y * 0.75}deg) rotateZ(${z * 0.65}deg) translateY(-5px); }
          80%  { transform: rotateX(${x * 0.95}deg) rotateY(${y * 0.95}deg) rotateZ(${z * 0.9}deg) translateY(4px); }
          90%  { transform: ${landRotation} translateY(-2px); }
          100% { transform: ${landRotation} translateY(0); }
        }
        @keyframes diceBounce${animKey}d${delay} {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
      `}</style>
      <div
        style={{
          width: size,
          height: size,
          position: "relative",
          transformStyle: "preserve-3d",
          transform: rolling ? undefined : landRotation,
          animation: rolling
            ? `${anim} 2.6s cubic-bezier(0.22, 0.61, 0.36, 1) ${delay}ms forwards`
            : result
            ? `diceBounce${animKey}d${delay} 2s ease-in-out infinite`
            : "none",
        }}
      >
        {FACE_ORDER.map((color, fi) => (
          <div
            key={color}
            style={{
              position: "absolute",
              width: size,
              height: size,
              transform: `${FACE_TRANSFORMS[fi]} translateZ(${half}px)`,
              backfaceVisibility: "hidden",
              borderRadius: Math.round(size * 0.12),
              overflow: "hidden",
              border: "2px solid rgba(255,255,255,0.25)",
              boxShadow: "inset 0 2px 6px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3)",
            }}
          >
            <img
              src={FACE_MAP[color]}
              alt={color}
              style={{ width: "100%", height: "100%", display: "block" }}
              draggable={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
