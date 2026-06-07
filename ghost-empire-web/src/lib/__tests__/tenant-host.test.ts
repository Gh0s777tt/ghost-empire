import { describe, it, expect } from "vitest";
import { tenantSlugFromHost } from "@/lib/tenant-host";

describe("tenantSlugFromHost", () => {
  const ROOT = "myapp.com";

  it("extracts a single-label subdomain as the tenant slug", () => {
    expect(tenantSlugFromHost("gh0st.myapp.com", ROOT)).toBe("gh0st");
    expect(tenantSlugFromHost("streamer-two.myapp.com", ROOT)).toBe("streamer-two");
  });

  it("returns null for apex and www (no tenant)", () => {
    expect(tenantSlugFromHost("myapp.com", ROOT)).toBeNull();
    expect(tenantSlugFromHost("www.myapp.com", ROOT)).toBeNull();
  });

  it("returns null for multi-label subdomains", () => {
    expect(tenantSlugFromHost("a.b.myapp.com", ROOT)).toBeNull();
  });

  it("returns null for hosts not under the root domain", () => {
    expect(tenantSlugFromHost("ghost-empire-web.vercel.app", ROOT)).toBeNull();
    expect(tenantSlugFromHost("localhost", ROOT)).toBeNull();
    expect(tenantSlugFromHost("evil-myapp.com", ROOT)).toBeNull(); // suffix without the dot must not match
  });

  it("is a no-op when no root domain is configured", () => {
    expect(tenantSlugFromHost("gh0st.myapp.com", undefined)).toBeNull();
    expect(tenantSlugFromHost("gh0st.myapp.com", "")).toBeNull();
  });

  it("handles empty / null hosts", () => {
    expect(tenantSlugFromHost(null, ROOT)).toBeNull();
    expect(tenantSlugFromHost(undefined, ROOT)).toBeNull();
    expect(tenantSlugFromHost("", ROOT)).toBeNull();
  });

  it("strips the port and is case-insensitive", () => {
    expect(tenantSlugFromHost("gh0st.myapp.com:3000", ROOT)).toBe("gh0st");
    expect(tenantSlugFromHost("GH0ST.MyApp.Com", ROOT)).toBe("gh0st");
  });
});
