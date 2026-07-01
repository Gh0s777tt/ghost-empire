// src/lib/__tests__/digest.test.ts — pure digest composer (#773).
import { describe, it, expect } from "vitest";
import { composeDigest, escapeHtml, type DigestStats } from "@/lib/digest";

const BASE: DigestStats = {
  tenantName: "E-Forge",
  tokenSymbol: "GT",
  portalUrl: "https://example.com",
  newUsers: 12,
  activeUsers: 87,
  gtEarned: 15000,
  gtSpent: 9000,
  topEarner: { name: "widz1", amount: 2500 },
  pendingOrders: 3,
  openTickets: 0,
};

describe("escapeHtml", () => {
  it("escapes all five specials", () => {
    expect(escapeHtml(`<img src="x" onerror='y'>&`)).toBe("&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;");
  });
});

describe("composeDigest", () => {
  it("puts the portal name in the subject and body", () => {
    const { subject, html } = composeDigest(BASE);
    expect(subject).toContain("E-Forge");
    expect(subject).toContain("tygodniowy");
    expect(html).toContain("E-Forge");
  });

  it("renders the stats with pl-PL formatting and the token symbol", () => {
    const { html } = composeDigest(BASE);
    expect(html).toContain("+12");
    expect(html).toContain("87");
    expect(html).toMatch(/15[\s  ]000/); // pl-PL grouping (space variant)
    expect(html).toContain("GT");
    expect(html).toContain("widz1");
    expect(html).toContain("/admin");
  });

  it("shows the attention strip only when something needs action", () => {
    expect(composeDigest(BASE).html).toContain("Wymaga uwagi");
    const calm = composeDigest({ ...BASE, pendingOrders: 0, openTickets: 0 });
    expect(calm.html).not.toContain("Wymaga uwagi");
  });

  it("omits the top-earner row when null", () => {
    const { html } = composeDigest({ ...BASE, topEarner: null });
    expect(html).not.toContain("Top zarabiający");
  });

  it("escapes hostile tenant/user strings (no raw HTML injection)", () => {
    const { html } = composeDigest({
      ...BASE,
      tenantName: `<script>alert(1)</script>`,
      topEarner: { name: `<b onmouseover="x">evil</b>`, amount: 1 },
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('<b onmouseover');
    expect(html).toContain("&lt;script&gt;");
  });
});
