// QA: read-side GET /api/admin/donations — nagłówek statystyk panelu donejtów w zakładce Ekonomia.
// Sedno kontraktu: agregat jest (1) tenant-scoped (currentTenantId → where.tenantId), (2) liczy
// PLN tą samą tabelą FX co szyna mintująca — `amountGrosze` to grosze WALUTY wiersza, nie zawsze
// PLN, więc $10 Ko-fi to ~40 PLN, nie 10; (3) nieznana waluta NIE jest zgadywana (dodaje 0 PLN,
// ale wciąż liczy sztukę), (4) rozbicie per-provider klucza po `source`. Mock admin/tenant/prisma;
// `@/lib/donations/fx` zostaje PRAWDZIWY, żeby test faktycznie sprawdzał kurs.
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  auth: { ok: true, userId: "admin-1" } as Record<string, unknown>,
  tid: "tenant-a" as string | null,
  groupBy: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({
  requireAdmin: async () => h.auth,
  findManagedUser: async () => null,
}));
vi.mock("@/lib/tenant", () => ({ currentTenantId: async () => h.tid }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/email-receipts", () => ({ sendDonationReceipt: vi.fn() }));
vi.mock("@/lib/donation-rate", () => ({ gtFromPln: (pln: number) => Math.round(pln) }));
vi.mock("@/lib/donation-claim", () => ({ claimsForDonation: () => [] }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { donation: { groupBy: h.groupBy } } }));

import { GET } from "@/app/api/admin/donations/route";

type StatsBody = {
  stats: { count: number; totalPln: number; byProvider: { source: string; count: number; pln: number }[] };
};

beforeEach(() => {
  vi.clearAllMocks();
  h.auth = { ok: true, userId: "admin-1" };
  h.tid = "tenant-a";
});

describe("GET /api/admin/donations — statystyki", () => {
  it("401/403 gdy nie-admin, bez pytania bazy", async () => {
    h.auth = { ok: false, error: "brak dostępu", status: 403 };
    const res = await GET();
    expect(res.status).toBe(403);
    expect(h.groupBy).not.toHaveBeenCalled();
  });

  it("scope'uje zapytanie po tenantId gdy tid != null", async () => {
    h.groupBy.mockResolvedValue([]);
    await GET();
    expect(h.groupBy.mock.calls[0][0].where).toEqual({ tenantId: "tenant-a" });
  });

  it("tid == null (founder) → brak filtra tenanta (widzi też legacy null)", async () => {
    h.tid = null;
    h.groupBy.mockResolvedValue([]);
    await GET();
    expect(h.groupBy.mock.calls[0][0].where).toEqual({});
  });

  it("PLN liczone kursem waluty wiersza — $10 Ko-fi to ~40 PLN, nie 10", async () => {
    // 1000 groszy USD = $10.00; kurs USD=4.0 → 40 PLN. Gdyby traktować jako PLN, byłoby 10.
    h.groupBy.mockResolvedValue([
      { source: "kofi", currency: "USD", _count: { _all: 1 }, _sum: { amountGrosze: 1000 } },
    ]);
    const res = await GET();
    const body = (await res.json()) as StatsBody;
    expect(body.stats.totalPln).toBe(40);
    expect(body.stats.count).toBe(1);
    expect(body.stats.byProvider).toEqual([{ source: "kofi", count: 1, pln: 40 }]);
  });

  it("nieznana waluta: liczy sztukę, dodaje 0 PLN (nie zgaduje kursu)", async () => {
    h.groupBy.mockResolvedValue([
      { source: "custom", currency: "XYZ", _count: { _all: 2 }, _sum: { amountGrosze: 999999 } },
      { source: "streamlabs", currency: "PLN", _count: { _all: 3 }, _sum: { amountGrosze: 5000 } },
    ]);
    const res = await GET();
    const body = (await res.json()) as StatsBody;
    expect(body.stats.count).toBe(5); // 2 + 3, obie wliczone
    expect(body.stats.totalPln).toBe(50); // tylko 5000 groszy PLN = 50; XYZ dodaje 0
    // rozbicie posortowane malejąco po PLN → PLN-owy streamlabs przed 0-PLN custom
    expect(body.stats.byProvider).toEqual([
      { source: "streamlabs", count: 3, pln: 50 },
      { source: "custom", count: 2, pln: 0 },
    ]);
  });

  it("łączy ten sam provider z wielu walut w jeden wiersz rozbicia", async () => {
    h.groupBy.mockResolvedValue([
      { source: "kofi", currency: "PLN", _count: { _all: 1 }, _sum: { amountGrosze: 2500 } }, // 25 PLN
      { source: "kofi", currency: "EUR", _count: { _all: 1 }, _sum: { amountGrosze: 1000 } }, // 10 EUR * 4.3 = 43
    ]);
    const res = await GET();
    const body = (await res.json()) as StatsBody;
    expect(body.stats.byProvider).toEqual([{ source: "kofi", count: 2, pln: 68 }]);
    expect(body.stats.totalPln).toBe(68);
  });
});
