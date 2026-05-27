// src/lib/predictions.ts
// Wager + resolve logic. All token movements run inside a single $transaction
// so partial state on errors is impossible.
import { prisma } from "@/lib/prisma";

export const MAX_OPTIONS = 4;
export const MIN_WAGER = 10;
export const MAX_WAGER = 1_000_000;

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

  try {
    return await prisma.$transaction(async (tx) => {
      const prediction = await tx.prediction.findUnique({ where: { id: predictionId } });
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
    console.error("[predictions] placeWager failed:", e);
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

  try {
    return await prisma.$transaction(async (tx) => {
      const prediction = await tx.prediction.findUnique({
        where: { id: predictionId },
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
        await tx.prediction.update({
          where: { id: predictionId },
          data: {
            status: "resolved",
            resolvedOptionIndex: winningOptionIndex,
            resolvedAt: new Date(),
          },
        });
        return {
          ok: true,
          winnersCount: 0,
          losersCount: prediction.entries.length,
          potDistributed: totalPot,
          refunded: true,
        } as const;
      }

      // Normal payout — each winner gets (their stake / winnersStakeSum) * totalPot
      // Use Math.floor + track remainder so we never overpay vs totalPot.
      let distributed = 0;
      for (let i = 0; i < winners.length; i++) {
        const e = winners[i];
        const share = (e.tokensWagered / winnersStakeSum) * totalPot;
        // Last winner gets whatever's left to avoid rounding loss
        const payout = i === winners.length - 1 ? totalPot - distributed : Math.floor(share);
        distributed += payout;

        await tx.user.update({
          where: { id: e.userId },
          data: { tokens: { increment: payout }, totalEarned: { increment: payout } },
        });
        await tx.predictionEntry.update({ where: { id: e.id }, data: { payout } });
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

      await tx.prediction.update({
        where: { id: predictionId },
        data: {
          status: "resolved",
          resolvedOptionIndex: winningOptionIndex,
          resolvedAt: new Date(),
        },
      });

      return {
        ok: true,
        winnersCount: winners.length,
        losersCount: losers.length,
        potDistributed: distributed,
        refunded: false,
      } as const;
    });
  } catch (e) {
    console.error("[predictions] resolve failed:", e);
    return { ok: false, status: 500, error: "Błąd serwera" };
  }
}

/** Cancel an open prediction and refund all wagers. */
export async function cancelPrediction(predictionId: string): Promise<{ ok: true; refunded: number } | { ok: false; status: number; error: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const prediction = await tx.prediction.findUnique({
        where: { id: predictionId },
        include: { entries: true },
      });
      if (!prediction) return { ok: false, status: 404, error: "Nie znaleziono" } as const;
      if (prediction.status === "resolved" || prediction.status === "cancelled") {
        return { ok: false, status: 409, error: "Już zamknięty" } as const;
      }

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

      await tx.prediction.update({
        where: { id: predictionId },
        data: { status: "cancelled", resolvedAt: new Date() },
      });

      return { ok: true, refunded: prediction.entries.length } as const;
    });
  } catch (e) {
    console.error("[predictions] cancel failed:", e);
    return { ok: false, status: 500, error: "Błąd serwera" };
  }
}
