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

// Roulette: European single-zero wheel (0-36). Bets: red/black (2×) or a straight number
// (36×). The single green 0 is the house edge → RTP ≈ 0.973 on every bet type (a GT sink).
const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type RouletteColor = "green" | "red" | "black";

export function rouletteColor(n: number): RouletteColor {
  if (n === 0) return "green";
  return ROULETTE_RED.has(n) ? "red" : "black";
}

/** Canonical roulette bet, or null if invalid. Accepts red/black (+ PL/short aliases) or 0-36. */
export function normRouletteChoice(choice?: string): string | null {
  const s = (choice ?? "").trim().toLowerCase();
  if (["red", "r", "czerwone", "czerwony", "🔴"].includes(s)) return "red";
  if (["black", "b", "czarne", "czarny", "⚫"].includes(s)) return "black";
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    if (n >= 0 && n <= 36) return String(n);
  }
  return null;
}

export type RouletteOutcome = { n: number; color: RouletteColor; multiplier: number };

/** Spin the wheel + resolve a (pre-normalized) bet. `rng()` is a [0,1) source. */
export function spinRoulette(choice: string, rng: () => number = Math.random): RouletteOutcome {
  const n = Math.floor(rng() * 37); // 0-36 uniform
  const color = rouletteColor(n);
  let multiplier = 0;
  if (choice === "red" || choice === "black") multiplier = color === choice ? 2 : 0;
  else if (/^\d+$/.test(choice)) multiplier = n === parseInt(choice, 10) ? 36 : 0;
  return { n, color, multiplier };
}

export type GtGameResult =
  | { ok: true; game: string; bet: number; payout: number; net: number; newBalance: number; detail: string; reels?: string[] }
  | { ok: false; status: number; error: string };

export class GtGameError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Charge `bet`, resolve the game, pay winnings and log it — atomically. `choice` is only
 *  used by roulette (red/black or a number 0-36). */
export async function playGtGame(
  userId: string,
  game: "slots" | "coinflip" | "roulette",
  bet: number,
  choice?: string,
): Promise<GtGameResult> {
  if (!Number.isInteger(bet) || bet < MIN_BET || bet > MAX_BET) {
    return { ok: false, status: 400, error: `Stawka musi być ${MIN_BET}-${MAX_BET} GT` };
  }

  let payout = 0;
  let detail = "";
  let reels: string[] | undefined;
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
    detail = `${emoji} ${o.n}`;
    payout = o.multiplier > 0 ? bet * o.multiplier : 0;
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

    return { ok: true, game, bet, payout, net: payout - bet, newBalance: result, detail, reels };
  } catch (e) {
    if (e instanceof GtGameError) return { ok: false, status: e.status, error: e.message };
    return { ok: false, status: 500, error: "Błąd serwera" };
  }
}
