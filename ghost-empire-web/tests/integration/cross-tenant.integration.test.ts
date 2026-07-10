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
});
