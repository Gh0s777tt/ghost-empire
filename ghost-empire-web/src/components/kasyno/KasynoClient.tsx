"use client";
// src/components/kasyno/KasynoClient.tsx
// Slots + coinflip + roulette played for Ghost Tokens, with GPU-composited spin
// animations (CSS `transform` transitions → run at the display's native refresh rate,
// 60/120/240 Hz; we never compute outcomes client-side — the wheel/reels/coin always
// LAND on the server-decided result). Respects prefers-reduced-motion.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { Link } from "@/i18n/navigation";

type PlayResult = {
  ok?: boolean; bet: number; payout: number; net: number; newBalance: number;
  detail: string; reels?: string[]; roll?: { n: number; color: "green" | "red" | "black" }; error?: string;
};
type Leaderboard = {
  bigWins: Array<{ id: string; name: string; game: string; net: number; detail: string | null }>;
  topNet: Array<{ name: string; net: number }>;
};
type Game = "slots" | "coinflip" | "roulette";
type Phase = "spin" | "land";
type Stage = { id: number; game: Game; phase: Phase; result: PlayResult | null; settled: boolean };

// ── Roulette wheel data (European single-zero, real wheel sequence) ──────────────
const EU_WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const SEG = 360 / EU_WHEEL.length;
const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const HEX: Record<string, string> = { green: "#15803d", red: "#b91c1c", black: "#0a0a0a" };
function rcolor(n: number): "green" | "red" | "black" { return n === 0 ? "green" : RED_SET.has(n) ? "red" : "black"; }
// Cartesian point on a circle — `deg` measured clockwise from the top (12 o'clock).
function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}
const SLOT_FACES = ["🍒", "🍋", "🔔", "⭐", "💎", "7️⃣"];
const CELL = 72;
const STRIP = 24;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ── Roulette: crisp vector (SVG) wheel; continuous spin → ease-out land on server's number ──
function RouletteWheel({ phase, target, onSettle, size = 340 }: { phase: Phase; target: number | null; onSettle: () => void; size?: number }) {
  const ref = useRef<SVGSVGElement>(null);
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
    const tIdx = EU_WHEEL.indexOf(target);
    const center = tIdx * SEG + SEG / 2; // SVG segments span [i·SEG,(i+1)·SEG] → center at i·SEG+SEG/2
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
    void el.getBoundingClientRect(); // reflow → lock the frozen frame (SVG has no offsetHeight)
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

  const cx = size / 2, cy = size / 2;
  const rRim = size / 2 - 2, rSeg = size / 2 - 13, rLabel = size / 2 - 26, rHub = size * 0.15;
  return (
    <div className="relative select-none" style={{ width: size, height: size }}>
      {/* fixed pointer */}
      <div className="absolute left-1/2 -translate-x-1/2 z-30" style={{ top: -4, width: 0, height: 0, borderLeft: "13px solid transparent", borderRight: "13px solid transparent", borderTop: "22px solid #fbbf24", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.6))" }} />
      <svg ref={ref} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="will-change-transform" style={{ display: "block", transform: "rotate(0deg)", transformOrigin: "50% 50%", filter: "drop-shadow(0 12px 32px rgba(0,0,0,.55))" }}>
        <defs>
          <radialGradient id="ge-rim" cx="50%" cy="32%" r="80%">
            <stop offset="0%" stopColor="#52525b" />
            <stop offset="62%" stopColor="#27272a" />
            <stop offset="100%" stopColor="#09090b" />
          </radialGradient>
          <radialGradient id="ge-hub" cx="50%" cy="32%" r="72%">
            <stop offset="0%" stopColor="#e4e4e7" />
            <stop offset="55%" stopColor="#71717a" />
            <stop offset="100%" stopColor="#27272a" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={rRim} fill="url(#ge-rim)" />
        {EU_WHEEL.map((n, i) => {
          const start = i * SEG, mid = i * SEG + SEG / 2;
          const p1 = polar(cx, cy, rSeg, start), p2 = polar(cx, cy, rSeg, start + SEG), lp = polar(cx, cy, rLabel, mid);
          return (
            <g key={n}>
              <path d={`M ${cx} ${cy} L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${rSeg} ${rSeg} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} Z`} fill={HEX[rcolor(n)]} stroke="#000000" strokeWidth={0.6} />
              <text x={lp.x.toFixed(2)} y={lp.y.toFixed(2)} fill="#ffffff" fontSize={(size * 0.042).toFixed(1)} fontWeight={700} textAnchor="middle" dominantBaseline="central" transform={`rotate(${mid.toFixed(2)} ${lp.x.toFixed(2)} ${lp.y.toFixed(2)})`} style={{ pointerEvents: "none" }}>{n}</text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={rHub} fill="url(#ge-hub)" stroke="#18181b" strokeWidth={2} />
        <circle cx={cx} cy={cy} r={Number((rHub * 0.42).toFixed(1))} fill="#0a0a0a" />
      </svg>
      {/* static gloss (does NOT rotate — light from above) */}
      <div className="absolute inset-0 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle at 50% 26%, rgba(255,255,255,0.16), rgba(255,255,255,0) 46%)" }} />
    </div>
  );
}

// ── Slots: 3 reels scroll down and decelerate onto the result symbols (staggered) ─
function SlotReels({ phase, reels, onSettle }: { phase: Phase; reels: string[] | null; onSettle: () => void }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const done = useRef(false);
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
    if (reducedMotion()) {
      strips.forEach((s, i) => { const el = refs.current[i]; if (el) el.style.transform = `translateY(-${(s.length - 1) * CELL}px)`; });
      const t = setTimeout(onSettle, 250); return () => clearTimeout(t);
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
    const t = setTimeout(onSettle, maxDur + 80);
    return () => clearTimeout(t);
  }, [phase, strips, onSettle]);

  const display = strips ?? [["❔"], ["❔"], ["❔"]];
  return (
    <div className="flex gap-2 items-center justify-center h-full">
      {display.map((strip, i) => (
        <div key={i} className="overflow-hidden rounded-xl bg-black border-2 border-zinc-700 shadow-inner" style={{ width: CELL, height: CELL }}>
          <div ref={(el) => { refs.current[i] = el; }} className="will-change-transform" style={{ transform: "translateY(0px)" }}>
            {strip.map((s, j) => (
              <div key={j} className="flex items-center justify-center" style={{ height: CELL, fontSize: 40 }}>{s}</div>
            ))}
          </div>
        </div>
      ))}
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
        <div className="absolute inset-0 rounded-full flex items-center justify-center text-6xl bg-gradient-to-br from-amber-300 to-amber-600 border-4 border-amber-200" style={{ backfaceVisibility: "hidden" }}>👑</div>
        <div className="absolute inset-0 rounded-full flex items-center justify-center text-6xl bg-gradient-to-br from-zinc-400 to-zinc-700 border-4 border-zinc-300" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>💀</div>
      </div>
    </div>
  );
}

export function KasynoClient({ isAuthenticated, initialBalance }: { isAuthenticated: boolean; initialBalance: number | null }) {
  const t = useTranslations("kasyno");
  const fmt = useLocaleFmt();
  const gameLabel: Record<string, string> = { slots: t("gameSlots"), coinflip: t("gameCoinflip"), roulette: t("gameRoulette") };
  const [balance, setBalance] = useState<number | null>(initialBalance);
  const [bet, setBet] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lb, setLb] = useState<Leaderboard | null>(null);
  const [rouletteNum, setRouletteNum] = useState("");
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
    if (busy) return;
    setBusy(true); setError(null);
    const id = ++playId.current;
    setStage({ id, game, phase: "spin", result: null, settled: false });
    try {
      const res = await fetch("/api/gt-games/play", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, bet, choice }) });
      const d: PlayResult = await res.json();
      if (!res.ok) { setError(d.error ?? t("err")); setStage(null); setBusy(false); return; }
      setStage((s) => (s && s.id === id ? { ...s, phase: "land", result: d } : s));
    } catch { setError(t("connError")); setStage(null); setBusy(false); }
  }

  const rouletteTarget = stage?.result?.roll?.n ?? (stage?.result?.detail ? (parseInt(stage.result.detail.replace(/\D/g, ""), 10) || 0) : null);
  const reveal = stage?.settled ? stage.result : null;

  return (
    <div className="flex flex-col items-center gap-6">
      <style>{`@keyframes gefx-spin { to { transform: rotate(360deg); } }`}</style>
      <div className="text-center">
        <h1 className="text-3xl font-black text-white tracking-tight">{t("title")}</h1>
        <p className="text-zinc-400 mt-1 text-sm">{t("subtitlePre")} <code className="text-zinc-500">!slots 100</code> · <code className="text-zinc-500">!coinflip 50</code> · <code className="text-zinc-500">!roulette 100 red</code></p>
      </div>

      {!isAuthenticated ? (
        <Link href="/" className="px-8 py-3 rounded-full font-extrabold text-white bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500">{t("loginToPlay")}</Link>
      ) : (
        <>
          {/* animation stage */}
          <div className="flex items-center justify-center" style={{ minHeight: 312 }}>
            {stage?.game === "roulette" ? (
              <RouletteWheel key={stage.id} phase={stage.phase} target={rouletteTarget} onSettle={settle} />
            ) : stage?.game === "slots" ? (
              <SlotReels key={stage.id} phase={stage.phase} reels={stage.result?.reels ?? null} onSettle={settle} />
            ) : stage?.game === "coinflip" ? (
              <CoinFlip key={stage.id} phase={stage.phase} win={stage.result ? stage.result.payout > 0 : null} onSettle={settle} />
            ) : (
              <div className="text-zinc-700 text-5xl tracking-widest">🎰</div>
            )}
          </div>

          {/* reveal */}
          <div className="min-h-[52px] flex flex-col items-center justify-center text-center">
            {reveal ? (
              <>
                <div className={`text-2xl font-bold ${reveal.payout > 0 ? "text-emerald-300" : "text-zinc-400"}`}>{reveal.detail}</div>
                <div className={`font-extrabold mt-0.5 ${reveal.payout > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {reveal.payout > 0 ? `+${fmt(reveal.payout)} GT 🎉` : `−${fmt(reveal.bet)} GT`}
                </div>
              </>
            ) : stage ? (
              <div className="text-zinc-500 text-sm animate-pulse">{t("title")}…</div>
            ) : null}
          </div>
          {error && <div className="text-rose-400 text-sm">{error}</div>}

          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400">{t("stake")}
              <input type="number" min={10} max={100000} value={bet} disabled={busy} onChange={(e) => setBet(Math.max(10, parseInt(e.target.value || "10", 10)))}
                className="ms-2 w-28 bg-black border border-zinc-700 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-amber-500 disabled:opacity-50" />
            </label>
          </div>
          <div className="flex gap-3">
            <button onClick={() => play("slots")} disabled={busy || (balance ?? 0) < bet}
              className="px-6 py-3 rounded-full font-extrabold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 disabled:opacity-40 transition-all">{t("slots")}</button>
            <button onClick={() => play("coinflip")} disabled={busy || (balance ?? 0) < bet}
              className="px-6 py-3 rounded-full font-extrabold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 disabled:opacity-40 transition-all">{t("coinflip")}</button>
          </div>

          {/* Roulette: red/black (2×) or a straight number (36×) */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-zinc-500 self-center me-1">{t("rouletteLabel")}</span>
            <button onClick={() => play("roulette", "red")} disabled={busy || (balance ?? 0) < bet}
              className="px-4 py-2 rounded-full font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 transition-all">{t("red")}</button>
            <button onClick={() => play("roulette", "black")} disabled={busy || (balance ?? 0) < bet}
              className="px-4 py-2 rounded-full font-bold text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 disabled:opacity-40 transition-all">{t("black")}</button>
            <input type="number" min={0} max={36} value={rouletteNum} disabled={busy} onChange={(e) => setRouletteNum(e.target.value)} placeholder="0-36"
              className="w-20 bg-black border border-zinc-700 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-amber-500 disabled:opacity-50" />
            <button onClick={() => play("roulette", rouletteNum)} disabled={busy || (balance ?? 0) < bet || !/^\d+$/.test(rouletteNum)}
              className="px-4 py-2 rounded-full font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 disabled:opacity-40 transition-all">{t("number")}</button>
          </div>

          <div className="text-sm text-zinc-400">{t("balance")} <span className="font-bold text-white">{fmt(balance ?? 0)} GT</span></div>
        </>
      )}

      {/* leaderboard */}
      {lb && (lb.bigWins.length > 0 || lb.topNet.length > 0) && (
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
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
