// src/lib/duels.ts
// PvP duel orchestration: create / accept / decline. The money-critical accept path charges
// BOTH stakes and pays the winner inside one $transaction — any failure throws and rolls the
// whole transfer back, so GT can never be created or lost incorrectly. Chat handles are stored
// on the duel so result messages can @-mention correctly (handles are public platform usernames).
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { duelPayout, pickDuelWinner } from "@/lib/economy";
import { MIN_BET, MAX_BET } from "@/lib/gt-games";
import { createLogger } from "@/lib/logger";

const log = createLogger("duels");

/** Unaccepted duels expire after this long. */
export const DUEL_TTL_MS = 2 * 60_000;

const cryptoRng = () => randomInt(0, 1_000_000) / 1_000_000;
const fmt = (n: number) => n.toLocaleString("pl-PL");

export type DuelOutcome = { ok: boolean; message: string };

class DuelError extends Error {}

/** challenger issues a duel for `bet`, optionally targeting an opponent (null = open challenge). */
export async function createDuel(opts: {
  platform: string;
  challengerId: string;
  challengerName: string;
  opponentId: string | null;
  opponentName: string | null;
  bet: number;
}): Promise<DuelOutcome> {
  const { platform, challengerId, challengerName, opponentId, opponentName, bet } = opts;
  if (!Number.isInteger(bet) || bet < MIN_BET || bet > MAX_BET) {
    return { ok: false, message: `@${challengerName} stawka musi być ${fmt(MIN_BET)}-${fmt(MAX_BET)} GT.` };
  }
  if (opponentId && opponentId === challengerId) {
    return { ok: false, message: `@${challengerName} nie pojedynkujesz się sam ze sobą. 🙃` };
  }
  try {
    const now = new Date();
    const challenger = await prisma.user.findUnique({ where: { id: challengerId }, select: { tokens: true } });
    if (!challenger) return { ok: false, message: `@${challengerName} połącz konto przez !portal, by walczyć o GT.` };
    if (challenger.tokens < bet) {
      return { ok: false, message: `@${challengerName} masz za mało GT na taką stawkę (${fmt(bet)}).` };
    }
    // One open challenge per challenger at a time (anti-spam).
    const existing = await prisma.duel.findFirst({
      where: { challengerId, status: "pending", expiresAt: { gt: now } },
      select: { id: true },
    });
    if (existing) {
      return { ok: false, message: `@${challengerName} masz już otwarte wyzwanie — poczekaj na !accept albo aż wygaśnie.` };
    }
    await prisma.duel.create({
      data: {
        platform,
        challengerId,
        challengerName,
        opponentId: opponentId ?? null,
        opponentName: opponentName ?? null,
        bet,
        status: "pending",
        expiresAt: new Date(now.getTime() + DUEL_TTL_MS),
      },
    });
    return {
      ok: true,
      message: opponentId
        ? `⚔️ @${opponentName} — @${challengerName} wyzywa Cię na pojedynek o ${fmt(bet)} GT! Wpisz !accept by stanąć do walki (2 min).`
        : `⚔️ @${challengerName} szuka pojedynku o ${fmt(bet)} GT! Pierwszy z !accept staje do walki (2 min).`,
    };
  } catch (e) {
    log.error("createDuel failed", e, { challengerId });
    return { ok: false, message: `@${challengerName} coś poszło nie tak — spróbuj ponownie.` };
  }
}

/** accepter takes a pending duel targeting them (or an open one). Atomic GT transfer. */
export async function acceptDuel(opts: {
  platform: string;
  accepterId: string;
  accepterName: string;
}): Promise<DuelOutcome> {
  const { platform, accepterId, accepterName } = opts;
  try {
    const now = new Date();
    const duel = await prisma.duel.findFirst({
      where: {
        platform,
        status: "pending",
        expiresAt: { gt: now },
        challengerId: { not: accepterId },
        OR: [{ opponentId: accepterId }, { opponentId: null }],
      },
      orderBy: { createdAt: "desc" },
    });
    if (!duel) return { ok: false, message: `@${accepterName} brak wyzwania do przyjęcia.` };

    const result = await prisma.$transaction(async (tx) => {
      // Atomically CLAIM the duel (pending→resolving). updateMany takes a row
      // lock, so a second concurrent !accept (or the expiry sweep) blocks, then
      // re-evaluates the WHERE against committed data and gets count 0 — closing
      // the double-resolve TOCTOU a plain findFirst re-read can't (READ COMMITTED).
      const claim = await tx.duel.updateMany({
        where: { id: duel.id, status: "pending", expiresAt: { gt: now } },
        data: { status: "resolving" },
      });
      if (claim.count === 0) throw new DuelError("stale");
      const fresh = await tx.duel.findUnique({ where: { id: duel.id } });
      if (!fresh) throw new DuelError("stale");

      // Charge both stakes — a throw here rolls back any partial charge.
      const chargedChallenger = await tx.user.updateMany({
        where: { id: fresh.challengerId, tokens: { gte: fresh.bet } },
        data: { tokens: { decrement: fresh.bet }, totalSpent: { increment: fresh.bet } },
      });
      if (chargedChallenger.count === 0) {
        await tx.duel.update({ where: { id: fresh.id }, data: { status: "cancelled" } });
        throw new DuelError("challenger_broke");
      }
      const chargedAccepter = await tx.user.updateMany({
        where: { id: accepterId, tokens: { gte: fresh.bet } },
        data: { tokens: { decrement: fresh.bet }, totalSpent: { increment: fresh.bet } },
      });
      if (chargedAccepter.count === 0) throw new DuelError("accepter_broke");

      // Fair coinflip → winner takes the pot minus rake.
      const winnerIdx = pickDuelWinner(cryptoRng); // 0 = challenger, 1 = accepter
      const winnerId = winnerIdx === 0 ? fresh.challengerId : accepterId;
      const { winnerTakes } = duelPayout(fresh.bet);

      await tx.user.update({
        where: { id: winnerId },
        data: { tokens: { increment: winnerTakes }, totalEarned: { increment: winnerTakes } },
      });
      await tx.transaction.createMany({
        data: [
          { userId: fresh.challengerId, type: "spend", amount: -fresh.bet, reason: "duel", status: "completed" },
          { userId: accepterId, type: "spend", amount: -fresh.bet, reason: "duel", status: "completed" },
          { userId: winnerId, type: "earn", amount: winnerTakes, reason: "duel:win", status: "completed" },
        ],
      });
      await tx.duel.update({
        where: { id: fresh.id },
        data: { status: "resolved", winnerId, opponentId: accepterId, opponentName: accepterName, resolvedAt: new Date() },
      });

      return {
        winnerId,
        winnerTakes,
        bet: fresh.bet,
        challengerId: fresh.challengerId,
        challengerName: fresh.challengerName,
      };
    });

    const winnerName = result.winnerId === result.challengerId ? result.challengerName : accepterName;
    const loserName = result.winnerId === result.challengerId ? accepterName : result.challengerName;

    // Notify the winner (positive ping; the loser sees the chat line).
    await prisma.notification
      .create({
        data: {
          userId: result.winnerId,
          type: "system",
          title: "⚔️ Pojedynek wygrany!",
          message: `Pokonałeś @${loserName} i zgarnąłeś ${fmt(result.winnerTakes)} GT.`,
          icon: "🏆",
          link: "/profile",
        },
      })
      .catch(() => {});

    // Duel-win achievements — strictly best-effort AFTER the money tx committed. Guarded so a
    // post-commit throw can never turn an already-paid, successful duel into an error message
    // to the winner (the success message below is built from the committed `result`). #audit4
    const { checkAndGrantAchievements } = await import("@/lib/achievements");
    await checkAndGrantAchievements({ userId: result.winnerId, triggerType: "duels_won" }).catch(() => {});

    return {
      ok: true,
      message: `⚔️ @${result.challengerName} vs @${accepterName} o ${fmt(result.bet)} GT → 🏆 wygrywa @${winnerName} i bierze ${fmt(result.winnerTakes)} GT!`,
    };
  } catch (e) {
    if (e instanceof DuelError) {
      if (e.message === "challenger_broke") {
        return { ok: false, message: `@${accepterName} wyzywający nie ma już GT na stawkę — pojedynek odwołany.` };
      }
      if (e.message === "accepter_broke") return { ok: false, message: `@${accepterName} masz za mało GT na tę stawkę.` };
      return { ok: false, message: `@${accepterName} wyzwanie już nieaktualne.` };
    }
    log.error("acceptDuel failed", e, { accepterId });
    return { ok: false, message: `@${accepterName} coś poszło nie tak — spróbuj ponownie.` };
  }
}

/** accepter declines a duel that targets them. */
export async function declineDuel(opts: {
  platform: string;
  accepterId: string;
  accepterName: string;
}): Promise<DuelOutcome> {
  const { platform, accepterId, accepterName } = opts;
  try {
    const now = new Date();
    const duel = await prisma.duel.findFirst({
      where: { platform, status: "pending", expiresAt: { gt: now }, opponentId: accepterId },
      orderBy: { createdAt: "desc" },
    });
    if (!duel) return { ok: false, message: `@${accepterName} brak wyzwania skierowanego do Ciebie.` };
    await prisma.duel.update({ where: { id: duel.id }, data: { status: "cancelled" } });
    return { ok: true, message: `@${accepterName} odrzucił pojedynek. 🏳️` };
  } catch (e) {
    log.error("declineDuel failed", e, { accepterId });
    return { ok: false, message: `@${accepterName} coś poszło nie tak.` };
  }
}
