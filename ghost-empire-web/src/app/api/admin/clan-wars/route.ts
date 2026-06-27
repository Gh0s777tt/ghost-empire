// src/app/api/admin/clan-wars/route.ts
// Admin control for clan wars. GET = active war + live standings. POST:
//   start { name, days, prizePool } — begin a war (resets every clan's warPoints)
//   end                              — resolve: top clan by warPoints wins the
//                                      prize pool into its treasury; war recorded.
// One active war per tenant. Tenant-scoped.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { clampWarDays, clampPrize } from "@/lib/clan-wars";

export const dynamic = "force-dynamic";

const STANDINGS_N = 10;

function activeWar(tid: string | null) {
  return prisma.clanWar.findFirst({
    where: { status: "active", ...(tid ? { tenantId: tid } : {}) },
    orderBy: { startsAt: "desc" },
  });
}

function topClan(tid: string | null) {
  return prisma.clan.findFirst({
    where: { ...(tid ? { tenantId: tid } : {}), warPoints: { gt: 0 } },
    orderBy: { warPoints: "desc" },
    select: { id: true, tag: true, name: true, warPoints: true },
  });
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();

  const [war, standings] = await Promise.all([
    activeWar(tid),
    prisma.clan.findMany({
      where: { ...(tid ? { tenantId: tid } : {}), warPoints: { gt: 0 } },
      orderBy: { warPoints: "desc" },
      take: STANDINGS_N,
      select: { tag: true, name: true, warPoints: true },
    }),
  ]);

  return NextResponse.json({
    war: war ? { id: war.id, name: war.name, endsAt: war.endsAt.toISOString(), prizePool: war.prizePool } : null,
    standings: standings.map((c) => ({ tag: c.tag, name: c.name, points: c.warPoints })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();

  let body: { action?: string; name?: string; days?: number; prizePool?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 }); }

  if (body.action === "start") {
    if (await activeWar(tid)) return NextResponse.json({ error: "Wojna już trwa — zakończ ją najpierw" }, { status: 409 });
    const name = (body.name ?? "").trim().slice(0, 60) || "Wojna klanów";
    const days = clampWarDays(Number(body.days));
    const prizePool = clampPrize(Number(body.prizePool));
    const endsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    // Fresh slate for everyone, then open the war.
    await prisma.clan.updateMany({ where: tid ? { tenantId: tid } : {}, data: { warPoints: 0 } });
    await prisma.clanWar.create({ data: { name, endsAt, prizePool, ...(tid ? { tenantId: tid } : {}) } });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "end") {
    const war = await activeWar(tid);
    if (!war) return NextResponse.json({ error: "Brak aktywnej wojny" }, { status: 404 });
    const winner = await topClan(tid);
    await prisma.$transaction(async (tx) => {
      // Guarded claim: only end a war that's still active, so two concurrent "end"
      // requests can't both award the prize pool (B5). count===0 → already ended.
      const claim = await tx.clanWar.updateMany({
        where: { id: war.id, status: "active" },
        data: {
          status: "ended",
          winnerClanId: winner?.id ?? null,
          winnerTag: winner?.tag ?? null,
          winnerPoints: winner?.warPoints ?? null,
        },
      });
      if (claim.count === 0) return; // a concurrent request already ended it
      if (winner && war.prizePool > 0) {
        await tx.clan.update({ where: { id: winner.id }, data: { treasury: { increment: war.prizePool } } });
      }
    });

    // Trophy notification to every member of the winning clan. Best-effort and
    // OUTSIDE the transaction: a notification failure must never undo the recorded
    // result or the prize award above.
    if (winner) {
      try {
        const members = await prisma.user.findMany({ where: { clanId: winner.id }, select: { id: true } });
        if (members.length > 0) {
          const pts = (winner.warPoints ?? 0).toLocaleString("pl-PL");
          const message = war.prizePool > 0
            ? `[${winner.tag}] zwycięża z ${pts} pkt — +${war.prizePool.toLocaleString("pl-PL")} GT do skarbca klanu!`
            : `[${winner.tag}] zwycięża z ${pts} pkt!`;
          await prisma.notification.createMany({
            data: members.map((m) => ({
              userId: m.id,
              type: "event_win",
              title: "🏆 Wygrana wojna klanów!",
              message,
              icon: "🏆",
              link: "/clans",
            })),
          });
        }
      } catch { /* notifications are best-effort */ }
    }

    return NextResponse.json({ ok: true, winnerTag: winner?.tag ?? null, prize: war.prizePool });
  }

  return NextResponse.json({ error: "action: start | end" }, { status: 400 });
}
