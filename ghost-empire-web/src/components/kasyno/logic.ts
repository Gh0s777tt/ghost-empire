// src/components/kasyno/logic.ts
// Pure casino primitives — types, constants and math/geometry helpers. Extracted from
// shared.tsx (audit ETAP 1: God-component) so the presentational boards stay pure UI and
// this logic is unit-testable without React/DOM. NO "use client" — safe on server + client.
// Re-exported by shared.tsx, so existing `./shared` imports keep working.

export type PlayResult = {
  ok?: boolean; bet: number; payout: number; net: number; newBalance: number;
  detail: string; reels?: string[]; roll?: { n: number; color: "green" | "red" | "black" };
  dice?: { roll: number; target: number; dir: "under" | "over"; win: boolean };
  crash?: { crash: number; target: number; win: boolean };
  plinko?: { path: number[]; bucket: number; multiplier: number };
  scratch?: { grid: string[]; multiplier: number; sym: string | null }; error?: string;
};
export type Leaderboard = {
  bigWins: Array<{ id: string; name: string; game: string; net: number; detail: string | null }>;
  topNet: Array<{ name: string; net: number }>;
};
export type History = {
  recent: Array<{ id: string; game: string; bet: number; payout: number; net: number; detail: string | null; createdAt: string }>;
  stats: { games: number; wins: number; net: number; best: number };
};
export type HiloState = {
  sessionId: string;
  card: { rank: number; suit: number };
  prevCard?: { rank: number; suit: number };
  multiplier: number;
  steps: number;
  potential: number;
  status: "active" | "busted" | "cashed";
  payout?: number;
  net?: number;
  newBalance?: number;
};
export type BjState = {
  sessionId: string;
  player: number[];
  dealer: number[];
  playerTotal: number;
  dealerTotal: number | null;
  status: "active" | "done";
  result?: { multiplier: number; payout: number; net: number; newBalance: number };
  doubled: boolean;
  canDouble: boolean;
};
export type Game = "slots" | "coinflip" | "roulette" | "dice" | "crash" | "plinko" | "scratch";
export type Phase = "spin" | "land";

// Per-game emoji + key helpers for the contextual "how it works" box (shown for the
// game you're actually in, instead of one long list of every game at once).
export const GAME_EMOJI: Record<string, string> = {
  slots: "🎰", coinflip: "🪙", roulette: "🎡", dice: "🎲", blackjack: "🃏",
  hilo: "↕️", crash: "🚀", plinko: "⚪", mines: "💣", scratch: "🎫",
};
export const capGame = (g: string) => g.charAt(0).toUpperCase() + g.slice(1);

// Plinko board mirrors lib/gt-games.ts (replicated so the client never imports the server lib).
export const PLINKO_MULTS_UI = [13, 4, 1.8, 1.3, 1.05, 0.9, 0.5, 0.9, 1.05, 1.3, 1.8, 4, 13];
export const PLINKO_ROWS_UI = 12;
export const plinkoBucketColor = (m: number) => (m >= 4 ? "#c01722" : m >= 1.3 ? "#b8860b" : m >= 1 ? "#3f3f46" : "#18181b");

// Dice odds mirror lib/gt-games.ts (pure, replicated here so the client never imports the server lib).
export const DICE_MIN = 2, DICE_MAX = 98, DICE_EDGE = 0.05;
export const diceChanceOf = (dir: "under" | "over", t: number) => (dir === "under" ? t : 100 - t) / 100;
export const diceMultOf = (dir: "under" | "over", t: number) => (1 - DICE_EDGE) / diceChanceOf(dir, t);
export type Stage = { id: number; game: Game; phase: Phase; result: PlayResult | null; settled: boolean };

// ── Roulette wheel data (American double-zero, real wheel sequence; 37 = "00") ────
export const US_WHEEL = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
export const SEG = 360 / US_WHEEL.length; // 38 pockets
export const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const HEX: Record<string, string> = { green: "#157a3d", red: "#c01722", black: "#0c0c0c" };
export function rcolor(n: number): "green" | "red" | "black" { return n === 0 || n === 37 ? "green" : RED_SET.has(n) ? "red" : "black"; }
export const pocketLabel = (n: number) => (n === 37 ? "00" : String(n));
// Cartesian point on a circle — `deg` measured clockwise from the top (12 o'clock).
export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}
// Donut (annulus) wedge between inner radius ri / outer ro, from a1° to a2° (clockwise from top).
export function annulus(cx: number, cy: number, ri: number, ro: number, a1: number, a2: number): string {
  const f = (p: { x: number; y: number }) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  return `M ${f(polar(cx, cy, ro, a1))} A ${ro} ${ro} 0 0 1 ${f(polar(cx, cy, ro, a2))} L ${f(polar(cx, cy, ri, a2))} A ${ri} ${ri} 0 0 0 ${f(polar(cx, cy, ri, a1))} Z`;
}
export const SLOT_FACES = ["🍒", "🍋", "🔔", "⭐", "💎", "7️⃣"];
export const CELL = 72;
export const STRIP = 24;
