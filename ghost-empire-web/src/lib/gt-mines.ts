// src/lib/gt-mines.ts
// Mines ("Pole minowe") — the one STATEFUL GT game: the player reveals tiles one-by-one on a 5×5
// grid, dodging bombs; each safe reveal raises the multiplier; cash out any time. The game session
// (bet + bomb layout + revealed set) lives in Redis with a TTL — NO Prisma schema change. Money is
// handled atomically: the bet is charged on START (one $transaction); the payout is paid on CASHOUT
// (another $transaction) but ONLY after an atomic Redis GETDEL claims the session, so a session can
// never be cashed out twice. Hitting a bomb ends the session with the bet already lost.
import { prisma } from "@/lib/prisma";
import { redis, withLock } from "@/lib/redis";
import { MIN_BET, MAX_BET } from "@/lib/gt-games";
import { cryptoRng } from "@/lib/secure-rng";
import { randomUUID } from "node:crypto";

export const MINES_TILES = 25; // 5×5
export const MINES_EDGE = 0.05; // RTP ≈ 0.95 regardless of how many tiles are revealed
export const MINES_MIN_BOMBS = 1;
export const MINES_MAX_BOMBS = 10;
export const MINES_MAX_MULT = 100; // cap a runaway jackpot (keeps the GT economy sane)
const TTL_S = 60 * 60; // sessions live 1h

/** Cash-out multiplier after `revealed` safe tiles with `bombs` bombs on a `tiles`-tile grid.
 *  fair = Π (tiles−i)/(tiles−bombs−i); a single (1−edge) house factor → flat RTP ≈ 0.95. */
export function minesMultiplier(revealed: number, bombs: number, tiles = MINES_TILES): number {
  if (revealed <= 0) return 1; // break-even (client disables cash-out before the first reveal)
  let m = 1;
  for (let i = 0; i < revealed; i++) m *= (tiles - i) / (tiles - bombs - i);
  return Math.min(MINES_MAX_MULT, m * (1 - MINES_EDGE));
}

type MinesSession = { bet: number; bombs: number; bombSet: number[]; revealed: number[] };
const sk = (userId: string, id: string) => `mines:${userId}:${id}`;

/** Place `bombs` distinct bombs via a partial Fisher–Yates shuffle. */
function placeBombs(bombs: number, rng: () => number = Math.random): number[] {
  const idx = Array.from({ length: MINES_TILES }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx.slice(0, bombs).sort((a, b) => a - b);
}

async function grantCasino(userId: string): Promise<void> {
  try { const { checkAndGrantAchievements } = await import("@/lib/achievements"); await checkAndGrantAchievements({ userId, triggerType: "casino_plays" }); } catch { /* best-effort */ }
}

export type MinesStartResult = { ok: true; sessionId: string; bombs: number; tiles: number; newBalance: number } | { ok: false; status: number; error: string };

/** Charge the bet (atomic) and open a session. Refunds if the session store is unavailable. */
export async function minesStart(userId: string, bet: number, bombs: number): Promise<MinesStartResult> {
  if (!Number.isInteger(bet) || bet < MIN_BET || bet > MAX_BET) return { ok: false, status: 400, error: `Stawka musi być ${MIN_BET}-${MAX_BET} żetonów` };
  if (!Number.isInteger(bombs) || bombs < MINES_MIN_BOMBS || bombs > MINES_MAX_BOMBS) return { ok: false, status: 400, error: `Bomby: ${MINES_MIN_BOMBS}-${MINES_MAX_BOMBS}` };
  if (!redis) return { ok: false, status: 503, error: "Gra chwilowo niedostępna" };

  let newBalance: number;
  try {
    newBalance = await prisma.$transaction(async (tx) => {
      const charged = await tx.user.updateMany({ where: { id: userId, chips: { gte: bet } }, data: { chips: { decrement: bet } } });
      if (charged.count === 0) throw new Error("INSUFFICIENT");
      await tx.transaction.create({ data: { userId, type: "spend", amount: -bet, reason: "gtgame:mines", currency: "CHIPS", status: "completed" } });
      const u = await tx.user.findUnique({ where: { id: userId }, select: { chips: true } });
      return u?.chips ?? 0;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT") return { ok: false, status: 402, error: "Za mało żetonów" };
    return { ok: false, status: 500, error: "Błąd serwera" };
  }

  const id = randomUUID();
  const session: MinesSession = { bet, bombs, bombSet: placeBombs(bombs, cryptoRng), revealed: [] };
  try {
    await redis.set(sk(userId, id), session, { ex: TTL_S });
  } catch {
    // session store failed → refund so the bet is never lost without a game
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { chips: { increment: bet } } });
      await tx.transaction.create({ data: { userId, type: "earn", amount: bet, reason: "gtgame:mines:refund", currency: "CHIPS", status: "completed" } });
    }).catch(() => { /* refund best-effort */ });
    return { ok: false, status: 503, error: "Gra chwilowo niedostępna" };
  }
  return { ok: true, sessionId: id, bombs, tiles: MINES_TILES, newBalance };
}

export type MinesRevealResult = { ok: true; bomb: boolean; tile: number; revealed: number[]; multiplier: number; bombSet?: number[] } | { ok: false; status: number; error: string };

/** Reveal one tile. A bomb ends the session (bet lost); a safe tile raises the multiplier. */
export async function minesReveal(userId: string, sessionId: string, tile: number): Promise<MinesRevealResult> {
  const r = redis;
  if (!r) return { ok: false, status: 503, error: "Gra niedostępna" };
  if (!Number.isInteger(tile) || tile < 0 || tile >= MINES_TILES) return { ok: false, status: 400, error: "Nieprawidłowe pole" };
  const k = sk(userId, sessionId);
  // Serialize reveals on this session: without the lock two concurrent reveals could
  // interleave so a safe-tile `set` lands after a bomb-tile `del`, resurrecting a
  // session that should have ended (and erasing the loss). #audit-v2
  const locked = await withLock(`lock:${k}`, 5_000, async (): Promise<MinesRevealResult> => {
    const session = await r.get<MinesSession>(k);
    if (!session) return { ok: false, status: 404, error: "Sesja wygasła" };
    if (session.revealed.includes(tile)) return { ok: false, status: 400, error: "Pole już odkryte" };

    if (session.bombSet.includes(tile)) {
      await r.del(k); // end the session
      await prisma.gtGamePlay.create({ data: { userId, game: "mines", bet: session.bet, payout: 0, net: -session.bet, detail: `💣 bomba (${session.revealed.length} bezp., ${session.bombs} bomb)`.slice(0, 80) } }).catch(() => {});
      void grantCasino(userId);
      return { ok: true, bomb: true, tile, revealed: session.revealed, multiplier: 0, bombSet: session.bombSet };
    }

    session.revealed.push(tile);
    await r.set(k, session, { ex: TTL_S });
    return { ok: true, bomb: false, tile, revealed: session.revealed, multiplier: minesMultiplier(session.revealed.length, session.bombs) };
  });
  return locked.ok ? locked.value : { ok: false, status: 409, error: "Poczekaj chwilę" };
}

export type MinesCashoutResult = { ok: true; payout: number; multiplier: number; net: number; newBalance: number; bombSet: number[] } | { ok: false; status: number; error: string };

/** Cash out: an atomic Redis GETDEL claims the session (so it can never pay twice), then we pay. */
export async function minesCashout(userId: string, sessionId: string): Promise<MinesCashoutResult> {
  if (!redis) return { ok: false, status: 503, error: "Gra niedostępna" };
  const session = await redis.getdel<MinesSession>(sk(userId, sessionId));
  if (!session) return { ok: false, status: 404, error: "Sesja wygasła lub zakończona" };

  const mult = minesMultiplier(session.revealed.length, session.bombs);
  const payout = Math.floor(session.bet * mult);
  let newBalance = 0;
  try {
    newBalance = await prisma.$transaction(async (tx) => {
      if (payout > 0) {
        await tx.user.update({ where: { id: userId }, data: { chips: { increment: payout } } });
        await tx.transaction.create({ data: { userId, type: "earn", amount: payout, reason: "gtgame:mines:win", currency: "CHIPS", status: "completed" } });
      }
      await tx.gtGamePlay.create({ data: { userId, game: "mines", bet: session.bet, payout, net: payout - session.bet, detail: `💎 ${mult.toFixed(2)}× (${session.revealed.length} bezp.)`.slice(0, 80) } });
      const u = await tx.user.findUnique({ where: { id: userId }, select: { chips: true } });
      return u?.chips ?? 0;
    });
  } catch {
    return { ok: false, status: 500, error: "Błąd serwera" };
  }
  void grantCasino(userId);
  return { ok: true, payout, multiplier: mult, net: payout - session.bet, newBalance, bombSet: session.bombSet };
}
