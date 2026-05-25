// src/app/api/admin/events/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";

const VALID_TYPES = ["giveaway", "raffle", "contest", "happy_hour"] as const;

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    type?: string;
    name?: string;
    description?: string;
    prize?: string;
    winnersCount?: number;
    requirement?: string;
    multiplier?: number;
    ticketPrice?: number;
    maxTicketsPerUser?: number;
    durationMinutes?: number;
    startsInMinutes?: number;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const type = body.type as (typeof VALID_TYPES)[number];
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Nieprawidłowy typ eventu" }, { status: 400 });
  }

  const name = body.name?.trim().slice(0, 200);
  if (!name) return NextResponse.json({ error: "Brak nazwy" }, { status: 400 });

  const description = body.description?.trim().slice(0, 2000) || null;

  const durationMinutes = Math.floor(Number(body.durationMinutes ?? 0));
  const startsInMinutes = Math.floor(Number(body.startsInMinutes ?? 0));
  if (durationMinutes < 1 || durationMinutes > 60 * 24 * 30) {
    return NextResponse.json({ error: "Duration: 1 minuta do 30 dni" }, { status: 400 });
  }

  const startsAt = startsInMinutes > 0
    ? new Date(Date.now() + startsInMinutes * 60_000)
    : new Date();
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

  // Type-specific validation + payload assembly
  const data: Record<string, unknown> = {
    type, name, description, startsAt, endsAt, active: true,
    createdById: auth.userId,
  };

  if (type === "happy_hour") {
    const mult = Number(body.multiplier ?? 0);
    if (!Number.isFinite(mult) || mult < 1.1 || mult > 10) {
      return NextResponse.json({ error: "Multiplier 1.1-10" }, { status: 400 });
    }
    data.multiplier = mult;
  } else {
    const prize = body.prize?.trim().slice(0, 500);
    if (!prize) return NextResponse.json({ error: "Brak nagrody (prize)" }, { status: 400 });
    data.prize = prize;

    if (type === "giveaway" || type === "raffle" || type === "contest") {
      const wc = Math.floor(Number(body.winnersCount ?? 1));
      if (wc < 1 || wc > 100) {
        return NextResponse.json({ error: "winnersCount 1-100" }, { status: 400 });
      }
      data.winnersCount = wc;
    }
    if (type === "giveaway") {
      data.requirement = body.requirement?.trim().slice(0, 500) || null;
    }
    if (type === "raffle") {
      const price = Math.floor(Number(body.ticketPrice ?? 0));
      const maxPer = Math.floor(Number(body.maxTicketsPerUser ?? 20));
      if (price < 1 || price > 1_000_000) {
        return NextResponse.json({ error: "ticketPrice 1-1,000,000" }, { status: 400 });
      }
      if (maxPer < 1 || maxPer > 10_000) {
        return NextResponse.json({ error: "maxTicketsPerUser 1-10,000" }, { status: 400 });
      }
      data.ticketPrice = price;
      data.maxTicketsPerUser = maxPer;
    }
  }

  const event = await prisma.event.create({ data: data as never });

  await logAdminAction({
    adminId: auth.userId,
    action: "create_event",
    targetType: "event",
    targetId: event.id,
    details: { type, name, prize: data.prize, winnersCount: data.winnersCount },
    req,
  });

  return NextResponse.json({ ok: true, event });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });

  await prisma.event.update({
    where: { id },
    data: { active: false },
  });

  await logAdminAction({
    adminId: auth.userId,
    action: "deactivate_event",
    targetType: "event",
    targetId: id,
    req,
  });

  return NextResponse.json({ ok: true });
}
