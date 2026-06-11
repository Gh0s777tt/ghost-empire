// src/lib/predictions.ts
// Wager + resolve logic. All token movements run inside a single $transaction
// so partial state on errors is impossible.
import { prisma } from "@/lib/prisma";
import { awardSeasonXp } from "@/lib/seasons";
import { computePayouts } from "@/lib/economy";
import { currentTenantId } from "@/lib/tenant";
import { createLogger } from "@/lib/logger";

const log = createLogger("predictions");

export const MAX_OPTIONS = 4;
export const MIN_WAGER = 10;
export const MAX_WAGER = 1_000_000;

/**
 * Auto-close: flip any still-"open" prediction whose `closesAt` has passed to
 * "locked", so the public page / overlay status matches the wager-blocking that
 * placeWager already enforces. Idempotent, cheap (single conditional updateMany);
 * call it at the start of prediction read paths. Returns how many were locked.
 *
 * `tenantId`: pass the request-scoped tid from SSE producers (a tick runs OUTSIDE
 * request scope, so currentTenantId() would mis-resolve there); omit elsewhere.
 */
const lastLockSweep = new Map<string, number>();
const LOCK_SWEEP_MS = 60_000;

export async function lockExpiredPredictions(tenantId?: string | null, now: Date = new Date()): Promise<number> {
  const tid = tenantId === undefined ? await currentTenantId() : tenantId;
  // Throttle: the overlay producer calls this every ~4s per OBS source. Locking
  // is not time-critical (placeWager already rejects late wagers), so sweep at
  // most once/min per tenant instead of writing on every tick.
  const key = tid ?? "default";
  const ms = now.getTime();
  if (ms - (lastLockSweep.get(key) ?? 0) < LOCK_SWEEP_MS) return 0;
  lastLockSweep.set(key, ms);
  const res = await prisma.prediction.updateMany({
    where: { status: "open", closesAt: { not: null, lt: now }, ...(tid ? { tenantId: tid } : {}) },
    data: { status: "locked" },
  });
  return res.count;
}

export type WagerResult =
  | { ok: true; newBalance: number; entry: { optionIndex: number; tokensWagered: number } }
  | { ok: false; status: number; error: string };

/**
 * User places a wager on a prediction option.
 * - Deducts tokens from user (must have enough)
 * - Creates PredictionEntry (unique per (predictionId, userId) — second call fails 409)
 * - Bumps Prediction.totalPot
 */
export async function placeWager(opts: {
  userId: string;
  predictionId: string;
  optionIndex: number;
  tokensWagered: number;
}): Promise<WagerResult> {
  const { userId, predictionId, optionIndex, tokensWagered } = opts;

  if (!Number.isInteger(tokensWagered) || tokensWagered < MIN_WAGER || tokensWagered > MAX_WAGER) {
    return { ok: false, status: 400, error: `Stawka musi być ${MIN_WAGER}-${MAX_WAGER} GT` };
  }
  if (!Number.isInteger(optionIndex) || optionIndex < 0) {
    return { ok: false, status: 400, error: "Niepoprawna opcja" };
  }

  const tid = await currentTenantId();
  try {
    return await prisma.$transaction(async (tx) => {
      const prediction = await tx.prediction.findFirst({ where: { id: predictionId, ...(tid ? { tenantId: tid } : {}) } });
      if (!prediction) {
        return { ok: false, status: 404, error: "Zakład nie istnieje" } as const;
      }
      if (prediction.status !== "open") {
        return { ok: false, status: 409, error: "Zakład jest już zamknięty" } as const;
      }
      if (prediction.closesAt && prediction.closesAt < new Date()) {
        return { ok: false, status: 409, error: "Czas obstawiania minął" } as const;
      }
      if (optionIndex >= prediction.options.length) {
        return { ok: false, status: 400, error: "Opcja poza zakresem" } as const;
      }

      // Atomic conditional decrement — only succeeds if user has enough tokens
      const userUpdate = await tx.user.updateMany({
        where: { id: userId, tokens: { gte: tokensWagered } },
        data: { tokens: { decrement: tokensWagered } },
      });
      if (userUpdate.count === 0) {
        return { ok: false, status: 402, error: "Za mało Ghost Tokens" } as const;
      }

      // Unique constraint catches second wager attempt
      try {
        await tx.predictionEntry.create({
          data: { predictionId, userId, optionIndex, tokensWagered },
        });
      } catch (e: unknown) {
        if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
          // Refund — atomic conflict
          await tx.user.update({ where: { id: userId }, data: { tokens: { increment: tokensWagered } } });
          return { ok: false, status: 409, error: "Już obstawiłeś ten zakład" } as const;
        }
        throw e;
      }

      await tx.prediction.update({
        where: { id: predictionId },
        data: { totalPot: { increment: tokensWagered } },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: "spend",
          amount: -tokensWagered,
          reason: `prediction_wager:${predictionId}:opt${optionIndex}`,
          status: "completed",
        },
      });

      const fresh = await tx.user.findUnique({ where: { id: userId }, select: { tokens: true } });

      return {
        ok: true,
        newBalance: fresh?.tokens ?? 0,
        entry: { optionIndex, tokensWagered },
      } as const;
    });
  } catch (e) {
    log.error("placeWager failed", e);
    return { ok: false, status: 500, error: "Błąd serwera" };
  }
}

export type ResolveResult =
  | { ok: true; winnersCount: number; losersCount: number; potDistributed: number; refunded: boolean }
  | { ok: false; status: number; error: string };

/**
 * Resolve a prediction — set the winning option and pay out the pot to winners.
 *
 * Payout: winners receive proportional share of TOTAL pot (including losers' tokens),
 * based on their fraction of winning-option wagers. Original stake stays absorbed
 * (already deducted) so net gain = payout - original wager.
 *
 * Edge case — no winners (winning option had 0 wagers): refund everyone their stake.
 */
export async function resolvePrediction(opts: {
  predictionId: string;
  winningOptionIndex: number;
}): Promise<ResolveResult> {
  const { predictionId, winningOptionIndex } = opts;
  const winnerUserIds: string[] = [];  // collected for post-commit season XP

  const tid = await currentTenantId();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const prediction = await tx.prediction.findFirst({
        where: { id: predictionId, ...(tid ? { tenantId: tid } : {}) },
        include: { entries: true },
      });
      if (!prediction) return { ok: false, status: 404, error: "Nie znaleziono" } as const;
      if (prediction.status === "resolved") {
        return { ok: false, status: 409, error: "Już rozstrzygnięty" } as const;
      }
      if (prediction.status === "cancelled") {
        return { ok: false, status: 409, error: "Anulowany" } as const;
      }
      if (winningOptionIndex < 0 || winningOptionIndex >= prediction.options.length) {
        return { ok: false, status: 400, error: "Niepoprawny indeks opcji" } as const;
      }

      // Atomically CLAIM the prediction here (not via the unguarded update at the
      // end): updateMany row-locks, so a second concurrent resolve/cancel sees
      // count 0 and bails — no double payout. Also stamps the final result fields.
      const claim = await tx.prediction.updateMany({
        where: { id: predictionId, status: { notIn: ["resolved", "cancelled"] }, ...(tid ? { tenantId: tid } : {}) },
        data: { status: "resolved", resolvedOptionIndex: winningOptionIndex, resolvedAt: new Date() },
      });
      if (claim.count === 0) return { ok: false, status: 409, error: "Już rozstrzygnięty" } as const;

      const winners = prediction.entries.filter((e) => e.optionIndex === winningOptionIndex);
      const losers = prediction.entries.filter((e) => e.optionIndex !== winningOptionIndex);
      const totalPot = prediction.totalPot;
      const winnersStakeSum = winners.reduce((s, e) => s + e.tokensWagered, 0);

      // No winners → refund everyone
      if (winners.length === 0 || winnersStakeSum === 0) {
        for (const e of prediction.entries) {
          await tx.user.update({
            where: { id: e.userId },
            data: { tokens: { increment: e.tokensWagered }, totalEarned: { increment: e.tokensWagered } },
          });
          await tx.predictionEntry.update({
            where: { id: e.id },
            data: { payout: e.tokensWagered },
          });
          await tx.transaction.create({
            data: {
              userId: e.userId,
              type: "earn",
              amount: e.tokensWagered,
              reason: `prediction_refund:${predictionId}`,
              status: "completed",
            },
          });
          await tx.notification.create({
            data: {
              userId: e.userId,
              type: "system",
              title: "Zakład anulowany — zwrot stawki",
              message: `Brak zwycięskich obstawień. Zwrócone: ${e.tokensWagered.toLocaleString("pl-PL")} GT.`,
              icon: "↩️",
              link: "/predictions",
            },
          });
        }
        // Status already set by the atomic claim above.
        return {
          ok: true,
          winnersCount: 0,
          losersCount: prediction.entries.length,
          potDistributed: totalPot,
          refunded: true,
        } as const;
      }

      // Proportional split of the whole pot among winners. Pure math extracted to
      // economy.ts (computePayouts) so it's unit-tested: floor each share, last
      // winner absorbs the remainder so the sum is exactly totalPot.
      const payouts = computePayouts(winners.map((w) => w.tokensWagered), totalPot);
      let distributed = 0;
      for (let i = 0; i < winners.length; i++) {
        const e = winners[i];
        const payout = payouts[i];
        distributed += payout;

        await tx.user.update({
          where: { id: e.userId },
          data: { tokens: { increment: payout }, totalEarned: { increment: payout } },
        });
        await tx.predictionEntry.update({ where: { id: e.id }, data: { payout } });
        winnerUserIds.push(e.userId);
        await tx.transaction.create({
          data: {
            userId: e.userId,
            type: "earn",
            amount: payout,
            reason: `prediction_win:${predictionId}`,
            status: "completed",
          },
        });
        await tx.notification.create({
          data: {
            userId: e.userId,
            type: "system",
            title: `🎉 Wygrałeś zakład!`,
            message: `+${payout.toLocaleString("pl-PL")} GT (stawka: ${e.tokensWagered.toLocaleString("pl-PL")} GT).`,
            icon: "🎲",
            link: "/predictions",
          },
        });
      }

      // Loser notifications (no token movement — already deducted at wager time)
      for (const e of losers) {
        await tx.notification.create({
          data: {
            userId: e.userId,
            type: "system",
            title: "Niestety, ten zakład nie wygrał",
            message: `Przegrana stawka: ${e.tokensWagered.toLocaleString("pl-PL")} GT. Wygrywająca opcja: "${prediction.options[winningOptionIndex]}".`,
            icon: "😔",
            link: "/predictions",
          },
        });
      }

      // Status already set by the atomic claim above.
      return {
        ok: true,
        winnersCount: winners.length,
        losersCount: losers.length,
        potDistributed: distributed,
        refunded: false,
      } as const;
    });

    // Award season XP to winners AFTER the transaction commits (awardSeasonXp uses its own queries)
    if (result.ok && winnerUserIds.length > 0) {
      for (const uid of winnerUserIds) {
        await awardSeasonXp(uid, "prediction_win");
      }
    }

    return result;
  } catch (e) {
    log.error("resolve failed", e);
    return { ok: false, status: 500, error: "Błąd serwera" };
  }
}

/** Cancel an open prediction and refund all wagers. */
export async function cancelPrediction(predictionId: string): Promise<{ ok: true; refunded: number } | { ok: false; status: number; error: string }> {
  const tid = await currentTenantId();
  try {
    return await prisma.$transaction(async (tx) => {
      const prediction = await tx.prediction.findFirst({
        where: { id: predictionId, ...(tid ? { tenantId: tid } : {}) },
        include: { entries: true },
      });
      if (!prediction) return { ok: false, status: 404, error: "Nie znaleziono" } as const;
      if (prediction.status === "resolved" || prediction.status === "cancelled") {
        return { ok: false, status: 409, error: "Już zamknięty" } as const;
      }

      // Atomically CLAIM (→cancelled) before refunding — row lock stops a
      // concurrent resolve/cancel from double-refunding the same wagers.
      const claim = await tx.prediction.updateMany({
        where: { id: predictionId, status: { notIn: ["resolved", "cancelled"] }, ...(tid ? { tenantId: tid } : {}) },
        data: { status: "cancelled", resolvedAt: new Date() },
      });
      if (claim.count === 0) return { ok: false, status: 409, error: "Już zamknięty" } as const;

      for (const e of prediction.entries) {
        await tx.user.update({
          where: { id: e.userId },
          data: { tokens: { increment: e.tokensWagered }, totalEarned: { increment: e.tokensWagered } },
        });
        await tx.transaction.create({
          data: {
            userId: e.userId,
            type: "earn",
            amount: e.tokensWagered,
            reason: `prediction_cancel:${predictionId}`,
            status: "completed",
          },
        });
        await tx.notification.create({
          data: {
            userId: e.userId,
            type: "system",
            title: "Zakład anulowany",
            message: `Stawka zwrócona: ${e.tokensWagered.toLocaleString("pl-PL")} GT.`,
            icon: "↩️",
            link: "/predictions",
          },
        });
      }

      // Status already set by the atomic claim above.
      return { ok: true, refunded: prediction.entries.length } as const;
    });
  } catch (e) {
    log.error("cancel failed", e);
    return { ok: false, status: 500, error: "Błąd serwera" };
  }
}
