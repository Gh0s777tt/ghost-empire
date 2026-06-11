// src/app/api/internal/song-request/route.ts
// Bot → portal: enqueue a viewer's song request. Bearer BOT_SECRET (mirrors chat-award).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBotSecret } from "@/lib/utils";
import { featureGateResponse } from "@/lib/entitlements";
import { currentTenantId } from "@/lib/tenant";

const MAX_QUERY = 200;
const MAX_QUEUE = 200; // reject if the queue is already huge

const PLATFORMS = new Set(["twitch", "kick", "youtube"]);

// Best-effort title from a YouTube/Spotify link via oEmbed (no API key, no quota).
async function fetchTitle(query: string): Promise<string | null> {
  if (!/^https?:\/\//i.test(query)) return null;
  let url: string | null = null;
  if (/youtube\.com|youtu\.be/i.test(query)) url = `https://www.youtube.com/oembed?url=${encodeURIComponent(query)}&format=json`;
  else if (/open\.spotify\.com/i.test(query)) url = `https://open.spotify.com/oembed?url=${encodeURIComponent(query)}`;
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    return data.title ? data.title.slice(0, 200) : null;
  } catch {
    return null; // never block the request on a flaky oEmbed
  }
}

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
      title: await fetchTitle(query),
      requestedBy: (body.requestedBy ?? "widz").slice(0, 80),
      platform: PLATFORMS.has(body.platform ?? "") ? body.platform! : "unknown",
    },
  });

  return NextResponse.json({ ok: true, position: queued + 1 });
}
