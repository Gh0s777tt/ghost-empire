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
    const before = await prisma.user.findUnique({
      where: { id: userId },
      select: { xp: true, level: true, prestige: true, username: true, displayName: true, image: true },
    });
    if (!before) return;

    const newXp = before.xp + amount;
    const newLevel = levelFor(newXp);
    const newPrestige = prestigeFromXp(newXp);
    const leveledUp = newLevel > before.level;
    const prestigedUp = newPrestige > before.prestige;

    if (!leveledUp && !prestigedUp) {
      await prisma.user.update({ where: { id: userId }, data: { xp: newXp } });
      return;
    }

    // Sum the rewards for every level and prestige star crossed (handles big jumps).
    let bonus = 0;
    for (let l = before.level + 1; l <= newLevel; l++) bonus += levelUpReward(l);
    for (let p = before.prestige + 1; p <= newPrestige; p++) bonus += prestigeUpReward(p);

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

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          xp: newXp,
          level: newLevel,
          prestige: newPrestige,
          tokens: { increment: bonus },
          totalEarned: { increment: bonus },
        },
      }),
      prisma.transaction.create({
        data: { userId, type: "earn", amount: bonus, reason, status: "completed" },
      }),
      prisma.notification.create({
        data: {
          userId,
          type: "system",
          title: notif.title,
          message: notif.message,
          icon: notif.icon,
          link: "/profile",
        },
      }),
    ]);

    const actorName = before.displayName || before.username || "Widz";
    await dispatchAlertSafe(
      prestigedUp
        ? {
            type: "level_up",
            title: "✦ Prestiż!",
            message: `wzniósł się na prestiż ${newPrestige}`,
            icon: "✦",
            actorName,
            actorImage: before.image ?? undefined,
            amount: newPrestige,
            amountLabel: "✦",
          }
        : {
            type: "level_up",
            title: "⬆️ Level up!",
            message: `osiągnął poziom ${newLevel}`,
            icon: "⭐",
            actorName,
            actorImage: before.image ?? undefined,
            amount: newLevel,
            amountLabel: "LVL",
          },
    );
  } catch (e) {
    log.error("awardAccountXp failed", e, { userId });
  }
}
