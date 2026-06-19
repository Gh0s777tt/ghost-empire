// scripts/backfill-account-tenant.ts
// Stage A of per-tenant viewer identity (docs/PER-TENANT-IDENTITY.md): copy every
// Account.tenantId from its owner's user.tenantId, so that when Stage C flips the
// Account unique to [provider, providerAccountId, tenantId] there are NO NULL-tenant
// rows left to slip a duplicate through. Idempotent — safe to re-run.
//   npx tsx scripts/backfill-account-tenant.ts   (reads DATABASE_URL from .env.local / .env)
// Run AFTER `npx prisma db push` adds accounts.tenantId, and BEFORE Stage C.
export {}; // mark as a module so top-level `main` doesn't collide with sibling scripts

// Load env BEFORE importing the prisma client — the pg adapter reads DATABASE_URL at
// import time (src/lib/prisma.ts), so a dynamic import is required below.
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file absent (CI / Vercel) — env already injected */
  }
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  // Accounts not yet attributed to a tenant, with their owner's tenantId.
  const accounts = await prisma.account.findMany({
    where: { tenantId: null },
    select: { id: true, user: { select: { tenantId: true } } },
  });

  let updated = 0;
  let skipped = 0;
  for (const a of accounts) {
    const tid = a.user?.tenantId ?? null;
    if (!tid) {
      // User itself has no tenant yet — run scripts/backfill-tenant.ts first, then re-run.
      skipped++;
      continue;
    }
    await prisma.account.update({ where: { id: a.id }, data: { tenantId: tid } });
    updated++;
  }

  console.log(
    `✅ account→tenant backfill: ${updated} updated, ${skipped} skipped (user had no tenantId), of ${accounts.length} null-tenant account(s)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ account→tenant backfill failed:", e);
    process.exit(1);
  });
