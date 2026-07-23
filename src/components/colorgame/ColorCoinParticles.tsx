"use client";

import { useEffect, useRef } from "react";

type Props = {
  active: boolean;
  count?: number;
  ambient?: boolean;
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

export function ColorCoinParticles({ active, count = 20, ambient }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spriteRef = useRef<HTMLImageElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const ambientTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = "/colorgame/coin-sprite.png";
    spriteRef.current = img;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    function spawnBurst(n: number) {
      for (let i = 0; i < n; i++) {
        particlesRef.current.push({
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
    }

    function spawnAmbient() {
      particlesRef.current.push({
        x: Math.random() * w,
        y: h + 10,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -0.8 - Math.random() * 1.2,
        frame: Math.floor(Math.random() * SPRITE_FRAMES),
        frameTimer: 0,
        life: 0,
        maxLife: 80 + Math.random() * 60,
        scale: 0.2 + Math.random() * 0.25,
      });
    }

    if (active) spawnBurst(count);

    if (ambient) {
      ambientTimerRef.current = setInterval(spawnAmbient, 800);
    }

    function animate() {
      if (!ctx || !canvas) return;
      const cw = canvas.offsetWidth;
      const ch = canvas.offsetHeight;
      ctx.clearRect(0, 0, cw, ch);
      const sprite = spriteRef.current;

      let alive = 0;
      for (const p of particlesRef.current) {
        if (p.life >= p.maxLife) continue;
        alive++;
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += ambient && !active ? 0.02 : 0.15;
        p.frameTimer++;
        if (p.frameTimer > 3) {
          p.frameTimer = 0;
          p.frame = (p.frame + 1) % SPRITE_FRAMES;
        }

        const alpha = Math.max(0, 1 - p.life / p.maxLife);
        ctx.globalAlpha = alpha * (ambient && !active ? 0.4 : 1);

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
      particlesRef.current = particlesRef.current.filter((p) => p.life < p.maxLife);

      if (alive > 0 || ambient) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (ambientTimerRef.current) clearInterval(ambientTimerRef.current);
    };
  }, [active, count, ambient]);

  if (!active && !ambient) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-40"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
