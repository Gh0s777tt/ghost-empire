// src/app/api/internal/song-request/route.ts
// Bot → portal: enqueue a viewer's song request. Bearer BOT_SECRET (mirrors chat-award).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBotSecret } from "@/lib/utils";

const MAX_QUERY = 200;
const MAX_QUEUE = 200; // reject if the queue is already huge

const PLATFORMS = new Set(["twitch", "kick", "youtube"]);

export async function POST(req: Request) {
  if (!verifyBotSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const queued = await prisma.songRequest.count({ where: { status: "queued" } });
  if (queued >= MAX_QUEUE) {
    return NextResponse.json({ error: "Queue full" }, { status: 429 });
  }

  await prisma.songRequest.create({
    data: {
      query,
      requestedBy: (body.requestedBy ?? "widz").slice(0, 80),
      platform: PLATFORMS.has(body.platform ?? "") ? body.platform! : "unknown",
    },
  });

  return NextResponse.json({ ok: true, position: queued + 1 });
}
