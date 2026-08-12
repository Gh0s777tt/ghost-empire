// src/app/api/internal/song-request/route.ts
// Bot → portal: enqueue a viewer's song request. Bearer BOT_SECRET (mirrors chat-award).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBotSecretForTenant } from "@/lib/utils";
import { featureGateResponse } from "@/lib/entitlements";
import { currentTenantId, getCurrentTenantBotAuth } from "@/lib/tenant";
import { fetchSongTitle, normalizeRequester } from "@/lib/song-requests";

const MAX_QUERY = 200;
const MAX_QUEUE = 200; // reject if the queue is already huge

const PLATFORMS = new Set(["twitch", "kick", "youtube"]);

export async function POST(req: Request) {
  const { botSecret } = await getCurrentTenantBotAuth();
  if (!verifyBotSecretForTenant(req.headers.get("authorization"), botSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Plan gate (pro+) — the bot relays the 403 message to the viewer in chat.
  const gated = await featureGateResponse("song_queue");
  if (gated) return gated;

  let body: { action?: string; query?: string; requestedBy?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tid = await currentTenantId();

  // Viewer self-cancel (!unsr / !wrongsong): usuń NAJNOWSZĄ wciąż-zakolejkowaną prośbę TEGO
  // widza. Dopasowanie po znormalizowanym handle (case-insensitive, jak ban) ORAZ status
  // "queued" — więc nie da się skasować cudzej prośby ani pozycji już granej/odtworzonej.
  // Tenant-scoped tym samym OR co reszta trasy. Idzie tą samą ścieżką auth/gate co !sr wyżej.
  if (body.action === "cancel") {
    const handle = normalizeRequester(body.requestedBy ?? "");
    if (!handle) return NextResponse.json({ error: "Invalid requester" }, { status: 400 });
    const tenantScope = tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {};
    const own = await prisma.songRequest.findFirst({
      where: { status: "queued", requestedBy: { equals: handle, mode: "insensitive" }, ...tenantScope },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, query: true },
    });
    if (!own) return NextResponse.json({ error: "not_found", message: "Nie masz utworu w kolejce do usunięcia." }, { status: 404 });
    // Hard-delete: to była POMYŁKA widza ("zły utwór"), więc znika zamiast osiadać w liście
    // "recent" jako skipped — spójne z akcją "delete" w panelu admina.
    await prisma.songRequest.delete({ where: { id: own.id } });
    return NextResponse.json({ ok: true, removed: own.title ?? own.query });
  }

  const query = (body.query ?? "").trim();
  if (!query || query.length > MAX_QUERY) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

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
