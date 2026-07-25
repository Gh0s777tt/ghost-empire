// Shared helpers for integration tests against the real test Postgres.
import { prisma } from "@/lib/prisma";

// Truncating `users` with CASCADE clears every FK-dependent table too; the extra
// names cover singletons / no-FK tables the tests touch directly.
const TABLES = [
  "wheel_spins", "wheel_config", "prediction_entries", "predictions",
  "transactions", "notifications", "stream_alerts", "chat_feed_messages",
  "twitch_events", "kick_events", "mod_violation_logs", "outgoing_webhooks",
  // `heists` must be listed EXPLICITLY: its `startedById` is a bare String, not an FK,
  // so the users CASCADE below never reaches it (only `heist_entries` FKs into users).
  // A leaked open heist is not inert — heistJoin() looks up "the open heist on this
  // platform/tenant", so the next test would silently join the previous test's crew.
  "heists",
  "users",
];

export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE;`,
  );
}

let n = 0;

// GT (`tokens`) is the real economy currency — predictions still charge/pay it.
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

/**
 * Non-zero GT ledger stamped on every chips-funded test user.
 *
 * The whole point of the "Kasyno na Żetonach" migration is that the casino moves
 * ONLY `chips` and never touches the real GT economy. Asserting that separation
 * against an all-zero ledger would be near-worthless: a stray `tokens: { decrement }`
 * on a 0-GT user is indistinguishable from noise, and `totalSpent`/`totalEarned`
 * would read 0 whether or not the path bumped them. Seeding real, distinct,
 * non-zero values makes any leak into the GT side show up as a concrete diff.
 */
export const GT_SEED = { tokens: 5_000, totalEarned: 7_000, totalSpent: 2_000 } as const;

export type GtLedger = { tokens: number; totalEarned: number; totalSpent: number };

// Chips (`żetony`) are the free, non-purchasable casino currency. Since the "Kasyno
// na Żetonach" migration, wheel / duels / heist charge and pay `chips`, not `tokens` —
// so those tests must seed and read chips, not GT. See docs/CHIPS-CASINO.md.
// The user is also given a GT_SEED ledger so `gtLedgerOf()` can prove the casino
// left the real economy alone.
export async function createUserWithChips(chips = 0): Promise<{ id: string }> {
  n += 1;
  const u = await prisma.user.create({
    data: { chips, ...GT_SEED, username: `itest_${Date.now()}_${n}`, displayName: `Tester ${n}` },
    select: { id: true },
  });
  return u;
}

export async function chipsOf(userId: string): Promise<number> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { chips: true } });
  return u?.chips ?? -1;
}

/**
 * Read the user's REAL-economy (GT) ledger — balance plus the two lifetime metrics
 * that feed ranking / wrapped / economy-health. Casino paths must leave all three
 * untouched, so tests compare this against {@link GT_SEED} after a spin/duel.
 */
export async function gtLedgerOf(userId: string): Promise<GtLedger> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokens: true, totalEarned: true, totalSpent: true },
  });
  if (!u) throw new Error(`gtLedgerOf: no user ${userId}`);
  return u;
}
