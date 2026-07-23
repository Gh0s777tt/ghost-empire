// src/app/api/shop/buy/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { dispatchAlertSafe } from "@/lib/alerts";
import { checkAndGrantAchievements } from "@/lib/achievements";
import { awardSeasonXp } from "@/lib/seasons";
import { discountedPrice } from "@/lib/economy";
import { createLogger } from "@/lib/logger";

const log = createLogger("shop-buy");

const TIER_RANK: Record<string, number> = { T1: 1, T2: 2, T3: 3, Prime: 1 };

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return jsonError("Musisz być zalogowany", 401);
  }

  let body: { itemId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowe dane", 400);
  }

  const itemId = body.itemId;
  if (!itemId || typeof itemId !== "string") {
    return jsonError("Brak itemId", 400);
  }

  const userId = session.user.id;

  // Max 10 buys per minute (prevents scripted abuse / double-clicks)
  const rl = await rateLimit(`shop:buy:${userId}`, 10, 60_000);
  if (!rl.allowed) {
    return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));
  }

  const tid = await currentTenantId();
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Tenant-guard: only this tenant's catalog item is buyable.
      const item = await tx.shopItem.findFirst({ where: { id: itemId, ...(tid ? { tenantId: tid } : {}) } });
      if (!item) throw new ShopError("Item nie istnieje", 404);
      if (!item.active) throw new ShopError("Item niedostępny", 410);
      if (item.stock === 0) throw new ShopError("Brak na stanie", 409);

      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { connections: true },
      });
      if (!user) throw new ShopError("Brak usera", 404);

      if (item.requiresMinLevel && user.level < item.requiresMinLevel) {
        throw new ShopError(`Wymagany Level ${item.requiresMinLevel}`, 403);
      }

      if (item.requiresSubTier === "DUAL") {
        const activeSubs = user.connections.filter((c) => c.isSubscriber).length;
        if (activeSubs < 2) {
          throw new ShopError("Wymagany Dual Supporter (sub na 2 platformach)", 403);
        }
      } else if (item.requiresSubTier) {
        const required = TIER_RANK[item.requiresSubTier] ?? 0;
        const ok = user.connections.some(
          (c) => c.isSubscriber && TIER_RANK[c.subTier ?? ""] >= required,
        );
        if (!ok) {
          throw new ShopError(`Wymagany sub ${item.requiresSubTier}`, 403);
        }
      }

      if (item.requiresMinMonths) {
        const maxMonths = user.connections.reduce(
          (acc, c) => Math.max(acc, c.subMonths),
          0,
        );
        if (maxMonths < item.requiresMinMonths) {
          throw new ShopError(
            `Wymagane ${item.requiresMinMonths} miesięcy subskrypcji`,
            403,
          );
        }
      }

      if (item.requiresAchievement) {
        const earned = await tx.userAchievement.findFirst({
          where: { userId, achievement: { code: item.requiresAchievement } },
          select: { id: true },
        });
        if (!earned) {
          const ach = await tx.achievement.findFirst({
            where: { code: item.requiresAchievement, ...(tid ? { tenantId: tid } : {}) },
            select: { name: true },
          });
          throw new ShopError(`Wymagane osiągnięcie: ${ach?.name ?? item.requiresAchievement}`, 403);
        }
      }

      // Loyalty perk: account level + prestige shave a little off the price.
      const price = discountedPrice(item.price, user.level, user.prestige);

      // Currency-aware: CHIPS items charge the FREE casino chips (never touch GT/totalSpent);
      // GT items charge Ghost Tokens as before. A CHIPS item must be a cosmetic (no market value) —
      // this is what keeps the casino's chips from ever buying anything of real value.
      const isChips = item.currency === "CHIPS";
      const userUpdate = await tx.user.updateMany({
        where: isChips ? { id: userId, chips: { gte: price } } : { id: userId, tokens: { gte: price } },
        data: isChips ? { chips: { decrement: price } } : { tokens: { decrement: price }, totalSpent: { increment: price } },
      });
      if (userUpdate.count === 0) {
        throw new ShopError(isChips ? "Za mało żetonów" : "Za mało Ghost Tokens", 402);
      }

      if (item.stock !== -1) {
        const stockUpdate = await tx.shopItem.updateMany({
          where: { id: itemId, stock: { gt: 0 }, ...(tid ? { tenantId: tid } : {}) },
          data: { stock: { decrement: 1 } },
        });
        if (stockUpdate.count === 0) {
          throw new ShopError("Brak na stanie", 409);
        }
      }

      const isDigital = item.category === "cosmetic";

      await tx.transaction.create({
        data: {
          userId,
          shopItemId: item.id,
          type: "spend",
          amount: -price,
          reason: `shop:${item.name}`,
          currency: isChips ? "CHIPS" : "GT",
          status: isDigital ? "completed" : "pending",
        },
      });

      await tx.notification.create({
        data: {
          userId,
          type: "shop_delivered",
          title: isDigital ? "Zakup zrealizowany" : "Zakup czeka na dostawę",
          message: isDigital
            ? `Otrzymałeś: ${item.name}`
            : `Kupiłeś: ${item.name}. Skontaktujemy się z Tobą przez ticket Discord.`,
          icon: item.imageEmoji,
          link: "/profile",
        },
      });

      const fresh = await tx.user.findUnique({
        where: { id: userId },
        select: { tokens: true, chips: true, username: true, displayName: true, image: true },
      });

      return {
        ok: true,
        itemName: item.name,
        spent: price,
        currency: isChips ? "CHIPS" : "GT",
        newBalance: (isChips ? fresh?.chips : fresh?.tokens) ?? 0,
        deliveryPending: !isDigital,
        // Internal-only fields used after the transaction for alert dispatch
        _actor: {
          name: fresh?.displayName || fresh?.username || "Anon",
          image: fresh?.image ?? null,
        },
        _item: {
          name: item.name,
          emoji: item.imageEmoji,
          price,
        },
      };
    });

    // Fire-and-forget stream alert (after commit so failures don't roll back the purchase)
    await dispatchAlertSafe({
      type: "shop_purchase",
      title: "🛒 Nowy zakup w sklepie!",
      message: `kupił ${result._item.name}`,
      icon: result._item.emoji ?? "🛍️",
      actorName: result._actor.name,
      actorImage: result._actor.image ?? undefined,
      amount: result._item.price,
      amountLabel: "GT",
    });

    // Achievement check — shop purchase milestones + season XP
    await checkAndGrantAchievements({ userId, triggerType: "shop_purchases" });
    await awardSeasonXp(userId, "shop_purchase");

    // Strip internal-only fields from the response
    const { _actor, _item, ...publicResult } = result;
    void _actor; void _item;
    return NextResponse.json(publicResult);
  } catch (e) {
    if (e instanceof ShopError) {
      return jsonError(e.message, e.status);
    }
    log.error("error", e);
    return jsonError("Błąd serwera", 500);
  }
}

class ShopError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
