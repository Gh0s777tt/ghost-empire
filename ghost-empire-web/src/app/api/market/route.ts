// src/app/api/market/route.ts
// P2P card marketplace (#552). GET = active listings + the viewer's listings/collection/
// balance. POST actions: list / cancel / buy. The card is escrowed (removed from the
// seller's collection) at LIST time; buy/cancel move it on. Every GT + card move is ONE
// atomic transaction with `gte`/`qty` guards so neither overspend nor double-spend is
// possible under concurrency. Tenant-scoped.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";
import { displayNick } from "@/lib/utils";
import { clampPrice, sellerProceeds, MAX_ACTIVE_LISTINGS } from "@/lib/market";

export const dynamic = "force-dynamic";

const cardSel = { id: true, name: true, rarity: true, emoji: true, imageUrl: true } as const;

export async function GET() {
  const session = await auth();
  const tid = await currentTenantId();

  const listings = await prisma.cardListing
    .findMany({
      where: { status: "active", ...(tid ? { tenantId: tid } : {}) },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, price: true, sellerId: true, collectible: { select: cardSel } },
    })
    .catch(() => []);
  const sellerIds = [...new Set(listings.map((l) => l.sellerId))];
  const sellers = await prisma.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, username: true, displayName: true } }).catch(() => []);
  const nick = new Map(sellers.map((s) => [s.id, displayNick(s.displayName, s.username)]));
  const items = listings.map((l) => ({ id: l.id, price: l.price, seller: nick.get(l.sellerId) ?? "?", sellerId: l.sellerId, card: l.collectible }));

  let myListings: unknown[] = [];
  let myCards: unknown[] = [];
  let balance = 0;
  if (session?.user?.id) {
    const [mineL, mineC, u] = await Promise.all([
      prisma.cardListing.findMany({ where: { sellerId: session.user.id, status: "active" }, orderBy: { createdAt: "desc" }, take: MAX_ACTIVE_LISTINGS, select: { id: true, price: true, collectible: { select: cardSel } } }).catch(() => []),
      // Cap the owned-card list — a collection can grow with the catalog; this is the
      // trade picker, not the full collection page, so a generous bound is plenty. #perf
      prisma.userCollectible.findMany({ where: { userId: session.user.id, qty: { gte: 1 } }, orderBy: { acquiredAt: "desc" }, take: 200, select: { qty: true, collectible: { select: cardSel } } }).catch(() => []),
      prisma.user.findUnique({ where: { id: session.user.id }, select: { tokens: true } }),
    ]);
    myListings = mineL.map((l) => ({ id: l.id, price: l.price, card: l.collectible }));
    myCards = mineC.map((c) => ({ qty: c.qty, card: c.collectible }));
    balance = u?.tokens ?? 0;
  }

  return NextResponse.json({ items, myListings, myCards, balance, loggedIn: !!session?.user?.id, currentUserId: session?.user?.id ?? null });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await rateLimit(`market:${userId}:${ip}`, 40, 60_000, { failClosed: false });
  if (!rl.allowed) return NextResponse.json({ ok: false, reason: "rate-limited" }, { status: 429 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, reason: "bad" }, { status: 400 }); }
  const action = String(body.action ?? "");
  const tid = await currentTenantId();

  // ---- LIST: escrow one owned card into a new listing ----
  if (action === "list") {
    const collectibleId = String(body.collectibleId ?? "");
    const price = clampPrice(Number(body.price));
    const active = await prisma.cardListing.count({ where: { sellerId: userId, status: "active" } }).catch(() => 0);
    if (active >= MAX_ACTIVE_LISTINGS) return NextResponse.json({ ok: false, reason: "too-many" });
    const res = await prisma
      .$transaction(async (tx) => {
        const dec = await tx.userCollectible.updateMany({ where: { userId, collectibleId, qty: { gte: 1 } }, data: { qty: { decrement: 1 } } });
        if (dec.count === 0) return { reason: "not-owned" as const };
        const listing = await tx.cardListing.create({ data: { ...(tid ? { tenantId: tid } : {}), sellerId: userId, collectibleId, price } });
        return { id: listing.id };
      })
      .catch(() => ({ reason: "error" as const }));
    return NextResponse.json("reason" in res ? { ok: false, reason: res.reason } : { ok: true, id: res.id });
  }

  // ---- CANCEL: return an escrowed card to the seller ----
  if (action === "cancel") {
    const id = String(body.id ?? "");
    const res = await prisma
      .$transaction(async (tx) => {
        const claim = await tx.cardListing.updateMany({ where: { id, sellerId: userId, status: "active" }, data: { status: "cancelled", closedAt: new Date() } });
        if (claim.count === 0) return { reason: "gone" as const };
        const l = await tx.cardListing.findUnique({ where: { id }, select: { collectibleId: true } });
        if (l) await tx.userCollectible.upsert({ where: { userId_collectibleId: { userId, collectibleId: l.collectibleId } }, create: { userId, collectibleId: l.collectibleId, qty: 1 }, update: { qty: { increment: 1 } } });
        return { ok: true as const };
      })
      .catch(() => ({ reason: "error" as const }));
    return NextResponse.json("reason" in res ? { ok: false, reason: res.reason } : { ok: true });
  }

  // ---- BUY: GT moves seller-ward (minus burned fee), card moves to buyer ----
  if (action === "buy") {
    const id = String(body.id ?? "");
    const res = await prisma
      .$transaction(async (tx) => {
        // Atomically claim an ACTIVE listing that is NOT the buyer's own — scoped to
        // this portal so a crafted foreign listing id can't cross tenants.
        const claim = await tx.cardListing.updateMany({ where: { id, status: "active", NOT: { sellerId: userId }, ...(tid ? { tenantId: tid } : {}) }, data: { status: "sold", buyerId: userId, closedAt: new Date() } });
        if (claim.count === 0) return { reason: "unavailable" as const };
        const l = await tx.cardListing.findUnique({ where: { id }, select: { price: true, sellerId: true, collectibleId: true } });
        if (!l) return { reason: "unavailable" as const };
        // Buyer pays — the gte guard makes overspend impossible; a fail throws → full rollback.
        const pay = await tx.user.updateMany({ where: { id: userId, tokens: { gte: l.price } }, data: { tokens: { decrement: l.price } } });
        if (pay.count === 0) throw new Error("insufficient");
        const proceeds = sellerProceeds(l.price); // price - burned fee (GT sink)
        await tx.user.update({ where: { id: l.sellerId }, data: { tokens: { increment: proceeds } } });
        await tx.userCollectible.upsert({ where: { userId_collectibleId: { userId, collectibleId: l.collectibleId } }, create: { userId, collectibleId: l.collectibleId, qty: 1 }, update: { qty: { increment: 1 } } });
        await tx.transaction.create({ data: { userId, type: "spend", amount: -l.price, reason: "market_buy" } });
        await tx.transaction.create({ data: { userId: l.sellerId, type: "earn", amount: proceeds, reason: "market_sale" } });
        return { ok: true as const };
      })
      .catch((e) => ({ reason: e instanceof Error && e.message === "insufficient" ? ("insufficient" as const) : ("error" as const) }));
    return NextResponse.json("reason" in res ? { ok: false, reason: res.reason } : { ok: true });
  }

  return NextResponse.json({ ok: false, reason: "bad" }, { status: 400 });
}
