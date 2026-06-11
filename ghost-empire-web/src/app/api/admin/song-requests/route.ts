// src/app/api/admin/song-requests/route.ts
// Song request queue management. Admin-only. Viewers enqueue via the bot
// (/api/internal/song-request); the streamer plays/skips/clears here.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";

type Row = {
  id: string; query: string; title: string | null; requestedBy: string; platform: string;
  status: string; createdAt: Date; playedAt: Date | null;
};
function serialize(s: Row) {
  return {
    id: s.id, query: s.query, title: s.title, requestedBy: s.requestedBy, platform: s.platform,
    status: s.status, createdAt: s.createdAt.toISOString(),
    playedAt: s.playedAt?.toISOString() ?? null,
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tid = await currentTenantId();
  const tenantScope = tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {};
  const [active, recent] = await Promise.all([
    prisma.songRequest.findMany({
      where: { status: { in: ["queued", "playing"] }, ...tenantScope },
      orderBy: [{ status: "desc" }, { createdAt: "asc" }], // "playing" before "queued", then FIFO
    }),
    prisma.songRequest.findMany({
      where: { status: { in: ["played", "skipped"] }, ...tenantScope },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return NextResponse.json({
    queue: active.map(serialize),
    recent: recent.map(serialize),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { action?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tid = await currentTenantId();
  const tenantScope = tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {};

  switch (body.action) {
    case "play": {
      if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      const owned = await prisma.songRequest.findFirst({ where: { id: body.id, ...tenantScope } });
      if (!owned) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
      // mark any currently-playing as played, then set this one playing
      await prisma.songRequest.updateMany({ where: { status: "playing", ...tenantScope }, data: { status: "played", playedAt: new Date() } });
      const updated = await prisma.songRequest.update({ where: { id: body.id }, data: { status: "playing" } });
      return NextResponse.json({ ok: true, song: serialize(updated) });
    }
    case "played": {
      if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      const owned = await prisma.songRequest.findFirst({ where: { id: body.id, ...tenantScope } });
      if (!owned) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
      const updated = await prisma.songRequest.update({ where: { id: body.id }, data: { status: "played", playedAt: new Date() } });
      return NextResponse.json({ ok: true, song: serialize(updated) });
    }
    case "skip": {
      if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      const owned = await prisma.songRequest.findFirst({ where: { id: body.id, ...tenantScope } });
      if (!owned) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
      const updated = await prisma.songRequest.update({ where: { id: body.id }, data: { status: "skipped" } });
      return NextResponse.json({ ok: true, song: serialize(updated) });
    }
    case "delete": {
      if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      const owned = await prisma.songRequest.findFirst({ where: { id: body.id, ...tenantScope } });
      if (!owned) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
      await prisma.songRequest.delete({ where: { id: body.id } });
      return NextResponse.json({ ok: true });
    }
    case "clear": {
      const res = await prisma.songRequest.updateMany({ where: { status: "queued", ...tenantScope }, data: { status: "skipped" } });
      return NextResponse.json({ ok: true, cleared: res.count });
    }
    default:
      return NextResponse.json({ error: "action: play | played | skip | delete | clear" }, { status: 400 });
  }
}
