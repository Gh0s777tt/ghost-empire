// QA: autoryzacja GET /api/companion (ścieżka Bearer dla rozszerzenia NX).
// Kontrakty: brak sesji i brak/zły token → 401; ważny token → dane WŁASNE
// posiadacza. Probe cross-tenant: token niesie tenantId, ale route go dziś
// IGNORUJE — dokumentujemy defekt D-3 (upsert może utworzyć companiona pod
// tenantem z Hosta, nie z tokena). Mock auth/prisma/tenant; token PRAWDZIWY
// (podpisywany dev-kluczem crypto.ts w środowisku testowym).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { signCompanionToken } from "@/lib/companion-token";

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  tenant: { id: "tenant-B", companionDefaultName: "Widmo-B" } as { id: string | null; companionDefaultName: string },
  companionUpsert: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: async () => state.session }));
vi.mock("@/lib/api-i18n", () => ({
  jsonError: (msg: string, status: number) => NextResponse.json({ error: msg }, { status }),
}));
vi.mock("@/lib/tenant", () => ({
  getCurrentTenant: async () => state.tenant,
  currentTenantId: async () => state.tenant.id,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    companion: { upsert: state.companionUpsert },
    user: { findUnique: state.userFindUnique },
  },
}));

import { GET } from "@/app/api/companion/route";

const req = (token?: string) =>
  new Request("https://portal-b.example/api/companion", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

beforeEach(() => {
  state.session = null;
  state.tenant = { id: "tenant-B", companionDefaultName: "Widmo-B" };
  state.companionUpsert.mockReset().mockResolvedValue({ name: "Widmo", xp: 5, lastFedAt: null });
  state.userFindUnique.mockReset().mockResolvedValue({ tokens: 120 });
});

describe("GET /api/companion — autoryzacja", () => {
  it("401 without a session and without a token", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(state.companionUpsert).not.toHaveBeenCalled();
  });

  it("401 for a garbage bearer token", async () => {
    const res = await GET(req("cmp1.not-a-real.token"));
    expect(res.status).toBe(401);
    expect(state.companionUpsert).not.toHaveBeenCalled();
  });

  it("returns ONLY the token holder's own data for a valid token", async () => {
    const res = await GET(req(signCompanionToken("user-42", "tenant-B")));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { balance: number };
    expect(body.balance).toBe(120);
    expect(state.companionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-42" } }),
    );
    expect(state.userFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-42" } }),
    );
  });

  it("sets CORS headers on the extension read path", async () => {
    const res = await GET(req(signCompanionToken("user-42", "tenant-B")));
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  // D-3 (naprawione): token niesie tenantId; route odrzuca token spoza tego portalu.
  // Token dla tenant-A obsłużony na Hoście tenant-B → 401, brak upsertu pod złym portalem.
  it("rejects a token scoped to a different tenant (cross-tenant, #qa D-3)", async () => {
    const res = await GET(req(signCompanionToken("user-from-A", "tenant-A")));
    expect(res.status).toBe(401);
    expect(state.companionUpsert).not.toHaveBeenCalled();
  });

  it("accepts a token whose tenantId matches the request tenant", async () => {
    const res = await GET(req(signCompanionToken("user-from-B", "tenant-B")));
    expect(res.status).toBe(200);
    expect(state.companionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-from-B" } }),
    );
  });

  it("rejects a legacy null-tenant token on a real (non-null) tenant portal", async () => {
    const res = await GET(req(signCompanionToken("legacy-user", null)));
    expect(res.status).toBe(401); // null !== "tenant-B"
  });
});
