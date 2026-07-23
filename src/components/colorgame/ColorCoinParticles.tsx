"use client";

import { useEffect, useRef } from "react";

type Props = {
  active: boolean;
  count?: number;
};

const SPRITE_FRAMES = 8;
const FRAME_W = 60;
const FRAME_H = 60;

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  frame: number;
  frameTimer: number;
  life: number;
  maxLife: number;
  scale: number;
};

export function ColorCoinParticles({ active, count = 20 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spriteRef = useRef<HTMLImageElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const img = new Image();
    img.src = "/colorgame/coin-sprite.png";
    spriteRef.current = img;
  }, []);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: w * 0.3 + Math.random() * w * 0.4,
        y: h * 0.5,
        vx: (Math.random() - 0.5) * 6,
        vy: -3 - Math.random() * 5,
        frame: Math.floor(Math.random() * SPRITE_FRAMES),
        frameTimer: 0,
        life: 0,
        maxLife: 40 + Math.random() * 30,
        scale: 0.4 + Math.random() * 0.4,
      });
    }
    particlesRef.current = particles;

    function animate() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, w, h);
      const sprite = spriteRef.current;

      let alive = 0;
      for (const p of particlesRef.current) {
        if (p.life >= p.maxLife) continue;
        alive++;
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        p.frameTimer++;
        if (p.frameTimer > 3) {
          p.frameTimer = 0;
          p.frame = (p.frame + 1) % SPRITE_FRAMES;
        }

        const alpha = Math.max(0, 1 - p.life / p.maxLife);
        ctx.globalAlpha = alpha;

        if (sprite?.complete) {
          const sx = p.frame * FRAME_W;
          const drawSize = FRAME_W * p.scale;
          ctx.drawImage(sprite, sx, 0, FRAME_W, FRAME_H, p.x - drawSize / 2, p.y - drawSize / 2, drawSize, drawSize);
        } else {
          ctx.fillStyle = "#FFD700";
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6 * p.scale, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      if (alive > 0) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, count]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-40"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
