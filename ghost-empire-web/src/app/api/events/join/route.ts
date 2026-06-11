// src/app/api/events/join/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("events-join");

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return jsonError("Musisz być zalogowany", 401);
  }

  const rl = await rateLimit(`event:join:${session.user.id}`, 10, 60_000);
  if (!rl.allowed) {
    return jsonError("Zbyt wiele żądań. Spróbuj ponownie za chwilę.", 429, rateLimitHeaders(rl));
  }

  let body: { eventId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowe dane", 400);
  }

  const eventId = body.eventId;
  if (!eventId) {
    return jsonError("Brak eventId", 400);
  }

  const tid = await currentTenantId();
  const event = await prisma.event.findFirst({ where: { id: eventId, ...(tid ? { tenantId: tid } : {}) } });
  if (!event) return jsonError("Event nie istnieje", 404);
  if (!event.active) return jsonError("Event nieaktywny", 410);
  if (event.endsAt && event.endsAt < new Date()) {
    return jsonError("Event się zakończył", 410);
  }
  if (event.type !== "giveaway" && event.type !== "contest") {
    return jsonError("Tego eventu nie da się joinować", 400);
  }

  try {
    const entry = await prisma.eventEntry.create({
      data: { eventId, userId: session.user.id },
    });
    return NextResponse.json({ ok: true, entryId: entry.id });
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return jsonError("Już dołączyłeś do tego eventu", 409);
    }
    log.error("entry create failed", e);
    return jsonError("Błąd serwera", 500);
  }
}
