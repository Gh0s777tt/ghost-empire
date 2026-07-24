// SECURITY (#saas-botsecret): /api/internal/award — per-tenant bot auth + tenant-scoped grant.
// This is a money endpoint. It MUST (a) accept BOTH the global BOT_SECRET (the first-party
// bot, back-compat) and this portal's own per-tenant secret, and reject anything else; and
// (b) resolve the target user by discordId SCOPED to the request's tenant, so a portal's bot
// can never award another tenant's user. Mocks prisma / tenant / side-effects; uses the REAL
// verifyBotSecretForTenant against a stubbed BOT_SECRET so the auth wiring is exercised end-to-end.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => ({
  // What getCurrentTenantBotAuth() resolves from the request Host: the portal's id (scopes
  // the lookup) and its per-tenant botSecret (authenticates its own bot).
  botAuth: { id: "tenant-B", botSecret: "tenantB-secret" } as { id: string | null; botSecret: string | null },
  userFindFirst: vi.fn(),
  txn: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({ getCurrentTenantBotAuth: async () => state.botAuth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: state.userFindFirst, update: vi.fn() },
    transaction: { create: vi.fn() },
    $transaction: state.txn,
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ allowed: true, remaining: 1, resetAt: 0, limit: 1 }),
  rateLimitHeaders: () => ({}),
}));
vi.mock("@/lib/audit", () => ({ extractIp: () => "1.2.3.4" }));
vi.mock("@/lib/daily-tasks", () => ({ updateDailyTaskProgress: vi.fn(async () => {}) }));
vi.mock("@/lib/happy-hour", () => ({ happyHourBoost: async () => 1 }));
vi.mock("@/lib/seasons", () => ({ awardSeasonXp: vi.fn(async () => {}) }));

import { POST } from "@/app/api/internal/award/route";

const req = (secret: string | null, body: object = { discordId: "123", amount: 10, reason: "message" }) =>
  new Request("https://portal-b.example/api/internal/award", {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv("BOT_SECRET", "global-secret");
  state.botAuth = { id: "tenant-B", botSecret: "tenantB-secret" };
  state.userFindFirst.mockReset().mockResolvedValue({ id: "user-1", tokens: 100 });
  state.txn.mockReset().mockResolvedValue([{}, { tokens: 110 }]);
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/internal/award — auth", () => {
  it("401 with no Authorization header", async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(401);
    expect(state.userFindFirst).not.toHaveBeenCalled();
  });

  it("401 for a secret matching neither the global nor this tenant's secret", async () => {
    const res = await POST(req("some-other-tenant-secret"));
    expect(res.status).toBe(401);
    expect(state.userFindFirst).not.toHaveBeenCalled();
  });

  it("accepts the global BOT_SECRET (first-party bot, back-compat)", async () => {
    const res = await POST(req("global-secret"));
    expect(res.status).toBe(200);
  });

  it("accepts this portal's own per-tenant secret", async () => {
    const res = await POST(req("tenantB-secret"));
    expect(res.status).toBe(200);
  });
});

describe("/api/internal/award — tenant-scoped user lookup", () => {
  it("scopes the discordId lookup to the resolved tenant", async () => {
    await POST(req("global-secret"));
    expect(state.userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { discordId: "123", tenantId: "tenant-B" } }),
    );
  });

  it("skips the grant (ok:false) when the discordId belongs to no user in this tenant", async () => {
    state.userFindFirst.mockResolvedValue(null); // scoped lookup finds nobody here
    const res = await POST(req("global-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, reason: "user_not_linked" });
    expect(state.txn).not.toHaveBeenCalled(); // no cross-tenant GT ever minted
  });

  it("falls back to an UNSCOPED lookup only when no tenant row resolves (legacy single-tenant)", async () => {
    state.botAuth = { id: null, botSecret: null }; // pre-backfill / outside a request scope
    const res = await POST(req("global-secret")); // only the global secret can authenticate now
    expect(res.status).toBe(200);
    expect(state.userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { discordId: "123" } }),
    );
  });
});
