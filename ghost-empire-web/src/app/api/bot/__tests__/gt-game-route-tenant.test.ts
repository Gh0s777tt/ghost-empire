// SECURITY (#saas-botsecret): /api/bot/gt-game — per-tenant bot auth + tenant-scoped Connection
// match. A chatter is resolved to a Ghost Empire user via a linked Connection, then GT is wagered.
// The Connection lookup MUST be scoped to the request's tenant (through the related user) so a
// portal's bot can only play for — and move GT of — its OWN viewers. Same contract as chat-award,
// but this exercises the `user: { tenantId }` relation-filter shape (Connection has no tenantId of
// its own). Mocks prisma / tenant / rate-limit / gt-games; uses the REAL verifyBotSecretForTenant.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => ({
  botAuth: { id: "tenant-B", botSecret: "tenantB-secret" } as { id: string | null; botSecret: string | null },
  brand: { tokenName: "Neo Coins", tokenSymbol: "NC" },
  connFindFirst: vi.fn(),
  playGtGame: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  getCurrentTenantBotAuth: async () => state.botAuth,
  // The route also reads the tenant's currency naming — the returned `message` is posted
  // verbatim to this portal's chat, so it must never carry a hardcoded "GT".
  getCurrentTenant: async () => state.brand,
}));
vi.mock("@/lib/prisma", () => ({ prisma: { connection: { findFirst: state.connFindFirst } } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/gt-games", () => ({ playGtGame: state.playGtGame }));

import { POST } from "@/app/api/bot/gt-game/route";

const req = (secret: string | null, body: object = { platform: "twitch", platformUserId: "p1", game: "slots", bet: 100 }) =>
  new Request("https://portal-b.example/api/bot/gt-game", {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv("BOT_SECRET", "global-secret");
  state.botAuth = { id: "tenant-B", botSecret: "tenantB-secret" };
  state.brand = { tokenName: "Neo Coins", tokenSymbol: "NC" };
  state.connFindFirst.mockReset().mockResolvedValue({ userId: "user-1" });
  state.playGtGame.mockReset().mockResolvedValue({ ok: true, payout: 0, bet: 100, detail: "🍒🍋🔔", newBalance: 50 });
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/bot/gt-game — auth", () => {
  it("401 for a secret matching neither the global nor this tenant's secret", async () => {
    const res = await POST(req("nope"));
    expect(res.status).toBe(401);
    expect(state.connFindFirst).not.toHaveBeenCalled();
  });

  it("accepts the global BOT_SECRET and this portal's per-tenant secret", async () => {
    expect((await POST(req("global-secret"))).status).toBe(200);
    expect((await POST(req("tenantB-secret"))).status).toBe(200);
  });
});

describe("/api/bot/gt-game — tenant-scoped Connection match", () => {
  it("scopes the platformId lookup to the tenant's users via the user relation", async () => {
    await POST(req("global-secret"));
    expect(state.connFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platform: "twitch", platformId: "p1", user: { tenantId: "tenant-B" } },
      }),
    );
  });

  it("does NOT play (no GT moved) when the chatter belongs to another tenant", async () => {
    state.connFindFirst.mockResolvedValue(null); // scoped match finds nobody in this portal
    const res = await POST(req("global-secret", { platform: "twitch", username: "someone", game: "slots", bet: 100 }));
    expect(res.status).toBe(200);
    expect((await res.json()).message).toContain("połącz konto");
    expect(state.playGtGame).not.toHaveBeenCalled();
  });

  it("drops the tenant filter only in the legacy no-tenant fallback", async () => {
    state.botAuth = { id: null, botSecret: null };
    await POST(req("global-secret"));
    expect(state.connFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { platform: "twitch", platformId: "p1" } }),
    );
  });
});

// WHITE-LABEL: this route's `message` is posted VERBATIM to the portal's Twitch/Kick/YouTube
// chat, so a hardcoded "GT" here leaks the founder's currency to a sub-portal's viewers just
// as a literal in the bot would. Symbol goes next to an amount, full name when merely named.
describe("/api/bot/gt-game — chat message names THIS tenant's currency", () => {
  const msg = async (res: Response) => (await res.json()).message as string;

  it("uses the tenant's symbol in a win message, not GT", async () => {
    state.playGtGame.mockResolvedValue({ ok: true, payout: 250, bet: 100, detail: "🍒🍒🍒", newBalance: 350 });
    const m = await msg(await POST(req("global-secret")));
    expect(m).toContain("250 NC!");
    expect(m).not.toMatch(/\bGT\b/);
  });

  it("uses the tenant's symbol in a loss message, not GT", async () => {
    state.playGtGame.mockResolvedValue({ ok: true, payout: 0, bet: 100, detail: "🍋🔔🍒", newBalance: 50 });
    const m = await msg(await POST(req("global-secret")));
    expect(m).toContain("-100 NC");
    expect(m).not.toMatch(/\bGT\b/);
  });

  it("uses the tenant's full currency NAME in the link-your-account prompt", async () => {
    state.connFindFirst.mockResolvedValue(null);
    const m = await msg(await POST(req("global-secret", { platform: "twitch", username: "widz", game: "slots", bet: 100 })));
    expect(m).toContain("by grać za Neo Coins.");
    expect(m).not.toMatch(/\bGT\b/);
  });

  it("still says Ghost Tokens/GT for the founder portal — its own currency", async () => {
    state.brand = { tokenName: "Ghost Tokens", tokenSymbol: "GT" };
    state.playGtGame.mockResolvedValue({ ok: true, payout: 250, bet: 100, detail: "🍒🍒🍒", newBalance: 350 });
    expect(await msg(await POST(req("global-secret")))).toContain("250 GT!");
  });
});
