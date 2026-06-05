// scripts/sync-steam.ts
// One-off utility: optionally set the SteamID (STEAM_ID env) then sync the Steam
// library into the DB. Needs DATABASE_URL + STEAM_API_KEY in env.
//   npx tsx scripts/sync-steam.ts
import { prisma } from "../src/lib/prisma";
import { syncSteamLibrary } from "../src/lib/games";

async function main() {
  const steamId = process.env.STEAM_ID;
  if (steamId) {
    await prisma.gameLibraryConfig.upsert({
      where: { id: "default" },
      create: { id: "default", steamId },
      update: { steamId },
    });
    console.log("[sync-steam] steamId set:", steamId);
  }
  const result = await syncSteamLibrary();
  console.log("[sync-steam] result:", result);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("[sync-steam] failed:", e);
  process.exit(1);
});
