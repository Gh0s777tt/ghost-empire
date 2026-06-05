// scripts/sync-psn.ts
// Sync the PSN trophy library into the Game table. Needs DATABASE_URL + PSN_NPSSO.
//   npx tsx scripts/sync-psn.ts
import { prisma } from "../src/lib/prisma";
import { syncPsnLibrary } from "../src/lib/games";

async function main() {
  const result = await syncPsnLibrary();
  console.log("[sync-psn] result:", result);
  await prisma.$disconnect();
}

main().catch((e) => { console.error("[sync-psn] failed:", e); process.exit(1); });
