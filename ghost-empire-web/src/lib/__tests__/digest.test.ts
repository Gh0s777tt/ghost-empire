// src/lib/__tests__/digest.test.ts — pure digest composer (#773).
import { describe, it, expect } from "vitest";
import { composeDigest, escapeHtml, type DigestStats } from "@/lib/digest";

const BASE: DigestStats = {
  tenantName: "E-Forge",
  tokenSymbol: "GT",
  portalUrl: "https://example.com",
  brandColor: "#0b6f78",
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

// Audyt 2026-08: nagłówek, ramka ostrzeżenia i przycisk były zaszyte na czerwieni ZAŁOŻYCIELA
// (#e50914), więc raport tygodniowy KAŻDEGO portalu wyglądał jak Ghost Empire — mail trafia
// do skrzynki właściciela, więc leak był podwójnie niezręczny.
describe("composeDigest — kolor marki portalu", () => {
  it("używa koloru PORTALU, nie zaszytej czerwieni założyciela", () => {
    const { html } = composeDigest({ ...BASE, brandColor: "#1d4ed8" });
    expect(html).toContain("#1d4ed8");
    expect(html).not.toContain("#e50914");
  });

  it("każdy portal dostaje SWÓJ kolor", () => {
    const a = composeDigest({ ...BASE, brandColor: "#aa0011" }).html;
    const b = composeDigest({ ...BASE, brandColor: "#00bb22" }).html;
    expect(a).toContain("#aa0011");
    expect(a).not.toContain("#00bb22");
    expect(b).toContain("#00bb22");
  });

  it("kolor spoza #rrggbb NIE wchodzi do stylu — to wektor wstrzyknięcia CSS w mailu", () => {
    // Wartość leci wprost do `style="…"`, więc traktujemy ją jak `brandColor` w layoucie portalu.
    for (const zly of ['red', '#fff', 'blue;background:url(x)', '#12345', '', null, undefined]) {
      const { html } = composeDigest({ ...BASE, brandColor: zly as unknown as string });
      expect(html).toContain("#52525b");           // neutralna szarość zamiast śmiecia
      expect(html).not.toContain("url(x)");        // nic się nie przemyciło
    }
  });
});
