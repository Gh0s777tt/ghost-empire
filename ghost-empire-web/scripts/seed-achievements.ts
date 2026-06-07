// scripts/seed-achievements.ts
// SAFE prod activation for the prestige / duel / casino achievements — upserts ONLY these
// rows (idempotent by `code`). Use this instead of `npm run db:seed`, which DELETES and
// recreates shop items + events (would wipe admin customizations on prod).
//   npx tsx scripts/seed-achievements.ts      (reads DATABASE_URL from .env.local / .env)
//
// Mirrors the same rows added to prisma/seed.ts so fresh installs get them too.

// Load env BEFORE importing the prisma client — the pg driver adapter reads DATABASE_URL
// at import time (src/lib/prisma.ts), so a dynamic import after loadEnvFile is required.
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file absent (e.g. CI / Vercel) — env already injected */
  }
}
const NEW_ACHIEVEMENTS = [
  { code: "prestige_1",   name: "Wniebowstąpienie", icon: "✦",  rarity: "epic",      description: "Zdobądź pierwszą gwiazdkę prestiżu ✦",  triggerType: "prestige",     triggerValue: 1,   tokenReward: 10000 },
  { code: "prestige_5",   name: "Pięć Gwiazd",      icon: "✦",  rarity: "legendary", description: "Zdobądź 5 gwiazdek prestiżu ✦",         triggerType: "prestige",     triggerValue: 5,   tokenReward: 50000 },
  { code: "duel_win_1",   name: "Pierwsza Krew",    icon: "⚔️", rarity: "common",    description: "Wygraj pierwszy pojedynek",             triggerType: "duels_won",    triggerValue: 1,   tokenReward: 500 },
  { code: "duel_win_10",  name: "Pojedynkowicz",    icon: "⚔️", rarity: "rare",      description: "Wygraj 10 pojedynków",                  triggerType: "duels_won",    triggerValue: 10,  tokenReward: 5000 },
  { code: "duel_win_50",  name: "Gladiator",        icon: "🗡️", rarity: "epic",      description: "Wygraj 50 pojedynków",                  triggerType: "duels_won",    triggerValue: 50,  tokenReward: 20000 },
  { code: "casino_first", name: "Pierwszy Zakład",  icon: "🎰", rarity: "common",    description: "Zagraj pierwszy raz w kasynie GT",      triggerType: "casino_plays", triggerValue: 1,   tokenReward: 200 },
  { code: "casino_100",   name: "Hazardzista",      icon: "🎲", rarity: "rare",      description: "Zagraj 100 razy w kasynie GT",          triggerType: "casino_plays", triggerValue: 100, tokenReward: 5000 },
];

async function main() {
  // Imported here (not at top) so the loadEnvFile() above runs first — the pg adapter
  // reads DATABASE_URL at module-eval time.
  const { prisma } = await import("../src/lib/prisma");
  // Multi-tenant: seed into the default "ghost-empire" tenant (code is unique PER tenant).
  const tenant = await prisma.tenant.upsert({
    where: { slug: "ghost-empire" },
    update: {},
    create: { slug: "ghost-empire", name: "GH0ST EMPIRE", shortName: "Ghost Empire", brandColor: "#E50914" },
  });
  for (const a of NEW_ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: a.code } },
      update: a,
      create: { ...a, tenantId: tenant.id },
    });
  }
  console.log(`✅ upserted ${NEW_ACHIEVEMENTS.length} achievements (prestiż / pojedynki / kasyno)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
