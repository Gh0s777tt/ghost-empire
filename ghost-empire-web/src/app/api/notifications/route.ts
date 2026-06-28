// src/app/api/notifications/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.notification.count({
      where: { userId: session.user.id, read: false },
    }),
  ]);

  return NextResponse.json({
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      icon: n.icon,
      link: n.link,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }

  const rl = await rateLimit(`notif:read:${session.user.id}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Za szybko. Spróbuj za chwilę." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  let body: { ids?: string[]; all?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  if (body.all) {
    const result = await prisma.notification.updateMany({
      where: { userId: session.user.id, read: false },
      data: { read: true },
    });
    return NextResponse.json({ ok: true, markedRead: result.count });
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "Brak ids lub all=true" }, { status: 400 });
  }
  // #756: only string ids, capped — an untyped/oversized ids[] otherwise hits the DB unbounded
  // (or errors on non-string elements in the `in` clause).
  const ids = (body.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 200);
  if (ids.length === 0) {
    return NextResponse.json({ error: "Brak ids lub all=true" }, { status: 400 });
  }

  const result = await prisma.notification.updateMany({
    where: {
      userId: session.user.id,
      id: { in: ids },
      read: false,
    },
    data: { read: true },
  });

  return NextResponse.json({ ok: true, markedRead: result.count });
}
