// src/app/api/collectibles/open-pack/route.ts
// Open a GT pack (#551): spend PACK_PRICE GT, receive one random card weighted by
// rarity. The GT spend + ownership grant + ledger entry are ONE atomic transaction
// (the `tokens: { gte }` guard makes overspend impossible under concurrency).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";
import { PACK_PRICE, pickRarity } from "@/lib/collectibles";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const ip = clientIp(req);
  const rl = await rateLimit(`pack:${userId}:${ip}`, 30, 60_000, { failClosed: false });
  if (!rl.allowed) return NextResponse.json({ ok: false, reason: "rate-limited" }, { status: 429 });

  const tid = await currentTenantId();
  const cards = await prisma.collectible
    .findMany({ where: { active: true, ...(tid ? { tenantId: tid } : {}) }, select: { id: true, rarity: true } })
    .catch(() => []);
  if (cards.length === 0) return NextResponse.json({ ok: false, reason: "no-cards" });

  // Weighted roll: pick a rarity, then a uniform-random card of it (fall back to any).
  const rarity = pickRarity(Math.random());
  const pool = cards.filter((c) => c.rarity === rarity);
  const from = pool.length ? pool : cards;
  const chosen = from[Math.floor(Math.random() * from.length)];

  try {
    const res = await prisma.$transaction(async (tx) => {
      const spend = await tx.user.updateMany({ where: { id: userId, tokens: { gte: PACK_PRICE } }, data: { tokens: { decrement: PACK_PRICE } } });
      if (spend.count === 0) return { insufficient: true as const };
      await tx.userCollectible.upsert({
        where: { userId_collectibleId: { userId, collectibleId: chosen.id } },
        create: { userId, collectibleId: chosen.id, qty: 1 },
        update: { qty: { increment: 1 } },
      });
      await tx.transaction.create({ data: { userId, type: "spend", amount: -PACK_PRICE, reason: "collectible_pack" } });
      const u = await tx.user.findUnique({ where: { id: userId }, select: { tokens: true } });
      return { balance: u?.tokens ?? 0 };
    });
    if ("insufficient" in res) return NextResponse.json({ ok: false, reason: "insufficient" });
    const card = await prisma.collectible.findUnique({ where: { id: chosen.id }, select: { id: true, name: true, rarity: true, emoji: true, imageUrl: true } });
    return NextResponse.json({ ok: true, card, balance: res.balance });
  } catch {
    return NextResponse.json({ ok: false, reason: "error" }, { status: 500 });
  }
}
