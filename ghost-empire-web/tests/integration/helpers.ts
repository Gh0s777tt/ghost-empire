// Shared helpers for integration tests against the real test Postgres.
import { prisma } from "@/lib/prisma";

// Truncating `users` with CASCADE clears every FK-dependent table too; the extra
// names cover singletons / no-FK tables the tests touch directly.
const TABLES = [
  "wheel_spins", "wheel_config", "prediction_entries", "predictions",
  "transactions", "notifications", "stream_alerts", "chat_feed_messages",
  "twitch_events", "kick_events", "mod_violation_logs", "outgoing_webhooks",
  "users",
];

export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE;`,
  );
}

let n = 0;
export async function createUser(tokens = 0): Promise<{ id: string }> {
  n += 1;
  const u = await prisma.user.create({
    data: { tokens, username: `itest_${Date.now()}_${n}`, displayName: `Tester ${n}` },
    select: { id: true },
  });
  return u;
}

export async function balanceOf(userId: string): Promise<number> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { tokens: true } });
  return u?.tokens ?? -1;
}
