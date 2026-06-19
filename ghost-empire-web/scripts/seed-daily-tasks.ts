// scripts/seed-daily-tasks.ts
// SAFE prod activation for the daily quests — upserts ONLY the daily_tasks rows
// (idempotent by `code`). Use this instead of `npm run db:seed`, which also
// re-seeds shop items / events and would wipe admin customizations on prod.
//   npx tsx scripts/seed-daily-tasks.ts      (reads DATABASE_URL from .env.local / .env)
//
// Mirrors the rows in prisma/seed.ts so fresh installs get them too. The new
// engagement quests (clan / companion / wheel / poll) progress via
// updateDailyTaskProgress fired from their respective endpoints.

// Load env BEFORE importing the prisma client — the pg driver adapter reads
// DATABASE_URL at import time (src/lib/prisma.ts), so a dynamic import is required.
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file absent (e.g. CI / Vercel) — env already injected */
  }
}

const DAILY_TASKS = [
  { code: "daily_messages",         text: "Napisz 10 wiadomości na Discord",   textEn: "Send 10 messages on Discord",        target: 10, reward: 250,  triggerType: "messages" },
  { code: "daily_voice",            text: "Spędź 30 min na voice",             textEn: "Spend 30 minutes in voice chat",     target: 30, reward: 500,  triggerType: "voice_minutes" },
  { code: "daily_drop",             text: "Odbierz kod drop podczas live",     textEn: "Claim a drop code during live stream", target: 1, reward: 1000, triggerType: "drop_code" },
  { code: "daily_clan_contribute",  text: "Wesprzyj skarbiec swojego klanu",   textEn: "Contribute to your clan treasury",   target: 1,  reward: 300,  triggerType: "clan_contribute" },
  { code: "daily_companion_feed",   text: "Nakarm swojego Ghost Companiona",   textEn: "Feed your Ghost Companion",          target: 1,  reward: 200,  triggerType: "companion_feed" },
  { code: "daily_wheel_spin",       text: "Zakręć Kołem Fortuny 3 razy",       textEn: "Spin the Wheel of Fortune 3 times",  target: 3,  reward: 250,  triggerType: "wheel_spin" },
  { code: "daily_poll_vote",        text: "Zagłosuj w ankiecie",               textEn: "Vote in a poll",                     target: 1,  reward: 150,  triggerType: "poll_vote" },
];

async function main() {
  // Imported here (not at top) so loadEnvFile() above runs first — the pg adapter
  // reads DATABASE_URL at module-eval time.
  const { prisma } = await import("../src/lib/prisma");
  // Multi-tenant (#512): quests belong to the default "ghost-empire" tenant.
  const tenant = await prisma.tenant.findUnique({ where: { slug: "ghost-empire" }, select: { id: true } });
  if (!tenant) {
    console.error("❌ no 'ghost-empire' tenant — run `npm run db:seed` (or backfill-tenant) first");
    process.exit(1);
  }
  for (const t of DAILY_TASKS) {
    await prisma.dailyTask.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: t.code } },
      update: t,
      create: { ...t, tenantId: tenant.id },
    });
  }
  console.log(`✅ upserted ${DAILY_TASKS.length} daily tasks (incl. clan / companion / wheel / poll quests)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Make this a module so its top-level `main`/`DAILY_TASKS` don't collide with the
// other standalone seed scripts in this folder (which share global script scope).
export {};
