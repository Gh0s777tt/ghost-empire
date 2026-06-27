// src/app/api/bounties/route.ts
// Public — lists open + recently-resolved Viewer Bounties (#679) for the /bounties page,
// and creates a new bounty (escrows the author's initial pledge). Tenant-scoped.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { createBounty } from "@/lib/bounties";

export const dynamic = "force-dynamic";

type CreatorRow = { name: string | null; displayName: string | null; username: string | null; image: string | null };
function displayName(c: CreatorRow | null): string {
  return c?.displayName || c?.name || c?.username || "Widmo";
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const tid = await currentTenantId();

  const creatorSelect = { select: { name: true, displayName: true, username: true, image: true } } as const;
  const [open, recent] = await Promise.all([
    prisma.bounty.findMany({
      where: { status: "open", ...(tid ? { tenantId: tid } : {}) },
      select: {
        id: true, title: true, description: true, pooledGt: true, createdAt: true, expiresAt: true,
        creator: creatorSelect, _count: { select: { pledges: true } },
      },
      orderBy: [{ pooledGt: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.bounty.findMany({
      where: { status: { in: ["completed", "rejected", "expired"] }, ...(tid ? { tenantId: tid } : {}) },
      select: {
        id: true, title: true, status: true, pooledGt: true, resolvedAt: true,
        creator: creatorSelect, _count: { select: { pledges: true } },
      },
      orderBy: { resolvedAt: "desc" },
      take: 10,
    }),
  ]);

  // Which open bounties has the caller already backed? (one cheap grouped query)
  const openIds = open.map((b) => b.id);
  const myPledged = userId && openIds.length
    ? new Set(
        (await prisma.bountyPledge.findMany({
          where: { bountyId: { in: openIds }, userId },
          select: { bountyId: true },
          distinct: ["bountyId"],
        })).map((p) => p.bountyId),
      )
    : new Set<string>();

  return NextResponse.json({
    me: userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { tokens: true } }).then((u) => ({ tokens: u?.tokens ?? 0 }))
      : null,
    open: open.map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      pooledGt: b.pooledGt,
      backers: b._count.pledges,
      creator: { name: displayName(b.creator), image: b.creator?.image ?? null },
      createdAt: b.createdAt.toISOString(),
      expiresAt: b.expiresAt?.toISOString() ?? null,
      iBacked: myPledged.has(b.id),
    })),
    recent: recent.map((b) => ({
      id: b.id,
      title: b.title,
      status: b.status,
      pooledGt: b.pooledGt,
      backers: b._count.pledges,
      creator: { name: displayName(b.creator), image: b.creator?.image ?? null },
      resolvedAt: b.resolvedAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const userId = session.user.id;

  // 3 new bounties per 5 min per user (anti-spam; the lib also caps open bounties per user).
  const rl = await rateLimit(`bounty:create:${userId}`, 3, 5 * 60_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));

  let body: { title?: string; description?: string; initialPledge?: number };
  try { body = await req.json(); } catch { return jsonError("Nieprawidłowe dane", 400); }
  if (typeof body.title !== "string" || typeof body.initialPledge !== "number") {
    return jsonError("Wymagane: title (string) + initialPledge (number)", 400);
  }

  const result = await createBounty({
    userId,
    title: body.title,
    description: typeof body.description === "string" ? body.description : null,
    initialPledge: Math.floor(body.initialPledge),
  });
  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json(result);
}
