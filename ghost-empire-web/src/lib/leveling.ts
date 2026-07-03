// src/lib/leveling.ts
// Lifetime account leveling. XP accrues from the same activity that grants Battle
// Pass XP (hooked via awardSeasonXp), but the account level NEVER resets. On a
// level-up the user gets a GT bonus, a notification and a stream alert.
import { prisma } from "@/lib/prisma";
import { levelFromXp } from "@/lib/utils";
import { MAX_LEVEL, prestigeFromXp } from "@/lib/economy";
import { dispatchAlertSafe } from "@/lib/alerts";
import { createLogger } from "@/lib/logger";

const log = createLogger("leveling");

/** Account level for a lifetime XP total, capped at MAX_LEVEL. */
function levelFor(xp: number): number {
  return Math.min(MAX_LEVEL, levelFromXp(xp));
}

/** GT reward granted when reaching `level`. */
function levelUpReward(level: number): number {
  return 50 * level;
}

/** Chunky one-time GT reward granted when reaching a prestige star. */
function prestigeUpReward(prestige: number): number {
  return 5000 * prestige;
}

/**
 * Add lifetime XP to a user; recompute level + prestige; on a level-up OR prestige-up
 * grant GT + notify + alert. Prestige stars accrue from XP earned past the level cap
 * (see prestigeFromXp) — the level itself never resets. Below the cap, level-ups and
 * prestige-ups are mutually exclusive (you only prestige once level is maxed), but the
 * math sums every star/level crossed so a single huge award is still handled correctly.
 * Best-effort and atomic on the XP/level/prestige/token writes. Never throws.
 */
export async function awardAccountXp(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  try {
    // Lock the user row so concurrent XP awards serialize (read→compute→write) — the old
    // read-then-SET of absolute xp clobbered concurrent awards on the hot chat-award path
    // (ended at X+max(a,b), not X+a+b). The alert + achievements run AFTER commit. #audit-v2
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`;
      const before = await tx.user.findUnique({
        where: { id: userId },
        select: { xp: true, level: true, prestige: true, username: true, displayName: true, image: true, referredById: true },
      });
      if (!before) return null;

      const newXp = before.xp + amount;
      const newLevel = levelFor(newXp);
      const newPrestige = prestigeFromXp(newXp);
      const leveledUp = newLevel > before.level;
      const prestigedUp = newPrestige > before.prestige;

      if (!leveledUp && !prestigedUp) {
        await tx.user.update({ where: { id: userId }, data: { xp: newXp } });
        return null; // nothing to announce
      }

      // Sum the rewards for every level and prestige star crossed (handles big jumps).
      let bonus = 0;
      for (let l = before.level + 1; l <= newLevel; l++) bonus += levelUpReward(l);
      for (let p = before.prestige + 1; p <= newPrestige; p++) bonus += prestigeUpReward(p);

      // Ongoing referral (#788/B6, conservative): the referrer earns a small, TAPERING cut of
      // their referee's level-up GT — only the level portion (never the huge prestige rewards) and
      // only for the referee's first 20 levels. Bounded (~1k GT total per referee over its whole
      // early growth) so it stays a non-inflationary growth incentive, not an open faucet. Credited
      // AFTER commit (best-effort, its own row lock) so it can never delay/undo the level-up.
      let referrerCut = 0;
      if (before.referredById && before.referredById !== userId) {
        let base = 0;
        for (let l = before.level + 1; l <= newLevel && l <= 20; l++) base += levelUpReward(l);
        referrerCut = Math.floor(base * 0.1);
      }

      const reason = prestigedUp ? `prestige_up:${newPrestige}` : `level_up:${newLevel}`;
      const notif = prestigedUp
        ? {
            title: `✦ Prestiż ${newPrestige}!`,
            message: `Wzniosłeś się na prestiż ${newPrestige} i zgarnąłeś ${bonus.toLocaleString("pl-PL")} GT.`,
            icon: "✦",
          }
        : {
            title: `⬆️ Level ${newLevel}!`,
            message: `Awansowałeś na poziom ${newLevel} i dostałeś ${bonus.toLocaleString("pl-PL")} GT bonusu.`,
            icon: "⭐",
          };

      await tx.user.update({
        where: { id: userId },
        data: { xp: newXp, level: newLevel, prestige: newPrestige, tokens: { increment: bonus }, totalEarned: { increment: bonus } },
      });
      await tx.transaction.create({ data: { userId, type: "earn", amount: bonus, reason, status: "completed" } });
      await tx.notification.create({
        data: { userId, type: "system", title: notif.title, message: notif.message, icon: notif.icon, link: "/profile" },
      });

      return {
        prestigedUp,
        newLevel,
        newPrestige,
        actorName: before.displayName || before.username || "Widz",
        actorImage: before.image ?? undefined,
        referrerId: before.referredById,
        referrerCut,
      };
    });

    if (!result) return; // no level/prestige up (or user gone)

    await dispatchAlertSafe(
      result.prestigedUp
        ? {
            type: "level_up",
            title: "✦ Prestiż!",
            message: `wzniósł się na prestiż ${result.newPrestige}`,
            icon: "✦",
            actorName: result.actorName,
            actorImage: result.actorImage,
            amount: result.newPrestige,
            amountLabel: "✦",
          }
        : {
            type: "level_up",
            title: "⬆️ Level up!",
            message: `osiągnął poziom ${result.newLevel}`,
            icon: "⭐",
            actorName: result.actorName,
            actorImage: result.actorImage,
            amount: result.newLevel,
            amountLabel: "LVL",
          },
    );

    // Prestige achievements (Phantom Ascension) — best-effort, after the prestige-up.
    if (result.prestigedUp) {
      const { checkAndGrantAchievements } = await import("@/lib/achievements");
      await checkAndGrantAchievements({ userId, triggerType: "prestige", hintValue: result.newPrestige });
    }

    // Ongoing referral bonus (#788/B6) — credit the referrer their tapering cut. Best-effort +
    // its own FOR UPDATE lock; never blocks or undoes the referee's level-up. A crash here just
    // forfeits this one small cut (acceptable — it's a growth incentive, not owed money).
    if (result.referrerCut > 0 && result.referrerId) {
      const referrerId = result.referrerId;
      const cut = result.referrerCut;
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${referrerId} FOR UPDATE`;
          await tx.user.update({ where: { id: referrerId }, data: { tokens: { increment: cut }, totalEarned: { increment: cut } } });
          await tx.transaction.create({ data: { userId: referrerId, type: "earn", amount: cut, reason: `referral_bonus:${userId}`, status: "completed" } });
        });
        await prisma.notification.create({
          data: { userId: referrerId, type: "system", title: "🤝 Bonus z polecenia", message: `Twój zaproszony gracz awansował — +${cut.toLocaleString("pl-PL")} GT.`, icon: "🤝", link: "/profile" },
        }).catch(() => {});
      } catch (e) {
        log.error("referral bonus credit failed", e, { referrerId });
      }
    }
  } catch (e) {
    log.error("awardAccountXp failed", e, { userId });
  }
}
