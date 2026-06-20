// src/lib/gt-hilo.ts
// Hi-Lo — the third STATEFUL GT game (same architecture as Mines/Blackjack): you see a
// card and guess whether the next one is HIGHER or LOWER (by rank, A low, K high).
// Each correct guess multiplies the pot by (1−edge)/P(guess); a tie or a wrong guess
// loses everything; cash out any time. Cards are drawn rank-uniform (infinite deck) so
// the odds are exactly P(higher)=(13−r)/13, P(lower)=(r−1)/13 — clean and provable.
import { prisma } from "@/lib/prisma";
import { redis, withLock } from "@/lib/redis";
import { MIN_BET, MAX_BET } from "@/lib/gt-games";
import { randomUUID } from "node:crypto";

const TTL_S = 60 * 60;
export const HILO_EDGE = 0.05;
export const HILO_MAX_MULT = 100;

export const HILO_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

/** Draw a card: rank 1-13 (uniform), suit 0-3 (cosmetic only). */
export function drawCard(rng: () => number = Math.random): { rank: number; suit: number } {
  return { rank: 1 + Math.floor(rng() * 13), suit: Math.floor(rng() * 4) };
}

/** Win chance for a guess from rank r (1-13). Ties lose, so K-higher / A-lower = 0. */
export function hiloChance(rank: number, guess: "hi" | "lo"): number {
  return guess === "hi" ? (13 - rank) / 13 : (rank - 1) / 13;
}

/** Multiplier applied to the pot on a correct guess ((1−edge)/P, capped later). */
export function hiloStepMultiplier(rank: number, guess: "hi" | "lo"): number {
  const p = hiloChance(rank, guess);
  return p > 0 ? (1 - HILO_EDGE) / p : 0;
}

type HiloSession = { bet: number; mult: number; card: { rank: number; suit: number }; steps: number };
const sk = (userId: string, id: string) => `hilo:${userId}:${id}`;

async function grantCasino(userId: string): Promise<void> {
  try { const { checkAndGrantAchievements } = await import("@/lib/achievements"); await checkAndGrantAchievements({ userId, triggerType: "casino_plays" }); } catch { /* best-effort */ }
}

export type HiloState = {
  sessionId: string;
  card: { rank: number; suit: number };
  prevCard?: { rank: number; suit: number };
  multiplier: number;
  steps: number;
  potential: number; // current cash-out value
  status: "active" | "busted" | "cashed";
  payout?: number;
  net?: number;
  newBalance?: number;
};
export type HiloResult = { ok: true; state: HiloState } | { ok: false; status: number; error: string };

/** Charge the bet and deal the first card. */
export async function hiloStart(userId: string, bet: number): Promise<HiloResult> {
  if (!Number.isInteger(bet) || bet < MIN_BET || bet > MAX_BET) return { ok: false, status: 400, error: `Stawka musi być ${MIN_BET}-${MAX_BET} GT` };
  if (!redis) return { ok: false, status: 503, error: "Gra chwilowo niedostępna" };

  let newBalance: number;
  try {
    newBalance = await prisma.$transaction(async (tx) => {
      const charged = await tx.user.updateMany({ where: { id: userId, tokens: { gte: bet } }, data: { tokens: { decrement: bet }, totalSpent: { increment: bet } } });
      if (charged.count === 0) throw new Error("INSUFFICIENT");
      await tx.transaction.create({ data: { userId, type: "spend", amount: -bet, reason: "gtgame:hilo", status: "completed" } });
      const u = await tx.user.findUnique({ where: { id: userId }, select: { tokens: true } });
      return u?.tokens ?? 0;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT") return { ok: false, status: 402, error: "Za mało Ghost Tokens" };
    return { ok: false, status: 500, error: "Błąd serwera" };
  }

  const s: HiloSession = { bet, mult: 1, card: drawCard(), steps: 0 };
  const id = randomUUID();
  try {
    await redis.set(sk(userId, id), s, { ex: TTL_S });
  } catch {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { tokens: { increment: bet }, totalSpent: { decrement: bet } } });
      await tx.transaction.create({ data: { userId, type: "earn", amount: bet, reason: "gtgame:hilo:refund", status: "completed" } });
    }).catch(() => { /* refund best-effort */ });
    return { ok: false, status: 503, error: "Gra chwilowo niedostępna" };
  }
  return { ok: true, state: { sessionId: id, card: s.card, multiplier: 1, steps: 0, potential: bet, status: "active", newBalance } };
}

/** Guess hi/lo: correct multiplies the pot, wrong/tie busts (bet already lost). */
export async function hiloGuess(userId: string, sessionId: string, guess: "hi" | "lo"): Promise<HiloResult> {
  const r = redis;
  if (!r) return { ok: false, status: 503, error: "Gra niedostępna" };
  if (guess !== "hi" && guess !== "lo") return { ok: false, status: 400, error: "Wybierz: wyżej / niżej" };
  const k = sk(userId, sessionId);
  // Serialize guesses on this session: without the lock two concurrent guesses could
  // interleave so a winning `set` overwrites a losing `del`, keeping the favorable draw
  // and erasing the loss. #audit-v2
  const locked = await withLock(`lock:${k}`, 5_000, async (): Promise<HiloResult> => {
    const s = await r.get<HiloSession>(k);
    if (!s) return { ok: false, status: 404, error: "Sesja wygasła" };

    const step = hiloStepMultiplier(s.card.rank, guess);
    if (step === 0) return { ok: false, status: 400, error: "Ten kierunek jest niemożliwy" }; // K-hi / A-lo

    const next = drawCard();
    const won = guess === "hi" ? next.rank > s.card.rank : next.rank < s.card.rank;

    if (!won) {
      await r.del(k);
      await prisma.gtGamePlay.create({ data: { userId, game: "hilo", bet: s.bet, payout: 0, net: -s.bet, detail: `🂠 bust po ${s.steps} trafieniach (${HILO_RANKS[s.card.rank - 1]}→${HILO_RANKS[next.rank - 1]})`.slice(0, 80) } }).catch(() => {});
      void grantCasino(userId);
      return { ok: true, state: { sessionId, card: next, prevCard: s.card, multiplier: 0, steps: s.steps, potential: 0, status: "busted" } };
    }

    const prev = s.card;
    s.card = next;
    s.steps += 1;
    s.mult = Math.min(HILO_MAX_MULT, s.mult * step);
    await r.set(k, s, { ex: TTL_S });
    return { ok: true, state: { sessionId, card: next, prevCard: prev, multiplier: s.mult, steps: s.steps, potential: Math.floor(s.bet * s.mult), status: "active" } };
  });
  return locked.ok ? locked.value : { ok: false, status: 409, error: "Poczekaj chwilę" };
}

/** Cash out (atomic GETDEL → can never pay twice). Requires at least one correct guess. */
export async function hiloCashout(userId: string, sessionId: string): Promise<HiloResult> {
  if (!redis) return { ok: false, status: 503, error: "Gra niedostępna" };
  const s = await redis.getdel<HiloSession>(sk(userId, sessionId));
  if (!s) return { ok: false, status: 404, error: "Sesja wygasła lub zakończona" };
  if (s.steps === 0) {
    // nothing won yet — put the session back instead of refunding silently
    try { await redis.set(sk(userId, sessionId), s, { ex: TTL_S }); } catch { /* ignore */ }
    return { ok: false, status: 400, error: "Najpierw zgadnij przynajmniej raz" };
  }

  const payout = Math.floor(s.bet * s.mult);
  let newBalance = 0;
  try {
    newBalance = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { tokens: { increment: payout }, totalEarned: { increment: payout } } });
      await tx.transaction.create({ data: { userId, type: "earn", amount: payout, reason: "gtgame:hilo:win", status: "completed" } });
      await tx.gtGamePlay.create({ data: { userId, game: "hilo", bet: s.bet, payout, net: payout - s.bet, detail: `🃏 ${s.mult.toFixed(2)}× (${s.steps} trafień)`.slice(0, 80) } });
      const u = await tx.user.findUnique({ where: { id: userId }, select: { tokens: true } });
      return u?.tokens ?? 0;
    });
  } catch {
    return { ok: false, status: 500, error: "Błąd serwera" };
  }
  void grantCasino(userId);
  return { ok: true, state: { sessionId, card: s.card, multiplier: s.mult, steps: s.steps, potential: payout, status: "cashed", payout, net: payout - s.bet, newBalance } };
}
