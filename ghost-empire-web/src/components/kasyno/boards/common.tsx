"use client";
// src/components/kasyno/boards/common.tsx
// Wyodrębnione z shared.tsx (audyt ETAP 1: God-component). Prezentacyjne — dane+callbacki
// jako propsy. Czysta logika/geometria w ../logic; wspólne prymitywy w ./common.
import * as React from "react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

export function reducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  // "ge-anim=force" overrides the OS/browser "reduce motion" setting — some users
  // (e.g. Firefox with system animations off) reported "no animations" without
  // realizing their system asked for that; the casino offers an explicit switch.
  try { if (localStorage.getItem("ge-anim") === "force") return false; } catch { /* ignore */ }
  return !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}


// Scale-to-fit for fixed-size boards (Crash/Plinko keep their px math intact and the
// whole board scales down on narrow screens — 24px margin each side).
export function useFitScale(designWidth: number): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const calc = () => setScale(Math.min(1, (window.innerWidth - 48) / designWidth));
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [designWidth]);
  return scale;
}


// ── Custom slot symbols: crisp vector art (replaces flat emojis); shared <defs> so
//    the 6 gradients are declared once and reused by every cell across all 3 reels. ──
export function SlotDefs() {
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


export function SlotSymbol({ s, size = 52 }: { s: string; size?: number }) {
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


// ── Die3D: a CSS 3D cube that tumbles while `spinning` and springs to its front face
//    when it stops. The front face's digit is set via `frontRef` (textContent) right
//    before the stop, so the die always "lands" on the real result. ──
export function Die3D({ spinning, frontRef, delay = "0s" }: { spinning: boolean; frontRef: React.Ref<HTMLDivElement>; delay?: string }) {
  const Z = 26;
  const faces: Array<{ tr: string; n: string }> = [
    { tr: `rotateY(0deg) translateZ(${Z}px)`, n: "?" },
    { tr: `rotateY(90deg) translateZ(${Z}px)`, n: "3" },
    { tr: `rotateY(180deg) translateZ(${Z}px)`, n: "9" },
    { tr: `rotateY(-90deg) translateZ(${Z}px)`, n: "1" },
    { tr: `rotateX(90deg) translateZ(${Z}px)`, n: "5" },
    { tr: `rotateX(-90deg) translateZ(${Z}px)`, n: "8" },
  ];
  return (
    <div style={{ perspective: 240 }} aria-hidden>
      <div
        style={{
          width: 52, height: 52, position: "relative", transformStyle: "preserve-3d",
          animation: spinning ? "gefx-tumble 0.9s linear infinite" : undefined,
          animationDelay: delay,
          transition: spinning ? undefined : "transform 800ms cubic-bezier(.2,1.4,.4,1)",
          transform: spinning ? undefined : "rotateX(0deg) rotateY(0deg)",
        }}
      >
        {faces.map((f, i) => (
          <div
            key={i}
            ref={i === 0 ? frontRef : undefined}
            style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 900, fontSize: 26, color: "#16161e", borderRadius: 10,
              background: "linear-gradient(145deg, #ffffff, #d7d7e2)",
              border: "1px solid #b9b9c6", boxShadow: "inset 0 -3px 6px rgba(0,0,0,.12)",
              transform: f.tr, backfaceVisibility: "hidden",
            }}
          >
            {f.n}
          </div>
        ))}
      </div>
    </div>
  );
}


// ── WinBurst: a small deterministic particle burst (gold/red/emerald confetti) shown on
//    wins. Pure CSS animations; particles derive from `seed` (no Math.random → no
//    hydration mismatch, replays identically per result). Parent must be `relative`. ──
export function WinBurst({ seed }: { seed: number }) {
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


// ── Mines ("Pole minowe"): interactive 5×5 grid (the one stateful game). Reveal tiles → 💎 and the
//    multiplier climbs; hit a 💣 and it's over. Cash out any time. State is driven by the server. ─
export type MinesGameState = { sessionId: string; bombs: number; revealed: number[]; multiplier: number; status: "active" | "bust" | "cashed"; bombSet: number[] | null; bet: number; payout?: number };


// ── Blackjack table: dealer row (hole card hidden while active) + player row + actions.
//    Cards render as styled rectangles; ranks/suits decode the 0-51 card codes. ──
export const BJ_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export const BJ_SUITS = ["♠", "♥", "♦", "♣"];


export function PlayingCard({ code, hidden = false, delay = 0 }: { code?: number; hidden?: boolean; delay?: number }) {
  if (hidden || code === undefined) {
    return (
      <div className="w-12 h-[68px] rounded-lg border border-zinc-600 flex items-center justify-center text-xl shrink-0"
        style={{ background: "repeating-linear-gradient(45deg, #1d1d2b, #1d1d2b 4px, #15151f 4px, #15151f 8px)" }}>
        👻
      </div>
    );
  }
  const suit = BJ_SUITS[Math.floor(code / 13)];
  const rank = BJ_RANKS[code % 13];
  const red = suit === "♥" || suit === "♦";
  return (
    <div className="w-12 h-[68px] rounded-lg border border-zinc-300 bg-gradient-to-br from-white to-zinc-200 flex flex-col items-center justify-center shrink-0"
      style={{ animation: `gefx-pop 320ms cubic-bezier(.34,1.56,.64,1) both`, animationDelay: `${delay}ms`, boxShadow: "0 2px 6px rgba(0,0,0,.45)" }}>
      <span className={`text-base font-black leading-none ${red ? "text-red-600" : "text-zinc-900"}`}>{rank}</span>
      <span className={`text-lg leading-none ${red ? "text-red-600" : "text-zinc-900"}`}>{suit}</span>
    </div>
  );
}

