// src/app/api/companion/route.ts
// The current user's Ghost Companion. GET creates-on-read (every logged-in user
// has exactly one); PATCH renames it. Feeding lives in ./feed.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const userId = session.user.id;
  const tid = await currentTenantId();

  const companion = await prisma.companion.upsert({
    where: { userId },
    create: { userId, ...(tid ? { tenantId: tid } : {}) },
    update: {},
    select: { name: true, xp: true, lastFedAt: true },
  });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tokens: true } });

  return NextResponse.json({
    name: companion.name,
    xp: companion.xp,
    lastFedAt: companion.lastFedAt?.toISOString() ?? null,
    balance: user?.tokens ?? 0,
  });
}

// PATCH { name } — rename the companion (1–20 chars).
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);

  let body: { name?: string };
  try { body = await req.json(); } catch { return jsonError("Nieprawidłowe dane", 400); }
  const name = (body.name ?? "").trim().slice(0, 20);
  if (name.length < 1) return jsonError("Imię 1–20 znaków", 400);

  const tid = await currentTenantId();
  await prisma.companion.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, name, ...(tid ? { tenantId: tid } : {}) },
    update: { name },
  });
  return NextResponse.json({ ok: true, name });
}
