// src/app/api/titles/route.ts
// Profile Titles (#761) — cosmetic GT sink. GET: catalog + the caller's owned/equipped + balance.
// POST {action:"buy", titleId}: atomic GT spend (FOR UPDATE, like predictions/bounties) → appends
// the title to ownedTitles. POST {action:"equip", titleId|null}: equip an owned title (or unequip).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { PROFILE_TITLES, titleById, isValidTitleId, parseOwnedTitles, titleUnlocked } from "@/lib/titles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  const u = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { tokens: true, ownedTitles: true, equippedTitleId: true, level: true },
  });
  return NextResponse.json({
    catalog: PROFILE_TITLES,
    owned: parseOwnedTitles(u?.ownedTitles),
    equipped: isValidTitleId(u?.equippedTitleId) ? u!.equippedTitleId : null,
    balance: u?.tokens ?? 0,
    level: u?.level ?? 1, // so the client can show which titles are rank-locked (#788/B5)
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  const userId = session.user.id;

  const rl = await rateLimit(`titles:${userId}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Za dużo prób — odczekaj chwilę" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  let body: { action?: unknown; titleId?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  // --- Equip (or unequip with titleId === null) — no money ---
  if (body.action === "equip") {
    const titleId = body.titleId === null ? null : isValidTitleId(body.titleId) ? body.titleId : undefined;
    if (titleId === undefined) return NextResponse.json({ error: "Nieznany tytuł" }, { status: 400 });
    if (titleId !== null) {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { ownedTitles: true } });
      if (!parseOwnedTitles(u?.ownedTitles).includes(titleId)) {
        return NextResponse.json({ error: "Nie posiadasz tego tytułu" }, { status: 403 });
      }
    }
    await prisma.user.update({ where: { id: userId }, data: { equippedTitleId: titleId } });
    return NextResponse.json({ ok: true, equipped: titleId });
  }

  // --- Buy — atomic GT spend ---
  if (body.action === "buy") {
    if (!isValidTitleId(body.titleId)) return NextResponse.json({ error: "Nieznany tytuł" }, { status: 400 });
    const def = titleById(body.titleId)!;
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Serialize concurrent buys for this user so two requests can't double-charge / overspend.
        await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`;
        const u = await tx.user.findUnique({ where: { id: userId }, select: { tokens: true, ownedTitles: true, level: true } });
        const owned = parseOwnedTitles(u?.ownedTitles);
        if (owned.includes(def.id)) return { error: "owned" as const };
        if (!titleUnlocked(def, u?.level ?? 1)) return { error: "locked" as const }; // rank gate (#788/B5)
        if ((u?.tokens ?? 0) < def.cost) return { error: "poor" as const };
        const updated = await tx.user.update({
          where: { id: userId },
          data: { tokens: { decrement: def.cost }, ownedTitles: [...owned, def.id] },
          select: { tokens: true },
        });
        await tx.transaction.create({
          data: { userId, type: "spend", amount: def.cost, reason: `title:${def.id}`, status: "completed" },
        });
        return { ok: true as const, balance: updated.tokens };
      });
      if ("error" in result) {
        if (result.error === "owned") return NextResponse.json({ error: "Masz już ten tytuł" }, { status: 409 });
        if (result.error === "locked") return NextResponse.json({ error: `Wymagany poziom ${def.requiresLevel}` }, { status: 403 });
        return NextResponse.json({ error: "Za mało GT" }, { status: 402 });
      }
      return NextResponse.json({ ok: true, balance: result.balance, owned: def.id });
    } catch {
      return NextResponse.json({ error: "Nie udało się kupić" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Nieznana akcja" }, { status: 400 });
}
