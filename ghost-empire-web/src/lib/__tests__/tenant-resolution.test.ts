// QA: rozwiązywanie tenantu z Host (rdzeń izolacji multi-tenant).
// Kontrakty: NIGDY nie ufać nagłówkowi x-tenant-slug; subdomena → slug;
// custom domain → Tenant.domain; nieznany host → tenant domyślny; awaria DB →
// FALLBACK_TENANT. Mockowane next/headers + prisma; resetModules per test,
// bo getCurrentTenant jest opakowany w React cache().
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  headersThrow: false,
  findUnique: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => {
    if (state.headersThrow) throw new Error("outside request scope");
    return { get: (k: string) => state.headers.get(k.toLowerCase()) ?? null };
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { tenant: { findUnique: state.findUnique } },
}));

// Wiersz tenanta w kształcie, jakiego dotyka toBrand (reszta pól nieużywana).
const row = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  slug: "ghost-empire",
  ownerUserId: "owner-1",
  name: "Ghost Empire",
  shortName: "GE",
  brandColor: "#8b5cf6",
  tokenName: "Ghost Tokens",
  tokenSymbol: "GT",
  ownerHandle: "gh0stt",
  logoUrl: null,
  companionDefaultName: "Widmo",
  bgImageUrl: null,
  socialLinks: null,
  timezone: "Europe/Warsaw",
  supportHeading: null,
  supportIntro: null,
  supportThanks: null,
  ...over,
});

async function loadTenantModule() {
  vi.resetModules();
  return import("@/lib/tenant");
}

beforeEach(() => {
  state.headers = new Map();
  state.headersThrow = false;
  state.findUnique.mockReset();
  // Root domain dla subdomen — resolveTenantSlug czyta env (patrz tenant-host.ts).
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = "e-forge.app";
});

describe("getCurrentTenant — wybór tenanta po Host", () => {
  it("SECURITY: ignores a forged x-tenant-slug header (host decides, not the header)", async () => {
    state.headers.set("host", "e-forge.app"); // apex — brak subdomeny
    state.headers.set("x-tenant-slug", "victim-portal"); // sfałszowany
    state.findUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.slug === "victim-portal") return row({ id: "VICTIM", slug: "victim-portal" });
      if (where.slug === "ghost-empire") return row();
      return null;
    });
    const { getCurrentTenant } = await loadTenantModule();
    const t = await getCurrentTenant();
    expect(t.id).toBe("t1"); // domyślny, NIE victim
    // findUnique nigdy nie pytał o sfałszowany slug
    const asked = state.findUnique.mock.calls.map((c) => JSON.stringify(c[0]));
    expect(asked.join("|")).not.toContain("victim-portal");
  });

  it("resolves a tenant subdomain by slug", async () => {
    state.headers.set("host", "streamerka.e-forge.app");
    state.findUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.slug === "streamerka" ? row({ id: "t-sub", slug: "streamerka" }) : null,
    );
    const { getCurrentTenant } = await loadTenantModule();
    expect((await getCurrentTenant()).id).toBe("t-sub");
  });

  it("resolves a white-label custom domain via Tenant.domain", async () => {
    state.headers.set("host", "empire-forge.com");
    state.findUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.domain === "empire-forge.com") return row({ id: "t-custom", slug: "forge" });
      if (where.slug === "ghost-empire") return row();
      return null;
    });
    const { getCurrentTenant } = await loadTenantModule();
    expect((await getCurrentTenant()).id).toBe("t-custom");
  });

  it("unknown subdomain falls back to the default tenant (documented behavior)", async () => {
    state.headers.set("host", "nie-istnieje.e-forge.app");
    state.findUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.slug === "ghost-empire" ? row() : null,
    );
    const { getCurrentTenant } = await loadTenantModule();
    expect((await getCurrentTenant()).slug).toBe("ghost-empire");
  });

  it("returns FALLBACK_TENANT when the DB throws (table not migrated)", async () => {
    state.headers.set("host", "e-forge.app");
    state.findUnique.mockRejectedValue(new Error("relation does not exist"));
    const { getCurrentTenant, FALLBACK_TENANT } = await loadTenantModule();
    const t = await getCurrentTenant();
    expect(t.id).toBeNull();
    expect(t.slug).toBe(FALLBACK_TENANT.slug);
  });

  it("returns the default brand outside a request scope (headers() throws)", async () => {
    state.headersThrow = true;
    state.findUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.slug === "ghost-empire" ? row() : null,
    );
    const { getCurrentTenant } = await loadTenantModule();
    expect((await getCurrentTenant()).slug).toBe("ghost-empire");
  });
});

describe("getCurrentTenant — sanityzacja socialLinks (dane z DB są niezaufane)", () => {
  it("drops javascript: URLs, lowercases/truncates platform, caps at 12 entries", async () => {
    state.headers.set("host", "e-forge.app");
    const links = [
      { platform: "TWITCH", url: "https://twitch.tv/x" },
      { platform: "evil", url: "javascript:alert(1)" }, // musi wypaść
      { platform: "x".repeat(40), url: "http://ok.example" },
      ...Array.from({ length: 15 }, (_, i) => ({ platform: `p${i}`, url: `https://s${i}.example` })),
    ];
    state.findUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.slug === "ghost-empire" ? row({ socialLinks: links }) : null,
    );
    const { getCurrentTenant } = await loadTenantModule();
    const t = await getCurrentTenant();
    expect(t.socialLinks).not.toBeNull();
    const urls = (t.socialLinks ?? []).map((l) => l.url);
    expect(urls.some((u) => u.startsWith("javascript:"))).toBe(false);
    expect(t.socialLinks!.length).toBeLessThanOrEqual(12);
    expect(t.socialLinks![0]!.platform).toBe("twitch"); // lowercased
    expect(t.socialLinks!.every((l) => l.platform.length <= 20)).toBe(true);
  });

  it("returns null socials for garbage shapes instead of crashing", async () => {
    state.headers.set("host", "e-forge.app");
    state.findUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.slug === "ghost-empire" ? row({ socialLinks: [{ nope: 1 }, "str", null, 42] }) : null,
    );
    const { getCurrentTenant } = await loadTenantModule();
    expect((await getCurrentTenant()).socialLinks).toBeNull();
  });
});

describe("isFounderBrand / isPlatformBrand — tabela prawdy (#746)", () => {
  it("classifies founder, platform storefront and streamer sub-portal correctly", async () => {
    const { isFounderBrand, isPlatformBrand } = await loadTenantModule();
    const founder = { id: "t1", slug: "ghost-empire", ownerUserId: "owner-1" };
    const prerow = { id: null, slug: "ghost-empire", ownerUserId: null };
    const storefront = { id: "t2", slug: "e-forge", ownerUserId: null };
    const streamer = { id: "t3", slug: "streamerka", ownerUserId: "u-9" };

    expect(isFounderBrand(founder)).toBe(true);
    expect(isFounderBrand(prerow)).toBe(true);
    expect(isFounderBrand(storefront)).toBe(false);
    expect(isFounderBrand(streamer)).toBe(false);

    expect(isPlatformBrand(founder)).toBe(true); // founder ma ownera, ale founder → storefront
    expect(isPlatformBrand(storefront)).toBe(true); // platform-seeded, bez ownera
    expect(isPlatformBrand(streamer)).toBe(false); // sub-portal streamera: Premium tylko dla admina
  });
});
