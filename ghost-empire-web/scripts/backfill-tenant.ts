// scripts/backfill-tenant.ts
// Phase 1 of the multi-tenant SaaS migration: create the default "Ghost Empire"
// tenant and attach every existing user to it. Idempotent — safe to re-run.
//   npx tsx scripts/backfill-tenant.ts      (reads DATABASE_URL from .env.local / .env)
// Run AFTER `npx prisma db push` (the tenants table + users.tenantId must exist).
export {}; // mark as a module so top-level `main`/`DEFAULT` don't collide with sibling scripts

// Load env BEFORE importing the prisma client — the pg driver adapter reads
// DATABASE_URL at import time (src/lib/prisma.ts), so a dynamic import is required.
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file absent (CI / Vercel) — env already injected */
  }
}

// Mirrors src/lib/site.ts — kept inline so the script has no app-alias dependency.
const DEFAULT = { slug: "ghost-empire", name: "GH0ST EMPIRE", shortName: "Ghost Empire", brandColor: "#E50914" };

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEFAULT.slug },
    update: {},
    create: { slug: DEFAULT.slug, name: DEFAULT.name, shortName: DEFAULT.shortName, brandColor: DEFAULT.brandColor },
  });
  const { count } = await prisma.user.updateMany({
    where: { tenantId: null },
    data: { tenantId: tenant.id },
  });
  console.log(`✅ default tenant "${tenant.slug}" (${tenant.id}); attached ${count} user(s)`);

  // Attach the existing config singletons to the default tenant (one row per tenant).
  // Each Phase 3 model that gains a tenantId adds a line here; re-run after its db push.
  const ic = await prisma.integrationConfig.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   integrationConfig: attached ${ic.count} row(s)`);
  const wc = await prisma.welcomeConfig.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   welcomeConfig: attached ${wc.count} row(s)`);
  const mc = await prisma.moderationConfig.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   moderationConfig: attached ${mc.count} row(s)`);
  const bc = await prisma.botConfig.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   botConfig: attached ${bc.count} row(s)`);
  const whc = await prisma.wheelConfig.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   wheelConfig: attached ${whc.count} row(s)`);
  const glc = await prisma.gameLibraryConfig.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   gameLibraryConfig: attached ${glc.count} row(s)`);
  const coc = await prisma.chatOverlayConfig.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   chatOverlayConfig: attached ${coc.count} row(s)`);
  const cdc = await prisma.codeDropConfig.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   codeDropConfig: attached ${cdc.count} row(s)`);
  const sub = await prisma.subathon.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   subathon: attached ${sub.count} row(s)`);
  const sch = await prisma.streamScheduleSlot.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   streamScheduleSlot: attached ${sch.count} row(s)`);
  const si = await prisma.shopItem.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   shopItem: attached ${si.count} row(s)`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
