// src/app/api/games/vote/route.ts
// "Vote for the next game" (#audit3): a logged-in viewer picks ONE game per portal they'd
// like the streamer to play next. Free. Re-voting MOVES the single vote (delete-then-create
// in a tx); posting a null gameId clears it. Strictly tenant-scoped; the game must be a
// visible game of this portal.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const userId = session.user.id;
  const rl = await rateLimit(`gamevote:${userId}`, 30, 60_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429);

  let body: { gameId?: string | null };
  try { body = (await req.json()) as { gameId?: string | null }; } catch { return jsonError("Nieprawidłowe dane", 400); }
  const gameId = typeof body.gameId === "string" && body.gameId ? body.gameId : null;

  const tid = await currentTenantId();
  const ownWhere = { userId, ...(tid ? { tenantId: tid } : { tenantId: null }) };

  // Clear the vote.
  if (!gameId) {
    await prisma.gameVote.deleteMany({ where: ownWhere });
    return NextResponse.json({ ok: true, gameId: null });
  }

  // The game must be a visible game of this portal (OR-null back-compat).
  const game = await prisma.game.findFirst({
    where: { id: gameId, hidden: false, ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) },
    select: { id: true },
  });
  if (!game) return jsonError("Nie znaleziono gry", 404);

  // Move the single vote atomically (delete any existing, then create the new pick).
  await prisma.$transaction(async (tx) => {
    await tx.gameVote.deleteMany({ where: ownWhere });
    await tx.gameVote.create({ data: { userId, gameId, ...(tid ? { tenantId: tid } : {}) } });
  });
  return NextResponse.json({ ok: true, gameId });
}
