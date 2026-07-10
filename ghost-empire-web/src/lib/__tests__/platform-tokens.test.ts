// QA: dostęp do per-tenant tokenów platform (Twitch/Kick/YouTube/Streamlabs).
// Kontrakty: undefined tid → resolve z currentTenantId (Host); string → ten tenant;
// null → wprost legacy "default"; per-tenant miss → fallback na "default"; per-tenant
// hit → NIE sięga po default (brak wycieku cudzego portalu). Plus tokenUpsertKeys
// (pure) i mapowanie broadcaster→tenant z webhooków. Mock prisma + currentTenantId.
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  currentTid: "tenant-A" as string | null,
  twitchFindUnique: vi.fn(),
  twitchFindFirst: vi.fn(),
  kickFindFirst: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({ currentTenantId: async () => h.currentTid }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    twitchStreamerToken: { findUnique: h.twitchFindUnique, findFirst: h.twitchFindFirst },
    kickStreamerToken: { findFirst: h.kickFindFirst },
    // pozostałe modele nietykane w tych testach
    youTubeStreamerToken: { findUnique: vi.fn() },
    streamlabsConnection: { findUnique: vi.fn() },
  },
}));

import {
  getTwitchStreamerToken,
  tokenUpsertKeys,
  tenantIdForTwitchBroadcaster,
  tenantIdForKickBroadcaster,
} from "@/lib/platform-tokens";

beforeEach(() => {
  h.currentTid = "tenant-A";
  h.twitchFindUnique.mockReset();
  h.twitchFindFirst.mockReset();
  h.kickFindFirst.mockReset();
});

describe("tokenUpsertKeys (pure)", () => {
  it("keys by tenantId when a tenant is known", () => {
    expect(tokenUpsertKeys("t1")).toEqual({ where: { tenantId: "t1" }, createKey: { tenantId: "t1" } });
  });
  it("keys by the legacy default row when tenant is null", () => {
    expect(tokenUpsertKeys(null)).toEqual({ where: { id: "default" }, createKey: { id: "default" } });
  });
});

describe("getTwitchStreamerToken — rozwiązywanie tenanta", () => {
  it("undefined tid → resolves via currentTenantId (Host) and returns the per-tenant row", async () => {
    h.twitchFindUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.tenantId === "tenant-A" ? { id: "row-A", tenantId: "tenant-A", accessToken: "x" } : null,
    );
    const row = await getTwitchStreamerToken();
    expect(row?.id).toBe("row-A");
    expect(h.twitchFindUnique).toHaveBeenCalledWith({ where: { tenantId: "tenant-A" } });
  });

  it("explicit tid string → uses THAT tenant (webhook path that mapped broadcaster→tenant)", async () => {
    h.twitchFindUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.tenantId === "tenant-Z" ? { id: "row-Z", tenantId: "tenant-Z" } : null,
    );
    const row = await getTwitchStreamerToken("tenant-Z");
    expect(row?.id).toBe("row-Z");
  });

  it("per-tenant HIT does NOT fall back to the default row (no cross-tenant leak)", async () => {
    h.twitchFindUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.tenantId === "tenant-A" ? { id: "row-A", tenantId: "tenant-A" } : { id: "default" },
    );
    await getTwitchStreamerToken();
    // Trafiliśmy per-tenant → tylko jedno zapytanie, brak sięgania po id:"default".
    expect(h.twitchFindUnique).toHaveBeenCalledTimes(1);
    expect(h.twitchFindUnique).not.toHaveBeenCalledWith({ where: { id: "default" } });
  });

  it("per-tenant MISS → falls back to the legacy default row", async () => {
    h.twitchFindUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.id === "default" ? { id: "default", accessToken: "legacy" } : null,
    );
    const row = await getTwitchStreamerToken();
    expect(row?.id).toBe("default");
    expect(h.twitchFindUnique).toHaveBeenCalledTimes(2); // per-tenant (null) → default
    expect(h.twitchFindUnique).toHaveBeenLastCalledWith({ where: { id: "default" } });
  });

  it("tid null → goes straight to the default row (no per-tenant query)", async () => {
    h.twitchFindUnique.mockResolvedValue({ id: "default" });
    await getTwitchStreamerToken(null);
    expect(h.twitchFindUnique).toHaveBeenCalledOnce();
    expect(h.twitchFindUnique).toHaveBeenCalledWith({ where: { id: "default" } });
  });

  it("resolved tid null (no Host tenant) → also straight to default", async () => {
    h.currentTid = null;
    h.twitchFindUnique.mockResolvedValue({ id: "default" });
    await getTwitchStreamerToken();
    expect(h.twitchFindUnique).toHaveBeenCalledOnce();
    expect(h.twitchFindUnique).toHaveBeenCalledWith({ where: { id: "default" } });
  });
});

describe("broadcaster → tenant (webhook mapping)", () => {
  it("Twitch: returns the tenantId for a broadcaster, or null when unmapped", async () => {
    h.twitchFindFirst.mockResolvedValueOnce({ tenantId: "tenant-A" });
    expect(await tenantIdForTwitchBroadcaster("bc-1")).toBe("tenant-A");
    h.twitchFindFirst.mockResolvedValueOnce(null);
    expect(await tenantIdForTwitchBroadcaster("bc-unknown")).toBeNull();
  });

  it("Twitch: a row with tenantId null maps to null (legacy single-tenant)", async () => {
    h.twitchFindFirst.mockResolvedValue({ tenantId: null });
    expect(await tenantIdForTwitchBroadcaster("bc-legacy")).toBeNull();
  });

  it("Kick: returns the tenantId or null and queries by broadcasterId", async () => {
    h.kickFindFirst.mockResolvedValue({ tenantId: "tenant-K" });
    expect(await tenantIdForKickBroadcaster("kbc-1")).toBe("tenant-K");
    expect(h.kickFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { broadcasterId: "kbc-1" }, select: { tenantId: true } }),
    );
  });
});
