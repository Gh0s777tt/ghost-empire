// src/lib/achievements.ts
// Achievement check + grant — call after any user-triggered event that might
// unlock something (donations, subs received, drops claimed, etc.).
//
// Architecture:
//  - Caller passes a triggerType (e.g. "donations_count")
//  - Helper finds all achievements with that triggerType
//  - Skips ones the user already has
//  - Queries DB for current count/sum (or uses caller's hint)
//  - Grants any whose threshold is met: UserAchievement + token reward +
//    notification + stream alert
//
// Fire-and-forget — never throws to caller. Designed to be safe inside any
// $transaction (helper runs OUTSIDE the transaction, dispatched after commit).
import { prisma } from "@/lib/prisma";
import { dispatchAlertSafe } from "@/lib/alerts";
import { createLogger, errContext } from "@/lib/logger";

const log = createLogger("achievements");

export type AchievementTriggerType =
  | "donations_count"        // # of donations made (Streamlabs + YouTube super chats)
  | "donations_amount_pln"   // cumulative PLN donated
  | "twitch_sub_received"    // user subbed to channel on Twitch (count)
  | "kick_sub_received"      // user subbed to channel on Kick (count)
  | "gift_subs_given"        // total gift subs the user has given (Twitch+Kick combined)
  | "bits_cheered"           // cumulative bits cheered
  | "super_chats_received"   // YT super chats user has sent
  | "drops_claimed"          // # of stream drops claimed
  | "events_won"             // # of events won (giveaway/raffle/contest)
  | "shop_purchases"         // # of shop items bought
  | "platforms_linked"       // # of OAuth platforms linked to account
  | "yt_member"              // YT membership received
  | "prestige"               // prestige stars (Phantom Ascension)
  | "duels_won"              // # of PvP duels won
  | "casino_plays"           // # of GT casino games played (slots/coinflip)
  // Existing in seed file:
  | "level"
  | "streak"
  | "messages"
  | "tokens_earned"
  | "manual";

export type CheckResult = { granted: Array<{ code: string; name: string; tokens: number; rarity: string }> };

/**
 * Check + grant achievements for a user after an event. Safe to call from anywhere
 * — swallows errors, never throws.
 */
export async function checkAndGrantAchievements(opts: {
  userId: string;
  triggerType: AchievementTriggerType;
  /** Caller's hint of the new value (e.g. "this is their 5th donation"). If omitted, helper queries DB. */
  hintValue?: number;
}): Promise<CheckResult> {
  try {
    return await runCheck(opts);
  } catch (e) {
    log.error("check failed", e, { triggerType: opts.triggerType });
    return { granted: [] };
  }
}

async function runCheck(opts: {
  userId: string;
  triggerType: AchievementTriggerType;
  hintValue?: number;
}): Promise<CheckResult> {
  // Scope to the granted user's tenant (works in signin/OAuth-callback context too,
  // where the request has no tenant subdomain — so we use the user's tenantId, not
  // currentTenantId()).
  const u0 = await prisma.user.findUnique({ where: { id: opts.userId }, select: { tenantId: true } });
  const tid = u0?.tenantId ?? null;
  const candidates = await prisma.achievement.findMany({
    where: { triggerType: opts.triggerType, ...(tid ? { tenantId: tid } : {}) },
  });
  if (candidates.length === 0) return { granted: [] };

  // Already-earned filter
  const earned = await prisma.userAchievement.findMany({
    where: { userId: opts.userId, achievementId: { in: candidates.map((c) => c.id) } },
    select: { achievementId: true },
  });
  const earnedIds = new Set(earned.map((e) => e.achievementId));
  const unearned = candidates.filter((c) => !earnedIds.has(c.id));
  if (unearned.length === 0) return { granted: [] };

  // Need current value to compare against triggerValue
  const currentValue = opts.hintValue ?? (await computeCurrentValue(opts.userId, opts.triggerType));

  // Sort by triggerValue ascending so we grant in milestone order
  const toGrant = unearned
    .filter((a) => currentValue >= (a.triggerValue ?? Infinity))
    .sort((a, b) => (a.triggerValue ?? 0) - (b.triggerValue ?? 0));

  if (toGrant.length === 0) return { granted: [] };

  // Fetch user info for alert dispatch
  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { username: true, displayName: true, image: true },
  });

  const granted: CheckResult["granted"] = [];
  for (const a of toGrant) {
    try {
      await prisma.$transaction([
        prisma.userAchievement.create({
          data: { userId: opts.userId, achievementId: a.id },
        }),
        ...(a.tokenReward > 0
          ? [
              prisma.user.update({
                where: { id: opts.userId },
                data: { tokens: { increment: a.tokenReward }, totalEarned: { increment: a.tokenReward } },
              }),
              prisma.transaction.create({
                data: {
                  userId: opts.userId,
                  type: "earn",
                  amount: a.tokenReward,
                  reason: `achievement:${a.code}`,
                  status: "completed",
                },
              }),
            ]
          : []),
        prisma.notification.create({
          data: {
            userId: opts.userId,
            type: "achievement",
            title: `🏆 Nowy achievement: ${a.name}`,
            message: `${a.description}${a.tokenReward > 0 ? ` (+${a.tokenReward.toLocaleString("pl-PL")} GT)` : ""}${a.rewardNote ? ` 🎁 Nagroda: ${a.rewardNote}` : ""}`,
            icon: a.icon,
            link: "/achievements",
          },
        }),
      ]);

      granted.push({ code: a.code, name: a.name, tokens: a.tokenReward, rarity: a.rarity });

      // Stream alert — visible on OBS overlay for legendary/epic achievements
      if (a.rarity === "legendary" || a.rarity === "epic") {
        await dispatchAlertSafe({
          type: "level_up",  // reuse the visual category
          title: `🏆 Achievement: ${a.name}`,
          message: a.description,
          icon: a.icon,
          actorName: user?.displayName || user?.username || "Anon",
          actorImage: user?.image ?? undefined,
        });
      }
    } catch (e) {
      // Unique constraint race — someone else granted in parallel
      log.warn("grant failed", { code: a.code, ...errContext(e) });
    }
  }
  return { granted };
}

// =====================================================
// Per-trigger count queries — fallback when caller doesn't pass hintValue
// =====================================================

async function computeCurrentValue(userId: string, triggerType: AchievementTriggerType): Promise<number> {
  switch (triggerType) {
    case "donations_count":
      return prisma.donation.count({ where: { userId } });

    case "donations_amount_pln": {
      const agg = await prisma.donation.aggregate({ where: { userId }, _sum: { amountGrosze: true } });
      return Math.floor((agg._sum.amountGrosze ?? 0) / 100);
    }

    case "twitch_sub_received":
      return prisma.twitchEvent.count({
        where: { userId, type: "channel.subscribe" },
      });

    case "kick_sub_received":
      return prisma.kickEvent.count({
        where: {
          userId,
          type: { in: ["channel.subscription.new", "channel.subscription.renewal"] },
        },
      });

    case "gift_subs_given": {
      const [tw, ki] = await Promise.all([
        prisma.twitchEvent.count({ where: { userId, type: "channel.subscription.gift" } }),
        prisma.kickEvent.count({ where: { userId, type: "channel.subscription.gifts" } }),
      ]);
      return tw + ki;
    }

    case "bits_cheered": {
      // Sum bits from Connection (Twitch cheer handler increments Connection.bits)
      const conns = await prisma.connection.findMany({
        where: { userId, platform: "twitch" },
        select: { bits: true },
      });
      return conns.reduce((s, c) => s + (c.bits ?? 0), 0);
    }

    case "super_chats_received":
      return prisma.youTubeEvent.count({ where: { userId, type: "superChat" } });

    case "yt_member":
      return prisma.youTubeEvent.count({
        where: { userId, type: { in: ["newSponsor", "memberMilestone"] } },
      });

    case "drops_claimed":
      return prisma.dropClaim.count({ where: { userId } });

    case "events_won":
      return prisma.eventEntry.count({ where: { userId, isWinner: true } });

    case "shop_purchases":
      return prisma.transaction.count({
        where: { userId, type: "spend", shopItemId: { not: null } },
      });

    case "platforms_linked":
      return prisma.connection.count({ where: { userId } });

    case "prestige": {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { prestige: true } });
      return u?.prestige ?? 0;
    }

    case "duels_won":
      return prisma.duel.count({ where: { status: "resolved", winnerId: userId } });

    case "casino_plays":
      return prisma.gtGamePlay.count({ where: { userId } });

    case "tokens_earned": {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { totalEarned: true } });
      return u?.totalEarned ?? 0;
    }

    case "level": {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { level: true } });
      return u?.level ?? 0;
    }

    case "streak": {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { streak: true } });
      return u?.streak ?? 0;
    }

    case "messages": {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { messageCount: true } });
      return u?.messageCount ?? 0;
    }

    case "manual":
      return 0; // Manual triggers are granted explicitly via grantManual()
  }
}

/** Manually grant an achievement by code — for admin actions / "manual" trigger achievements. */
export async function grantManualAchievement(userId: string, code: string): Promise<boolean> {
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
    const achievement = await prisma.achievement.findFirst({ where: { code, ...(u?.tenantId ? { tenantId: u.tenantId } : {}) } });
    if (!achievement) return false;
    const existing = await prisma.userAchievement.findFirst({
      where: { userId, achievementId: achievement.id },
    });
    if (existing) return false;
    await checkAndGrantAchievements({
      userId,
      triggerType: "manual",
      hintValue: achievement.triggerValue ?? 1,
    });
    // checkAndGrantAchievements with "manual" triggerType won't grant our specific
    // one (it filters by triggerType + currentValue=0). Do it directly:
    await prisma.userAchievement.create({
      data: { userId, achievementId: achievement.id },
    });
    if (achievement.tokenReward > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { tokens: { increment: achievement.tokenReward }, totalEarned: { increment: achievement.tokenReward } },
      });
      await prisma.transaction.create({
        data: {
          userId,
          type: "earn",
          amount: achievement.tokenReward,
          reason: `achievement:${achievement.code}`,
          status: "completed",
        },
      });
    }
    await prisma.notification.create({
      data: {
        userId,
        type: "achievement",
        title: `🏆 Achievement: ${achievement.name}`,
        message: `${achievement.description}${achievement.tokenReward > 0 ? ` (+${achievement.tokenReward.toLocaleString("pl-PL")} GT)` : ""}${achievement.rewardNote ? ` 🎁 Nagroda: ${achievement.rewardNote}` : ""}`,
        icon: achievement.icon,
        link: "/achievements",
      },
    });
    return true;
  } catch (e) {
    log.error("manual grant failed", e, { code });
    return false;
  }
}
