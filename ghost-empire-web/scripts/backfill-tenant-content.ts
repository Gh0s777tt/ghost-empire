// scripts/backfill-tenant-content.ts
// One-off, owner-run backfill for per-tenant content seeding (#689/#690). Onboarding now
// auto-seeds the founder's engagement content (achievements, daily quests, alert styling,
// battle pass) into every NEW portal; tenants created earlier started empty. This clones that
// content into every non-founder tenant. Idempotent (catalog clones skipDuplicates; battle pass
// skipped if a season already exists) + best-effort — safe to re-run.
//   npx tsx scripts/backfill-tenant-content.ts      (reads DATABASE_URL from .env.local / .env)
export {}; // module marker — isolates `main` from sibling scripts' top-level scope (TS2393)

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
  const { seedTenantContent } = await import("../src/lib/tenant-seed");

  const tenants = await prisma.tenant.findMany({ where: { slug: { not: "ghost-empire" } }, select: { id: true, slug: true } });
  for (const t of tenants) {
    const r = await seedTenantContent(t.id);
    console.log(`✅ ${t.slug}: achievements=${r.achievements} quests=${r.dailyTasks} alertConfigs=${r.alertConfigs} battlePass=${r.battlePass}`);
  }
  console.log(`Done — processed ${tenants.length} non-founder tenant(s).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
