// src/app/api/clips/route.ts
// Clip of the Week. GET (public) = this week's clips + vote counts + my vote.
// POST = cast/change my vote (one clip per ISO week). Tenant-scoped; clips come
// live from Helix (lib/twitch-clips), votes are stored.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getRecentClips, isoWeekKey } from "@/lib/twitch-clips";

export const dynamic = "force-dynamic";

export async function GET() {
  // Independent reads — run them together instead of serially on the 3-connection pool. #audit-v2
  const [session, tid] = await Promise.all([auth(), currentTenantId()]);
  const week = isoWeekKey(new Date());
  const clips = await getRecentClips(tid);

  const grouped = clips.length
    ? await prisma.clipVote.groupBy({ by: ["clipId"], where: { week, ...(tid ? { tenantId: tid } : {}) }, _count: { _all: true } })
    : [];
  const counts = new Map(grouped.map((g) => [g.clipId, g._count._all]));
  const myVote = session?.user?.id
    ? (await prisma.clipVote.findUnique({ where: { userId_week: { userId: session.user.id, week } }, select: { clipId: true } }))?.clipId ?? null
    : null;

  const withVotes = clips.map((c) => ({ ...c, votes: counts.get(c.id) ?? 0 }));
  withVotes.sort((a, b) => b.votes - a.votes || b.views - a.views);

  return NextResponse.json({
    week,
    authenticated: !!session?.user?.id,
    myVote,
    leaderId: withVotes.length && withVotes[0].votes > 0 ? withVotes[0].id : null,
    clips: withVotes,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const userId = session.user.id;

  const rl = await rateLimit(`clipvote:${userId}`, 20, 60_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));

  let body: { clipId?: string };
  try { body = await req.json(); } catch { return jsonError("Nieprawidłowe dane", 400); }
  const clipId = String(body.clipId ?? "");
  if (!clipId) return jsonError("Brak clipId", 400);

  const tid = await currentTenantId();
  // Only vote for a clip that's actually in this week's set (no arbitrary ids).
  const clips = await getRecentClips(tid);
  if (!clips.some((c) => c.id === clipId)) return jsonError("Klip nie istnieje", 404);

  const week = isoWeekKey(new Date());
  await prisma.clipVote.upsert({
    where: { userId_week: { userId, week } },
    create: { userId, clipId, week, ...(tid ? { tenantId: tid } : {}) },
    update: { clipId },
  });

  const grouped = await prisma.clipVote.groupBy({ by: ["clipId"], where: { week, ...(tid ? { tenantId: tid } : {}) }, _count: { _all: true } });
  const counts = Object.fromEntries(grouped.map((g) => [g.clipId, g._count._all]));
  return NextResponse.json({ ok: true, myVote: clipId, counts });
}
