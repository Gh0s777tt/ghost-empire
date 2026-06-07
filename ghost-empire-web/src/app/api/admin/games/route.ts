// src/app/api/admin/games/route.ts
// Admin-only: configure the SteamID, trigger a sync, and hide/show games.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { getGameLibraryConfig, syncSteamLibrary, syncPsnLibrary } from "@/lib/games";
import { coerceSteamId } from "@/lib/steam";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const cfg = await getGameLibraryConfig();
  const [count, totals, games] = await Promise.all([
    prisma.game.count(),
    prisma.game.aggregate({ _sum: { playtimeMin: true } }),
    prisma.game.findMany({ orderBy: { playtimeMin: "desc" }, take: 200 }),
  ]);

  return NextResponse.json({
    steamId: cfg.steamId,
    steamSyncedAt: cfg.steamSyncedAt?.toISOString() ?? null,
    hasKey: !!process.env.STEAM_API_KEY,
    hasNpsso: !!process.env.PSN_NPSSO,
    count,
    totalHours: Math.round((totals._sum.playtimeMin ?? 0) / 60),
    games: games.map((g) => ({
      id: g.id, source: g.source, name: g.name, imageUrl: g.imageUrl,
      hours: Math.round(g.playtimeMin / 60), hidden: g.hidden,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { action?: string; steamId?: string; id?: string; hidden?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  if (body.action === "set_steam_id") {
    const resolved = body.steamId ? await coerceSteamId(body.steamId) : null;
    if (body.steamId && !resolved) {
      return NextResponse.json({ error: "Nie rozpoznano SteamID / vanity / URL" }, { status: 400 });
    }
    const cfg = await getGameLibraryConfig();
    await prisma.gameLibraryConfig.update({ where: { id: cfg.id }, data: { steamId: resolved } });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "game_library", targetId: "steam", req });
    return NextResponse.json({ ok: true, steamId: resolved });
  }

  if (body.action === "sync") {
    const result = await syncSteamLibrary();
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "game_library", targetId: "sync", details: result, req });
    return NextResponse.json(result);
  }

  if (body.action === "sync_psn") {
    const result = await syncPsnLibrary();
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "game_library", targetId: "sync_psn", details: result, req });
    return NextResponse.json(result);
  }

  if (body.action === "toggle_hidden") {
    if (typeof body.id !== "string" || typeof body.hidden !== "boolean") {
      return NextResponse.json({ error: "id + hidden wymagane" }, { status: 400 });
    }
    await prisma.game.update({ where: { id: body.id }, data: { hidden: body.hidden } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action: set_steam_id | sync | toggle_hidden" }, { status: 400 });
}
