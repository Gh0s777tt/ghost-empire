import { test, expect } from "@playwright/test";

// Smoke tests: every public page must render without a server error and show the
// shared chrome (nav + footer). Catches a broken build / crashing page before deploy.
const PUBLIC_PAGES = ["/", "/shop", "/ranking", "/about", "/wheel", "/games", "/predictions", "/polls", "/schedule", "/achievements"];

test.describe("public pages smoke", () => {
  for (const path of PUBLIC_PAGES) {
    test(`loads ${path} without a server error`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res, `no response for ${path}`).not.toBeNull();
      expect(res!.status(), `HTTP status for ${path}`).toBeLessThan(400);
      await expect(page.locator("body")).toBeVisible();
    });
  }

  test("home renders the primary navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /SKLEP/i }).first()).toBeVisible();
  });

  test("the Wheel page shows its heading", async ({ page }) => {
    await page.goto("/wheel");
    await expect(page.getByText(/Koło Fortuny/i).first()).toBeVisible();
  });

  test("404 page responds for an unknown route", async ({ page }) => {
    const res = await page.goto("/this-route-does-not-exist-xyz");
    expect(res?.status()).toBe(404);
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
