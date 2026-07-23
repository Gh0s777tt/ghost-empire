// src/lib/gt-blackjack.ts
// Blackjack vs the dealer — the second STATEFUL GT game (same architecture as Mines):
// the session (bet + shuffled deck + hands) lives in Redis with a TTL, money moves
// atomically (bet charged on START, payout paid on settle AFTER an atomic GETDEL
// claims the session — a hand can never pay twice). Rules: dealer stands on 17+,
// player blackjack pays 3:2 (2.5× total), win 2×, push 1×, no splits, double on
// the first two cards (one card, auto-stand). House edge ≈ 1-2% (GT sink).
import { prisma } from "@/lib/prisma";
import { redis, withLock } from "@/lib/redis";
import { feedJackpot, MIN_BET, MAX_BET } from "@/lib/gt-games";
import { cryptoRng } from "@/lib/secure-rng";
import { randomUUID } from "node:crypto";

const TTL_S = 60 * 60;

// Cards are 0-51: rank = c % 13 (0=A, 1=2 … 9=10, 10=J, 11=Q, 12=K), suit = floor(c/13).
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export const SUITS = ["♠", "♥", "♦", "♣"] as const;

export function cardRank(c: number): number { return c % 13; }
export function cardLabel(c: number): string { return `${SUITS[Math.floor(c / 13)]}${RANKS[c % 13]}`; }

/** Best blackjack hand value (aces count 11 when they fit). */
export function handValue(cards: number[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = cardRank(c);
    if (r === 0) { aces++; total += 11; }
    else total += Math.min(r + 1, 10);
  }
  let soft = aces > 0;
  while (total > 21 && aces > 0) { total -= 10; aces--; soft = aces > 0; }
  return { total, soft };
}

export function isBlackjack(cards: number[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

/** Dealer draws to 17+ (stands on any 17). Returns the final dealer hand. */
export function dealerPlay(dealer: number[], deck: number[]): number[] {
  const hand = [...dealer];
  while (handValue(hand).total < 17 && deck.length > 0) hand.push(deck.pop() as number);
  return hand;
}

/** Payout multiplier vs the bet: blackjack 2.5, win 2, push 1, lose 0. */
export function settleMultiplier(player: number[], dealerFinal: number[]): number {
  const p = handValue(player).total;
  if (p > 21) return 0;
  const d = handValue(dealerFinal).total;
  const pBj = isBlackjack(player);
  const dBj = isBlackjack(dealerFinal);
  if (pBj && dBj) return 1;
  if (pBj) return 2.5;
  if (dBj) return 0;
  if (d > 21) return 2;
  if (p > d) return 2;
  if (p === d) return 1;
  return 0;
}

function shuffledDeck(rng: () => number = Math.random): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}

type BjSession = { bet: number; deck: number[]; player: number[]; dealer: number[]; doubled: boolean };
const sk = (userId: string, id: string) => `bj:${userId}:${id}`;

async function grantCasino(userId: string): Promise<void> {
  try { const { checkAndGrantAchievements } = await import("@/lib/achievements"); await checkAndGrantAchievements({ userId, triggerType: "casino_plays" }); } catch { /* best-effort */ }
}

export type BjState = {
  sessionId: string;
  player: number[];
  dealer: number[];        // during play: only the up-card; on settle: full hand
  playerTotal: number;
  dealerTotal: number | null;
  status: "active" | "done";
  result?: { multiplier: number; payout: number; net: number; newBalance: number };
  doubled: boolean;
  canDouble: boolean;
};
export type BjResult = { ok: true; state: BjState } | { ok: false; status: number; error: string };

/** Pay out + log + return fresh balance (session must already be claimed/removed). */
async function settle(userId: string, s: BjSession, dealerFinal: number[]): Promise<{ payout: number; net: number; newBalance: number; multiplier: number }> {
  const multiplier = settleMultiplier(s.player, dealerFinal);
  const payout = Math.floor(s.bet * multiplier);
  const p = handValue(s.player).total;
  const d = handValue(dealerFinal).total;
  const tag = multiplier === 2.5 ? "BJ! ✅" : multiplier === 2 ? "✅" : multiplier === 1 ? "🤝" : "❌";
  const newBalance = await prisma.$transaction(async (tx) => {
    if (payout > 0) {
      await tx.user.update({ where: { id: userId }, data: { chips: { increment: payout } } });
      await tx.transaction.create({ data: { userId, type: "earn", amount: payout, reason: "gtgame:blackjack:win", currency: "CHIPS", status: "completed" } });
    }
    await tx.gtGamePlay.create({ data: { userId, game: "blackjack", bet: s.bet, payout, net: payout - s.bet, detail: `🃏 ${p} vs ${d} ${tag}`.slice(0, 80) } });
    const u = await tx.user.findUnique({ where: { id: userId }, select: { chips: true } });
    return u?.chips ?? 0;
  });
  void grantCasino(userId);
  return { payout, net: payout - s.bet, newBalance, multiplier };
}

const activeState = (id: string, s: BjSession): BjState => ({
  sessionId: id,
  player: s.player,
  dealer: [s.dealer[0]], // hole card stays hidden
  playerTotal: handValue(s.player).total,
  dealerTotal: null,
  status: "active",
  doubled: s.doubled,
  canDouble: s.player.length === 2 && !s.doubled,
});

const doneState = (id: string, s: BjSession, dealerFinal: number[], r: { multiplier: number; payout: number; net: number; newBalance: number }): BjState => ({
  sessionId: id,
  player: s.player,
  dealer: dealerFinal,
  playerTotal: handValue(s.player).total,
  dealerTotal: handValue(dealerFinal).total,
  status: "done",
  result: r,
  doubled: s.doubled,
  canDouble: false,
});

/** Charge the bet, deal the hand. Instant blackjacks settle immediately. */
export async function blackjackStart(userId: string, bet: number): Promise<BjResult & { newBalance?: number }> {
  if (!Number.isInteger(bet) || bet < MIN_BET || bet > MAX_BET) return { ok: false, status: 400, error: `Stawka musi być ${MIN_BET}-${MAX_BET} żetonów` };
  if (!redis) return { ok: false, status: 503, error: "Gra chwilowo niedostępna" };

  let newBalance: number;
  try {
    newBalance = await prisma.$transaction(async (tx) => {
      const charged = await tx.user.updateMany({ where: { id: userId, chips: { gte: bet } }, data: { chips: { decrement: bet } } });
      if (charged.count === 0) throw new Error("INSUFFICIENT");
      await tx.transaction.create({ data: { userId, type: "spend", amount: -bet, reason: "gtgame:blackjack", currency: "CHIPS", status: "completed" } });
      const u = await tx.user.findUnique({ where: { id: userId }, select: { chips: true } });
      return u?.chips ?? 0;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT") return { ok: false, status: 402, error: "Za mało żetonów" };
    return { ok: false, status: 500, error: "Błąd serwera" };
  }

  const deck = shuffledDeck(cryptoRng);
  const player = [deck.pop() as number, deck.pop() as number];
  const dealer = [deck.pop() as number, deck.pop() as number];
  const s: BjSession = { bet, deck, player, dealer, doubled: false };
  const id = randomUUID();

  // Natural blackjack (either side with player 21) settles instantly — no session stored.
  if (isBlackjack(player) || isBlackjack(dealer)) {
    const r = await settle(userId, s, dealer);
    return { ok: true, state: doneState(id, s, dealer, r), newBalance: r.newBalance };
  }

  try {
    await redis.set(sk(userId, id), s, { ex: TTL_S });
  } catch {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { chips: { increment: bet } } });
      await tx.transaction.create({ data: { userId, type: "earn", amount: bet, reason: "gtgame:blackjack:refund", currency: "CHIPS", status: "completed" } });
    }).catch(() => { /* refund best-effort */ });
    return { ok: false, status: 503, error: "Gra chwilowo niedostępna" };
  }
  return { ok: true, state: activeState(id, s), newBalance };
}

/** Draw one card. Bust settles immediately; 21 auto-stands. */
export async function blackjackHit(userId: string, sessionId: string): Promise<BjResult> {
  const rc = redis;
  if (!rc) return { ok: false, status: 503, error: "Gra niedostępna" };
  const k = sk(userId, sessionId);
  // Serialize hit/stand/double on this session so two concurrent moves can't each
  // mutate their own copy and overwrite each other (or settle on a stale hand). #audit-v2
  const locked = await withLock(`lock:${k}`, 5_000, async (): Promise<BjResult> => {
    const s = await rc.get<BjSession>(k);
    if (!s) return { ok: false, status: 404, error: "Sesja wygasła" };

    s.player.push(s.deck.pop() as number);
    const total = handValue(s.player).total;

    if (total > 21) {
      const claimed = await rc.getdel<BjSession>(k); // claim before paying out (= logging the loss)
      if (!claimed) return { ok: false, status: 404, error: "Sesja wygasła lub zakończona" };
      const r = await settle(userId, s, s.dealer);
      return { ok: true, state: doneState(sessionId, s, s.dealer, r) };
    }
    if (total === 21) return blackjackStandWith(userId, sessionId, s, k);

    await rc.set(k, s, { ex: TTL_S });
    return { ok: true, state: activeState(sessionId, s) };
  });
  return locked.ok ? locked.value : { ok: false, status: 409, error: "Poczekaj chwilę" };
}

async function blackjackStandWith(userId: string, sessionId: string, s: BjSession, k: string): Promise<BjResult> {
  const claimed = await redis!.getdel<BjSession>(k);
  if (!claimed) return { ok: false, status: 404, error: "Sesja wygasła lub zakończona" };
  // `s` may hold a fresher hand than the stored copy (hit→21 path) — settle on `s`.
  const dealerFinal = dealerPlay(s.dealer, s.deck);
  const r = await settle(userId, s, dealerFinal);
  return { ok: true, state: doneState(sessionId, s, dealerFinal, r) };
}

/** Stand: dealer draws to 17+, hand settles. */
export async function blackjackStand(userId: string, sessionId: string): Promise<BjResult> {
  const rc = redis;
  if (!rc) return { ok: false, status: 503, error: "Gra niedostępna" };
  const k = sk(userId, sessionId);
  const locked = await withLock(`lock:${k}`, 5_000, async (): Promise<BjResult> => {
    const s = await rc.get<BjSession>(k);
    if (!s) return { ok: false, status: 404, error: "Sesja wygasła" };
    return blackjackStandWith(userId, sessionId, s, k);
  });
  return locked.ok ? locked.value : { ok: false, status: 409, error: "Poczekaj chwilę" };
}

/** Double: only on the first two cards — charges another bet, draws ONE card, auto-stands. */
export async function blackjackDouble(userId: string, sessionId: string): Promise<BjResult> {
  const rc = redis;
  if (!rc) return { ok: false, status: 503, error: "Gra niedostępna" };
  const k = sk(userId, sessionId);
  // Under the lock the second-bet charge can't race a concurrent double: the loser
  // sees the already-claimed/mutated session and bails WITHOUT charging. #audit-v2
  const locked = await withLock(`lock:${k}`, 5_000, async (): Promise<BjResult> => {
    const s = await rc.get<BjSession>(k);
    if (!s) return { ok: false, status: 404, error: "Sesja wygasła" };
    if (s.player.length !== 2 || s.doubled) return { ok: false, status: 400, error: "Podwojenie możliwe tylko na starcie" };

    try {
      await prisma.$transaction(async (tx) => {
        const charged = await tx.user.updateMany({ where: { id: userId, chips: { gte: s.bet } }, data: { chips: { decrement: s.bet } } });
        if (charged.count === 0) throw new Error("INSUFFICIENT");
        await tx.transaction.create({ data: { userId, type: "spend", amount: -s.bet, reason: "gtgame:blackjack", currency: "CHIPS", status: "completed" } });
      });
    } catch (e) {
      if (e instanceof Error && e.message === "INSUFFICIENT") return { ok: false, status: 402, error: "Za mało żetonów na podwojenie" };
      return { ok: false, status: 500, error: "Błąd serwera" };
    }
    void feedJackpot(s.bet).catch(() => {}); // the doubled portion feeds the pool too

    s.bet *= 2;
    s.doubled = true;
    s.player.push(s.deck.pop() as number);
    if (handValue(s.player).total > 21) {
      const claimed = await rc.getdel<BjSession>(k);
      if (!claimed) return { ok: false, status: 404, error: "Sesja wygasła lub zakończona" };
      const r = await settle(userId, s, s.dealer);
      return { ok: true, state: doneState(sessionId, s, s.dealer, r) };
    }
    return blackjackStandWith(userId, sessionId, s, k);
  });
  return locked.ok ? locked.value : { ok: false, status: 409, error: "Poczekaj chwilę" };
}
