// src/app/api/internal/link-status/route.ts
// GET — bot (authenticated by BOT_SECRET) checks whether a Discord ID is linked to a GH0ST account.
// Used by the E-Bot dashboard (/profile) to show real link status.
import { NextResponse } from "next/server";
import { extractIp } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { verifyBotSecret } from "@/lib/utils";

export async function GET(req: Request) {
  const ip = extractIp(req) ?? "unknown";
  const ipLimit = await rateLimit(`linkstatus:ip:${ip}`, 120, 60_000);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: rateLimitHeaders(ipLimit) },
    );
  }

  if (!verifyBotSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const discordId = new URL(req.url).searchParams.get("discordId")?.trim();
  if (!discordId || !/^\d{1,20}$/.test(discordId)) {
    return NextResponse.json({ error: "Invalid discordId" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { name: true, discordUsername: true, tokens: true },
  });

  return NextResponse.json({
    linked: !!user,
    username: user?.discordUsername ?? user?.name ?? null,
    tokens: user?.tokens ?? null,
  });
}
