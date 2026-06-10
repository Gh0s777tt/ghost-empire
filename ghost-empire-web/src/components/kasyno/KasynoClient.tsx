"use client";
// src/components/kasyno/KasynoClient.tsx
// Slots + coinflip + roulette played for Ghost Tokens, with GPU-composited spin
// animations (CSS `transform` transitions → run at the display's native refresh rate,
// 60/120/240 Hz; we never compute outcomes client-side — the wheel/reels/coin always
// LAND on the server-decided result). Respects prefers-reduced-motion.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import HowItWorks from "@/components/HowItWorks";
import InfoTip from "@/components/InfoTip";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { Link } from "@/i18n/navigation";

type PlayResult = {
  ok?: boolean; bet: number; payout: number; net: number; newBalance: number;
  detail: string; reels?: string[]; roll?: { n: number; color: "green" | "red" | "black" };
  dice?: { roll: number; target: number; dir: "under" | "over"; win: boolean };
  crash?: { crash: number; target: number; win: boolean };
  plinko?: { path: number[]; bucket: number; multiplier: number }; error?: string;
};
type Leaderboard = {
  bigWins: Array<{ id: string; name: string; game: string; net: number; detail: string | null }>;
  topNet: Array<{ name: string; net: number }>;
};
type Game = "slots" | "coinflip" | "roulette" | "dice" | "crash" | "plinko";
type Phase = "spin" | "land";

// Plinko board mirrors lib/gt-games.ts (replicated so the client never imports the server lib).
const PLINKO_MULTS_UI = [13, 4, 1.8, 1.3, 1.05, 0.9, 0.5, 0.9, 1.05, 1.3, 1.8, 4, 13];
const PLINKO_ROWS_UI = 12;
const plinkoBucketColor = (m: number) => (m >= 4 ? "#c01722" : m >= 1.3 ? "#b8860b" : m >= 1 ? "#3f3f46" : "#18181b");

// Dice odds mirror lib/gt-games.ts (pure, replicated here so the client never imports the server lib).
const DICE_MIN = 2, DICE_MAX = 98, DICE_EDGE = 0.05;
const diceChanceOf = (dir: "under" | "over", t: number) => (dir === "under" ? t : 100 - t) / 100;
const diceMultOf = (dir: "under" | "over", t: number) => (1 - DICE_EDGE) / diceChanceOf(dir, t);
type Stage = { id: number; game: Game; phase: Phase; result: PlayResult | null; settled: boolean };

// ── Roulette wheel data (American double-zero, real wheel sequence; 37 = "00") ────
const US_WHEEL = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
const SEG = 360 / US_WHEEL.length; // 38 pockets
const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const HEX: Record<string, string> = { green: "#157a3d", red: "#c01722", black: "#0c0c0c" };
function rcolor(n: number): "green" | "red" | "black" { return n === 0 || n === 37 ? "green" : RED_SET.has(n) ? "red" : "black"; }
const pocketLabel = (n: number) => (n === 37 ? "00" : String(n));
// Cartesian point on a circle — `deg` measured clockwise from the top (12 o'clock).
function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}
// Donut (annulus) wedge between inner radius ri / outer ro, from a1° to a2° (clockwise from top).
function annulus(cx: number, cy: number, ri: number, ro: number, a1: number, a2: number): string {
  const f = (p: { x: number; y: number }) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  return `M ${f(polar(cx, cy, ro, a1))} A ${ro} ${ro} 0 0 1 ${f(polar(cx, cy, ro, a2))} L ${f(polar(cx, cy, ri, a2))} A ${ri} ${ri} 0 0 0 ${f(polar(cx, cy, ri, a1))} Z`;
}
const SLOT_FACES = ["🍒", "🍋", "🔔", "⭐", "💎", "7️⃣"];
const CELL = 72;
const STRIP = 24;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ── Roulette: crisp vector (SVG) wheel; continuous spin → ease-out land on server's number ──
function RouletteWheel({ phase, target, onSettle, size = 340 }: { phase: Phase; target: number | null; onSettle: () => void; size?: number }) {
  const ref = useRef<HTMLDivElement>(null); // rotating wrapper (CSS transform animations don't apply to <svg> itself)
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || phase !== "spin" || reducedMotion()) return;
    el.style.transition = "none";
    el.style.transform = "rotate(0deg)";
    el.style.animation = "gefx-spin 0.7s linear infinite";
  }, [phase]);

  useEffect(() => {
    const el = ref.current;
    if (!el || phase !== "land" || target == null || done.current) return;
    done.current = true;
    const tIdx = US_WHEEL.indexOf(target);
    const center = tIdx * SEG + SEG / 2; // segments span [i·SEG,(i+1)·SEG] → center at i·SEG+SEG/2
    const targetMod = (((360 - (center % 360)) % 360) + 360) % 360;

    if (reducedMotion()) {
      el.style.animation = "none"; el.style.transition = "none";
      el.style.transform = `rotate(${targetMod}deg)`;
      const t = setTimeout(onSettle, 250); return () => clearTimeout(t);
    }
    // Hand off from the infinite spin: freeze the current angle, then ease-out to the landing.
    const cs = getComputedStyle(el);
    const m = cs.transform && cs.transform !== "none" ? new DOMMatrixReadOnly(cs.transform) : new DOMMatrixReadOnly();
    const cur = Math.atan2(m.b, m.a) * (180 / Math.PI);
    el.style.animation = "none";
    el.style.transition = "none";
    el.style.transform = `rotate(${cur}deg)`;
    void el.offsetHeight; // reflow → lock the frozen frame (no jump)
    const curMod = (((cur % 360) + 360) % 360);
    let delta = targetMod - curMod;
    if (delta < 0) delta += 360;
    const land = cur + delta + 360 * 5; // 5 full turns, then align under the pointer
    const DUR = 4400;
    el.style.transition = `transform ${DUR}ms cubic-bezier(0.16, 0.85, 0.20, 1)`;
    requestAnimationFrame(() => { if (ref.current) ref.current.style.transform = `rotate(${land}deg)`; });
    const t = setTimeout(onSettle, DUR + 80);
    return () => clearTimeout(t);
  }, [phase, target, onSettle]);

  const cx = size / 2, cy = size / 2, R = size / 2;
  const rRimIn = R * 0.85;                          // gold rim inner edge → black bezel
  const rNumOut = R * 0.73, rNumIn = R * 0.50;      // numbered pocket ring
  const rPockOut = R * 0.475, rPockIn = R * 0.39;   // inner ball-track ring
  const rCone = R * 0.37, arm = R * 0.30, knob = size * 0.020;
  const numFont = (size * 0.034).toFixed(1);
  return (
    <div className="relative select-none" style={{ width: size, height: size }}>
      {/* fixed gold pointer — points down at the winning pocket */}
      <div className="absolute left-1/2 -translate-x-1/2 z-30" style={{ top: cy - rNumOut - 16, width: 0, height: 0, borderLeft: "11px solid transparent", borderRight: "11px solid transparent", borderTop: "18px solid #fcd34d", filter: "drop-shadow(0 2px 2px rgba(0,0,0,.7))" }} />

      {/* STATIC bowl — gold rim + diamonds + black bezel */}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" style={{ display: "block", filter: "drop-shadow(0 12px 34px rgba(0,0,0,.55))" }}>
        <defs>
          <radialGradient id="ge-gold" cx="50%" cy="28%" r="80%">
            <stop offset="0%" stopColor="#fde9a9" />
            <stop offset="42%" stopColor="#d8a82a" />
            <stop offset="100%" stopColor="#6e5210" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={R} fill="url(#ge-gold)" />
        <circle cx={cx} cy={cy} r={rRimIn} fill="#0a0a0a" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
          const p = polar(cx, cy, R * 0.925, a), s = size * 0.026;
          return <rect key={a} x={(p.x - s).toFixed(2)} y={(p.y - s).toFixed(2)} width={(s * 2).toFixed(2)} height={(s * 2).toFixed(2)} rx={2} fill="url(#ge-gold)" stroke="#6e5210" strokeWidth={0.8} transform={`rotate(45 ${p.x.toFixed(2)} ${p.y.toFixed(2)})`} />;
        })}
      </svg>

      {/* ROTATING rotor — numbers + frets + inner ring + cone + turret */}
      <div ref={ref} className="absolute inset-0 will-change-transform" style={{ transform: "rotate(0deg)" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
          <defs>
            <radialGradient id="ge-cone" cx="50%" cy="34%" r="72%">
              <stop offset="0%" stopColor="#2c2c30" />
              <stop offset="70%" stopColor="#0d0d10" />
              <stop offset="100%" stopColor="#000000" />
            </radialGradient>
            <radialGradient id="ge-knob" cx="38%" cy="32%" r="75%">
              <stop offset="0%" stopColor="#fff6d5" />
              <stop offset="48%" stopColor="#e6bb33" />
              <stop offset="100%" stopColor="#8a6a12" />
            </radialGradient>
          </defs>
          <circle cx={cx} cy={cy} r={rNumOut} fill="none" stroke="#caa030" strokeWidth={1.5} />
          {US_WHEEL.map((n, i) => {
            const a1 = i * SEG, mid = i * SEG + SEG / 2;
            const lp = polar(cx, cy, (rNumIn + rNumOut) / 2, mid);
            return (
              <g key={n}>
                <path d={annulus(cx, cy, rNumIn, rNumOut, a1, a1 + SEG)} fill={HEX[rcolor(n)]} stroke="#caa030" strokeWidth={0.5} />
                <text x={lp.x.toFixed(2)} y={lp.y.toFixed(2)} fill="#ffffff" fontSize={numFont} fontWeight={700} textAnchor="middle" dominantBaseline="central" transform={`rotate(${mid.toFixed(2)} ${lp.x.toFixed(2)} ${lp.y.toFixed(2)})`} style={{ pointerEvents: "none" }}>{pocketLabel(n)}</text>
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r={rNumIn} fill="none" stroke="#caa030" strokeWidth={1.5} />
          {US_WHEEL.map((n, i) => (
            <path key={`p${n}`} d={annulus(cx, cy, rPockIn, rPockOut, i * SEG, i * SEG + SEG)} fill={HEX[rcolor(n)]} stroke="#000000" strokeWidth={0.4} />
          ))}
          <circle cx={cx} cy={cy} r={rPockIn} fill="none" stroke="#caa030" strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={rCone} fill="url(#ge-cone)" />
          {[45, 135, 225, 315].map((a) => {
            const e = polar(cx, cy, arm, a);
            return (
              <g key={a}>
                <line x1={cx} y1={cy} x2={e.x.toFixed(2)} y2={e.y.toFixed(2)} stroke="url(#ge-knob)" strokeWidth={(size * 0.016).toFixed(1)} strokeLinecap="round" />
                <circle cx={e.x.toFixed(2)} cy={e.y.toFixed(2)} r={knob.toFixed(1)} fill="url(#ge-knob)" />
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r={(size * 0.032).toFixed(1)} fill="url(#ge-knob)" />
        </svg>
      </div>

      {/* static gloss (does NOT rotate — light from above) */}
      <div className="absolute inset-0 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle at 50% 26%, rgba(255,255,255,0.14), rgba(255,255,255,0) 44%)" }} />
    </div>
  );
}

// ── Custom slot symbols: crisp vector art (replaces flat emojis); shared <defs> so
//    the 6 gradients are declared once and reused by every cell across all 3 reels. ──
function SlotDefs() {
  return (
    <svg aria-hidden width={0} height={0} style={{ position: "absolute" }}>
      <defs>
        <radialGradient id="ge-cher" cx="38%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ff8a8a" /><stop offset="55%" stopColor="#e01e37" /><stop offset="100%" stopColor="#7d0010" />
        </radialGradient>
        <radialGradient id="ge-lem" cx="38%" cy="32%" r="80%">
          <stop offset="0" stopColor="#fff7a8" /><stop offset="55%" stopColor="#f5d000" /><stop offset="100%" stopColor="#b58900" />
        </radialGradient>
        <linearGradient id="ge-bel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9a8" /><stop offset="45%" stopColor="#f7c948" /><stop offset="100%" stopColor="#a9760f" />
        </linearGradient>
        <linearGradient id="ge-str" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3b0" /><stop offset="50%" stopColor="#ffce3a" /><stop offset="100%" stopColor="#e08a00" />
        </linearGradient>
        <linearGradient id="ge-gem" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d6fbff" /><stop offset="50%" stopColor="#3ec9e0" /><stop offset="100%" stopColor="#1c7fa8" />
        </linearGradient>
        <linearGradient id="ge-sev" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff5d5d" /><stop offset="100%" stopColor="#a00018" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function SlotSymbol({ s, size = 52 }: { s: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 64 64" } as const;
  switch (s) {
    case "🍒": // cherries (10×)
      return (
        <svg {...common}>
          <path d="M32 16 C26 27,22 35,20 45" stroke="#3f7d3f" strokeWidth={3} fill="none" strokeLinecap="round" />
          <path d="M32 16 C38 27,42 35,44 45" stroke="#3f7d3f" strokeWidth={3} fill="none" strokeLinecap="round" />
          <path d="M32 16 C42 9,53 11,55 18 C46 22,36 20,32 16 Z" fill="#4caf50" />
          <circle cx={20} cy={50} r={11} fill="url(#ge-cher)" />
          <circle cx={44} cy={50} r={11} fill="url(#ge-cher)" />
          <circle cx={16} cy={46} r={3} fill="#fff" opacity={0.6} />
          <circle cx={40} cy={46} r={3} fill="#fff" opacity={0.6} />
        </svg>
      );
    case "🍋": // lemon (12×)
      return (
        <svg {...common}>
          <g transform="rotate(-22 32 32)">
            <ellipse cx={32} cy={32} rx={23} ry={15} fill="url(#ge-lem)" stroke="#b58900" strokeWidth={1} />
            <circle cx={9} cy={32} r={2.4} fill="#caa400" />
            <circle cx={55} cy={32} r={2.4} fill="#caa400" />
            <ellipse cx={24} cy={26} rx={7} ry={3.5} fill="#fff" opacity={0.45} />
          </g>
        </svg>
      );
    case "🔔": // bell (20×)
      return (
        <svg {...common}>
          <circle cx={32} cy={13} r={4} fill="#e0a800" />
          <path d="M32 15 C20 17,16 31,13 45 L51 45 C48 31,44 17,32 15 Z" fill="url(#ge-bel)" stroke="#8a5e00" strokeWidth={1.5} />
          <rect x={11} y={44} width={42} height={5} rx={2.5} fill="#d9a400" />
          <circle cx={32} cy={54} r={5} fill="#e0a800" />
        </svg>
      );
    case "⭐": // star (50×)
      return (
        <svg {...common}>
          <path d="M32 8 L37.9 23.9 L54.8 24.6 L41.5 35.1 L46.1 51.4 L32 42 L17.9 51.4 L22.5 35.1 L9.2 24.6 L26.1 23.9 Z" fill="url(#ge-str)" stroke="#b56a00" strokeWidth={1.5} strokeLinejoin="round" />
        </svg>
      );
    case "💎": // diamond (150×)
      return (
        <svg {...common}>
          <polygon points="20,20 44,20 50,30 14,30" fill="#dffaff" />
          <polygon points="14,30 50,30 32,53" fill="url(#ge-gem)" />
          <polygon points="20,20 26,30 14,30" fill="#9fe8f5" />
          <polygon points="44,20 38,30 50,30" fill="#9fe8f5" />
          <polygon points="14,30 26,30 32,53" fill="#2fb6d0" opacity={0.45} />
          <polyline points="26,30 32,53 38,30" fill="none" stroke="#eafdff" strokeWidth={1} />
        </svg>
      );
    case "7️⃣": // lucky seven (800× — jackpot)
      return (
        <svg {...common}>
          <path d="M16 14 H50 V23 L34 54 H21 L38 25 H16 Z" fill="url(#ge-sev)" stroke="#ffd54a" strokeWidth={2.5} strokeLinejoin="round" paintOrder="stroke" />
        </svg>
      );
    default:
      return <span style={{ fontSize: size * 0.78 }}>{s}</span>;
  }
}

// ── Slots: 3 reels scroll down and decelerate onto the result symbols (staggered),
//    framed in a premium gold cabinet with a payline that lights up on a 3-of-a-kind. ─
function SlotReels({ phase, reels, onSettle }: { phase: Phase; reels: string[] | null; onSettle: () => void }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const done = useRef(false);
  const [glow, setGlow] = useState(false);
  const isWin = !!reels && reels[0] === reels[1] && reels[1] === reels[2];
  const strips = useMemo(() => {
    if (!reels) return null;
    return reels.map((target) => {
      const arr = Array.from({ length: STRIP }, () => SLOT_FACES[Math.floor(Math.random() * SLOT_FACES.length)]);
      arr.push(target);
      return arr;
    });
  }, [reels]);

  useEffect(() => {
    if (phase !== "land" || !strips || done.current) return;
    done.current = true;
    setGlow(false);
    if (reducedMotion()) {
      strips.forEach((s, i) => { const el = refs.current[i]; if (el) el.style.transform = `translateY(-${(s.length - 1) * CELL}px)`; });
      const t = setTimeout(() => { setGlow(isWin); onSettle(); }, 250); return () => clearTimeout(t);
    }
    let maxDur = 0;
    strips.forEach((s, i) => {
      const el = refs.current[i]; if (!el) return;
      const dist = (s.length - 1) * CELL;
      const dur = 1900 + i * 520;
      maxDur = Math.max(maxDur, dur);
      el.style.transition = "none";
      el.style.transform = "translateY(0px)";
      void el.offsetHeight;
      el.style.transition = `transform ${dur}ms cubic-bezier(0.18, 0.86, 0.22, 1)`;
      requestAnimationFrame(() => { const e = refs.current[i]; if (e) e.style.transform = `translateY(-${dist}px)`; });
    });
    const t = setTimeout(() => { setGlow(isWin); onSettle(); }, maxDur + 80);
    return () => clearTimeout(t);
  }, [phase, strips, onSettle, isWin]);

  const display = strips ?? [["❔"], ["❔"], ["❔"]];
  return (
    <div className="flex items-center justify-center h-full">
      <SlotDefs />
      <div className="relative rounded-2xl p-3" style={{
        backgroundImage: "linear-gradient(160deg,#1a0e05,#0c0703), linear-gradient(145deg,#ffe9a8,#b8860b 42%,#5c4208 72%,#ffd96b)",
        backgroundOrigin: "border-box", backgroundClip: "padding-box, border-box",
        border: "3px solid transparent",
        boxShadow: glow
          ? "0 0 28px 4px rgba(255,213,74,.55), 0 12px 40px rgba(0,0,0,.6), inset 0 0 24px rgba(0,0,0,.7)"
          : "0 12px 40px rgba(0,0,0,.6), inset 0 0 24px rgba(0,0,0,.7)",
        transition: "box-shadow 300ms ease",
      }}>
        <div className="flex gap-2 relative">
          {display.map((strip, i) => (
            <div key={i} className="overflow-hidden rounded-lg" style={{
              width: CELL, height: CELL,
              background: "linear-gradient(180deg,#23232c,#070709 50%,#23232c)",
              boxShadow: "inset 0 9px 12px rgba(0,0,0,.85), inset 0 -9px 12px rgba(0,0,0,.85)",
            }}>
              <div ref={(el) => { refs.current[i] = el; }} className="will-change-transform" style={{ transform: "translateY(0px)" }}>
                {strip.map((s, j) => (
                  <div key={j} className="flex items-center justify-center" style={{ height: CELL }}>
                    <SlotSymbol s={s} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="pointer-events-none absolute left-1 right-1" style={{
            top: "50%", transform: "translateY(-50%)", height: 2,
            background: glow ? "linear-gradient(90deg,transparent,#ffd54a,transparent)" : "linear-gradient(90deg,transparent,rgba(192,23,34,.55),transparent)",
            boxShadow: glow ? "0 0 14px 3px rgba(255,213,74,.85)" : "none",
            transition: "all 300ms ease",
          }} />
        </div>
      </div>
    </div>
  );
}

// ── Coinflip: 3D flip landing on win (crown) / lose (skull) ──────────────────────
function CoinFlip({ phase, win, onSettle }: { phase: Phase; win: boolean | null; onSettle: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || phase !== "land" || win == null || done.current) return;
    done.current = true;
    if (reducedMotion()) { el.style.transition = "none"; el.style.transform = `rotateY(${win ? 0 : 180}deg)`; const t = setTimeout(onSettle, 250); return () => clearTimeout(t); }
    const target = 360 * 5 + (win ? 0 : 180);
    const DUR = 1800;
    el.style.transition = `transform ${DUR}ms cubic-bezier(0.18, 0.8, 0.25, 1)`;
    requestAnimationFrame(() => { if (ref.current) ref.current.style.transform = `rotateY(${target}deg)`; });
    const t = setTimeout(onSettle, DUR + 80);
    return () => clearTimeout(t);
  }, [phase, win, onSettle]);
  return (
    <div className="flex items-center justify-center h-full" style={{ perspective: 900 }}>
      <div ref={ref} className="relative will-change-transform" style={{ width: 128, height: 128, transformStyle: "preserve-3d", transform: "rotateY(0deg)" }}>
        {/* WIN face — gold coin, embossed Ghost Empire ghost, reeded edge */}
        <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
          <svg width={128} height={128} viewBox="0 0 128 128">
            <defs>
              <radialGradient id="coin-gold" cx="38%" cy="30%" r="75%">
                <stop offset="0" stopColor="#fff2c0" /><stop offset="45%" stopColor="#f2c14e" /><stop offset="80%" stopColor="#c8901f" /><stop offset="100%" stopColor="#8a5e0e" />
              </radialGradient>
            </defs>
            <circle cx={64} cy={64} r={62} fill="#7a510c" />
            <circle cx={64} cy={64} r={62} fill="none" stroke="#5c3d08" strokeWidth={4} strokeDasharray="3 3" />
            <circle cx={64} cy={64} r={54} fill="url(#coin-gold)" stroke="#fff2c0" strokeWidth={1.5} />
            <circle cx={64} cy={64} r={46} fill="none" stroke="#a9760f" strokeWidth={2} opacity={0.55} />
            <path d="M64 35 C49 35,41 47,41 61 L41 86 L49 80 L57 86 L64 80 L71 86 L79 80 L87 86 L87 61 C87 47,79 35,64 35 Z" fill="#a9760f" opacity={0.6} />
            <path d="M64 33 C49 33,41 45,41 59 L41 84 L49 78 L57 84 L64 78 L71 84 L79 78 L87 84 L87 59 C87 45,79 33,64 33 Z" fill="#fff6d8" />
            <circle cx={56} cy={57} r={4} fill="#8a5e0e" />
            <circle cx={73} cy={57} r={4} fill="#8a5e0e" />
          </svg>
        </div>
        {/* LOSE face — steel coin, embossed skull */}
        <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
          <svg width={128} height={128} viewBox="0 0 128 128">
            <defs>
              <radialGradient id="coin-steel" cx="38%" cy="30%" r="75%">
                <stop offset="0" stopColor="#eef1f6" /><stop offset="45%" stopColor="#9aa3b0" /><stop offset="80%" stopColor="#5b626e" /><stop offset="100%" stopColor="#33373f" />
              </radialGradient>
            </defs>
            <circle cx={64} cy={64} r={62} fill="#2b2e34" />
            <circle cx={64} cy={64} r={62} fill="none" stroke="#1c1f24" strokeWidth={4} strokeDasharray="3 3" />
            <circle cx={64} cy={64} r={54} fill="url(#coin-steel)" stroke="#eef1f6" strokeWidth={1.5} />
            <circle cx={64} cy={64} r={46} fill="none" stroke="#4a4f59" strokeWidth={2} opacity={0.55} />
            <path d="M64 38 C48 38,40 50,40 64 C40 73,45 79,50 82 L50 90 C50 93,53 95,56 95 L72 95 C75 95,78 93,78 90 L78 82 C83 79,88 73,88 64 C88 50,80 38,64 38 Z" fill="#cfd4db" />
            <circle cx={54} cy={64} r={7} fill="#2b2e34" />
            <circle cx={74} cy={64} r={7} fill="#2b2e34" />
            <path d="M61 77 L64 71 L67 77 Z" fill="#2b2e34" />
            <rect x={55} y={88} width={3} height={6} fill="#2b2e34" />
            <rect x={62.5} y={88} width={3} height={6} fill="#2b2e34" />
            <rect x={70} y={88} width={3} height={6} fill="#2b2e34" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ── Dice: a 0-99 track with a green win-zone; the pointer slides to the rolled value
//    while a counter ticks up to it. Win-zone = left of the threshold (under) or right (over). ─
function DiceTrack({ phase, dice, onSettle }: { phase: Phase; dice: { roll: number; target: number; dir: "under" | "over"; win: boolean } | null; onSettle: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const [shown, setShown] = useState<number | null>(null);
  const shownRef = useRef<number | null>(null);
  shownRef.current = shown;
  const [landed, setLanded] = useState(false);
  const target = dice?.target ?? 50;
  const dir = dice?.dir ?? "under";

  // SPIN: while we wait for the server, the counter flickers random numbers and the
  // pointer sweeps the track (CSS keyframes) — the game is visibly "rolling".
  useEffect(() => {
    if (phase !== "spin" || reducedMotion()) return;
    let raf = 0, last = 0;
    const tick = (now: number) => {
      if (now - last > 70) { setShown(Math.floor(Math.random() * 100)); last = now; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // LAND: freeze the in-flight sweep where it is, then ease the pointer onto the
  // server's roll while the counter counts toward it (easeOutCubic — fast then settle).
  useEffect(() => {
    if (phase !== "land" || !dice || done.current) return;
    done.current = true;
    const el = ref.current;
    if (reducedMotion()) {
      if (el) { el.style.animation = "none"; el.style.left = `${dice.roll}%`; }
      setShown(dice.roll); setLanded(true);
      const t = setTimeout(onSettle, 250); return () => clearTimeout(t);
    }
    if (el) {
      const cur = getComputedStyle(el).left; // current sweep position (keyframes expose it)
      el.style.animation = "none";
      el.style.left = cur;
      void el.offsetHeight;
      el.style.transition = "left 1600ms cubic-bezier(0.12,0.9,0.18,1)";
      requestAnimationFrame(() => { el.style.left = `${dice.roll}%`; });
    }
    const DUR = 1600;
    const from = shownRef.current ?? 50;
    let raf = 0, startTs = 0;
    const tick = (now: number) => {
      if (!startTs) startTs = now;
      const k = Math.min(1, (now - startTs) / DUR);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(from + (dice.roll - from) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
      else setLanded(true);
    };
    raf = requestAnimationFrame(tick);
    const t = setTimeout(onSettle, DUR + 120);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, [phase, dice, onSettle]);

  const pointerColor = dice ? (dice.win ? "#34d399" : "#fb7185") : "#ffffff";
  const winZone: CSSProperties = dir === "under"
    ? { left: 0, width: `${target}%`, background: "linear-gradient(90deg,#0f7a3d,#1aa356)" }
    : { left: `${target}%`, right: 0, background: "linear-gradient(90deg,#1aa356,#0f7a3d)" };

  return (
    <div className="flex flex-col items-center justify-center gap-6 w-full" style={{ maxWidth: 380 }}>
      <div className="relative">
        <div
          className={`text-7xl font-black tabular-nums ${landed ? (dice?.win ? "text-emerald-300" : "text-rose-300") : "text-zinc-300"}`}
          style={{
            textShadow: landed && dice?.win ? "0 0 28px rgba(52,211,153,.55), 0 3px 16px rgba(0,0,0,.6)" : "0 3px 16px rgba(0,0,0,.6)",
            animation: landed ? (dice?.win ? "gefx-pop 450ms cubic-bezier(.34,1.56,.64,1)" : "gefx-shake 420ms ease-in-out") : undefined,
          }}
        >
          {shown ?? "—"}
        </div>
        {landed && dice?.win && !reducedMotion() && <WinBurst seed={dice.roll + 1} />}
      </div>
      <div className="relative w-full">
        <div className="relative rounded-full overflow-hidden" style={{ height: 14, background: "#3a0d12", boxShadow: "inset 0 2px 5px rgba(0,0,0,.6)" }}>
          <div className="absolute inset-y-0" style={{ ...winZone, animation: landed && dice?.win ? "gefx-flash 650ms ease-out 2" : undefined }} />
        </div>
        {/* threshold marker */}
        <div className="absolute" style={{ left: `${target}%`, top: -5, height: 24, width: 2, background: "#ffd54a", boxShadow: "0 0 6px #ffd54a", transform: "translateX(-1px)" }} />
        {/* result pointer (▼): sweeps during spin, then slides onto the roll */}
        <div ref={ref} className="absolute will-change-[left]" style={{ left: "50%", top: -14, transform: "translateX(-50%)", animation: phase === "spin" && !reducedMotion() ? "gefx-dice-sweep 1.1s ease-in-out infinite alternate" : undefined }}>
          <div style={{ width: 0, height: 0, borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderTop: `11px solid ${pointerColor}`, filter: "drop-shadow(0 1px 3px rgba(0,0,0,.7))" }} />
        </div>
        <div className="flex justify-between font-mono mt-2.5" style={{ fontSize: 10, color: "#71717a" }}>
          <span>0</span><span>25</span><span>50</span><span>75</span><span>99</span>
        </div>
      </div>
    </div>
  );
}

// ── WinBurst: a small deterministic particle burst (gold/red/emerald confetti) shown on
//    wins. Pure CSS animations; particles derive from `seed` (no Math.random → no
//    hydration mismatch, replays identically per result). Parent must be `relative`. ──
function WinBurst({ seed }: { seed: number }) {
  const parts = useMemo(() => {
    const COLORS = ["#ffd54a", "#ff9d2e", "#e50914", "#34d399", "#fff2c0"];
    return Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2 + (seed % 7) * 0.13;
      const d = 46 + ((i * 37 + seed) % 34);
      return {
        dx: Math.cos(a) * d,
        dy: Math.sin(a) * d - 18,
        c: COLORS[i % COLORS.length],
        s: 5 + ((i * 13 + seed) % 5),
        r: (i * 47 + seed * 11) % 360,
        delay: (i % 5) * 18,
      };
    });
  }, [seed]);
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {parts.map((p, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2"
          style={{
            width: p.s, height: p.s, background: p.c, borderRadius: 1,
            transform: "translate(-50%, -50%)",
            animation: "gefx-part 850ms cubic-bezier(.17,.84,.32,1) forwards",
            animationDelay: `${p.delay}ms`,
            ...({ "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, "--rot": `${p.r}deg` } as CSSProperties),
          }}
        />
      ))}
    </span>
  );
}

// ── Crash ("Rakieta"): the multiplier climbs exponentially and the rocket flies up; it either
//    cashes out at the player's target (win, green) or bursts at the crash point below it (💥). ─
function CrashRocket({ phase, crash, onSettle }: { phase: Phase; crash: { crash: number; target: number; win: boolean } | null; onSettle: () => void }) {
  const numRef = useRef<HTMLDivElement>(null);
  const rocketRef = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const [ended, setEnded] = useState(false);
  const target = crash?.target ?? 2;
  const win = crash?.win ?? false;

  useEffect(() => {
    if (phase !== "land" || !crash || done.current) return;
    done.current = true;
    const endMult = win ? crash.target : crash.crash; // cash out at target, or burst at crash
    const setNum = (m: number) => { if (numRef.current) numRef.current.textContent = m.toFixed(2) + "×"; };
    const place = (p: number) => { const rk = rocketRef.current; if (rk) { rk.style.left = `${10 + 70 * p}%`; rk.style.bottom = `${8 + 64 * p}%`; } };
    if (reducedMotion()) { setNum(endMult); place(1); setEnded(true); const t = setTimeout(onSettle, 250); return () => clearTimeout(t); }
    const DUR = Math.min(3200, Math.max(1300, 900 + endMult * 130));
    let raf = 0, startTs = 0;
    const tick = (now: number) => {
      if (!startTs) startTs = now;
      const p = Math.min(1, (now - startTs) / DUR);
      setNum(endMult <= 1 ? 1 : Math.pow(endMult, p)); // exponential climb 1 → endMult
      place(p);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setEnded(true);
    };
    raf = requestAnimationFrame(tick);
    const t = setTimeout(onSettle, DUR + 450);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, [phase, crash, onSettle, win]);

  const numColor = !crash ? "text-zinc-400" : ended ? (win ? "text-emerald-300" : "text-rose-400") : "text-white";
  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ width: 380, height: 300, background: "radial-gradient(130% 100% at 50% 120%, #241a4d, #0a0a14 72%)", border: "1px solid #2a2a3a" }}>
      <div className="absolute right-3 top-3 text-xs font-mono px-2 py-1 rounded-md" style={{ background: "rgba(255,213,74,.12)", color: "#ffd54a" }}>🎯 {target.toFixed(2)}×</div>
      <div ref={rocketRef} className="absolute will-change-transform" style={{ left: "10%", bottom: "8%", transform: "translate(-50%,50%) rotate(-40deg)", fontSize: 40, filter: "drop-shadow(0 0 8px rgba(255,150,60,.6))" }}>{ended && !win ? "💥" : "🚀"}</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div ref={numRef} className={`text-6xl font-black tabular-nums ${numColor}`} style={{ textShadow: "0 3px 18px rgba(0,0,0,.8)" }}>1.00×</div>
      </div>
      {ended && (
        <div className={`absolute left-0 right-0 text-center text-lg font-extrabold ${win ? "text-emerald-300" : "text-rose-400"}`} style={{ bottom: 16 }}>
          {win ? `✅ ${target.toFixed(2)}×` : `💥 ${crash?.crash.toFixed(2)}×`}
        </div>
      )}
    </div>
  );
}

// ── Plinko: the gold ball drops through a peg triangle, zig-zagging along the server's real path,
//    and settles into a multiplier bucket (which lights up). Edge buckets pay big, center sub-1. ─
function PlinkoBoard({ phase, plinko, onSettle }: { phase: Phase; plinko: { path: number[]; bucket: number; multiplier: number } | null; onSettle: () => void }) {
  const ballRef = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const [landed, setLanded] = useState<number | null>(null);
  const W = 360, H = 300, topY = 18, bottomY = 250;
  const rows = PLINKO_ROWS_UI;
  const rowH = (bottomY - topY) / rows;
  const laneW = W / (rows + 1);
  const bucketCenterX = (k: number) => (k + 0.5) * laneW; // aligns with the flex buckets below

  useEffect(() => {
    if (phase !== "land" || !plinko || done.current) return;
    done.current = true;
    const xs = [W / 2];
    let off = 0;
    for (const d of plinko.path) { off += (d ? 1 : -1) * (laneW / 2); xs.push(W / 2 + off); }
    const place = (x: number, y: number) => { const b = ballRef.current; if (b) { b.style.left = `${x}px`; b.style.top = `${y}px`; } };
    if (reducedMotion()) { place(bucketCenterX(plinko.bucket), bottomY); setLanded(plinko.bucket); const t = setTimeout(onSettle, 250); return () => clearTimeout(t); }
    const DUR = 1700;
    let raf = 0, startTs = 0;
    const tick = (now: number) => {
      if (!startTs) startTs = now;
      const p = Math.min(1, (now - startTs) / DUR);
      const fr = p * rows;
      const i = Math.floor(fr), t = fr - i;
      const x0 = xs[Math.min(i, xs.length - 1)], x1 = xs[Math.min(i + 1, xs.length - 1)];
      place(x0 + (x1 - x0) * t, topY + fr * rowH + Math.sin(t * Math.PI) * 6); // slight hop between rows
      if (p < 1) raf = requestAnimationFrame(tick);
      else { place(bucketCenterX(plinko.bucket), bottomY); setLanded(plinko.bucket); }
    };
    raf = requestAnimationFrame(tick);
    const t = setTimeout(onSettle, DUR + 350);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, [phase, plinko, onSettle, laneW, rowH]);

  const pegs: { x: number; y: number }[] = [];
  for (let r = 1; r <= rows; r++) for (let j = 0; j <= r; j++) pegs.push({ x: W / 2 + (j - r / 2) * laneW, y: topY + r * rowH });

  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ width: W, height: H, background: "radial-gradient(120% 100% at 50% 0%, #15172e, #0a0a12 70%)", border: "1px solid #2a2a3a" }}>
      {pegs.map((p, i) => (
        <div key={i} className="absolute rounded-full" style={{ left: p.x - 2, top: p.y - 2, width: 4, height: 4, background: "#5b5b73" }} />
      ))}
      <div className="absolute left-0 right-0 flex gap-px px-px" style={{ bottom: 6, height: 28 }}>
        {PLINKO_MULTS_UI.map((m, k) => (
          <div key={k} className="flex-1 rounded-sm flex items-center justify-center text-white font-bold"
            style={{ fontSize: 9, background: plinkoBucketColor(m), opacity: landed === null || landed === k ? 1 : 0.4, transform: landed === k ? "translateY(-3px)" : "none", boxShadow: landed === k ? "0 0 10px 2px rgba(255,213,74,.85)" : "none", transition: "all 200ms ease" }}>
            {m}
          </div>
        ))}
      </div>
      <div ref={ballRef} className="absolute rounded-full will-change-transform" style={{ left: W / 2, top: topY, width: 12, height: 12, marginLeft: -6, marginTop: -6, background: "radial-gradient(circle at 35% 30%, #fff, #f5c842 60%, #b8860b)", boxShadow: "0 0 8px rgba(245,200,66,.85)" }} />
    </div>
  );
}

// ── Mines ("Pole minowe"): interactive 5×5 grid (the one stateful game). Reveal tiles → 💎 and the
//    multiplier climbs; hit a 💣 and it's over. Cash out any time. State is driven by the server. ─
type MinesGameState = { sessionId: string; bombs: number; revealed: number[]; multiplier: number; status: "active" | "bust" | "cashed"; bombSet: number[] | null; bet: number; payout?: number };

function MinesGrid({ game, onReveal, onCashout, busy, fmt, t }: {
  game: MinesGameState; onReveal: (tile: number) => void; onCashout: () => void; busy: boolean; fmt: (n: number) => string; t: (k: string) => string;
}) {
  const over = game.status !== "active";
  const revealedSet = new Set(game.revealed);
  const bombSet = new Set(game.bombSet ?? []);
  const potential = Math.floor(game.bet * game.multiplier);
  return (
    <div className="flex flex-col items-center gap-3" style={{ width: 300 }}>
      <div className="flex items-center gap-3 h-9">
        <div className="text-sm font-mono text-zinc-300">{game.bombs} 💣 · <span className="text-amber-300 font-bold">{game.multiplier.toFixed(2)}×</span></div>
        {game.status === "active" ? (
          <button onClick={onCashout} disabled={busy || game.revealed.length === 0}
            className="px-4 py-1.5 rounded-full text-sm font-extrabold text-black bg-gradient-to-r from-emerald-400 to-green-500 hover:from-emerald-300 disabled:opacity-40 transition-all">
            {t("minesCashout")} {fmt(potential)} GT
          </button>
        ) : (
          <div className={`text-sm font-extrabold ${game.status === "cashed" ? "text-emerald-300" : "text-rose-400"}`}>
            {game.status === "cashed" ? `✅ +${fmt((game.payout ?? 0) - game.bet)} GT` : `💥 −${fmt(game.bet)} GT`}
          </div>
        )}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: 25 }, (_, i) => {
          const isRevealed = revealedSet.has(i);
          const showBomb = over && bombSet.has(i);
          const showGem = isRevealed && !bombSet.has(i);
          return (
            <button key={i} onClick={() => !over && !isRevealed && onReveal(i)} disabled={busy || over || isRevealed}
              className="rounded-lg flex items-center justify-center transition-all"
              style={{
                width: 50, height: 50, fontSize: 24,
                background: showBomb ? "radial-gradient(circle at 50% 40%, #5b1a1f, #1a0a0c)" : showGem ? "radial-gradient(circle at 50% 35%, #145c3a, #0a2a1c)" : "linear-gradient(160deg,#2a2a36,#16161e)",
                border: showGem ? "1px solid #34d399" : showBomb ? "1px solid #fb7185" : "1px solid #3a3a48",
                boxShadow: showGem ? "0 0 8px rgba(52,211,153,.5)" : "inset 0 2px 4px rgba(0,0,0,.5)",
                cursor: !over && !isRevealed ? "pointer" : "default",
                opacity: over && !showBomb && !showGem ? 0.4 : 1,
              }}>
              {showBomb ? "💣" : showGem ? "💎" : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function KasynoClient({ isAuthenticated, initialBalance }: { isAuthenticated: boolean; initialBalance: number | null }) {
  const t = useTranslations("kasyno");
  const fmt = useLocaleFmt();
  const gameLabel: Record<string, string> = { slots: t("gameSlots"), coinflip: t("gameCoinflip"), roulette: t("gameRoulette"), dice: t("gameDice"), crash: t("gameCrash"), plinko: t("gamePlinko"), mines: t("gameMines") };
  const [balance, setBalance] = useState<number | null>(initialBalance);
  const [bet, setBet] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lb, setLb] = useState<Leaderboard | null>(null);
  const [rouletteNum, setRouletteNum] = useState("");
  const [diceTarget, setDiceTarget] = useState(50);
  const [diceDir, setDiceDir] = useState<"under" | "over">("under");
  const [crashTarget, setCrashTarget] = useState(2);
  const [minesBombs, setMinesBombs] = useState(3);
  const [minesGame, setMinesGame] = useState<MinesGameState | null>(null);
  const [minesBusy, setMinesBusy] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);
  const playId = useRef(0);

  const loadLb = useCallback(async () => {
    try { const r = await fetch("/api/gt-games/leaderboard", { cache: "no-store" }); if (r.ok) setLb(await r.json()); } catch { /* ignore */ }
  }, []);
  useEffect(() => { void loadLb(); }, [loadLb]);

  const settle = useCallback(() => {
    setStage((s) => {
      if (!s || s.settled) return s;
      if (s.result) setBalance(s.result.newBalance);
      return { ...s, settled: true };
    });
    setBusy(false);
    void loadLb();
  }, [loadLb]);

  async function play(game: Game, choice?: string) {
    if (busy || minesBusy) return;
    setBusy(true); setError(null); setMinesGame(null); // single-shot games take over the stage
    const id = ++playId.current;
    setStage({ id, game, phase: "spin", result: null, settled: false });
    try {
      const res = await fetch("/api/gt-games/play", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, bet, choice }) });
      const d: PlayResult = await res.json();
      if (!res.ok) { setError(d.error ?? t("err")); setStage(null); setBusy(false); return; }
      setStage((s) => (s && s.id === id ? { ...s, phase: "land", result: d } : s));
    } catch { setError(t("connError")); setStage(null); setBusy(false); }
  }

  // ── Mines (stateful: start → reveal tiles → cash out / bust) ──
  async function minesStartFn() {
    if (minesBusy || busy || minesGame?.status === "active") return;
    setMinesBusy(true); setError(null); setStage(null); // mines takes over the stage
    try {
      const res = await fetch("/api/gt-games/mines/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bet, bombs: minesBombs }) });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? t("err")); setMinesBusy(false); return; }
      setBalance(d.newBalance);
      setMinesGame({ sessionId: d.sessionId, bombs: d.bombs, revealed: [], multiplier: 1, status: "active", bombSet: null, bet });
    } catch { setError(t("connError")); }
    setMinesBusy(false);
  }
  async function minesRevealFn(tile: number) {
    if (minesBusy || !minesGame || minesGame.status !== "active") return;
    setMinesBusy(true);
    try {
      const res = await fetch("/api/gt-games/mines/reveal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: minesGame.sessionId, tile }) });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? t("err")); setMinesBusy(false); return; }
      if (d.bomb) { setMinesGame((g) => (g ? { ...g, status: "bust", revealed: d.revealed, bombSet: d.bombSet } : g)); void loadLb(); }
      else setMinesGame((g) => (g ? { ...g, revealed: d.revealed, multiplier: d.multiplier } : g));
    } catch { setError(t("connError")); }
    setMinesBusy(false);
  }
  async function minesCashoutFn() {
    if (minesBusy || !minesGame || minesGame.status !== "active" || minesGame.revealed.length === 0) return;
    setMinesBusy(true);
    try {
      const res = await fetch("/api/gt-games/mines/cashout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: minesGame.sessionId }) });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? t("err")); setMinesBusy(false); return; }
      setBalance(d.newBalance);
      setMinesGame((g) => (g ? { ...g, status: "cashed", multiplier: d.multiplier, bombSet: d.bombSet, payout: d.payout } : g));
      void loadLb();
    } catch { setError(t("connError")); }
    setMinesBusy(false);
  }

  const rouletteTarget = stage?.result?.roll?.n ?? (stage?.result?.detail ? (stage.result.detail.includes("00") ? 37 : (parseInt(stage.result.detail.replace(/\D/g, ""), 10) || 0)) : null);
  const reveal = stage?.settled ? stage.result : null;

  return (
    <div className="flex flex-col items-center gap-6">
      <style>{`
        @keyframes gefx-spin { to { transform: rotate(360deg); } }
        @keyframes gefx-dice-sweep { from { left: 6%; } to { left: 94%; } }
        @keyframes gefx-pop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.18); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes gefx-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-5px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(3px); } }
        @keyframes gefx-flash { 0% { filter: brightness(1); } 30% { filter: brightness(2); } 100% { filter: brightness(1); } }
        @keyframes gefx-part { 0% { opacity: 1; } 100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) rotate(var(--rot)); opacity: 0; } }
      `}</style>
      <div className="text-center">
        <h1 className="text-3xl font-black text-white tracking-tight">{t("title")}</h1>
        <p className="text-zinc-400 mt-1 text-sm">{t("subtitlePre")} <code className="text-zinc-500">!slots 100</code> · <code className="text-zinc-500">!coinflip 50</code> · <code className="text-zinc-500">!roulette 100 red</code></p>
      </div>

      <HowItWorks>
        <p className="mb-2">{t("help")}</p>
        <ul className="space-y-1.5">
          <li><b className="text-white">🎰 {t("gameSlots")}:</b> {t("helpSlots")}</li>
          <li><b className="text-white">🪙 {t("gameCoinflip")}:</b> {t("helpCoinflip")}</li>
          <li><b className="text-white">🎡 {t("gameRoulette")}:</b> {t("helpRoulette")}</li>
          <li><b className="text-white">🎲 {t("gameDice")}:</b> {t("helpDice")}</li>
          <li><b className="text-white">🚀 {t("gameCrash")}:</b> {t("helpCrash")}</li>
          <li><b className="text-white">⚪ {t("gamePlinko")}:</b> {t("helpPlinko")}</li>
          <li><b className="text-white">💣 {t("gameMines")}:</b> {t("helpMines")}</li>
        </ul>
      </HowItWorks>

      {!isAuthenticated ? (
        <Link href="/" className="px-8 py-3 rounded-full font-extrabold text-white bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500">{t("loginToPlay")}</Link>
      ) : (
        <>
          {/* animation stage */}
          <div className="flex items-center justify-center" style={{ minHeight: 312 }}>
            {minesGame ? (
              <MinesGrid game={minesGame} onReveal={minesRevealFn} onCashout={minesCashoutFn} busy={minesBusy} fmt={fmt} t={t} />
            ) : stage?.game === "roulette" ? (
              <RouletteWheel key={stage.id} phase={stage.phase} target={rouletteTarget} onSettle={settle} />
            ) : stage?.game === "slots" ? (
              <SlotReels key={stage.id} phase={stage.phase} reels={stage.result?.reels ?? null} onSettle={settle} />
            ) : stage?.game === "coinflip" ? (
              <CoinFlip key={stage.id} phase={stage.phase} win={stage.result ? stage.result.payout > 0 : null} onSettle={settle} />
            ) : stage?.game === "dice" ? (
              <DiceTrack key={stage.id} phase={stage.phase} dice={stage.result?.dice ?? null} onSettle={settle} />
            ) : stage?.game === "crash" ? (
              <CrashRocket key={stage.id} phase={stage.phase} crash={stage.result?.crash ?? null} onSettle={settle} />
            ) : stage?.game === "plinko" ? (
              <PlinkoBoard key={stage.id} phase={stage.phase} plinko={stage.result?.plinko ?? null} onSettle={settle} />
            ) : (
              <div className="text-zinc-700 text-5xl tracking-widest">🎰</div>
            )}
          </div>

          {/* reveal (+ celebration burst on every win, all games) */}
          <div className="relative min-h-[52px] flex flex-col items-center justify-center text-center">
            {reveal ? (
              <>
                {reveal.net > 0 && !reducedMotion() && <WinBurst seed={(stage?.id ?? 0) + reveal.payout} />}
                <div
                  className={`text-2xl font-bold ${reveal.net >= 0 ? "text-emerald-300" : "text-zinc-400"}`}
                  style={{ animation: reducedMotion() ? undefined : "gefx-pop 380ms cubic-bezier(.34,1.56,.64,1)" }}
                >
                  {reveal.detail}
                </div>
                <div
                  className={`font-extrabold mt-0.5 ${reveal.net > 0 ? "text-emerald-400" : reveal.net < 0 ? "text-rose-400" : "text-zinc-300"}`}
                  style={{
                    animation: reducedMotion() ? undefined : "gefx-pop 460ms cubic-bezier(.34,1.56,.64,1)",
                    textShadow: reveal.net > 0 ? "0 0 22px rgba(52,211,153,.45)" : undefined,
                  }}
                >
                  {reveal.net > 0 ? `+${fmt(reveal.net)} GT 🎉` : reveal.net < 0 ? `−${fmt(-reveal.net)} GT` : `±0 GT`}
                </div>
              </>
            ) : stage ? (
              <div className="text-zinc-500 text-sm animate-pulse">{t("title")}…</div>
            ) : null}
          </div>
          {error && <div className="text-rose-400 text-sm">{error}</div>}

          <div className="flex items-center gap-2" data-tour="kasyno-stake">
            <label className="text-xs text-zinc-400">{t("stake")}
              <input type="number" min={10} max={100000} value={bet} disabled={busy} onChange={(e) => setBet(Math.max(10, parseInt(e.target.value || "10", 10)))}
                className="ms-2 w-28 bg-black border border-zinc-700 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-amber-500 disabled:opacity-50" />
            </label>
          </div>
          <div className="flex gap-3" data-tour="kasyno-slots">
            <button onClick={() => play("slots")} disabled={busy || (balance ?? 0) < bet}
              className="px-6 py-3 rounded-full font-extrabold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 disabled:opacity-40 transition-all">{t("slots")}</button>
            <InfoTip text={t("helpSlots")} />
            <button onClick={() => play("coinflip")} disabled={busy || (balance ?? 0) < bet}
              className="px-6 py-3 rounded-full font-extrabold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 disabled:opacity-40 transition-all">{t("coinflip")}</button>
            <InfoTip text={t("helpCoinflip")} />
          </div>

          {/* Roulette: red/black (2×) or a straight number (36×) */}
          <div className="flex flex-wrap items-center justify-center gap-2" data-tour="kasyno-roulette">
            <span className="text-xs text-zinc-500 self-center me-1 inline-flex items-center gap-1">{t("rouletteLabel")} <InfoTip text={t("helpRoulette")} /></span>
            <button onClick={() => play("roulette", "red")} disabled={busy || (balance ?? 0) < bet}
              className="px-4 py-2 rounded-full font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 transition-all">{t("red")}</button>
            <button onClick={() => play("roulette", "black")} disabled={busy || (balance ?? 0) < bet}
              className="px-4 py-2 rounded-full font-bold text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 disabled:opacity-40 transition-all">{t("black")}</button>
            <button onClick={() => play("roulette", "0")} disabled={busy || (balance ?? 0) < bet}
              className="px-3 py-2 rounded-full font-extrabold text-white bg-green-700 hover:bg-green-600 disabled:opacity-40 transition-all" title="36×">0</button>
            <button onClick={() => play("roulette", "00")} disabled={busy || (balance ?? 0) < bet}
              className="px-3 py-2 rounded-full font-extrabold text-white bg-green-700 hover:bg-green-600 disabled:opacity-40 transition-all" title="36×">00</button>
            <input type="number" min={0} max={36} value={rouletteNum} disabled={busy} onChange={(e) => setRouletteNum(e.target.value)} placeholder="0-36"
              className="w-20 bg-black border border-zinc-700 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-amber-500 disabled:opacity-50" />
            <button onClick={() => play("roulette", rouletteNum)} disabled={busy || (balance ?? 0) < bet || !/^\d+$/.test(rouletteNum)}
              className="px-4 py-2 rounded-full font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 disabled:opacity-40 transition-all">{t("number")}</button>
          </div>

          {/* Dice: bet under/over a threshold — multiplier scales with the risk */}
          <div className="flex flex-wrap items-center justify-center gap-2" data-tour="kasyno-dice">
            <span className="text-xs text-zinc-500 self-center me-1 inline-flex items-center gap-1">{t("diceLabel")} <InfoTip text={t("helpDice")} /></span>
            <div className="flex rounded-full overflow-hidden border border-zinc-700">
              <button onClick={() => setDiceDir("under")} disabled={busy}
                className={`px-3 py-2 text-sm font-bold transition-all ${diceDir === "under" ? "bg-emerald-600 text-white" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"}`}>{t("diceUnder")}</button>
              <button onClick={() => setDiceDir("over")} disabled={busy}
                className={`px-3 py-2 text-sm font-bold transition-all ${diceDir === "over" ? "bg-emerald-600 text-white" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"}`}>{t("diceOver")}</button>
            </div>
            <input type="range" min={DICE_MIN} max={DICE_MAX} value={diceTarget} disabled={busy}
              onChange={(e) => setDiceTarget(parseInt(e.target.value, 10))} className="w-36 accent-amber-500 disabled:opacity-50" aria-label={t("diceLabel")} />
            <span className="text-xs text-zinc-300 font-mono tabular-nums w-32 text-center">
              {diceTarget} · {(diceChanceOf(diceDir, diceTarget) * 100).toFixed(0)}% · {diceMultOf(diceDir, diceTarget).toFixed(2)}×
            </span>
            <button onClick={() => play("dice", `${diceDir}:${diceTarget}`)} disabled={busy || (balance ?? 0) < bet}
              className="px-4 py-2 rounded-full font-bold text-white bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 disabled:opacity-40 transition-all">{t("diceRoll")}</button>
          </div>

          {/* Crash: auto-cashout at a target multiplier; the rocket busts at a random point */}
          <div className="flex flex-wrap items-center justify-center gap-2" data-tour="kasyno-crash">
            <span className="text-xs text-zinc-500 self-center me-1 inline-flex items-center gap-1">{t("crashLabel")} <InfoTip text={t("helpCrash")} /></span>
            {[1.5, 2, 5, 10].map((m) => (
              <button key={m} onClick={() => setCrashTarget(m)} disabled={busy}
                className={`px-3 py-2 rounded-full text-sm font-bold transition-all ${crashTarget === m ? "bg-violet-600 text-white" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-700"}`}>{m % 1 ? m.toFixed(1) : m.toFixed(0)}×</button>
            ))}
            <input type="number" min={1.01} max={50} step={0.1} value={crashTarget} disabled={busy}
              onChange={(e) => setCrashTarget(Math.min(50, Math.max(1.01, parseFloat(e.target.value || "2"))))}
              className="w-20 bg-black border border-zinc-700 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-amber-500 disabled:opacity-50" />
            <span className="text-xs text-zinc-400 font-mono tabular-nums w-16 text-center">{(95 / crashTarget).toFixed(1)}%</span>
            <button onClick={() => play("crash", String(crashTarget))} disabled={busy || (balance ?? 0) < bet}
              className="px-4 py-2 rounded-full font-bold text-white bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 disabled:opacity-40 transition-all">{t("crashStart")}</button>
          </div>

          {/* Plinko: drop the ball — no bet choice; edge buckets pay big, center sub-1 */}
          <div className="flex flex-wrap items-center justify-center gap-2" data-tour="kasyno-plinko">
            <span className="text-xs text-zinc-500 self-center me-1 inline-flex items-center gap-1">{t("plinkoLabel")} <InfoTip text={t("helpPlinko")} /></span>
            <button onClick={() => play("plinko")} disabled={busy || (balance ?? 0) < bet}
              className="px-6 py-2.5 rounded-full font-bold text-white bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-500 disabled:opacity-40 transition-all">{t("plinkoDrop")}</button>
          </div>

          {/* Mines: pick bombs, reveal tiles, dodge bombs, cash out anytime */}
          <div className="flex flex-wrap items-center justify-center gap-2" data-tour="kasyno-mines">
            <span className="text-xs text-zinc-500 self-center me-1 inline-flex items-center gap-1">{t("minesLabel")} <InfoTip text={t("helpMines")} /></span>
            {[1, 3, 5, 10].map((b) => (
              <button key={b} onClick={() => setMinesBombs(b)} disabled={minesGame?.status === "active"}
                className={`px-3 py-2 rounded-full text-sm font-bold transition-all ${minesBombs === b ? "bg-rose-600 text-white" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-700"} disabled:opacity-40`}>{b} 💣</button>
            ))}
            <button onClick={minesStartFn} disabled={minesBusy || minesGame?.status === "active" || (balance ?? 0) < bet}
              className="px-5 py-2 rounded-full font-bold text-white bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 disabled:opacity-40 transition-all">{t("minesStart")}</button>
          </div>

          <div className="text-sm text-zinc-400">{t("balance")} <span className="font-bold text-white">{fmt(balance ?? 0)} GT</span></div>
        </>
      )}

      {/* leaderboard */}
      {lb && (lb.bigWins.length > 0 || lb.topNet.length > 0) && (
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4" data-tour="kasyno-leaderboard">
          <div>
            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t("bigWins")}</h2>
            <ul className="space-y-1">
              {lb.bigWins.map((w) => (
                <li key={w.id} className="flex items-center justify-between text-sm bg-zinc-950 border border-zinc-900 px-3 py-1.5">
                  <span className="text-zinc-300 truncate">{w.name} <span className="text-zinc-600">{gameLabel[w.game] ?? w.game}</span></span>
                  <span className="text-emerald-400 font-bold">+{fmt(w.net)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t("topNet")}</h2>
            <ul className="space-y-1">
              {lb.topNet.map((tn, i) => (
                <li key={i} className="flex items-center justify-between text-sm bg-zinc-950 border border-zinc-900 px-3 py-1.5">
                  <span className="text-zinc-300 truncate">{tn.name}</span>
                  <span className={tn.net >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>{tn.net >= 0 ? "+" : ""}{fmt(tn.net)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
