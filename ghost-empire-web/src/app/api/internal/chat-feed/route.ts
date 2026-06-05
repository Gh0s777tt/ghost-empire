// src/app/api/internal/chat-feed/route.ts
// Bot → portal: forward a chat message for the OBS chat overlay. Bearer BOT_SECRET.
// Keeps only a short rolling buffer (prunes old rows opportunistically).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBotSecret } from "@/lib/utils";

const MAX_MESSAGE = 500;
const MAX_USERNAME = 80;
const KEEP_MS = 10 * 60 * 1000; // overlay only shows recent chat; drop older
const PLATFORMS = new Set(["twitch", "kick", "youtube"]);

export async function POST(req: Request) {
  if (!verifyBotSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { platform?: string; username?: string; message?: string; emotes?: unknown; badges?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (!message || !PLATFORMS.has(body.platform ?? "")) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  // Twitch passes its emote/badge maps so the overlay can render real emote images.
  const emotes = body.emotes && typeof body.emotes === "object" ? JSON.stringify(body.emotes).slice(0, 4000) : null;
  const badges = body.badges && typeof body.badges === "object" ? JSON.stringify(body.badges).slice(0, 1000) : null;

  await prisma.chatFeedMessage.create({
    data: {
      platform: body.platform!,
      username: (body.username ?? "widz").slice(0, MAX_USERNAME),
      message: message.slice(0, MAX_MESSAGE),
      emotes,
      badges,
    },
  });

  // Opportunistic prune so the table stays tiny (≈5% of inserts do the cleanup).
  if (Math.random() < 0.05) {
    await prisma.chatFeedMessage.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - KEEP_MS) } },
    });
  }

  return NextResponse.json({ ok: true });
}
