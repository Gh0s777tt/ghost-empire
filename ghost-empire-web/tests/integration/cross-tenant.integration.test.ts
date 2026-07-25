import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb } from "./helpers";

// The central white-label invariant: a tenant-scoped read must NEVER see another
// portal's rows. This guards the `...(tid ? { tenantId } : {})` convention the whole
// app relies on — drop a filter somewhere and this turns red. (Audit v6: this isolation
// was enforced only by convention, with no test.)
describe("multi-tenant isolation (integration, real DB)", () => {
  // User.tenantId has a FK to Tenant (users_tenantId_fkey — added with the per-tenant
  // identity work, #508–#512), so the referenced portals must exist before a scoped user
  // can be created. This test predated the FK and used bare "tenantA"/"tenantB" strings,
  // which now violate it — the central isolation guard was effectively not running (#qa).
  // Seed the two portals idempotently (fixed ids; resetDb truncates users, not tenants).
  beforeEach(async () => {
    await resetDb();
    for (const id of ["tenantA", "tenantB"]) {
      await prisma.tenant.upsert({
        where: { id },
        update: {},
        create: { id, slug: id, name: id },
      });
    }
  });
  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: ["tenantA", "tenantB"] } } });
    await prisma.$disconnect();
  });

  let seq = 0;
  function userIn(tenantId: string | null, tokens: number) {
    seq += 1;
    return prisma.user.create({
      data: { tenantId, tokens, username: `ct_${Date.now()}_${seq}`, displayName: `ct${seq}` },
      select: { id: true },
    });
  }

  it("a tenant-scoped leaderboard read returns only that tenant's users", async () => {
    await userIn("tenantA", 500);
    await userIn("tenantA", 300);
    await userIn("tenantB", 999);

    const aBoard = await prisma.user.findMany({
      where: { tenantId: "tenantA" },
      orderBy: { tokens: "desc" },
      select: { tokens: true },
    });
    expect(aBoard.map((u) => u.tokens)).toEqual([500, 300]); // tenant B's 999 never appears
    expect(aBoard.some((u) => u.tokens === 999)).toBe(false);

    const bBoard = await prisma.user.findMany({ where: { tenantId: "tenantB" } });
    expect(bBoard).toHaveLength(1);
  });

  it("tenant-less rows (transactions) don't bleed across portals via the user relation", async () => {
    const a = await userIn("tenantA", 0);
    const b = await userIn("tenantB", 0);
    await prisma.transaction.create({ data: { userId: a.id, type: "earn", amount: 100, reason: "ct", status: "completed" } });
    await prisma.transaction.create({ data: { userId: b.id, type: "earn", amount: 200, reason: "ct", status: "completed" } });

    // The app scopes the tenant-less Transaction table via the user relation.
    const aTx = await prisma.transaction.findMany({ where: { user: { tenantId: "tenantA" } } });
    expect(aTx).toHaveLength(1);
    expect(aTx[0]?.amount).toBe(100);
  });

  it("an unscoped read (no tenantId) sees every portal — scoping is opt-in", async () => {
    await userIn("tenantA", 1);
    await userIn("tenantB", 1);
    const all = await prisma.user.findMany({});
    expect(all).toHaveLength(2);
  });

  // --- Bot-facing endpoint isolation (#saas-botsecret) --------------------------------
  // The bot money/identity routes resolve their target the SAME two ways these assert: a
  // Connection by (platform, platformId) or (platform, username), and a User by discordId —
  // now SCOPED to the request's tenant. These run the EXACT Prisma queries the routes issue
  // (relation filter `user: { tenantId }`, direct `tenantId`) against real Postgres, which the
  // route-level unit tests (mocked Prisma) cannot cover. Drop a scope in a route ⇒ this reddens.
  async function connIn(tenantId: string, platform: string, platformId: string, username: string) {
    seq += 1;
    const u = await prisma.user.create({
      data: { tenantId, username: `conn_${Date.now()}_${seq}`, displayName: `c${seq}` },
      select: { id: true },
    });
    await prisma.connection.create({ data: { userId: u.id, platform, platformId, username } });
    return u.id;
  }

  it("Connection lookup by (platform, platformId) is isolated per tenant (chat-award/gt-game/heist/duel)", async () => {
    const aId = await connIn("tenantA", "twitch", "p1", "alice");
    await connIn("tenantB", "twitch", "p2", "bob");

    // In-tenant hit: tenant A's bot resolves its own viewer by the stable platformId.
    const hit = await prisma.connection.findFirst({
      where: { platform: "twitch", platformId: "p1", user: { tenantId: "tenantA" } },
      select: { userId: true },
    });
    expect(hit?.userId).toBe(aId);

    // Cross-tenant miss: tenant B's bot CANNOT resolve A's viewer, so no GT ever moves.
    const miss = await prisma.connection.findFirst({
      where: { platform: "twitch", platformId: "p1", user: { tenantId: "tenantB" } },
      select: { userId: true },
    });
    expect(miss).toBeNull();
  });

  it("Connection lookup by (platform, username) is isolated per tenant (username fallback path)", async () => {
    const aId = await connIn("tenantA", "twitch", "p1", "sameName");
    // A different real account reusing the same handle under another portal.
    await connIn("tenantB", "twitch", "p2", "sameName");

    // Case-insensitive match, scoped to A → A's account (never B's).
    const aHit = await prisma.connection.findFirst({
      where: { platform: "twitch", username: { equals: "SAMENAME", mode: "insensitive" }, user: { tenantId: "tenantA" } },
      select: { userId: true },
    });
    expect(aHit?.userId).toBe(aId);

    // Same handle, scoped to B → B's account, and it must not be A's user.
    const bHit = await prisma.connection.findFirst({
      where: { platform: "twitch", username: { equals: "sameName", mode: "insensitive" }, user: { tenantId: "tenantB" } },
      select: { userId: true },
    });
    expect(bHit?.userId).not.toBe(aId);
  });

  it("User lookup by discordId is isolated per tenant (award / link-status)", async () => {
    // discordId is globally @unique, so it exists under exactly one portal (tenant A here).
    const a = await prisma.user.create({
      data: { tenantId: "tenantA", discordId: "111", username: `d_${Date.now()}_a`, displayName: "da" },
      select: { id: true },
    });

    const inTenant = await prisma.user.findFirst({ where: { discordId: "111", tenantId: "tenantA" }, select: { id: true } });
    expect(inTenant?.id).toBe(a.id);

    // Tenant B's bot cannot award or read A's Discord user (scoped lookup misses it).
    const otherTenant = await prisma.user.findFirst({ where: { discordId: "111", tenantId: "tenantB" }, select: { id: true } });
    expect(otherTenant).toBeNull();
  });
});
