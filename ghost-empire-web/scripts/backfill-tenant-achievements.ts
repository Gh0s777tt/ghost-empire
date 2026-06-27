// scripts/backfill-tenant-achievements.ts
// One-off, owner-run backfill for the per-tenant achievement seeding (#689). Onboarding now
// auto-clones the founder catalog into every NEW portal, but tenants created earlier (before
// #689) have an empty catalog. This clones the founder catalog into every tenant that is
// missing achievements. Idempotent (skipDuplicates on the unique [tenantId, code]) — safe to
// re-run. Does NOT touch the founder tenant or any tenant that already has rows.
//   npx tsx scripts/backfill-tenant-achievements.ts      (reads DATABASE_URL from .env.local / .env)
export {}; // module marker — isolates `main` from other scripts' top-level scope (TS2393)

// Load env BEFORE importing the prisma client (the pg adapter reads DATABASE_URL at import time).
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file absent (e.g. CI / Vercel) — env already injected */
  }
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { seedTenantAchievements } = await import("../src/lib/achievements");

  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  let touched = 0;
  for (const t of tenants) {
    const have = await prisma.achievement.count({ where: { tenantId: t.id } });
    if (have > 0) {
      console.log(`• ${t.slug}: ${have} achievements — skip`);
      continue;
    }
    const n = await seedTenantAchievements(t.id);
    console.log(`✅ ${t.slug}: seeded ${n} achievements`);
    if (n > 0) touched++;
  }
  console.log(`Done — backfilled ${touched} tenant(s).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
