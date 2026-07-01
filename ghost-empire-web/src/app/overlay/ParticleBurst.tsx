"use client";
// src/app/overlay/ParticleBurst.tsx
// Reactive alert particles (#770): a dependency-free canvas-2D confetti/ember burst fired
// behind each alert card. Origin follows the alert's anchor position (9-slot grid), colors
// derive from the alert accent. Intensity comes from the overlay URL (?particles=0..200,
// default 90; 0 disables) so streamers tune it per browser-source without any DB config.
// Runs a rAF loop ONLY while particles are alive — idle cost is zero.
import { useEffect, useRef } from "react";

type P = {
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number; size: number; color: string;
  born: number; life: number; shape: 0 | 1; // 0 = rect confetti, 1 = round ember
};

/** Fractional screen origin for each alert anchor position. */
export function burstOrigin(pos: string): { fx: number; fy: number } {
  switch (pos) {
    case "top-left": return { fx: 0.14, fy: 0.22 };
    case "top-center": return { fx: 0.5, fy: 0.2 };
    case "top-right": return { fx: 0.86, fy: 0.22 };
    case "center-left": return { fx: 0.14, fy: 0.5 };
    case "center": return { fx: 0.5, fy: 0.5 };
    case "center-right": return { fx: 0.86, fy: 0.5 };
    case "bottom-left": return { fx: 0.14, fy: 0.78 };
    case "bottom-center": return { fx: 0.5, fy: 0.8 };
    default: return { fx: 0.86, fy: 0.78 }; // bottom-right (default anchor)
  }
}

/** Types that celebrate harder (money/subs) get a bigger burst. */
export function typeMultiplier(type: string | undefined): number {
  switch (type) {
    case "donation":
    case "twitch_gift_sub":
    case "twitch_sub":
    case "shop_purchase":
      return 1.5;
    case "twitch_cheer":
    case "event_win":
      return 1.2;
    default:
      return 1;
  }
}

export function ParticleBurst({
  alertId,
  accent,
  position,
  type,
  intensity,
}: {
  alertId: string | null;
  accent: string;
  position: string;
  type?: string;
  intensity: number; // 0 disables; ~90 default
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<P[]>([]);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);

  // Spawn a burst whenever a new alert becomes current.
  useEffect(() => {
    if (!alertId || intensity <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    const { fx, fy } = burstOrigin(position);
    const count = Math.round(Math.min(200, intensity) * typeMultiplier(type));
    const colors = [accent, accent, "#ffffff", "#fbbf24", "#f4f4f5"];
    const now = performance.now();
    const born: P[] = [];
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9; // fountain up, wide spread
      const speed = 260 + Math.random() * 620;
      born.push({
        x: fx * w + (Math.random() - 0.5) * 60,
        y: fy * h + (Math.random() - 0.5) * 24,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 14,
        size: 4 + Math.random() * 7,
        color: colors[i % colors.length],
        born: now,
        life: 1100 + Math.random() * 700,
        shape: Math.random() < 0.75 ? 0 : 1,
      });
    }
    particlesRef.current.push(...born);

    // (Re)start the loop if idle.
    if (!rafRef.current) {
      lastRef.current = now;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      const tick = (t: number) => {
        const dt = Math.min(0.05, (t - lastRef.current) / 1000);
        lastRef.current = t;
        const cw = window.innerWidth, ch = window.innerHeight;
        ctx.clearRect(0, 0, cw, ch);
        const alive: P[] = [];
        for (const p of particlesRef.current) {
          const age = t - p.born;
          if (age > p.life || p.y > ch + 40) continue;
          p.vy += 950 * dt; // gravity
          p.vx *= 0.985; p.vy *= 0.992; // drag
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.rot += p.vr * dt;
          const fade = age / p.life;
          ctx.globalAlpha = fade > 0.7 ? Math.max(0, 1 - (fade - 0.7) / 0.3) : 1;
          ctx.fillStyle = p.color;
          if (p.shape === 0) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            ctx.restore();
          } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size / 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
          alive.push(p);
        }
        ctx.globalAlpha = 1;
        particlesRef.current = alive;
        if (alive.length > 0) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          ctx.clearRect(0, 0, cw, ch);
          rafRef.current = 0; // idle — zero cost until the next alert
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- retrigger strictly per alert
  }, [alertId]);

  // Unmount: stop the loop.
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  if (intensity <= 0) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 999998 }}
      aria-hidden
    />
  );
}
