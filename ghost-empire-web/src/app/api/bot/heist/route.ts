// src/app/api/bot/heist/route.ts
// Bot → portal: co-op heist. Bearer BOT_SECRET. action="join" starts/joins the active heist
// for the chatter (resolved via their linked Connection); action="resolve" closes a heist by
// id (the bot fires this after the join window, or on lazy recovery). All GT escrow/payout +
// atomicity live in lib/heist.ts.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBotSecret } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { heistJoin, resolveHeist } from "@/lib/heist";

const PLATFORMS = new Set(["twitch", "kick", "youtube"]);

async function resolveUserId(platform: string, platformUserId?: string, username?: string): Promise<string | null> {
  if (platformUserId) {
    const c = await prisma.connection.findUnique({
      where: { platform_platformId: { platform, platformId: String(platformUserId) } },
      select: { userId: true },
    });
    if (c) return c.userId;
  }
  if (username) {
    const c = await prisma.connection.findFirst({
      where: { platform, username: { equals: username, mode: "insensitive" } },
      select: { userId: true },
    });
    if (c) return c.userId;
  }
  return null;
}

export async function POST(req: Request) {
  if (!verifyBotSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: {
    platform?: string;
    platformUserId?: string;
    username?: string;
    action?: string;
    bet?: number;
    heistId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const platform = String(body.platform ?? "");
  const action = body.action === "resolve" ? "resolve" : body.action === "join" ? "join" : null;
  if (!action || !PLATFORMS.has(platform)) {
    return NextResponse.json({ message: null });
  }

  // Resolve a heist by id (bot fires this after the join window). Bot-secret gated.
  if (action === "resolve") {
    if (!body.heistId) return NextResponse.json({ message: null });
    const message = await resolveHeist(String(body.heistId));
    return NextResponse.json({ message, ok: message != null });
  }

  // join
  const username = body.username ? String(body.username) : undefined;
  const u = username ?? "widz";
  const selfId = await resolveUserId(platform, body.platformUserId, username);
  if (!selfId) {
    return NextResponse.json({ message: `@${u} połącz konto na ${platform} przez !portal, by dołączyć do napadu.` });
  }

  const rl = await rateLimit(`heist:${selfId}`, 8, 60_000);
  if (!rl.allowed) return NextResponse.json({ message: `@${u} za szybko — chwila przerwy.` });

  const bet = Math.floor(Number(body.bet ?? 0));
  const r = await heistJoin({ platform, userId: selfId, name: u, bet });
  return NextResponse.json({ message: r.message, ok: r.ok, resolveInMs: r.resolveInMs, heistId: r.heistId });
}
