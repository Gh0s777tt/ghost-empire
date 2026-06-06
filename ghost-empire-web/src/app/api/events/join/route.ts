// src/app/api/events/join/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }

  const rl = await rateLimit(`event:join:${session.user.id}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zbyt wiele żądań. Spróbuj ponownie za chwilę." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: { eventId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const eventId = body.eventId;
  if (!eventId) {
    return NextResponse.json({ error: "Brak eventId" }, { status: 400 });
  }

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return NextResponse.json({ error: "Event nie istnieje" }, { status: 404 });
  if (!event.active) return NextResponse.json({ error: "Event nieaktywny" }, { status: 410 });
  if (event.endsAt && event.endsAt < new Date()) {
    return NextResponse.json({ error: "Event się zakończył" }, { status: 410 });
  }
  if (event.type !== "giveaway" && event.type !== "contest") {
    return NextResponse.json({ error: "Tego eventu nie da się joinować" }, { status: 400 });
  }

  try {
    const entry = await prisma.eventEntry.create({
      data: { eventId, userId: session.user.id },
    });
    return NextResponse.json({ ok: true, entryId: entry.id });
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Już dołączyłeś do tego eventu" }, { status: 409 });
    }
    throw e;
  }
}
