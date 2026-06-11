import { test, expect } from "@playwright/test";

// Smoke tests: every public page must render without a server error and show the
// shared chrome (nav + footer). Catches a broken build / crashing page before deploy.
const PUBLIC_PAGES = ["/", "/shop", "/ranking", "/about", "/wheel", "/kasyno", "/games", "/predictions", "/polls", "/schedule", "/achievements"];

test.describe("public pages smoke", () => {
  for (const path of PUBLIC_PAGES) {
    test(`loads ${path} without a server error`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res, `no response for ${path}`).not.toBeNull();
      expect(res!.status(), `HTTP status for ${path}`).toBeLessThan(400);
      await expect(page.locator("body")).toBeVisible();
    });
  }

  test("a public page renders the primary navigation", async ({ page }) => {
    // (not "/" — a first visit redirects guests to /welcome, which has no nav)
    await page.goto("/shop");
    await expect(page.getByRole("link", { name: /RANKING/i }).first()).toBeVisible();
  });

  test("the Wheel page shows its how-it-works box", async ({ page }) => {
    // ASCII-only assertion (this file once had broken PL diacritics encoding)
    await page.goto("/wheel");
    await expect(page.locator("details summary").first()).toBeVisible();
  });

  test("404 page responds for an unknown route", async ({ page }) => {
    const res = await page.goto("/this-route-does-not-exist-xyz");
    expect(res?.status()).toBe(404);
  });

  test("the casino help box lists all 10 games (guest view)", async ({ page }) => {
    // The tile lobby itself sits behind login; the public how-it-works box mirrors it.
    await page.goto("/kasyno", { waitUntil: "load" });
    await expect(page.locator("details li")).toHaveCount(10, { timeout: 10_000 });
  });

  test("ranking has 5 sort tabs (incl. weekly)", async ({ page }) => {
    await page.goto("/ranking?sort=weekly");
    await expect(page.locator('[data-tour="ranking-sort"] a')).toHaveCount(5);
  });

  test("english locale renders the casino help box", async ({ page }) => {
    await page.goto("/en/kasyno");
    await expect(page.getByText(/HOW DOES IT WORK\?/i).first()).toBeVisible();
  });

  test("onboarding wizard requires sign-in (guest → signin redirect)", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/auth\/signin/);
    expect(page.url()).toContain("callbackUrl");
  });

  test("english onboarding route resolves", async ({ page }) => {
    const res = await page.goto("/en/onboarding", { waitUntil: "domcontentloaded" });
    expect(res!.status()).toBeLessThan(400);
  });

  test("no Content-Security-Policy violations on key pages", async ({ page }) => {
    // Genuine CSP violations name the policy / a disallowed source. (We don't match
    // the generic "Refused to execute" — locally that also fires for the Vercel
    // Analytics scripts, which only exist on Vercel's infra, not under `next start`.)
    const violations: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && /content security policy|unsafe-eval|unsafe-inline/i.test(msg.text())) {
        violations.push(msg.text());
      }
    });
    for (const path of ["/", "/wheel", "/shop"]) {
      await page.goto(path, { waitUntil: "load" });
    }
    expect(violations, violations.join("\n")).toHaveLength(0);
  });
});

test.describe("public APIs smoke", () => {
  test("health responds ok with db up", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.db).toBe("ok");
  });

  test("jackpot pool responds with at least the seed", async ({ request }) => {
    const res = await request.get("/api/gt-games/jackpot");
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).pool).toBeGreaterThanOrEqual(5000);
  });

  test("the play API rejects guests (auth wall)", async ({ request }) => {
    const res = await request.post("/api/gt-games/play", { data: { game: "coinflip", bet: 10 } });
    expect(res.status()).toBe(401);
  });
});
