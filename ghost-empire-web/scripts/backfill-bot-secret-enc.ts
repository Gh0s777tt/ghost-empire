// scripts/backfill-bot-secret-enc.ts
// AUDYT 2026-08: `Tenant.botSecret` jest teraz szyfrowany at-rest (patrz api/admin/bot-secret
// + tenant.ts). Odczyt jest DUAL-READ, więc istniejące wiersze plaintext DZIAŁAJĄ bez tego
// skryptu — to tylko domknięcie: jednorazowo zaszyfruj sekrety, które są jeszcze plaintextem,
// żeby w bazie/backupie nie zostało nic czytelnego. Idempotentny: pomija już zaszyfrowane.
//   npx tsx scripts/backfill-bot-secret-enc.ts        (czyta DATABASE_URL z .env.local / .env)
// Nie wymaga `db push` — nie zmienia schematu, tylko wartości w istniejącej kolumnie.
export {}; // mark as a module so top-level names don't collide with sibling scripts

// Load env BEFORE importing the prisma client — the pg driver adapter reads DATABASE_URL at
// import time (src/lib/prisma.ts), so a dynamic import is required.
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file absent (CI / Vercel) — env already injected */
  }
}

async function main(): Promise<void> {
  const { prisma } = await import("../src/lib/prisma");
  const { encryptSecret, isEncrypted } = await import("../src/lib/crypto");

  // Only rows that actually carry a secret. `botSecret: { not: null }` keeps it a single query.
  const rows = await prisma.tenant.findMany({
    where: { botSecret: { not: null } },
    select: { id: true, slug: true, botSecret: true },
  });

  let encrypted = 0;
  let alreadyEncrypted = 0;
  for (const t of rows) {
    if (isEncrypted(t.botSecret)) {
      alreadyEncrypted++;
      continue;
    }
    // Plaintext → ciphertext. The value itself is never logged.
    await prisma.tenant.update({
      where: { id: t.id },
      data: { botSecret: encryptSecret(t.botSecret) },
    });
    encrypted++;
    console.log(`  ✓ ${t.slug}: botSecret zaszyfrowany`);
  }

  console.log(
    `\nGotowe. Zaszyfrowano ${encrypted}, już zaszyfrowanych ${alreadyEncrypted}, razem z sekretem ${rows.length}.`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("backfill-bot-secret-enc: FAILED —", e);
  process.exit(1);
});
