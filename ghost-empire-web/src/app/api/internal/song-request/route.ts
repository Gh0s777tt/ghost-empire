// src/app/api/internal/song-request/route.ts
// Bot → portal: enqueue a viewer's song request. Bearer BOT_SECRET (mirrors chat-award).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBotSecret } from "@/lib/utils";
import { featureGateResponse } from "@/lib/entitlements";
import { currentTenantId } from "@/lib/tenant";
import { fetchSongTitle, normalizeRequester } from "@/lib/song-requests";

const MAX_QUERY = 200;
const MAX_QUEUE = 200; // reject if the queue is already huge

const PLATFORMS = new Set(["twitch", "kick", "youtube"]);

export async function POST(req: Request) {
  if (!verifyBotSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Plan gate (pro+) — the bot relays the 403 message to the viewer in chat.
  const gated = await featureGateResponse("song_queue");
  if (gated) return gated;

  let body: { query?: string; requestedBy?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const query = (body.query ?? "").trim();
  if (!query || query.length > MAX_QUERY) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const tid = await currentTenantId();

  // Ban check: a chatter the streamer banned (admin Song Queue) can't enqueue. The bot
  // relays the message to chat. Matched on the lowercased handle, scoped to this portal.
  const requestedBy = (body.requestedBy ?? "widz").slice(0, 80);
  const banned = await prisma.songRequestBan.findFirst({
    where: { name: normalizeRequester(requestedBy), tenantId: tid },
    select: { id: true },
  });
  if (banned) {
    return NextResponse.json({ error: "banned", message: "Masz zakaz dodawania utworów do kolejki." }, { status: 403 });
  }

  const queued = await prisma.songRequest.count({
    where: { status: "queued", ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) },
  });
  if (queued >= MAX_QUEUE) {
    return NextResponse.json({ error: "Queue full" }, { status: 429 });
  }

  await prisma.songRequest.create({
    data: {
      tenantId: tid,
      query,
      title: await fetchSongTitle(query),
      requestedBy,
      platform: PLATFORMS.has(body.platform ?? "") ? body.platform! : "unknown",
    },
  });

  return NextResponse.json({ ok: true, position: queued + 1 });
}
