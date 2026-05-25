// src/app/api/events/raffle-tickets/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }

  let body: { eventId?: string; count?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const eventId = body.eventId;
  const count = Math.floor(Number(body.count ?? 0));

  if (!eventId) return NextResponse.json({ error: "Brak eventId" }, { status: 400 });
  if (!Number.isFinite(count) || count < 1 || count > 100) {
    return NextResponse.json({ error: "Liczba biletów musi być 1-100" }, { status: 400 });
  }

  const userId = session.user.id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const event = await tx.event.findUnique({ where: { id: eventId } });
      if (!event) throw new HttpError("Event nie istnieje", 404);
      if (!event.active) throw new HttpError("Event nieaktywny", 410);
      if (event.endsAt && event.endsAt < new Date()) {
        throw new HttpError("Event się zakończył", 410);
      }
      if (event.type !== "raffle") {
        throw new HttpError("To nie jest raffle", 400);
      }
      if (!event.ticketPrice || event.ticketPrice <= 0) {
        throw new HttpError("Bilet nie ma ceny", 400);
      }

      if (event.maxTicketsPerUser) {
        const owned = await tx.raffleTicket.count({
          where: { eventId, userId },
        });
        if (owned + count > event.maxTicketsPerUser) {
          throw new HttpError(
            `Limit ${event.maxTicketsPerUser} biletów na osobę (masz ${owned})`,
            409,
          );
        }
      }

      const totalCost = event.ticketPrice * count;

      const userUpdate = await tx.user.updateMany({
        where: { id: userId, tokens: { gte: totalCost } },
        data: {
          tokens: { decrement: totalCost },
          totalSpent: { increment: totalCost },
        },
      });
      if (userUpdate.count === 0) {
        throw new HttpError(`Za mało Ghost Tokens (potrzeba ${totalCost})`, 402);
      }

      const lastTicket = await tx.raffleTicket.findFirst({
        where: { eventId },
        orderBy: { ticketNumber: "desc" },
        select: { ticketNumber: true },
      });
      const startNumber = (lastTicket?.ticketNumber ?? 0) + 1;

      await tx.raffleTicket.createMany({
        data: Array.from({ length: count }, (_, i) => ({
          eventId,
          userId,
          ticketNumber: startNumber + i,
        })),
      });

      await tx.transaction.create({
        data: {
          userId,
          type: "spend",
          amount: -totalCost,
          reason: `raffle_tickets:${event.name}`,
          status: "completed",
        },
      });

      const fresh = await tx.user.findUnique({
        where: { id: userId },
        select: { tokens: true },
      });

      return {
        ok: true,
        bought: count,
        totalCost,
        newBalance: fresh?.tokens ?? 0,
        firstTicket: startNumber,
        lastTicket: startNumber + count - 1,
      };
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("raffle-tickets error:", e);
    return NextResponse.json({ error: "Błąd serwera" }, { status: 500 });
  }
}

class HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
