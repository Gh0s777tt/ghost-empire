// src/app/api/auctions/route.ts
// Auction House (#762) — a real GT sink.
//   GET  (public): list this portal's auctions (lazy-settles expired ones first). Adds the
//        caller's balance + "you're the high bidder" flags when logged in.
//   POST {action:"bid", auctionId, amount}  (any viewer): ATOMIC escrow bid — hold the
//        bidder's GT, refund the previous high bidder, all under a FOR UPDATE auction lock.
//   POST {action:"create", ...}  (admin): list a new auction.
//   POST {action:"cancel", auctionId}  (admin): cancel + refund the current high bidder.
//
// Money model: a bid HOLDS GT (decrement now). Being outbid REFUNDS it. The winner's hold is
// simply never refunded → that's the sink. Settlement moves no money (only flips status).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import {
  nextMinBid,
  validateAuctionInput,
  AUCTION_TITLE_MAX,
  AUCTION_DESC_MAX,
} from "@/lib/auctions";

export const dynamic = "force-dynamic";

type LockedAuction = {
  id: string;
  status: string;
  endsAt: Date;
  minBid: number;
  currentBid: number | null;
  currentBidderId: string | null;
  tenantId: string | null;
};

/** Lazy settlement: any open auction past its end becomes "closed" with the high bidder
 *  recorded as winner. No money moves (the winner's GT is already held). Best-effort —
 *  the listing renders correctly via displayStatus even if this no-ops. */
async function settleExpired(tid: string | null): Promise<void> {
  try {
    if (tid) {
      await prisma.$executeRaw`UPDATE "auctions" SET "status"='closed', "winnerUserId"="currentBidderId", "winningBid"="currentBid", "updatedAt"=NOW() WHERE "status"='open' AND "endsAt" <= NOW() AND "tenantId" = ${tid}`;
    } else {
      await prisma.$executeRaw`UPDATE "auctions" SET "status"='closed', "winnerUserId"="currentBidderId", "winningBid"="currentBid", "updatedAt"=NOW() WHERE "status"='open' AND "endsAt" <= NOW()`;
    }
  } catch {
    /* best-effort */
  }
}

export async function GET() {
  const tid = await currentTenantId();
  await settleExpired(tid);
  const session = await auth();
  const meId = session?.user?.id ?? null;

  const rows = await prisma.auction.findMany({
    where: { ...(tid ? { tenantId: tid } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true, title: true, description: true, imageUrl: true, minBid: true,
      currentBid: true, currentBidderId: true, status: true, endsAt: true,
      winnerUserId: true, winningBid: true, createdAt: true,
      _count: { select: { bids: true } },
    },
  });

  // Resolve usernames for the high bidders + winners in one query.
  const ids = Array.from(new Set(rows.flatMap((a) => [a.currentBidderId, a.winnerUserId]).filter((x): x is string => !!x)));
  const names = ids.length
    ? new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } })).map((u) => [u.id, u.username]))
    : new Map<string, string | null>();

  const balance = meId
    ? (await prisma.user.findUnique({ where: { id: meId }, select: { tokens: true } }))?.tokens ?? 0
    : null;

  const auctions = rows.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    imageUrl: a.imageUrl,
    minBid: a.minBid,
    currentBid: a.currentBid,
    nextMinBid: nextMinBid(a.minBid, a.currentBid),
    status: a.status,
    endsAt: a.endsAt.toISOString(),
    bidCount: a._count.bids,
    highBidderName: a.currentBidderId ? names.get(a.currentBidderId) ?? null : null,
    winnerName: a.winnerUserId ? names.get(a.winnerUserId) ?? null : null,
    winningBid: a.winningBid,
    youAreHighBidder: !!meId && a.currentBidderId === meId,
  }));

  return NextResponse.json({ auctions, balance });
}

export async function POST(req: Request) {
  let body: { action?: unknown; auctionId?: unknown; amount?: unknown; title?: unknown; description?: unknown; imageUrl?: unknown; minBid?: unknown; durationMs?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  // ---- CREATE (admin) ----
  if (body.action === "create") {
    const gate = await requirePermission("create_events");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const title = String(body.title ?? "").trim().slice(0, AUCTION_TITLE_MAX);
    const description = String(body.description ?? "").trim().slice(0, AUCTION_DESC_MAX) || null;
    const imageUrl = String(body.imageUrl ?? "").trim().slice(0, 500) || null;
    const minBid = Math.floor(Number(body.minBid));
    const durationMs = Math.floor(Number(body.durationMs));
    const v = validateAuctionInput({ title, description, imageUrl, minBid, durationMs });
    if (!v.ok) return NextResponse.json({ error: "Nieprawidłowe dane aukcji", field: v.error }, { status: 400 });

    const tid = await currentTenantId();
    const created = await prisma.auction.create({
      data: { tenantId: tid, title, description, imageUrl, minBid, endsAt: new Date(Date.now() + durationMs), createdById: gate.userId },
      select: { id: true },
    });
    await logAdminAction({ adminId: gate.userId, action: "create_auction", targetType: "auction", targetId: created.id, details: { title, minBid, durationMs }, req });
    return NextResponse.json({ ok: true, id: created.id });
  }

  // ---- CANCEL (admin) — refund the current high bidder ----
  if (body.action === "cancel") {
    const gate = await requirePermission("create_events");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const auctionId = String(body.auctionId ?? "");
    if (!auctionId) return NextResponse.json({ error: "Brak auctionId" }, { status: 400 });
    const tid = await currentTenantId();

    try {
      const result = await prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<LockedAuction[]>`SELECT "id","status","endsAt","minBid","currentBid","currentBidderId","tenantId" FROM "auctions" WHERE "id" = ${auctionId} FOR UPDATE`;
        const a = locked[0];
        if (!a) return { error: "notfound" as const };
        if (!gate.isPlatformOwner && tid && a.tenantId && a.tenantId !== tid) return { error: "notfound" as const };
        if (a.status !== "open") return { error: "notopen" as const };
        if (a.currentBidderId && a.currentBid != null) {
          await tx.user.update({ where: { id: a.currentBidderId }, data: { tokens: { increment: a.currentBid } } });
          await tx.transaction.create({ data: { userId: a.currentBidderId, type: "refund", amount: a.currentBid, reason: `auction_cancelled:${auctionId}` } });
        }
        await tx.auction.update({ where: { id: auctionId }, data: { status: "cancelled" } });
        return { ok: true as const };
      });
      if ("error" in result) {
        return result.error === "notfound"
          ? NextResponse.json({ error: "Aukcja nie istnieje" }, { status: 404 })
          : NextResponse.json({ error: "Aukcję można anulować tylko gdy trwa" }, { status: 409 });
      }
      await logAdminAction({ adminId: gate.userId, action: "cancel_auction", targetType: "auction", targetId: auctionId, req });
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: "Nie udało się anulować" }, { status: 500 });
    }
  }

  // ---- BID (any logged-in viewer) ----
  if (body.action === "bid") {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
    const userId = session.user.id;

    const rl = await rateLimit(`auction-bid:${userId}`, 30, 60_000);
    if (!rl.allowed) return NextResponse.json({ error: "Za dużo ofert — odczekaj chwilę" }, { status: 429 });

    const auctionId = String(body.auctionId ?? "");
    const amount = Math.floor(Number(body.amount));
    if (!auctionId || !Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json({ error: "Nieprawidłowa oferta" }, { status: 400 });
    }
    const tid = await currentTenantId();
    const now = Date.now();

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Serialize all bids on THIS auction (lock order: auction first, then user rows).
        const locked = await tx.$queryRaw<LockedAuction[]>`SELECT "id","status","endsAt","minBid","currentBid","currentBidderId","tenantId" FROM "auctions" WHERE "id" = ${auctionId} FOR UPDATE`;
        const a = locked[0];
        if (!a) return { error: "notfound" as const };
        if (tid && a.tenantId && a.tenantId !== tid) return { error: "notfound" as const };
        if (a.status !== "open" || a.endsAt.getTime() <= now) return { error: "closed" as const };
        const minNext = nextMinBid(a.minBid, a.currentBid);
        if (amount < minNext) return { error: "min" as const, minNext };

        // Lock both affected user rows in a deterministic (id-sorted) order so concurrent
        // bids across DIFFERENT auctions can't deadlock on the refund+charge pair.
        const affected = Array.from(new Set([userId, a.currentBidderId].filter((x): x is string => !!x))).sort();
        for (const id of affected) {
          await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${id} FOR UPDATE`;
        }

        if (a.currentBidderId === userId) {
          // Raising your own top bid → you already hold `currentBid`; charge only the delta.
          const delta = amount - (a.currentBid ?? 0);
          const pay = await tx.user.updateMany({ where: { id: userId, tokens: { gte: delta } }, data: { tokens: { decrement: delta } } });
          if (pay.count === 0) return { error: "poor" as const };
          await tx.transaction.create({ data: { userId, type: "spend", amount: -delta, reason: `auction_bid:${auctionId}` } });
        } else {
          // New high bidder: hold their full bid (gte guard makes overspend impossible)...
          const pay = await tx.user.updateMany({ where: { id: userId, tokens: { gte: amount } }, data: { tokens: { decrement: amount } } });
          if (pay.count === 0) return { error: "poor" as const };
          await tx.transaction.create({ data: { userId, type: "spend", amount: -amount, reason: `auction_bid:${auctionId}` } });
          // ...and refund the previous high bidder the GT they had held.
          if (a.currentBidderId && a.currentBid != null) {
            await tx.user.update({ where: { id: a.currentBidderId }, data: { tokens: { increment: a.currentBid } } });
            await tx.transaction.create({ data: { userId: a.currentBidderId, type: "refund", amount: a.currentBid, reason: `auction_outbid:${auctionId}` } });
          }
        }

        await tx.auction.update({ where: { id: auctionId }, data: { currentBid: amount, currentBidderId: userId } });
        await tx.auctionBid.create({ data: { auctionId, userId, amount } });
        const u = await tx.user.findUnique({ where: { id: userId }, select: { tokens: true } });
        return { ok: true as const, balance: u?.tokens ?? 0, currentBid: amount };
      });

      if ("error" in result) {
        switch (result.error) {
          case "notfound": return NextResponse.json({ error: "Aukcja nie istnieje" }, { status: 404 });
          case "closed": return NextResponse.json({ error: "Ta aukcja już się zakończyła" }, { status: 409 });
          case "min": return NextResponse.json({ error: "Oferta za niska", minNext: result.minNext }, { status: 409 });
          case "poor": return NextResponse.json({ error: "Za mało GT" }, { status: 402 });
        }
      }
      return NextResponse.json({ ok: true, balance: result.balance, currentBid: result.currentBid });
    } catch {
      return NextResponse.json({ error: "Nie udało się złożyć oferty" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Nieznana akcja" }, { status: 400 });
}
