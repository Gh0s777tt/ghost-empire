// src/lib/games.ts
// Game library aggregation. Steam first (official API); GOG/PSN/Xbox can plug in the
// same Game table later. Sync upserts owned games and prunes ones no longer owned.
import { prisma } from "@/lib/prisma";
import { fetchSteamOwnedGames, steamHeaderImage } from "@/lib/steam";
import { fetchPsnTitles } from "@/lib/psn";
import { fetchXboxTitles } from "@/lib/xbox";
import { createLogger } from "@/lib/logger";
import { currentTenantId } from "@/lib/tenant";
import { decryptSecret } from "@/lib/crypto";

const log = createLogger("games");

export async function getGameLibraryConfig() {
  const tid = await currentTenantId();
  if (tid) {
    const existing = await prisma.gameLibraryConfig.findFirst({ where: { tenantId: tid } });
    if (existing) return existing;
    try {
      return await prisma.gameLibraryConfig.create({ data: { tenantId: tid } });
    } catch {
      // Two concurrent first-syncs can race the create (tenantId is @unique) → P2002.
      // Re-read the row the winner created instead of surfacing a sync error. #audit4
      const row = await prisma.gameLibraryConfig.findFirst({ where: { tenantId: tid } });
      if (row) return row;
      throw new Error("game library config unavailable");
    }
  }
  return prisma.gameLibraryConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
}

export type SyncResult = { ok: boolean; synced?: number; removed?: number; error?: string };

type GameData = { name: string; imageUrl: string | null; playtimeMin: number; lastPlayedAt: Date | null };

/**
 * Tenant-scoped upsert into the per-portal Game table. For a real tenant we key on the
 * `[tenantId, source, externalId]` compound unique; for the legacy null-tenant case (no
 * request scope / pre-backfill) Prisma can't use a compound unique with a NULL member, so
 * we emulate the upsert with findFirst + update/create.
 */
async function upsertGame(tid: string | null, source: string, externalId: string, data: GameData) {
  if (tid) {
    await prisma.game.upsert({
      where: { tenantId_source_externalId: { tenantId: tid, source, externalId } },
      create: { tenantId: tid, source, externalId, ...data },
      update: data,
    });
    return;
  }
  const existing = await prisma.game.findFirst({ where: { tenantId: null, source, externalId } });
  if (existing) await prisma.game.update({ where: { id: existing.id }, data });
  else await prisma.game.create({ data: { source, externalId, ...data } });
}

/** Pull the Steam library for the configured SteamID into the Game table. */
export async function syncSteamLibrary(): Promise<SyncResult> {
  const cfg = await getGameLibraryConfig();
  if (!cfg.steamId) return { ok: false, error: "Brak SteamID — ustaw go w panelu" };
  const tid = cfg.tenantId ?? null;

  let games;
  try {
    games = await fetchSteamOwnedGames(cfg.steamId);
  } catch (e) {
    const error = e instanceof Error ? e.message : "fetch_failed";
    log.error("steam sync failed", e, { steamId: cfg.steamId });
    return { ok: false, error };
  }

  // On the FIRST Steam sync only, claim any legacy null-tenant Steam rows for this portal so
  // a re-sync updates them in place instead of duplicating. Gated by `steamSyncedAt` so it
  // can't repeatedly land-grab another tenant's pre-backfill rows on every later sync. #audit4
  if (tid && !cfg.steamSyncedAt) await prisma.game.updateMany({ where: { tenantId: null, source: "steam" }, data: { tenantId: tid } });

  const appIds: string[] = [];
  for (const g of games) {
    const externalId = String(g.appid);
    appIds.push(externalId);
    const data = {
      name: (g.name || `App ${g.appid}`).slice(0, 200),
      imageUrl: steamHeaderImage(g.appid),
      playtimeMin: Math.max(0, g.playtime_forever ?? 0),
      lastPlayedAt: g.rtime_last_played ? new Date(g.rtime_last_played * 1000) : null,
    };
    await upsertGame(tid, "steam", externalId, data);
  }

  // Drop this portal's Steam games no longer owned (refunds, family-share expiry, etc.).
  const removed = await prisma.game.deleteMany({
    where: { tenantId: tid, source: "steam", externalId: { notIn: appIds.length ? appIds : ["__none__"] } },
  });

  await prisma.gameLibraryConfig.update({ where: { id: cfg.id }, data: { steamSyncedAt: new Date() } });
  log.info("steam library synced", { synced: games.length, removed: removed.count });
  return { ok: true, synced: games.length, removed: removed.count };
}

/** Pull the PSN trophy library (played titles) into the Game table. Needs PSN_NPSSO. */
export async function syncPsnLibrary(): Promise<SyncResult> {
  // PSN config lives per-tenant alongside Steam (the NPSSO is still a global env for now —
  // per-tenant PSN connect lands with the subdomain milestone). Scope the rows by tenant.
  const cfg = await getGameLibraryConfig();
  const tid = cfg.tenantId ?? null;
  // Per-portal NPSSO first (encrypted at rest), then the global env as back-compat.
  const npsso = (cfg.psnNpsso ? decryptSecret(cfg.psnNpsso) : null) || process.env.PSN_NPSSO || null;
  if (!npsso) return { ok: false, error: "PSN nie skonfigurowany — ustaw NPSSO w panelu" };

  let titles;
  try {
    titles = await fetchPsnTitles(npsso);
  } catch (e) {
    const error = e instanceof Error ? e.message : "fetch_failed";
    log.error("psn sync failed", e);
    return { ok: false, error };
  }

  if (tid && !cfg.psnSyncedAt) await prisma.game.updateMany({ where: { tenantId: null, source: "psn" }, data: { tenantId: tid } });

  const ids: string[] = [];
  for (const t of titles) {
    ids.push(t.id);
    const lp = t.lastPlayed ? new Date(t.lastPlayed) : null;
    const data = {
      name: t.name.slice(0, 200),
      imageUrl: t.image,
      playtimeMin: 0, // trophy API has no playtime
      lastPlayedAt: lp && !Number.isNaN(lp.getTime()) ? lp : null,
    };
    await upsertGame(tid, "psn", t.id, data);
  }
  const removed = await prisma.game.deleteMany({
    where: { tenantId: tid, source: "psn", externalId: { notIn: ids.length ? ids : ["__none__"] } },
  });
  await prisma.gameLibraryConfig.update({ where: { id: cfg.id }, data: { psnSyncedAt: new Date() } });
  log.info("psn library synced", { synced: titles.length, removed: removed.count });
  return { ok: true, synced: titles.length, removed: removed.count };
}

/** Pull the Xbox (Xbox Live) played-titles library via OpenXBL. Needs a per-portal xbl.io key. */
export async function syncXboxLibrary(): Promise<SyncResult> {
  const cfg = await getGameLibraryConfig();
  const tid = cfg.tenantId ?? null;
  const apiKey = cfg.xboxApiKey ? decryptSecret(cfg.xboxApiKey) : null;
  if (!apiKey) return { ok: false, error: "Xbox nie skonfigurowany — ustaw klucz xbl.io w panelu" };

  let titles;
  try {
    titles = await fetchXboxTitles(apiKey);
  } catch (e) {
    const error = e instanceof Error ? e.message : "fetch_failed";
    log.error("xbox sync failed", e);
    return { ok: false, error };
  }

  if (tid && !cfg.xboxSyncedAt) await prisma.game.updateMany({ where: { tenantId: null, source: "xbox" }, data: { tenantId: tid } });

  const ids: string[] = [];
  for (const x of titles) {
    ids.push(x.id);
    const lp = x.lastPlayed ? new Date(x.lastPlayed) : null;
    const data = {
      name: x.name.slice(0, 200),
      imageUrl: x.image,
      playtimeMin: 0, // Xbox title history has no playtime
      lastPlayedAt: lp && !Number.isNaN(lp.getTime()) ? lp : null,
    };
    await upsertGame(tid, "xbox", x.id, data);
  }
  const removed = await prisma.game.deleteMany({
    where: { tenantId: tid, source: "xbox", externalId: { notIn: ids.length ? ids : ["__none__"] } },
  });
  await prisma.gameLibraryConfig.update({ where: { id: cfg.id }, data: { xboxSyncedAt: new Date() } });
  log.info("xbox library synced", { synced: titles.length, removed: removed.count });
  return { ok: true, synced: titles.length, removed: removed.count };
}
