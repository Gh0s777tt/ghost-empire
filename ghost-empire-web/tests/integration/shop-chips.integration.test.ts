import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb, createUserWithChips, chipsOf } from "./helpers";

// Pokrycie DB-owe dla rozdziału walut w sklepie. Reguły są proste do napisania i łatwe do
// cichego złamania, a unit testy dotykają tylko czystej logiki (`checkCurrencyCategory`),
// nie ZAPISU. Tu leci prawdziwa transakcja na prawdziwym Postgresie i sprawdzamy to, co
// realnie kosztuje: którą kolumnę obciążono, czego NIE tknięto i czy zły wiersz da się kupić.
//
// Inwariant prawny (docs/CHIPS-CASINO.md): item za CHIPS musi być kosmetykiem. Test celowo
// **wstawia zły wiersz wprost do bazy** — omijając walidację API, tak jak zrobiłaby to ręczna
// edycja w Studio — i sprawdza, że sprzedaż mimo to się nie odbywa (fail-closed).
const SESSION = { user: { id: "" } as { id: string } };

vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("@/lib/tenant", () => ({
  currentTenantId: async () => null, // katalog bez tenanta = ścieżka legacy/unscoped
  getCurrentTenant: async () => ({ id: null, tokenName: "Test Tokens", tokenSymbol: "TT", name: "Test Portal" }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ allowed: true, remaining: 9, resetAt: new Date() }),
  rateLimitHeaders: () => ({}),
}));
// `jsonError` czyta cookie locale przez `cookies()`, co poza kontekstem requestu rzuca.
// Zastępujemy je gołym JSON-em — testujemy KODY i ruch na saldach, nie tłumaczenie treści
// (ten sam zabieg co w src/app/api/drops/__tests__/claim-route.test.ts).
vi.mock("@/lib/api-i18n", async () => {
  const { NextResponse } = await import("next/server");
  return {
    jsonError: (msg: string, status: number, headers?: Record<string, string>) =>
      NextResponse.json({ error: msg }, { status, headers }),
  };
});
// Efekty uboczne poza ścieżką pieniędzy — nie są przedmiotem tego testu.
vi.mock("@/lib/alerts", () => ({ dispatchAlertSafe: async () => {} }));
vi.mock("@/lib/achievements", () => ({ checkAndGrantAchievements: async () => {} }));
vi.mock("@/lib/seasons", () => ({ awardSeasonXp: async () => {} }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  // `after()` wymaga kontekstu requestu; poza nim uruchamiamy callback od razu (i tak jest
  // zamockowany na no-op), żeby trasa nie wywróciła się na side-effectach.
  return { ...actual, after: (fn: () => unknown) => { void fn(); } };
});

const { POST: buy } = await import("@/app/api/shop/buy/route");

const req = (body: unknown) =>
  new Request("https://portal.example/api/shop/buy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

let seq = 0;
async function item(overrides: Record<string, unknown>) {
  seq += 1;
  return prisma.shopItem.create({
    data: {
      name: `itest item ${Date.now()}_${seq}`,
      description: "integration fixture",
      category: "cosmetic",
      currency: "GT",
      price: 100,
      stock: -1,
      totalStock: -1,
      ...overrides,
    },
  });
}

const userRow = (id: string) =>
  prisma.user.findUnique({ where: { id }, select: { tokens: true, chips: true, totalSpent: true } });

describe("sklep: rozdział GT / żetonów (integration, real DB)", () => {
  beforeEach(async () => {
    await resetDb();
    // `shop_items` nie wisi na FK do `users`, więc TRUNCATE ... CASCADE go nie czyści.
    await prisma.shopItem.deleteMany();
    SESSION.user.id = "";
  });
  afterAll(async () => {
    await prisma.shopItem.deleteMany();
    await prisma.$disconnect();
  });

  it("zakup za CHIPS obciąża `chips` i NIE rusza tokens ani totalSpent", async () => {
    const u = await prisma.user.create({
      data: { chips: 5_000, tokens: 7_000, username: `itest_shop_${Date.now()}`, displayName: "Buyer" },
      select: { id: true },
    });
    SESSION.user.id = u.id;
    const it1 = await item({ currency: "CHIPS", category: "cosmetic", price: 1_500 });

    const res = await buy(req({ itemId: it1.id }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { currency: string; spent: number; newBalance: number };
    expect(body.currency).toBe("CHIPS");

    const after = await userRow(u.id);
    expect(after?.chips).toBe(5_000 - body.spent);
    expect(after?.tokens).toBe(7_000);   // realna waluta nietknięta
    expect(after?.totalSpent).toBe(0);   // metryka realnej ekonomii nietknięta

    const tx = await prisma.transaction.findFirst({ where: { userId: u.id, shopItemId: it1.id } });
    expect(tx?.currency).toBe("CHIPS");
    expect(tx?.status).toBe("completed"); // kosmetyk = dostarczony od razu
  });

  it("zakup za GT obciąża `tokens` + totalSpent i nie rusza żetonów", async () => {
    const u = await prisma.user.create({
      data: { chips: 5_000, tokens: 7_000, username: `itest_shop_${Date.now()}_gt`, displayName: "Buyer" },
      select: { id: true },
    });
    SESSION.user.id = u.id;
    const it1 = await item({ currency: "GT", category: "games", price: 2_000 });

    const res = await buy(req({ itemId: it1.id }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { currency: string; spent: number };
    expect(body.currency).toBe("GT");

    const after = await userRow(u.id);
    expect(after?.tokens).toBe(7_000 - body.spent);
    expect(after?.totalSpent).toBe(body.spent);
    expect(after?.chips).toBe(5_000);

    const tx = await prisma.transaction.findFirst({ where: { userId: u.id, shopItemId: it1.id } });
    expect(tx?.currency).toBe("GT");
    expect(tx?.status).toBe("pending"); // rzecz do dostarczenia przez streamera
  });

  it("FAIL-CLOSED: itemu CHIPS spoza `cosmetic` nie da się kupić, mimo że siedzi w bazie", async () => {
    const u = await createUserWithChips(50_000);
    SESSION.user.id = u.id;
    // Wiersz wstawiony z pominięciem API — dokładnie to, co zrobiłaby ręczna edycja w DB.
    const bad = await item({ currency: "CHIPS", category: "games", price: 1_000 });

    const res = await buy(req({ itemId: bad.id }));
    expect(res.status).toBe(410);

    // Nic się nie ruszyło: ani saldo, ani stan, ani ledger.
    expect(await chipsOf(u.id)).toBe(50_000);
    expect(await prisma.transaction.count({ where: { userId: u.id } })).toBe(0);
  });

  it("za mało żetonów → 402 i ZERO ruchu na saldach (brak częściowego zapisu)", async () => {
    const u = await prisma.user.create({
      data: { chips: 100, tokens: 99_999, username: `itest_shop_${Date.now()}_poor`, displayName: "Poor" },
      select: { id: true },
    });
    SESSION.user.id = u.id;
    const pricey = await item({ currency: "CHIPS", category: "cosmetic", price: 10_000 });

    const res = await buy(req({ itemId: pricey.id }));
    expect(res.status).toBe(402);

    const after = await userRow(u.id);
    expect(after?.chips).toBe(100);
    expect(after?.tokens).toBe(99_999); // brak fallbacku na realną walutę
    expect(await prisma.transaction.count({ where: { userId: u.id } })).toBe(0);
  });

  it("stock schodzi tylko przy udanym zakupie (nieudany go nie zjada)", async () => {
    const u = await createUserWithChips(200);
    SESSION.user.id = u.id;
    const limited = await item({ currency: "CHIPS", category: "cosmetic", price: 10_000, stock: 3, totalStock: 3 });

    const res = await buy(req({ itemId: limited.id }));
    expect(res.status).toBe(402);
    expect((await prisma.shopItem.findUnique({ where: { id: limited.id } }))?.stock).toBe(3);
  });
});
