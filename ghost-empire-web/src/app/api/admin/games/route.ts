// src/app/api/admin/games/route.ts
// Admin-only: configure the SteamID, trigger a sync, and hide/show games.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { getGameLibraryConfig, syncSteamLibrary, syncPsnLibrary, syncXboxLibrary } from "@/lib/games";
import { coerceSteamId } from "@/lib/steam";
import { currentTenantId } from "@/lib/tenant";
import { encryptSecret } from "@/lib/crypto";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const cfg = await getGameLibraryConfig();
  // Scope every aggregate to this portal (OR-null keeps legacy rows until backfill claims them).
  const tid = await currentTenantId();
  const tw = tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {};
  const [count, totals, games] = await Promise.all([
    prisma.game.count({ where: tw }),
    prisma.game.aggregate({ _sum: { playtimeMin: true }, where: tw }),
    prisma.game.findMany({ where: tw, orderBy: { playtimeMin: "desc" }, take: 200 }),
  ]);

  return NextResponse.json({
    steamId: cfg.steamId,
    steamSyncedAt: cfg.steamSyncedAt?.toISOString() ?? null,
    psnSyncedAt: cfg.psnSyncedAt?.toISOString() ?? null,
    xboxSyncedAt: cfg.xboxSyncedAt?.toISOString() ?? null,
    hasKey: !!process.env.STEAM_API_KEY,
    // Per-portal NPSSO set, or the global env as fallback (the secret itself is never returned).
    hasPsnNpsso: !!cfg.psnNpsso,
    hasNpsso: !!cfg.psnNpsso || !!process.env.PSN_NPSSO,
    // Per-portal Xbox key set (no env fallback; the key itself is never returned).
    hasXboxKey: !!cfg.xboxApiKey,
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

  let body: { action?: string; steamId?: string; npsso?: string; xboxKey?: string; id?: string; hidden?: boolean };
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

  if (body.action === "set_psn_npsso") {
    // Per-portal PSN NPSSO — encrypted at rest; empty clears it (falls back to PSN_NPSSO env).
    const cfg = await getGameLibraryConfig();
    const raw = typeof body.npsso === "string" ? body.npsso.trim() : "";
    if (raw.length > 4000) return NextResponse.json({ error: "NPSSO za długi" }, { status: 400 });
    await prisma.gameLibraryConfig.update({ where: { id: cfg.id }, data: { psnNpsso: raw ? encryptSecret(raw) : null } });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "game_library", targetId: "psn_npsso", req });
    return NextResponse.json({ ok: true, hasPsnNpsso: !!raw });
  }

  if (body.action === "set_xbox_key") {
    // Per-portal Xbox (OpenXBL) API key — encrypted at rest; empty clears it.
    const cfg = await getGameLibraryConfig();
    const raw = typeof body.xboxKey === "string" ? body.xboxKey.trim() : "";
    if (raw.length > 4000) return NextResponse.json({ error: "Klucz za długi" }, { status: 400 });
    await prisma.gameLibraryConfig.update({ where: { id: cfg.id }, data: { xboxApiKey: raw ? encryptSecret(raw) : null } });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "game_library", targetId: "xbox_key", req });
    return NextResponse.json({ ok: true, hasXboxKey: !!raw });
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

  if (body.action === "sync_xbox") {
    const result = await syncXboxLibrary();
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "game_library", targetId: "sync_xbox", details: result, req });
    return NextResponse.json(result);
  }

  if (body.action === "toggle_hidden") {
    if (typeof body.id !== "string" || typeof body.hidden !== "boolean") {
      return NextResponse.json({ error: "id + hidden wymagane" }, { status: 400 });
    }
    // Scope by tenant so an admin can't flip another portal's game by id (OR-null = own + legacy).
    const tid = await currentTenantId();
    const r = await prisma.game.updateMany({
      where: { id: body.id, ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) },
      data: { hidden: body.hidden },
    });
    if (r.count === 0) return NextResponse.json({ error: "Nie znaleziono gry" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action: set_steam_id | sync | toggle_hidden" }, { status: 400 });
}
