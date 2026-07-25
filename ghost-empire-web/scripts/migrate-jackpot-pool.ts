// scripts/migrate-jackpot-pool.ts
// One-shot: move the LEGACY, globally-shared jackpot surplus into one portal's own pool.
//
// Why this exists: the progressive jackpot used to live under a single Redis key
// (`jackpot:surplus`) shared by every portal — bets on one streamer's portal grew everyone's
// jackpot and a win on another drained it. The pool is now per portal (`jackpot:surplus:<tid>`,
// see `lib/gt-games.ts`), which is correct but leaves the accumulated surplus orphaned under
// the old key: every portal's displayed jackpot drops back to the seed on deploy.
//
// Chips carry no market value, so nothing is *owed* to anyone and doing nothing is a valid
// choice. This script exists so the drop isn't forced on you: it hands the historical surplus
// to the portal that produced most of it (the founder tenant by default).
//
// Usage (from ghost-empire-web/, with the PROD Redis env loaded):
//   npx tsx scripts/migrate-jackpot-pool.ts                 # dry run — prints, changes nothing
//   npx tsx scripts/migrate-jackpot-pool.ts --apply         # move it to the founder tenant
//   npx tsx scripts/migrate-jackpot-pool.ts --apply --tenant <tenantId>
//
// Idempotent: it GETDELs the legacy key, so a second run finds nothing left to move. If the
// INCRBY were to fail after the GETDEL, the amount is printed so it can be restored by hand.
import { redis } from "../src/lib/redis";
import { prisma } from "../src/lib/prisma";
import { JACKPOT_KEY, jackpotKey, JACKPOT_SEED } from "../src/lib/gt-games";

const DEFAULT_TENANT_SLUG = "ghost-empire";

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantArg = process.argv.indexOf("--tenant");
  const explicitTenant = tenantArg !== -1 ? process.argv[tenantArg + 1] : null;

  if (!redis) {
    console.error("❌ Brak Redisa (UPSTASH_REDIS_REST_URL/TOKEN) — bez niego jackpot i tak nie rośnie.");
    process.exit(1);
  }

  const legacy = Number(await redis.get(JACKPOT_KEY)) || 0;
  if (legacy <= 0) {
    console.log(`✅ Stary, wspólny klucz "${JACKPOT_KEY}" jest pusty — nie ma czego przenosić.`);
    return;
  }

  const tenant = explicitTenant
    ? await prisma.tenant.findUnique({ where: { id: explicitTenant }, select: { id: true, slug: true } })
    : await prisma.tenant.findUnique({ where: { slug: DEFAULT_TENANT_SLUG }, select: { id: true, slug: true } });
  if (!tenant) {
    console.error(`❌ Nie znaleziono portalu (${explicitTenant ?? DEFAULT_TENANT_SLUG}).`);
    process.exit(1);
  }

  const target = jackpotKey(tenant.id);
  const already = Number(await redis.get(target)) || 0;
  console.log(`Stara wspólna nadwyżka:      ${legacy.toLocaleString("pl-PL")} 🪙  (klucz "${JACKPOT_KEY}")`);
  console.log(`Portal docelowy:             ${tenant.slug} → "${target}"`);
  console.log(`Nadwyżka portalu teraz:      ${already.toLocaleString("pl-PL")} 🪙`);
  console.log(`Wyświetlana pula po zmianie: ${(JACKPOT_SEED + already + legacy).toLocaleString("pl-PL")} 🪙 (ziarno ${JACKPOT_SEED.toLocaleString("pl-PL")} + nadwyżka)`);

  if (!apply) {
    console.log("\n(dry run — nic nie zmieniono; dodaj --apply, żeby wykonać)");
    return;
  }

  // GETDEL first: the legacy key must not be readable twice, or a re-run would duplicate the
  // amount into the target pool.
  const claimed = Number(await redis.getdel(JACKPOT_KEY)) || 0;
  if (claimed <= 0) {
    console.log("✅ Nic nie zostało do przeniesienia (ktoś był szybszy).");
    return;
  }
  try {
    await redis.incrby(target, claimed);
    console.log(`\n✅ Przeniesiono ${claimed.toLocaleString("pl-PL")} 🪙 do puli portalu ${tenant.slug}.`);
  } catch (e) {
    // The amount is already out of the legacy key — print it so nothing is lost silently.
    console.error(`\n❌ INCRBY padł PO zabraniu ${claimed} 🪙 ze starego klucza. Przywróć ręcznie:`);
    console.error(`   redis INCRBY "${target}" ${claimed}`);
    throw e;
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
