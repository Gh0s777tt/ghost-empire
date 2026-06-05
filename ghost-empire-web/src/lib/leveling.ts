// src/lib/leveling.ts
// Lifetime account leveling. XP accrues from the same activity that grants Battle
// Pass XP (hooked via awardSeasonXp), but the account level NEVER resets. On a
// level-up the user gets a GT bonus, a notification and a stream alert.
import { prisma } from "@/lib/prisma";
import { levelFromXp } from "@/lib/utils";
import { MAX_LEVEL } from "@/lib/economy";
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

/**
 * Add lifetime XP to a user; recompute level; on a level-up grant GT + notify + alert.
 * Best-effort and atomic on the XP/level/token writes. Never throws.
 */
export async function awardAccountXp(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  try {
    const before = await prisma.user.findUnique({
      where: { id: userId },
      select: { xp: true, level: true, username: true, displayName: true, image: true },
    });
    if (!before) return;

    const newXp = before.xp + amount;
    const newLevel = levelFor(newXp);
    const leveledUp = newLevel > before.level;

    if (!leveledUp) {
      await prisma.user.update({ where: { id: userId }, data: { xp: newXp } });
      return;
    }

    // Sum the rewards for every level crossed (handles multi-level jumps).
    let bonus = 0;
    for (let l = before.level + 1; l <= newLevel; l++) bonus += levelUpReward(l);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { xp: newXp, level: newLevel, tokens: { increment: bonus }, totalEarned: { increment: bonus } },
      }),
      prisma.transaction.create({
        data: { userId, type: "earn", amount: bonus, reason: `level_up:${newLevel}`, status: "completed" },
      }),
      prisma.notification.create({
        data: {
          userId,
          type: "system",
          title: `⬆️ Level ${newLevel}!`,
          message: `Awansowałeś na poziom ${newLevel} i dostałeś ${bonus.toLocaleString("pl-PL")} GT bonusu.`,
          icon: "⭐",
          link: "/profile",
        },
      }),
    ]);

    await dispatchAlertSafe({
      type: "level_up",
      title: "⬆️ Level up!",
      message: `osiągnął poziom ${newLevel}`,
      icon: "⭐",
      actorName: before.displayName || before.username || "Widz",
      actorImage: before.image ?? undefined,
      amount: newLevel,
      amountLabel: "LVL",
    });
  } catch (e) {
    log.error("awardAccountXp failed", e, { userId });
  }
}
