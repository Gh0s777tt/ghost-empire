// QA: ścieżka pieniężna POST /api/drops/claim. Kontrakty: auth, walidacja kodu,
// rate-limit, stany kodu (brak/nieaktywny/wygasły), nagroda + transakcja GT,
// BONUS liczony z ATOMOWEGO ordinala (claimCount z tx.update, nie z odczytu poza
// tx — inaczej wyścig dałby N zwycięzców), podwójny claim (P2002 → 409), skoping
// tenanta. Mock wszystkiego (auth/prisma/tenant/rate-limit/alerts/achievements/
// seasons) — zero sieci/DB. $transaction wywołuje callback z mockowym tx.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  session: { user: { id: "user-1" } } as null | { user: { id: string } },
  tid: "tenant-A" as string | null,
  rateAllowed: true,
  drop: null as null | Record<string, unknown>,
  // sterowanie tx
  claimCreate: vi.fn(),
  dropUpdate: vi.fn(),
  userUpdate: vi.fn(),
  txCreate: vi.fn(),
  dailyFindMany: vi.fn(),
  userTaskUpsert: vi.fn(),
  notifCreate: vi.fn(),
  claimUpdate: vi.fn(),
  findFirst: vi.fn(),
  dispatchAlert: vi.fn(),
  grantAch: vi.fn(),
  awardXp: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: async () => h.session }));
vi.mock("@/lib/api-i18n", () => ({
  jsonError: (msg: string, status: number, headers?: Record<string, string>) =>
    NextResponse.json({ error: msg }, { status, headers }),
}));
vi.mock("@/lib/tenant", () => ({ currentTenantId: async () => h.tid }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => (h.rateAllowed
    ? { allowed: true, remaining: 29, resetAt: new Date() }
    : { allowed: false, remaining: 0, resetAt: new Date(), retryAfterSeconds: 30 }),
  rateLimitHeaders: () => ({ "Retry-After": "30" }),
}));
vi.mock("@/lib/alerts", () => ({ dispatchAlertSafe: h.dispatchAlert }));
vi.mock("@/lib/achievements", () => ({ checkAndGrantAchievements: h.grantAch }));
vi.mock("@/lib/seasons", () => ({ awardSeasonXp: h.awardXp }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    streamDrop: { findFirst: h.findFirst },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        dropClaim: { create: h.claimCreate, update: h.claimUpdate },
        streamDrop: { update: h.dropUpdate },
        user: { update: h.userUpdate },
        transaction: { create: h.txCreate },
        dailyTask: { findMany: h.dailyFindMany },
        userTask: { upsert: h.userTaskUpsert },
        notification: { create: h.notifCreate },
      }),
  },
}));

import { POST } from "@/app/api/drops/claim/route";

const req = (body: unknown) =>
  new Request("https://portal.example/api/drops/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  h.session = { user: { id: "user-1" } };
  h.tid = "tenant-A";
  h.rateAllowed = true;
  h.drop = { id: "drop-1", code: "SUMMER", active: true, expiresAt: null, reward: 100, bonusReward: 50, bonusSlots: 3 };
  h.findFirst.mockReset().mockImplementation(async () => h.drop);
  h.claimCreate.mockReset().mockResolvedValue({ id: "claim-1" });
  h.claimUpdate.mockReset().mockResolvedValue({});
  h.dropUpdate.mockReset().mockResolvedValue({ claimCount: 1 });
  h.userUpdate.mockReset().mockResolvedValue({ tokens: 600, username: "u", displayName: "U", image: null });
  h.txCreate.mockReset().mockResolvedValue({});
  h.dailyFindMany.mockReset().mockResolvedValue([]);
  h.userTaskUpsert.mockReset().mockResolvedValue({});
  h.notifCreate.mockReset().mockResolvedValue({});
  h.dispatchAlert.mockReset().mockResolvedValue(undefined);
  h.grantAch.mockReset().mockResolvedValue(undefined);
  h.awardXp.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/drops/claim — auth + walidacja", () => {
  it("401 without a session", async () => {
    h.session = null;
    expect((await POST(req({ code: "SUMMER" }))).status).toBe(401);
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it("400 on invalid JSON body", async () => {
    const bad = new Request("https://portal.example/api/drops/claim", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{not json",
    });
    expect((await POST(bad)).status).toBe(400);
  });

  it("400 on empty and malformed codes (regex), never touching the DB", async () => {
    expect((await POST(req({ code: "" }))).status).toBe(400);
    expect((await POST(req({ code: "ab" }))).status).toBe(400); // za krótki (<3)
    expect((await POST(req({ code: "bad code!" }))).status).toBe(400); // spacja + !
    expect((await POST(req({ code: "X".repeat(25) }))).status).toBe(400); // >24
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it("uppercases the code before lookup", async () => {
    await POST(req({ code: "summer" }));
    expect(h.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ code: "SUMMER" }) }),
    );
  });
});

describe("POST /api/drops/claim — rate limit + stany kodu", () => {
  it("429 when rate-limited (before any lookup)", async () => {
    h.rateAllowed = false;
    const res = await POST(req({ code: "SUMMER" }));
    expect(res.status).toBe(429);
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it("404 when the code does not exist", async () => {
    h.drop = null;
    expect((await POST(req({ code: "NOPE99" }))).status).toBe(404);
  });

  it("410 when the code is inactive", async () => {
    h.drop = { ...(h.drop as object), active: false };
    expect((await POST(req({ code: "SUMMER" }))).status).toBe(410);
  });

  it("410 when the code has expired", async () => {
    h.drop = { ...(h.drop as object), expiresAt: new Date(Date.now() - 1000) };
    expect((await POST(req({ code: "SUMMER" }))).status).toBe(410);
  });

  it("scopes the lookup to the current tenant", async () => {
    await POST(req({ code: "SUMMER" }));
    expect(h.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-A" }) }),
    );
  });
});

describe("POST /api/drops/claim — nagroda + bonus (atomowy ordinal)", () => {
  it("awards base reward, writes GT transaction, returns newBalance", async () => {
    h.dropUpdate.mockResolvedValue({ claimCount: 5 }); // poza oknem bonusu (>3)
    h.userUpdate.mockResolvedValue({ tokens: 700, username: "u", displayName: "U", image: null });
    const res = await POST(req({ code: "SUMMER" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { totalReward: number; gotBonus: boolean; newBalance: number };
    expect(body.totalReward).toBe(100); // sam base (bez bonusu)
    expect(body.gotBonus).toBe(false);
    expect(body.newBalance).toBe(700);
    // GT zapisane przez tx.user.update.increment i transaction.create
    expect(h.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tokens: { increment: 100 } }) }),
    );
    expect(h.txCreate).toHaveBeenCalled();
    expect(h.dispatchAlert).not.toHaveBeenCalled(); // alert tylko dla bonusu
  });

  it("BONUS: ordinal within bonusSlots gets bonusReward and fires a stream alert", async () => {
    h.dropUpdate.mockResolvedValue({ claimCount: 2 }); // 2 <= bonusSlots(3) → bonus
    const res = await POST(req({ code: "SUMMER" }));
    const body = (await res.json()) as { totalReward: number; gotBonus: boolean; bonusSlotsLeft: number };
    expect(body.gotBonus).toBe(true);
    expect(body.totalReward).toBe(150); // 100 + 50
    expect(body.bonusSlotsLeft).toBe(1); // 3 - 2
    expect(h.dispatchAlert).toHaveBeenCalledOnce();
  });

  it("BONUS boundary: the ordinal EQUAL to bonusSlots still gets the bonus (<=)", async () => {
    h.dropUpdate.mockResolvedValue({ claimCount: 3 }); // 3 == bonusSlots
    const body = (await (await POST(req({ code: "SUMMER" }))).json()) as { gotBonus: boolean; bonusSlotsLeft: number };
    expect(body.gotBonus).toBe(true);
    expect(body.bonusSlotsLeft).toBe(0);
  });

  it("no bonus when bonusReward is 0 even inside the slot window", async () => {
    h.drop = { ...(h.drop as object), bonusReward: 0 };
    h.dropUpdate.mockResolvedValue({ claimCount: 1 });
    const body = (await (await POST(req({ code: "SUMMER" }))).json()) as { gotBonus: boolean; totalReward: number };
    expect(body.gotBonus).toBe(false);
    expect(body.totalReward).toBe(100);
  });

  it("uses the tx-increment claimCount (not an out-of-tx read) to decide the bonus", async () => {
    // Gdyby bonus liczył się z wartości sprzed inkrementu, ten przypadek dałby zły wynik.
    h.dropUpdate.mockResolvedValue({ claimCount: 4 }); // po inkremencie poza oknem
    const body = (await (await POST(req({ code: "SUMMER" }))).json()) as { gotBonus: boolean };
    expect(body.gotBonus).toBe(false);
    expect(h.dropUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { claimCount: { increment: 1 } } }),
    );
  });
});

describe("POST /api/drops/claim — podwójny claim", () => {
  it("409 when the unique (dropId,userId) claim already exists (P2002)", async () => {
    const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    h.claimCreate.mockRejectedValue(p2002);
    const res = await POST(req({ code: "SUMMER" }));
    expect(res.status).toBe(409);
    expect(h.userUpdate).not.toHaveBeenCalled(); // rollback — GT nie przyznane
    expect(h.dispatchAlert).not.toHaveBeenCalled();
  });

  it("500 on a non-P2002 transaction failure", async () => {
    h.userUpdate.mockRejectedValue(new Error("deadlock"));
    const res = await POST(req({ code: "SUMMER" }));
    expect(res.status).toBe(500);
  });
});
