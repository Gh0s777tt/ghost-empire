// scripts/backfill-connection-tenant.ts
// AUDYT 2026-08: `Connection.tenantId` (per-tenant tożsamość platform, mirror Account #510/#511).
// Uzupełnia tenantId istniejących połączeń z tenanta ich użytkownika. Idempotentny: dotyka
// wyłącznie wierszy, które mają jeszcze tenantId = NULL i których user MA tenantId.
//   npx tsx scripts/backfill-connection-tenant.ts     (czyta DATABASE_URL z .env.local / .env)
// Uruchom PO `npm run db:push` (kolumna connections.tenantId musi już istnieć).
export {}; // mark as a module so top-level names don't collide with sibling scripts

for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file absent (CI / Vercel) — env already injected */
  }
}

async function main(): Promise<void> {
  const { prisma } = await import("../src/lib/prisma");

  // Jedno set-based UPDATE zamiast N zapytań: connections.tenantId := users.tenantId.
  // `IS NULL` czyni to idempotentnym; `u."tenantId" IS NOT NULL` pomija konta legacy bez portalu.
  const affected = await prisma.$executeRawUnsafe(`
    UPDATE "connections" AS c
    SET "tenantId" = u."tenantId"
    FROM "users" AS u
    WHERE c."userId" = u."id"
      AND c."tenantId" IS NULL
      AND u."tenantId" IS NOT NULL
  `);

  const remaining = await prisma.connection.count({ where: { tenantId: null } });
  console.log(
    `Gotowe. Uzupełniono ${affected} połączeń. Pozostało z tenantId=NULL: ${remaining} ` +
      `(to połączenia użytkowników, którzy sami nie mają jeszcze tenanta — legacy, self-heal przy logowaniu).`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("backfill-connection-tenant: FAILED —", e);
  process.exit(1);
});
