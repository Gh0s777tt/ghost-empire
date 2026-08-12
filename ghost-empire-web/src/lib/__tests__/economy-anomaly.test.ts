// QA: detektor anomalii grantów admina — czysta logika progów (anomalyReasons)
// ORAZ skoping per-tenant obu zapytań w checkGrantAnomaly. Sedno kontraktu: okno
// godzinowe liczy TYLKO granty tego portalu (Transaction nie ma tenantId → scope
// przez relację `user`, jak w src/lib/cached.ts), a alert idzie TYLKO do adminów
// tego portalu (wiadomość cytuje nick widza → inaczej wyciek przez granicę tenanta).
// Mock prisma + logger (wzorzec z platform-tokens.test.ts / drops/claim-route.test.ts).
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  aggregate: vi.fn(),
  adminFindMany: vi.fn(),
  notifCreateMany: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: { aggregate: h.aggregate },
    user: { findMany: h.adminFindMany },
    notification: { createMany: h.notifCreateMany },
  },
}));

import {
  anomalyReasons,
  checkGrantAnomaly,
  SINGLE_GRANT_THRESHOLD,
  HOURLY_GRANT_THRESHOLD,
} from "@/lib/economy-anomaly";

describe("anomalyReasons (czysta logika progów anty-nadużyć)", () => {
  it("nic anomalnego poniżej obu progów", () => {
    expect(anomalyReasons(SINGLE_GRANT_THRESHOLD - 1, HOURLY_GRANT_THRESHOLD - 1)).toEqual([]);
  });

  it("flaguje pojedynczy duży grant", () => {
    const r = anomalyReasons(SINGLE_GRANT_THRESHOLD, 0);
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("pojedynczy grant");
  });

  it("flaguje sumę godzinową grantów", () => {
    const r = anomalyReasons(1, HOURLY_GRANT_THRESHOLD);
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("ostatniej godzinie");
  });

  it("oba progi przekroczone → dwa powody", () => {
    expect(anomalyReasons(SINGLE_GRANT_THRESHOLD, HOURLY_GRANT_THRESHOLD)).toHaveLength(2);
  });

  it("progi są inkluzywne (>=): dokładna wartość progu flaguje, o 1 mniej nie", () => {
    expect(anomalyReasons(SINGLE_GRANT_THRESHOLD, 0)).toHaveLength(1);
    expect(anomalyReasons(SINGLE_GRANT_THRESHOLD - 1, 0)).toHaveLength(0);
    expect(anomalyReasons(0, HOURLY_GRANT_THRESHOLD)).toHaveLength(1);
    expect(anomalyReasons(0, HOURLY_GRANT_THRESHOLD - 1)).toHaveLength(0);
  });

  it("zero/wartości poniżej progu → brak flag", () => {
    expect(anomalyReasons(0, 0)).toEqual([]);
  });

  it("kwota jest formatowana w powodzie (pl-PL, separator tysięcy)", () => {
    const r = anomalyReasons(SINGLE_GRANT_THRESHOLD, 0);
    // 100000 → "100 000" (pl-PL używa spacji/nbsp jako separatora)
    expect(r[0]).toMatch(/100[\s ]?000/);
  });
});

/** `where` przekazany do agregatu okna godzinowego. */
const aggWhere = () => (h.aggregate.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
/** `where` przekazany do wyszukania adminów-odbiorców alertu. */
const adminWhere = () => (h.adminFindMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;

describe("checkGrantAnomaly — skoping per-tenant (obie strony detektora)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    h.adminFindMany.mockResolvedValue([{ id: "admin-A" }]);
    h.notifCreateMany.mockResolvedValue({ count: 1 });
  });

  it("okno godzinowe liczy tylko granty tego portalu (Transaction bez tenantId → relacja `user`)", async () => {
    await checkGrantAnomaly({ adminId: "a1", amount: SINGLE_GRANT_THRESHOLD, targetUsername: "widz", tenantId: "tenant-A" });
    expect(aggWhere()).toMatchObject({
      type: "admin_grant",
      currency: "GT",
      amount: { gt: 0 },
      user: { tenantId: "tenant-A" },
    });
  });

  it("alert trafia WYŁĄCZNIE do adminów tego portalu (wiadomość cytuje nick widza)", async () => {
    await checkGrantAnomaly({ adminId: "a1", amount: SINGLE_GRANT_THRESHOLD, targetUsername: "widz", tenantId: "tenant-A" });
    expect(adminWhere()).toEqual({ isAdmin: true, tenantId: "tenant-A" });
    // Odbiorcy pochodzą wprost z zawężonego zapytania — żaden obcy admin nie dostaje nicku.
    const rows = (h.notifCreateMany.mock.calls[0]![0] as { data: { userId: string; message: string }[] }).data;
    expect(rows.map((r) => r.userId)).toEqual(["admin-A"]);
    expect(rows[0]!.message).toContain("widz");
  });

  it("tenantId null (legacy/single-tenant) → oba zapytania bez filtra tenanta, konwencja `...(tid ? {} : {})`", async () => {
    await checkGrantAnomaly({ adminId: "a1", amount: SINGLE_GRANT_THRESHOLD, targetUsername: "widz", tenantId: null });
    expect("user" in aggWhere()).toBe(false);
    expect(adminWhere()).toEqual({ isAdmin: true });
  });

  it("suma godzinowa z agregatu jest tym, co przechodzi przez progi (portal B nie podbija portalu A)", async () => {
    h.aggregate.mockResolvedValue({ _sum: { amount: HOURLY_GRANT_THRESHOLD } });
    await checkGrantAnomaly({ adminId: "a1", amount: 1, targetUsername: "widz", tenantId: "tenant-A" });
    const rows = (h.notifCreateMany.mock.calls[0]![0] as { data: { message: string }[] }).data;
    expect(rows[0]!.message).toContain("ostatniej godzinie");
  });

  it("poniżej progów → zero powiadomień i żadnego zapytania o adminów", async () => {
    await checkGrantAnomaly({ adminId: "a1", amount: 1, targetUsername: "widz", tenantId: "tenant-A" });
    expect(h.adminFindMany).not.toHaveBeenCalled();
    expect(h.notifCreateMany).not.toHaveBeenCalled();
  });

  it("odjęcie (amount <= 0) wychodzi natychmiast — nie dotyka bazy", async () => {
    await checkGrantAnomaly({ adminId: "a1", amount: -5_000, targetUsername: "widz", tenantId: "tenant-A" });
    expect(h.aggregate).not.toHaveBeenCalled();
  });

  it("fire-and-forget: błąd bazy jest połykany, nigdy nie wywraca grantu", async () => {
    h.aggregate.mockRejectedValue(new Error("db down"));
    await expect(
      checkGrantAnomaly({ adminId: "a1", amount: SINGLE_GRANT_THRESHOLD, targetUsername: "widz", tenantId: "tenant-A" }),
    ).resolves.toBeUndefined();
  });
});
