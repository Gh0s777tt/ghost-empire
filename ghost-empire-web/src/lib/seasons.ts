// src/lib/seasons.ts
// Battle Pass / Seasons — monthly-rolling tier progression.
//
// XP accrues from activity across the platform; every `xpPerTier` XP unlocks the
// next tier. Each tier can carry a free reward and (later) a premium reward.
// Seasons auto-roll on the 1st of each month — getOrCreateCurrentSeason() lazily
// creates the current month's season and deactivates any expired ones.
import { prisma } from "@/lib/prisma";
import { tierFromXp } from "@/lib/economy";

// XP awarded per event type — tuned so a casual viewer reaches a few tiers/month,
// an active supporter most of the pass, and whales can finish.
export const SEASON_XP = {
  chat_message: 10,
  voice_minute: 20,
  twitch_sub: 500,
  kick_sub: 500,
  gift_sub_each: 250,
  bit_each: 1,
  donation_per_pln: 10,
  drop_claim: 50,
  event_won: 500,
  shop_purchase: 100,
  welcome: 1000,
  prediction_win: 200,
} as const;

export type SeasonXpSource = keyof typeof SEASON_XP;

function monthBounds(now = new Date()): { start: Date; end: Date; number: number; label: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  // Season number = months since Jan 2026 (project epoch) + 1
  const number = (now.getUTCFullYear() - 2026) * 12 + now.getUTCMonth() + 1;
  const monthNames = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
  const label = `${monthNames[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
  return { start, end, number, label };
}

/**
 * Returns the current active season, creating it lazily on first call of the month.
 * Also deactivates any season whose endsAt has passed.
 */
export async function getOrCreateCurrentSeason() {
  const { start, end, number, label } = monthBounds();

  // Deactivate expired seasons (best-effort)
  await prisma.season
    .updateMany({ where: { active: true, endsAt: { lte: new Date() } }, data: { active: false } })
    .catch(() => {});

  const existing = await prisma.season.findUnique({ where: { number } });
  if (existing) {
    if (!existing.active && existing.endsAt > new Date()) {
      // Reactivate if it's still within range (e.g. was wrongly deactivated)
      return prisma.season.update({ where: { id: existing.id }, data: { active: true } });
    }
    return existing;
  }

  // Create the month's season with a default free-track reward set
  const created = await prisma.season.create({
    data: {
      number,
      name: `Sezon ${number}: ${label}`,
      startsAt: start,
      endsAt: end,
      totalTiers: 30,
      xpPerTier: 5000,
      active: true,
      rewards: {
        create: defaultFreeRewards(),
      },
    },
  });
  return created;
}

/** Default free-track rewards spread across 30 tiers — admin can edit/add later. */
function defaultFreeRewards() {
  const rewards: Array<{ tier: number; premium: boolean; type: string; label: string; value: string; icon: string }> = [];
  const tokenTiers: Record<number, number> = {
    1: 500, 3: 750, 5: 1000, 8: 1500, 10: 2000, 13: 2500,
    15: 3000, 18: 4000, 20: 5000, 23: 6000, 25: 8000, 28: 10000, 30: 20000,
  };
  for (const [tierStr, amount] of Object.entries(tokenTiers)) {
    rewards.push({
      tier: Number(tierStr),
      premium: false,
      type: "tokens",
      label: `${amount.toLocaleString("pl-PL")} Ghost Tokens`,
      value: String(amount),
      icon: "👻",
    });
  }
  return rewards;
}

/**
 * Award season XP to a user for the current season. Lazily creates UserSeasonProgress.
 * Recomputes tier from total XP. Fire-and-forget — never throws.
 */
export async function awardSeasonXp(userId: string, source: SeasonXpSource, multiplier = 1): Promise<void> {
  try {
    const amount = Math.round(SEASON_XP[source] * multiplier);
    if (amount <= 0) return;

    const season = await getOrCreateCurrentSeason();

    const progress = await prisma.userSeasonProgress.upsert({
      where: { userId_seasonId: { userId, seasonId: season.id } },
      create: { userId, seasonId: season.id, xp: amount, tier: tierFromXp(amount, season.xpPerTier, season.totalTiers) },
      update: { xp: { increment: amount } },
    });

    // Recompute tier from the post-increment xp the upsert returned. XP only ever grows
    // within a season, so tier is monotonic — only bump it UP. Guarding on `>` (not `!==`)
    // also stops a slower concurrent award from writing back a stale, lower tier.
    const newTier = tierFromXp(progress.xp, season.xpPerTier, season.totalTiers);
    if (newTier > progress.tier) {
      await prisma.userSeasonProgress.update({
        where: { id: progress.id },
        data: { tier: newTier },
      });
    }

    // Lifetime account level rides on the same activity (never resets). Best-effort.
    const { awardAccountXp } = await import("@/lib/leveling");
    await awardAccountXp(userId, amount);
  } catch (e) {
    console.error("[seasons] awardSeasonXp failed:", source, e);
  }
}

export type ClaimResult =
  | { ok: true; type: string; label: string; tokens?: number }
  | { ok: false; status: number; error: string };

/**
 * Claim a season reward. Validates the user has reached the tier, hasn't claimed it,
 * and (for premium rewards) has the premium pass. Grants the reward payload.
 */
export async function claimSeasonReward(userId: string, rewardId: string): Promise<ClaimResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const reward = await tx.seasonReward.findUnique({
        where: { id: rewardId },
        include: { season: true },
      });
      if (!reward) return { ok: false, status: 404, error: "Nagroda nie istnieje" } as const;

      const progress = await tx.userSeasonProgress.findUnique({
        where: { userId_seasonId: { userId, seasonId: reward.seasonId } },
      });
      if (!progress) return { ok: false, status: 400, error: "Brak progresu w tym sezonie" } as const;

      if (progress.tier < reward.tier) {
        return { ok: false, status: 403, error: `Wymagany tier ${reward.tier} (masz ${progress.tier})` } as const;
      }
      if (reward.premium && !progress.premium) {
        return { ok: false, status: 403, error: "Ta nagroda wymaga Premium Pass" } as const;
      }

      // Dedup
      const existing = await tx.userSeasonRewardClaim.findUnique({
        where: { userId_rewardId: { userId, rewardId } },
      });
      if (existing) return { ok: false, status: 409, error: "Już odebrane" } as const;

      await tx.userSeasonRewardClaim.create({ data: { userId, rewardId } });

      // Grant payload by type
      if (reward.type === "tokens") {
        const amount = parseInt(reward.value, 10) || 0;
        if (amount > 0) {
          await tx.user.update({
            where: { id: userId },
            data: { tokens: { increment: amount }, totalEarned: { increment: amount } },
          });
          await tx.transaction.create({
            data: {
              userId,
              type: "earn",
              amount,
              reason: `season:${reward.season.number}:tier${reward.tier}`,
              status: "completed",
            },
          });
        }
        await tx.notification.create({
          data: {
            userId,
            type: "task_reward",
            title: `🎟️ Nagroda sezonowa odebrana!`,
            message: `Tier ${reward.tier}: ${reward.label}`,
            icon: reward.icon ?? "🎟️",
            link: "/seasons",
          },
        });
        return { ok: true, type: "tokens", label: reward.label, tokens: amount } as const;
      }

      // Other reward types (badge/title/color/shop_unlock/item/code) — record claim
      // + notify. Cosmetic application is handled elsewhere; for code/item rewards we
      // surface the actual value (the code) or delivery instructions in the message.
      const valueSuffix =
        reward.type === "code"
          ? ` — Twój kod: ${reward.value}`
          : reward.type === "item"
            ? ` — odbiór przez ticket na Discord${reward.value ? ` (${reward.value})` : ""}`
            : "";
      await tx.notification.create({
        data: {
          userId,
          type: "task_reward",
          title: `🎟️ Nagroda sezonowa odebrana!`,
          message: `Tier ${reward.tier}: ${reward.label}${valueSuffix}`,
          icon: reward.icon ?? "🎟️",
          link: "/seasons",
        },
      });
      return { ok: true, type: reward.type, label: reward.label } as const;
    });
  } catch (e) {
    console.error("[seasons] claim failed:", e);
    return { ok: false, status: 500, error: "Błąd serwera" };
  }
}
