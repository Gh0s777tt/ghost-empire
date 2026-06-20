// src/app/api/search/users/route.ts
// User search for the command palette (#549). Public but consistent with the already-
// public leaderboard/profiles: only users WITH a public username, public fields only,
// tenant-scoped, capped + rate-limited to bound enumeration. Min 2 chars.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await rateLimit(`usearch:${ip}`, 60, 60_000, { failClosed: false });
  if (!rl.allowed) return NextResponse.json({ users: [] }, { status: 429 });

  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 40);
  if (q.length < 2) return NextResponse.json({ users: [] });

  const tid = await currentTenantId();
  const users = await prisma.user
    .findMany({
      where: {
        ...(tid ? { tenantId: tid } : {}),
        username: { not: null }, // only users with a public /u/<name> profile
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          { displayName: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { username: true, displayName: true, image: true, level: true },
      orderBy: { level: "desc" },
      take: 6,
    })
    .catch(() => []);

  return NextResponse.json({ users });
}
