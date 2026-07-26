// SECURITY (#saas-botsecret): /api/bot/gt-game — per-tenant bot auth + tenant-scoped Connection
// match. A chatter is resolved to a Ghost Empire user via a linked Connection, then GT is wagered.
// The Connection lookup MUST be scoped to the request's tenant (through the related user) so a
// portal's bot can only play for — and move GT of — its OWN viewers. Same contract as chat-award,
// but this exercises the `user: { tenantId }` relation-filter shape (Connection has no tenantId of
// its own). Mocks prisma / tenant / rate-limit / gt-games; uses the REAL verifyBotSecretForTenant.
// ⚠️ THE SUITES BELOW ARE PARKED, NOT DELETED (2026-07-26).
//
// /api/bot/gt-game drives the chat casino games, a surface retired under REGULAMIN_GHOST_TOKENS.md
// §7 ust. 12 (the ban covers the MECHANIC, not just the naming, and applies regardless of prize
// value). The route now answers 410 before doing anything, so their assertions about auth, tenant
// scoping and chat wording no longer describe reality — they describe the surface as it worked.
//
// They are `describe.skip` rather than removed because the coverage they encode (per-tenant secret
// acceptance, Connection lookup scoped through the user relation, the chips-vs-GT wording rule) is
// expensive to rebuild and would be needed again the day the terms change. The live test at the
// bottom is the one that matters now: it pins that the retirement holds.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => ({
  botAuth: { id: "tenant-B", botSecret: "tenantB-secret" } as { id: string | null; botSecret: string | null },
  tokenSymbol: "NEO",
  connFindFirst: vi.fn(),
  playGtGame: vi.fn(),
}));

// Two reads of the SAME cache()d tenant row: botAuth carries the server-only botSecret, the brand
// carries tokenSymbol for the chat text (botSecret is deliberately absent from TenantBrand).
vi.mock("@/lib/tenant", () => ({
  getCurrentTenantBotAuth: async () => state.botAuth,
  getCurrentTenant: async () => ({ id: state.botAuth.id, tokenSymbol: state.tokenSymbol }),
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
  state.tokenSymbol = "NEO";
  state.connFindFirst.mockReset().mockResolvedValue({ userId: "user-1" });
  state.playGtGame.mockReset().mockResolvedValue({ ok: true, payout: 0, bet: 100, detail: "🍒🍋🔔", newBalance: 50 });
});
afterEach(() => vi.unstubAllEnvs());

describe.skip("/api/bot/gt-game — auth", () => {
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

describe.skip("/api/bot/gt-game — tenant-scoped Connection match", () => {
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

// WALUTA + WHITE-LABEL: każdy string niżej bot wkleja WERBATIM na czat streamera — najbardziej
// publiczna powierzchnia marki, jaka istnieje. Dwa błędy są tu możliwe i oba były popełnione:
//   1) literalne "GT" reklamuje walutę ZAŁOŻYCIELA na cudzym kanale (leak jak w #801),
//   2) symbol tokena portalu ogłasza wygraną w jego REALNEJ walucie — a `playGtGame` rusza
//      `user.chips` i stempluje ledger `currency:"CHIPS"`, więc gracz wygrał DARMOWE żetony.
// Poprawna etykieta to uniwersalne 🪙 (docs/CHIPS-CASINO.md): nie należy do niczyjej marki
// i nie sugeruje wartości, której żetony nie mają.
describe.skip("/api/bot/gt-game — czat nazywa walutę, którą gra faktycznie płaci (żetony)", () => {
  it("WYGRANA jest w żetonach, nie w tokenie portalu", async () => {
    state.playGtGame.mockResolvedValue({ ok: true, payout: 250, bet: 100, detail: "🍒🍒🍒", newBalance: 350 });
    const msg = (await (await POST(req("global-secret"))).json()).message as string;
    expect(msg).toContain("250 🪙!");
    expect(msg).not.toContain("NEO");   // token portalu = ZŁA waluta dla kasyna
    expect(msg).not.toMatch(/\bGT\b/); // marka założyciela = leak
  });

  it("PRZEGRANA też jest w żetonach", async () => {
    state.playGtGame.mockResolvedValue({ ok: true, payout: 0, bet: 100, detail: "🍋🔔🍒", newBalance: 50 });
    const msg = (await (await POST(req("global-secret"))).json()).message as string;
    expect(msg).toContain("-100 🪙");
    expect(msg).not.toContain("NEO");
    expect(msg).not.toMatch(/\bGT\b/);
  });

  it("zachęta połącz-konto mówi o żetonach", async () => {
    state.connFindFirst.mockResolvedValue(null);
    const msg = (await (await POST(req("global-secret", { platform: "twitch", username: "someone", game: "slots", bet: 100 }))).json()).message as string;
    expect(msg).toContain("by grać za żetony 🪙.");
    expect(msg).not.toMatch(/\bGT\b/);
  });

  it("na portalu założyciela też żetony — kasyno nie płaci realną walutą NIGDZIE", async () => {
    state.tokenSymbol = "GT";
    state.playGtGame.mockResolvedValue({ ok: true, payout: 250, bet: 100, detail: "🍒🍒🍒", newBalance: 350 });
    const msg = (await (await POST(req("global-secret"))).json()).message as string;
    expect(msg).toContain("250 🪙!");
    expect(msg).not.toMatch(/\bGT\b/);
  });
});

describe("/api/bot/gt-game — retired under §7 ust. 12", () => {
  it("refuses with 410 before touching auth, the tenant or any balance", async () => {
    // 410 and not 404: the endpoint existed and was intentionally withdrawn, so a bot that gets this
    // stops retrying instead of treating it as a routing glitch.
    const res = await POST(new Request("https://portal.example/api/bot/gt-game", { method: "POST", body: "{}" }));
    expect(res.status).toBe(410);
    expect((await res.json()).reason).toBe("casino_surfaces_disabled_by_terms_7_12");
  });
});
