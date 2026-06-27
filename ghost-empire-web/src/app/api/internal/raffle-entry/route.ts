// src/app/api/internal/raffle-entry/route.ts
// Bot → portal (#audit3): a viewer typed an active raffle's keyword in chat. Enters the
// linked user into that keyword raffle for FREE, granting extra tickets to subs/mods so
// their odds are higher (the draw already weights by ticket count). Bearer BOT_SECRET.
// One entry per user per raffle — repeat hits are ignored (the bot should also dedupe).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBotSecret } from "@/lib/utils";
import { currentTenantId } from "@/lib/tenant";

export async function POST(req: Request) {
  if (!verifyBotSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { keyword?: string; platform?: string; username?: string; isSub?: boolean; isMod?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const keyword = String(body.keyword ?? "").trim().toLowerCase();
  const platform = String(body.platform ?? "").trim().toLowerCase();
  const username = String(body.username ?? "").trim().toLowerCase();
  if (!keyword || !platform || !username) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const tid = await currentTenantId();
  // Find the active keyword raffle (this tenant + legacy null), not yet drawn, not expired.
  const event = await prisma.event.findFirst({
    where: {
      type: "raffle",
      active: true,
      drawnAt: null,
      raffleKeyword: { equals: keyword, mode: "insensitive" },
      AND: [
        ...(tid ? [{ OR: [{ tenantId: tid }, { tenantId: null }] }] : []),
        { OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, tenantId: true, raffleSubWeight: true, raffleModWeight: true },
  });
  // No matching raffle → silently OK (the bot doesn't need to know which keywords are live).
  if (!event) return NextResponse.json({ ok: true, entered: false });

  // Resolve the chat user to a linked portal account, scoped to the raffle's portal.
  const etid = event.tenantId;
  const connection = await prisma.connection.findFirst({
    where: {
      platform,
      username: { equals: username, mode: "insensitive" },
      ...(etid ? { OR: [{ user: { tenantId: etid } }, { user: { tenantId: null } }] } : {}),
    },
    select: { userId: true },
  });
  if (!connection) return NextResponse.json({ ok: true, entered: false }); // not linked → ignore

  // Tickets granted = higher of the applicable sub/mod weights (viewers get 1) → higher odds.
  const weight = Math.max(1, body.isMod ? event.raffleModWeight : 0, body.isSub ? event.raffleSubWeight : 0);

  const created = await prisma.$transaction(async (tx) => {
    // Lock the event row so concurrent free entries for THIS raffle serialize through
    // the one-entry check → read-max-ticketNumber → createMany section. READ COMMITTED
    // would otherwise let two entries read the same max and mint duplicate ticket
    // numbers (and both pass the per-user count). Mirrors the paid path. (B3)
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${event.id} FOR UPDATE`;
    const existing = await tx.raffleTicket.count({ where: { eventId: event.id, userId: connection.userId } });
    if (existing > 0) return false; // already entered — one entry per user
    const last = await tx.raffleTicket.findFirst({
      where: { eventId: event.id },
      orderBy: { ticketNumber: "desc" },
      select: { ticketNumber: true },
    });
    const start = (last?.ticketNumber ?? 0) + 1;
    await tx.raffleTicket.createMany({
      data: Array.from({ length: weight }, (_, i) => ({ eventId: event.id, userId: connection.userId, ticketNumber: start + i })),
    });
    return true;
  });

  return NextResponse.json({ ok: true, entered: created, tickets: created ? weight : 0 });
}
