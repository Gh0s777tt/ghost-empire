// src/lib/games.ts
// Game library aggregation. Steam first (official API); GOG/PSN/Xbox can plug in the
// same Game table later. Sync upserts owned games and prunes ones no longer owned.
import { prisma } from "@/lib/prisma";
import { fetchSteamOwnedGames, steamHeaderImage } from "@/lib/steam";
import { fetchPsnTitles } from "@/lib/psn";
import { createLogger } from "@/lib/logger";

const log = createLogger("games");

export async function getGameLibraryConfig() {
  return prisma.gameLibraryConfig.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}

export type SyncResult = { ok: boolean; synced?: number; removed?: number; error?: string };

/** Pull the Steam library for the configured SteamID into the Game table. */
export async function syncSteamLibrary(): Promise<SyncResult> {
  const cfg = await getGameLibraryConfig();
  if (!cfg.steamId) return { ok: false, error: "Brak SteamID — ustaw go w panelu" };

  let games;
  try {
    games = await fetchSteamOwnedGames(cfg.steamId);
  } catch (e) {
    const error = e instanceof Error ? e.message : "fetch_failed";
    log.error("steam sync failed", e, { steamId: cfg.steamId });
    return { ok: false, error };
  }

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
    await prisma.game.upsert({
      where: { source_externalId: { source: "steam", externalId } },
      create: { source: "steam", externalId, ...data },
      update: data,
    });
  }

  // Drop Steam games no longer owned (refunds, family-share expiry, etc.).
  const removed = await prisma.game.deleteMany({
    where: { source: "steam", externalId: { notIn: appIds.length ? appIds : ["__none__"] } },
  });

  await prisma.gameLibraryConfig.update({ where: { id: "default" }, data: { steamSyncedAt: new Date() } });
  log.info("steam library synced", { synced: games.length, removed: removed.count });
  return { ok: true, synced: games.length, removed: removed.count };
}

/** Pull the PSN trophy library (played titles) into the Game table. Needs PSN_NPSSO. */
export async function syncPsnLibrary(): Promise<SyncResult> {
  let titles;
  try {
    titles = await fetchPsnTitles();
  } catch (e) {
    const error = e instanceof Error ? e.message : "fetch_failed";
    log.error("psn sync failed", e);
    return { ok: false, error };
  }

  const ids: string[] = [];
  for (const t of titles) {
    ids.push(t.id);
    const data = {
      name: t.name.slice(0, 200),
      imageUrl: t.image,
      playtimeMin: 0, // trophy API has no playtime
      lastPlayedAt: t.lastPlayed ? new Date(t.lastPlayed) : null,
    };
    await prisma.game.upsert({
      where: { source_externalId: { source: "psn", externalId: t.id } },
      create: { source: "psn", externalId: t.id, ...data },
      update: data,
    });
  }
  const removed = await prisma.game.deleteMany({
    where: { source: "psn", externalId: { notIn: ids.length ? ids : ["__none__"] } },
  });
  log.info("psn library synced", { synced: titles.length, removed: removed.count });
  return { ok: true, synced: titles.length, removed: removed.count };
}
