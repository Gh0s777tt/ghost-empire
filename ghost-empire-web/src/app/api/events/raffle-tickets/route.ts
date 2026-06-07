// src/app/api/events/raffle-tickets/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return jsonError("Musisz być zalogowany", 401);
  }

  const rl = await rateLimit(`raffle:tickets:${session.user.id}`, 10, 60_000);
  if (!rl.allowed) {
    return jsonError("Zbyt wiele żądań. Spróbuj ponownie za chwilę.", 429, rateLimitHeaders(rl));
  }

  let body: { eventId?: string; count?: number };
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowe dane", 400);
  }

  const eventId = body.eventId;
  const count = Math.floor(Number(body.count ?? 0));

  if (!eventId) return jsonError("Brak eventId", 400);
  if (!Number.isFinite(count) || count < 1 || count > 100) {
    return jsonError("Liczba biletów musi być 1-100", 400);
  }

  const userId = session.user.id;

  const tid = await currentTenantId();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const event = await tx.event.findFirst({ where: { id: eventId, ...(tid ? { tenantId: tid } : {}) } });
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
      return jsonError(e.message, e.status);
    }
    console.error("raffle-tickets error:", e);
    return jsonError("Błąd serwera", 500);
  }
}

class HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
