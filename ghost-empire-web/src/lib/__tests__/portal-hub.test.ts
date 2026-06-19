import { describe, it, expect } from "vitest";
import { portalUrl, buildPortalList, type PortalTenant } from "@/lib/portal-hub";

const tenant = (over: Partial<PortalTenant> = {}): PortalTenant => ({
  slug: "ghost-empire",
  name: "Ghost Empire",
  logoUrl: null,
  brandColor: "#E50914",
  domain: null,
  ...over,
});

describe("portalUrl", () => {
  it("prefers a custom domain over the subdomain", () => {
    expect(portalUrl({ slug: "ge", domain: "ghostempire.tv" }, "root.com")).toBe("https://ghostempire.tv");
  });

  it("normalizes a domain that already has a scheme / trailing slash", () => {
    expect(portalUrl({ slug: "ge", domain: "https://ghostempire.tv/" }, "root.com")).toBe("https://ghostempire.tv");
  });

  it("builds slug.<root> when only a root domain is configured", () => {
    expect(portalUrl({ slug: "neo", domain: null }, "myapp.com")).toBe("https://neo.myapp.com");
  });

  it("returns null when no root domain is configured (subdomains not deployed)", () => {
    expect(portalUrl({ slug: "neo", domain: null }, undefined)).toBeNull();
    expect(portalUrl({ slug: "neo", domain: null }, "")).toBeNull();
  });
});

describe("buildPortalList", () => {
  it("puts the current portal first and marks it", () => {
    const list = buildPortalList(tenant(), [tenant({ slug: "neo", name: "Neo" })], "ghost-empire", "myapp.com");
    expect(list[0].slug).toBe("ghost-empire");
    expect(list[0].isCurrent).toBe(true);
    expect(list[1].slug).toBe("neo");
    expect(list[1].isCurrent).toBe(false);
  });

  it("deduplicates when the current portal is also followed", () => {
    const list = buildPortalList(tenant(), [tenant(), tenant({ slug: "neo", name: "Neo" })], "ghost-empire", "myapp.com");
    expect(list.filter((p) => p.slug === "ghost-empire")).toHaveLength(1);
  });

  it("sorts followed portals alphabetically by name", () => {
    const list = buildPortalList(
      null,
      [tenant({ slug: "z", name: "Zed" }), tenant({ slug: "a", name: "Apex" })],
      null,
      "myapp.com",
    );
    expect(list.map((p) => p.name)).toEqual(["Apex", "Zed"]);
  });

  it("handles no current tenant (fallback) without crashing", () => {
    expect(buildPortalList(null, [], null)).toEqual([]);
  });
});
