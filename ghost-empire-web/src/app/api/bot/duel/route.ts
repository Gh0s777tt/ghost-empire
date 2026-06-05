// src/app/api/bot/duel/route.ts
// Bot → portal: PvP duels. Bearer BOT_SECRET. Resolves the chatter (and, for a targeted
// challenge, the opponent handle) to Ghost Empire users via their linked Connection, then
// delegates to lib/duels (all GT math + atomicity live there) and returns a chat message.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBotSecret } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { createDuel, acceptDuel, declineDuel } from "@/lib/duels";

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
    target?: string;
    bet?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const platform = String(body.platform ?? "");
  const action =
    body.action === "accept" ? "accept" : body.action === "decline" ? "decline" : body.action === "challenge" ? "challenge" : null;
  const username = body.username ? String(body.username) : undefined;
  const u = username ?? "widz";
  if (!action || !PLATFORMS.has(platform)) {
    return NextResponse.json({ message: null });
  }

  const selfId = await resolveUserId(platform, body.platformUserId, username);
  if (!selfId) {
    return NextResponse.json({ message: `@${u} połącz konto na ${platform} przez !portal, by walczyć o GT.` });
  }

  // Per-user rate limit shared across duel actions (anti-spam / double-fire).
  const rl = await rateLimit(`duel:${selfId}`, 12, 60_000);
  if (!rl.allowed) return NextResponse.json({ message: `@${u} za szybko — chwila przerwy.` });

  if (action === "accept") {
    const r = await acceptDuel({ platform, accepterId: selfId, accepterName: u });
    return NextResponse.json({ message: r.message, ok: r.ok });
  }
  if (action === "decline") {
    const r = await declineDuel({ platform, accepterId: selfId, accepterName: u });
    return NextResponse.json({ message: r.message, ok: r.ok });
  }

  // challenge
  const bet = Math.floor(Number(body.bet ?? 0));
  let opponentId: string | null = null;
  let opponentName: string | null = null;
  const target = body.target ? String(body.target).replace(/^@/, "").trim() : "";
  if (target) {
    opponentName = target;
    opponentId = await resolveUserId(platform, undefined, target);
    if (!opponentId) {
      return NextResponse.json({
        message: `@${u} @${target} nie ma konta Ghost Empire na ${platform}. Spróbuj otwartego wyzwania: !duel ${bet || 100}.`,
      });
    }
  }
  const r = await createDuel({ platform, challengerId: selfId, challengerName: u, opponentId, opponentName, bet });
  return NextResponse.json({ message: r.message, ok: r.ok });
}
