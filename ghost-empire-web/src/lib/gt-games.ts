// src/lib/gt-games.ts
// GT mini-games: slots + coinflip. Pure outcome math (unit-tested for RTP) +
// atomic play() that charges the bet, pays winnings and logs the play — all in one
// transaction so GT can never be created or lost incorrectly.
import { prisma } from "@/lib/prisma";
import { pickWeightedIndex } from "@/lib/economy";

export const MIN_BET = 10;
export const MAX_BET = 100_000;

// Slots: 3 reels. Only a 3-of-a-kind pays, with the symbol's multiplier. House edge
// is intentional (this is a GT sink) — RTP ≈ 0.86, verified by a Monte-Carlo test.
export const SLOT_SYMBOLS = [
  { s: "🍒", weight: 30, mult: 10 },
  { s: "🍋", weight: 25, mult: 12 },
  { s: "🔔", weight: 18, mult: 20 },
  { s: "⭐", weight: 12, mult: 50 },
  { s: "💎", weight: 8, mult: 150 },
  { s: "7️⃣", weight: 4, mult: 800 },
];

const SLOT_WEIGHTS = SLOT_SYMBOLS.map((x) => x.weight);

export type SlotOutcome = { reels: string[]; multiplier: number };

/** Spin 3 reels. `rng()` is a [0,1) source (injectable for tests). */
export function spinSlots(rng: () => number = Math.random): SlotOutcome {
  const idx = [0, 1, 2].map(() => pickWeightedIndex(SLOT_WEIGHTS, rng()));
  const reels = idx.map((i) => SLOT_SYMBOLS[i].s);
  const multiplier = idx[0] === idx[1] && idx[1] === idx[2] ? SLOT_SYMBOLS[idx[0]].mult : 0;
  return { reels, multiplier };
}

/** Coinflip: ~48% win → 2× (house edge 4%, RTP 0.96). */
export function flipCoin(rng: () => number = Math.random): { win: boolean; multiplier: number } {
  const win = rng() < 0.48;
  return { win, multiplier: win ? 2 : 0 };
}

// Dice: roll 0-99 (uniform). Bet "under T" (win if roll < T) or "over T" (win if roll ≥ T),
// T in 2..98. Fair multiplier = 1 / winChance; we shave a 5% house edge → RTP ≈ 0.95 (GT sink).
const DICE_EDGE = 0.05;
export const DICE_MIN_TARGET = 2;
export const DICE_MAX_TARGET = 98;

export type DiceDir = "under" | "over";
export type DiceOutcome = { roll: number; win: boolean; multiplier: number };

/** Win probability for a (dir,target) bet — `target` is the 2..98 threshold. */
export function diceWinChance(dir: DiceDir, target: number): number {
  return (dir === "under" ? target : 100 - target) / 100;
}

/** Applied multiplier (incl. 5% house edge) for a (dir,target) bet. */
export function diceMultiplier(dir: DiceDir, target: number): number {
  return (1 - DICE_EDGE) / diceWinChance(dir, target);
}

/** Canonical dice bet "under:NN" / "over:NN" (separator may be ":" or a space), or null. */
export function normDiceChoice(choice?: string): { dir: DiceDir; target: number } | null {
  const m = (choice ?? "").trim().toLowerCase().match(/^(under|over)\s*[:\s]\s*(\d{1,3})$/);
  if (!m) return null;
  const target = parseInt(m[2], 10);
  if (target < DICE_MIN_TARGET || target > DICE_MAX_TARGET) return null;
  return { dir: m[1] as DiceDir, target };
}

/** Roll the die (0..99) + resolve a (pre-normalized) bet. `rng()` is a [0,1) source. */
export function rollDice(dir: DiceDir, target: number, rng: () => number = Math.random): DiceOutcome {
  const roll = Math.floor(rng() * 100); // 0..99 uniform
  const win = dir === "under" ? roll < target : roll >= target;
  return { roll, win, multiplier: diceMultiplier(dir, target) };
}

// Crash ("Rakieta"): the multiplier climbs from 1.00× and busts at a random crash point C with
// the provably-fair tail P(C ≥ m) = (1 − edge) / m. The player pre-sets an auto-cashout target T;
// they win T× if C ≥ T (cashed out before the bust), else lose. Expected payout = T·(1−edge)/T =
// (1 − edge) for ANY target → flat RTP ≈ 0.95 (GT sink). C is capped at 100× for sane animation.
const CRASH_EDGE = 0.05;
const CRASH_MAX_CRASH = 100;
export const CRASH_MIN_TARGET = 1.01;
export const CRASH_MAX_TARGET = 50;

export type CrashOutcome = { crash: number; target: number; win: boolean; multiplier: number };

/** Canonical crash auto-cashout target (1.01..50, 2 decimals), or null if invalid. */
export function normCrashChoice(choice?: string): number | null {
  const v = parseFloat((choice ?? "").trim().replace(",", "."));
  if (!Number.isFinite(v)) return null;
  const t = Math.round(v * 100) / 100;
  if (t < CRASH_MIN_TARGET || t > CRASH_MAX_TARGET) return null;
  return t;
}

/** Sample the crash point and resolve a (pre-normalized) auto-cashout target. `rng()` is [0,1). */
export function rollCrash(target: number, rng: () => number = Math.random): CrashOutcome {
  const u = rng();
  const raw = (1 - CRASH_EDGE) / (u <= 0 ? 1e-9 : u); // ≥1 with prob (1−edge); <1 (instant bust) with prob edge
  const crash = raw < 1 ? 1 : Math.min(CRASH_MAX_CRASH, Math.floor(raw * 100) / 100);
  const win = crash >= target;
  return { crash, target, win, multiplier: win ? target : 0 };
}

// Roulette: American double-zero wheel — 38 pockets (0, 00, 1-36). "00" is encoded as the
// sentinel pocket value n = 37. Bets: red/black (2×) or a straight number incl. 0/00 (36×).
// The two green pockets (0, 00) are the house edge → RTP ≈ 0.947 on every bet type (a GT sink).
const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const ROULETTE_DOUBLE_ZERO = 37; // sentinel pocket value representing "00"

export type RouletteColor = "green" | "red" | "black";

export function rouletteColor(n: number): RouletteColor {
  if (n === 0 || n === ROULETTE_DOUBLE_ZERO) return "green";
  return ROULETTE_RED.has(n) ? "red" : "black";
}

/** Canonical roulette bet, or null if invalid. Accepts red/black (+ PL/short aliases),
 *  a straight number 0-36, or "00" (double zero). */
export function normRouletteChoice(choice?: string): string | null {
  const s = (choice ?? "").trim().toLowerCase();
  if (["red", "r", "czerwone", "czerwony", "🔴"].includes(s)) return "red";
  if (["black", "b", "czarne", "czarny", "⚫"].includes(s)) return "black";
  if (s === "00") return "00";
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    if (n >= 0 && n <= 36) return String(n);
  }
  return null;
}

export type RouletteOutcome = { n: number; color: RouletteColor; multiplier: number };

/** Spin the wheel + resolve a (pre-normalized) bet. `rng()` is a [0,1) source. */
export function spinRoulette(choice: string, rng: () => number = Math.random): RouletteOutcome {
  const n = Math.floor(rng() * 38); // 0..37 uniform; 37 = "00"
  const color = rouletteColor(n);
  let multiplier = 0;
  if (choice === "red" || choice === "black") multiplier = color === choice ? 2 : 0;
  else if (choice === "00") multiplier = n === ROULETTE_DOUBLE_ZERO ? 36 : 0;
  else if (/^\d+$/.test(choice)) multiplier = n === parseInt(choice, 10) ? 36 : 0;
  return { n, color, multiplier };
}

export type GtGameResult =
  | { ok: true; game: string; bet: number; payout: number; net: number; newBalance: number; detail: string; reels?: string[]; roll?: { n: number; color: RouletteColor }; dice?: { roll: number; target: number; dir: DiceDir; win: boolean }; crash?: { crash: number; target: number; win: boolean } }
  | { ok: false; status: number; error: string };

export class GtGameError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Charge `bet`, resolve the game, pay winnings and log it — atomically. `choice` is only
 *  used by roulette (red/black or a number 0-36). */
export async function playGtGame(
  userId: string,
  game: "slots" | "coinflip" | "roulette" | "dice" | "crash",
  bet: number,
  choice?: string,
): Promise<GtGameResult> {
  if (!Number.isInteger(bet) || bet < MIN_BET || bet > MAX_BET) {
    return { ok: false, status: 400, error: `Stawka musi być ${MIN_BET}-${MAX_BET} GT` };
  }

  let payout = 0;
  let detail = "";
  let reels: string[] | undefined;
  let roll: { n: number; color: RouletteColor } | undefined;
  let dice: { roll: number; target: number; dir: DiceDir; win: boolean } | undefined;
  let crash: { crash: number; target: number; win: boolean } | undefined;
  if (game === "slots") {
    const o = spinSlots();
    reels = o.reels;
    detail = o.reels.join("");
    payout = o.multiplier > 0 ? bet * o.multiplier : 0;
  } else if (game === "coinflip") {
    const o = flipCoin();
    detail = o.win ? "✅ orzeł" : "❌ reszka";
    payout = o.win ? bet * o.multiplier : 0;
  } else if (game === "roulette") {
    const c = normRouletteChoice(choice);
    if (!c) return { ok: false, status: 400, error: "Wybierz: red / black / liczba 0-36" };
    const o = spinRoulette(c);
    const emoji = o.color === "red" ? "🔴" : o.color === "black" ? "⚫" : "🟢";
    detail = `${emoji} ${o.n === 37 ? "00" : o.n}`;
    roll = { n: o.n, color: o.color };
    payout = o.multiplier > 0 ? bet * o.multiplier : 0;
  } else if (game === "dice") {
    const c = normDiceChoice(choice);
    if (!c) return { ok: false, status: 400, error: `Wybierz under/over + próg ${DICE_MIN_TARGET}-${DICE_MAX_TARGET}` };
    const o = rollDice(c.dir, c.target);
    detail = `🎲 ${o.roll} ${c.dir === "under" ? "<" : "≥"} ${c.target} → ${o.win ? "✅" : "❌"}`;
    dice = { roll: o.roll, target: c.target, dir: c.dir, win: o.win };
    payout = o.win ? Math.floor(bet * o.multiplier) : 0;
  } else if (game === "crash") {
    const target = normCrashChoice(choice);
    if (target == null) return { ok: false, status: 400, error: `Auto-cashout musi być ${CRASH_MIN_TARGET}-${CRASH_MAX_TARGET}×` };
    const o = rollCrash(target);
    detail = o.win ? `🚀 ${o.crash.toFixed(2)}× — wypłata @ ${target.toFixed(2)}× ✅` : `💥 crash @ ${o.crash.toFixed(2)}× (cel ${target.toFixed(2)}×) ❌`;
    crash = { crash: o.crash, target, win: o.win };
    payout = o.win ? Math.floor(bet * target) : 0;
  } else {
    return { ok: false, status: 400, error: "Nieznana gra" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const charged = await tx.user.updateMany({
        where: { id: userId, tokens: { gte: bet } },
        data: { tokens: { decrement: bet }, totalSpent: { increment: bet } },
      });
      if (charged.count === 0) throw new GtGameError("Za mało Ghost Tokens", 402);

      await tx.transaction.create({ data: { userId, type: "spend", amount: -bet, reason: `gtgame:${game}`, status: "completed" } });

      if (payout > 0) {
        await tx.user.update({ where: { id: userId }, data: { tokens: { increment: payout }, totalEarned: { increment: payout } } });
        await tx.transaction.create({ data: { userId, type: "earn", amount: payout, reason: `gtgame:${game}:win`, status: "completed" } });
      }

      await tx.gtGamePlay.create({ data: { userId, game, bet, payout, net: payout - bet, detail: detail.slice(0, 80) } });

      const fresh = await tx.user.findUnique({ where: { id: userId }, select: { tokens: true } });
      return fresh?.tokens ?? 0;
    });

    // Casino achievements (best-effort; helper swallows its own errors, never throws).
    const { checkAndGrantAchievements } = await import("@/lib/achievements");
    await checkAndGrantAchievements({ userId, triggerType: "casino_plays" });

    return { ok: true, game, bet, payout, net: payout - bet, newBalance: result, detail, reels, roll, dice, crash };
  } catch (e) {
    if (e instanceof GtGameError) return { ok: false, status: e.status, error: e.message };
    return { ok: false, status: 500, error: "Błąd serwera" };
  }
}
