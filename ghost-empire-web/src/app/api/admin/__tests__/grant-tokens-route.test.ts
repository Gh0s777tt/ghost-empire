// QA: ścieżka pieniężna POST /api/admin/grant-tokens dla OBU walut księgi.
// Sedno kontraktu: grant w żetonach (CHIPS — darmowa waluta kasyna) rusza WYŁĄCZNIE
// kolumnę `chips` i NIGDY `tokens`/`totalEarned`/`totalSpent`, nie karmi detektora anomalii
// ekonomii GT i stempluje wiersz ledgera `currency:"CHIPS"`. Grant GT zostaje bez zmian.
// Mock wszystkiego (admin/prisma/audit/anomaly) — zero sieci/DB; $transaction woła callback
// z mockowym tx (wzorzec z drops/claim-route.test.ts).
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  perm: { ok: true, userId: "admin-1", isPlatformOwner: true } as Record<string, unknown>,
  user: null as null | Record<string, unknown>,
  stepUp: { ok: true } as Record<string, unknown>,
  userUpdate: vi.fn(),
  userUpdateMany: vi.fn(),
  userFindUnique: vi.fn(),
  txCreate: vi.fn(),
  notifCreate: vi.fn(),
  audit: vi.fn(),
  anomaly: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({
  requirePermission: async () => h.perm,
  findManagedUser: async () => h.user,
  requireStepUp: async () => h.stepUp,
}));
vi.mock("@/lib/audit", () => ({ logAdminAction: h.audit }));
vi.mock("@/lib/economy-anomaly", () => ({ checkGrantAnomaly: h.anomaly }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: { create: h.notifCreate },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        user: { update: h.userUpdate, updateMany: h.userUpdateMany, findUnique: h.userFindUnique },
        transaction: { create: h.txCreate },
      }),
  },
}));

import { POST } from "@/app/api/admin/grant-tokens/route";

const req = (body: unknown) =>
  new Request("https://portal.example/api/admin/grant-tokens", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.perm = { ok: true, userId: "admin-1", isPlatformOwner: true };
  h.stepUp = { ok: true };
  h.user = { id: "u-1", username: "widz", displayName: "Widz", tokens: 1_000, chips: 2_000 };
  h.userUpdate.mockResolvedValue({});
  h.userUpdateMany.mockResolvedValue({ count: 1 });
  h.userFindUnique.mockResolvedValue({ tokens: 1_500, chips: 2_500 });
  h.notifCreate.mockResolvedValue({});
  h.audit.mockResolvedValue(undefined);
  // Fire-and-forget in the route (`void check(...).catch(...)`) — must be thenable.
  h.anomaly.mockResolvedValue(undefined);
});

/** The `data` object the route handed to `user.update` (grant path). */
const grantData = () => h.userUpdate.mock.calls[0][0].data as Record<string, unknown>;
/** The `where`/`data` the route handed to `user.updateMany` (deduction path). */
const deductArgs = () => h.userUpdateMany.mock.calls[0][0] as { where: Record<string, unknown>; data: Record<string, unknown> };

describe("POST /api/admin/grant-tokens — GT (domyślna waluta, bez zmian)", () => {
  it("kredytuje tokens + totalEarned i stempluje ledger GT", async () => {
    const res = await POST(req({ target: "widz", amount: 500, reason: "konkurs" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { newBalance: number; currency: string };

    expect(grantData()).toEqual({ tokens: { increment: 500 }, totalEarned: { increment: 500 } });
    expect(h.txCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "admin_grant", amount: 500, currency: "GT" }) }),
    );
    expect(body.currency).toBe("GT");
    expect(body.newBalance).toBe(1_500); // saldo GT, nie chips
  });

  it("odjęcie jest strażowane `gte` i bumpuje totalSpent", async () => {
    await POST(req({ target: "widz", amount: -300 }));
    const { where, data } = deductArgs();
    expect(where).toEqual({ id: "u-1", tokens: { gte: 300 } });
    expect(data).toEqual({ tokens: { decrement: 300 }, totalSpent: { increment: 300 } });
  });

  it("karmi detektor anomalii ekonomii", async () => {
    await POST(req({ target: "widz", amount: 500 }));
    expect(h.anomaly).toHaveBeenCalledOnce();
  });
});

describe("POST /api/admin/grant-tokens — CHIPS (darmowa waluta kasyna)", () => {
  it("rusza WYŁĄCZNIE `chips` — zero tokens/totalEarned (to jest cały sens rozdziału)", async () => {
    const res = await POST(req({ target: "widz", amount: 5_000, currency: "CHIPS", reason: "event" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { newBalance: number; currency: string };

    expect(grantData()).toEqual({ chips: { increment: 5_000 } });
    expect(grantData()).not.toHaveProperty("tokens");
    expect(grantData()).not.toHaveProperty("totalEarned");
    expect(body.currency).toBe("CHIPS");
    expect(body.newBalance).toBe(2_500); // saldo żetonów, nie GT
  });

  it("stempluje wiersz ledgera `currency:\"CHIPS\"` (inaczej refund/ranking policzą go jako GT)", async () => {
    await POST(req({ target: "widz", amount: 5_000, currency: "CHIPS" }));
    expect(h.txCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "admin_grant", currency: "CHIPS" }) }),
    );
  });

  it("NIE karmi detektora anomalii GT (darmowa waluta = fałszywy alarm + znieczulenie realnego)", async () => {
    await POST(req({ target: "widz", amount: 500_000, currency: "CHIPS" }));
    expect(h.anomaly).not.toHaveBeenCalled();
  });

  it("odjęcie strażowane po `chips` i nie tyka totalSpent", async () => {
    await POST(req({ target: "widz", amount: -1_000, currency: "CHIPS" }));
    const { where, data } = deductArgs();
    expect(where).toEqual({ id: "u-1", chips: { gte: 1_000 } });
    expect(data).toEqual({ chips: { decrement: 1_000 } });
    expect(data).not.toHaveProperty("totalSpent");
  });

  it("pre-check niewystarczającego salda patrzy na chips, nie na tokens", async () => {
    // 2 000 żetonów, próba odjęcia 1 500 — po saldzie GT (1 000) to by przeszło jako błąd.
    h.user = { id: "u-1", username: "widz", displayName: "Widz", tokens: 1_000, chips: 2_000 };
    const ok = await POST(req({ target: "widz", amount: -1_500, currency: "CHIPS" }));
    expect(ok.status).toBe(200);

    // A teraz odwrotnie: 3 000 żetonów przy saldzie 2 000 → 400 z komunikatem o żetonach.
    const res = await POST(req({ target: "widz", amount: -3_000, currency: "CHIPS" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("żeton");
    expect(body.error).not.toContain("GT");
  });

  it("powiadomienie dla widza mówi o żetonach, nie o tokenach", async () => {
    await POST(req({ target: "widz", amount: 5_000, currency: "CHIPS", reason: "event" }));
    const notif = h.notifCreate.mock.calls[0][0].data as { title: string; message: string };
    expect(notif.title).toContain("żeton");
    expect(notif.message).toContain("🪙");
    expect(notif.message).not.toContain("GT");
  });
});

describe("POST /api/admin/grant-tokens — walidacja waluty", () => {
  it("odrzuca nieznaną walutę zamiast po cichu potraktować ją jak GT", async () => {
    const res = await POST(req({ target: "widz", amount: 100, currency: "PLN" }));
    expect(res.status).toBe(400);
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it("case-sensitive: \"chips\" to nie \"CHIPS\"", async () => {
    const res = await POST(req({ target: "widz", amount: 100, currency: "chips" }));
    expect(res.status).toBe(400);
  });

  it("brak pola currency = GT (kompatybilność wstecz dla botów/istniejących klientów)", async () => {
    await POST(req({ target: "widz", amount: 100 }));
    expect(grantData()).toEqual({ tokens: { increment: 100 }, totalEarned: { increment: 100 } });
  });
});
