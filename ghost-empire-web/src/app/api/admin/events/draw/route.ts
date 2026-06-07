// src/app/api/admin/events/draw/route.ts
import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";
import { dispatchAlertSafe } from "@/lib/alerts";
import { checkAndGrantAchievements } from "@/lib/achievements";
import { awardSeasonXp } from "@/lib/seasons";

// Crypto-secure Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function POST(req: Request) {
  const auth = await requirePermission("draw_events");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { eventId?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const eventId = body.eventId;
  if (!eventId) return NextResponse.json({ error: "Brak eventId" }, { status: 400 });

  const tid = await currentTenantId();
  const event = await prisma.event.findFirst({ where: { id: eventId, ...(tid ? { tenantId: tid } : {}) } });
  if (!event) return NextResponse.json({ error: "Event nie istnieje" }, { status: 404 });
  if (event.type === "happy_hour") {
    return NextResponse.json(
      { error: "Happy Hour nie ma losowania" },
      { status: 400 },
    );
  }
  if (event.drawnAt) {
    return NextResponse.json(
      { error: "Event już został wylosowany" },
      { status: 409 },
    );
  }

  const winnersCount = Math.max(1, event.winnersCount ?? 1);

  // Collect candidate userIds based on event type
  let candidateUserIds: string[];

  if (event.type === "raffle") {
    // Each ticket = 1 chance. Shuffle tickets, then take unique userIds in order.
    const tickets = await prisma.raffleTicket.findMany({
      where: { eventId },
      select: { userId: true, ticketNumber: true },
    });
    if (tickets.length === 0) {
      return NextResponse.json(
        { error: "Brak biletów — nie można losować" },
        { status: 400 },
      );
    }
    candidateUserIds = tickets.map((t) => t.userId);
  } else {
    // giveaway / contest — entries are equal-weight
    const entries = await prisma.eventEntry.findMany({
      where: { eventId, isWinner: false }, // ignore any pre-flagged
      select: { userId: true },
    });
    if (entries.length === 0) {
      return NextResponse.json(
        { error: "Brak uczestników — nie można losować" },
        { status: 400 },
      );
    }
    candidateUserIds = entries.map((e) => e.userId);
  }

  // Pick N distinct winners by shuffling then deduplicating in order
  const shuffled = shuffle(candidateUserIds);
  const winnerIds: string[] = [];
  const seen = new Set<string>();
  for (const uid of shuffled) {
    if (seen.has(uid)) continue;
    seen.add(uid);
    winnerIds.push(uid);
    if (winnerIds.length >= winnersCount) break;
  }

  // Atomic: mark/create EventEntry with isWinner=true for each winner, set Event.drawnAt
  await prisma.$transaction(async (tx) => {
    for (const userId of winnerIds) {
      await tx.eventEntry.upsert({
        where: { eventId_userId: { eventId, userId } },
        create: { eventId, userId, isWinner: true },
        update: { isWinner: true },
      });

      await tx.notification.create({
        data: {
          userId,
          type: "event_win",
          title: "🎉 Wygrałeś event!",
          message: `Wygrałeś "${event.name}". Skontaktujemy się przez ticket Discord żeby przekazać nagrodę.`,
          icon: "🏆",
          link: "/events",
        },
      });
    }

    await tx.event.update({
      where: { id: eventId },
      data: { drawnAt: new Date() },
    });
  });

  // Fetch winner details for response
  const winners = await prisma.user.findMany({
    where: { id: { in: winnerIds } },
    select: { id: true, username: true, displayName: true, image: true },
  });

  // Dispatch one stream alert per winner (safe — never blocks) + achievement check
  for (const w of winners) {
    await dispatchAlertSafe({
      type: "event_win",
      title: "🏆 Mamy zwycięzcę!",
      message: `wygrał ${event.name}`,
      icon: "🏆",
      actorName: w.displayName || w.username || "Anon",
      actorImage: w.image ?? undefined,
    });
    await checkAndGrantAchievements({ userId: w.id, triggerType: "events_won" });
    await awardSeasonXp(w.id, "event_won");
  }

  await logAdminAction({
    adminId: auth.userId,
    action: "draw_event",
    targetType: "event",
    targetId: eventId,
    details: {
      eventName: event.name,
      eventType: event.type,
      winnersCount,
      winnerIds,
      candidatesCount: candidateUserIds.length,
    },
    req,
  });

  return NextResponse.json({
    ok: true,
    eventName: event.name,
    eventType: event.type,
    requestedWinners: winnersCount,
    actualWinners: winners.length,
    winners,
  });
}
