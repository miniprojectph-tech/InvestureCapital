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

const FACE_ROTATIONS: Record<number, string> = {
  0: "rotateY(0deg)",      // front
  1: "rotateY(180deg)",    // back
  2: "rotateY(-90deg)",    // left
  3: "rotateY(90deg)",     // right
  4: "rotateX(90deg)",     // top
  5: "rotateX(-90deg)",    // bottom
};

const LANDING_ROTATIONS: Record<DieColor, string> = {
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

export function ColorDice({ results, rolling, size = 80 }: Props) {
  const half = size / 2;

  return (
    <div className="flex items-center justify-center gap-3 sm:gap-5">
      {[0, 1, 2].map((i) => (
        <SingleDie
          key={i}
          result={results?.[i]}
          rolling={rolling}
          size={size}
          half={half}
          delay={i * 200}
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
}: {
  result?: DieColor;
  rolling: boolean;
  size: number;
  half: number;
  delay: number;
}) {
  const cubeRef = useRef<HTMLDivElement>(null);
  const [spinId, setSpinId] = useState(0);

  useEffect(() => {
    if (rolling) setSpinId((p) => p + 1);
  }, [rolling]);

  const landRotation = result ? LANDING_ROTATIONS[result] : "rotateX(0deg) rotateY(0deg)";

  const spinTurns = 3 + Math.random() * 2;
  const spinX = Math.round(spinTurns * 360 + (Math.random() > 0.5 ? 180 : 0));
  const spinY = Math.round(spinTurns * 360 + (Math.random() > 0.5 ? 90 : 0));
  const spinZ = Math.round(spinTurns * 180);

  const animName = `diceRoll_${spinId}_${delay}`;

  return (
    <div
      style={{
        width: size,
        height: size,
        perspective: size * 4,
      }}
    >
      <style>{`
        @keyframes ${animName} {
          0% { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg); }
          15% { transform: rotateX(${spinX * 0.3}deg) rotateY(${spinY * 0.3}deg) rotateZ(${spinZ * 0.3}deg); }
          40% { transform: rotateX(${spinX * 0.65}deg) rotateY(${spinY * 0.65}deg) rotateZ(${spinZ * 0.6}deg); }
          70% { transform: rotateX(${spinX * 0.9}deg) rotateY(${spinY * 0.9}deg) rotateZ(${spinZ * 0.85}deg); }
          100% { transform: ${landRotation}; }
        }
      `}</style>
      <div
        ref={cubeRef}
        style={{
          width: size,
          height: size,
          position: "relative",
          transformStyle: "preserve-3d",
          transition: rolling ? "none" : "transform 0.3s ease-out",
          transform: rolling ? undefined : landRotation,
          animation: rolling ? `${animName} 2.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}ms forwards` : "none",
        }}
      >
        {FACE_ORDER.map((color, fi) => (
          <div
            key={color}
            style={{
              position: "absolute",
              width: size,
              height: size,
              transform: `${FACE_ROTATIONS[fi]} translateZ(${half}px)`,
              backfaceVisibility: "hidden",
              borderRadius: 8,
              overflow: "hidden",
              boxShadow: "inset 0 0 8px rgba(0,0,0,0.3)",
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
