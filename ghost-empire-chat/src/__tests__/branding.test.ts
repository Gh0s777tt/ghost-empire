// src/__tests__/branding.test.ts
// Guards the invariants of src/branding.ts — the module that decides which currency name
// goes into VIEWER-FACING chat messages on every portal. The bug this protects against is a
// white-label leak: the founder's "Ghost Tokens"/"GT" appearing in another streamer's chat.
//
// Why these tests and not "does the fetch work": the fetch is trivial, the FAILURE
// behaviour is what's load-bearing. A wrong currency name is a leak, so a broken portal
// must degrade to brand-neutral wording, never to "GT"; and because this runs on the chat
// hot path, a down portal must not cost a round-trip per message (back-off) or throw.
//
// Runner: Node's built-in test runner via tsx (`npm test`). Deliberately NO new dependency —
// the bot had no test setup, and node:test + node:assert cover this without adding vitest to
// a runtime whose only other dev tooling is tsx + tsc.
import { test, describe, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// env.ts's req() throws on missing vars at import time, so these must exist before the
// first dynamic import of branding.ts (dotenv does not override already-set values).
process.env.PORTAL_URL = "https://neo-zone.example.test";
process.env.BOT_SECRET = "test-secret";
process.env.TWITCH_BOT_USERNAME = "TestBot";
process.env.TWITCH_CHANNEL = "test_channel";

type BrandingModule = typeof import("../branding");

/**
 * A branding.ts with FRESH module state (empty cache, no back-off). The module keeps its
 * cache in module scope, so tests would otherwise leak into each other; a distinct import
 * query gives each case its own instance.
 */
let instances = 0;
async function freshBranding(): Promise<BrandingModule> {
  return (await import(`../branding.ts?case=${++instances}`)) as BrandingModule;
}

// The stubs declare fetch's parameters so `calls[n].arguments[0]` stays typed (a zero-arg
// mock.fn() infers an empty tuple, which has no index 0).
type FetchArgs = [input?: unknown, init?: unknown];

/** Stub global fetch with a JSON body + status, counting calls. */
function stubFetch(body: unknown, status = 200) {
  const fn = mock.fn(async (..._args: FetchArgs) => new Response(JSON.stringify(body), { status }));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

/** Stub global fetch with a hard network failure (portal unreachable / DNS / timeout). */
function stubFetchFailure() {
  const fn = mock.fn(async (..._args: FetchArgs) => {
    throw new Error("connect ECONNREFUSED");
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  mock.timers.reset();
});

/** The leak this module exists to prevent: founder-specific currency naming. */
function assertNoFounderCurrency(text: string) {
  assert.doesNotMatch(text, /\bGT\b/, `founder symbol leaked into chat copy: ${text}`);
  assert.doesNotMatch(text, /Ghost Tokens/i, `founder currency leaked into chat copy: ${text}`);
}

describe("branding fallback (portal not yet read)", () => {
  test("starts brand-neutral, never the founder's currency", async () => {
    const { brandingNow } = await freshBranding();
    const b = brandingNow();
    assert.equal(b.tokenName, "tokeny");
    assert.equal(b.tokenSymbol, "tokenów");
    assertNoFounderCurrency(b.tokenName);
    assertNoFounderCurrency(b.tokenSymbol);
  });

  test("brandingNow() never performs a fetch (safe on sync chat paths)", async () => {
    const fetchMock = stubFetch({ tokenName: "Neo Coins", tokenSymbol: "NC" });
    const { brandingNow } = await freshBranding();
    brandingNow();
    brandingNow();
    assert.equal(fetchMock.mock.callCount(), 0);
  });
});

describe("branding fetch (happy path)", () => {
  test("uses THIS portal's currency names", async () => {
    stubFetch({ name: "Neo Zone", tokenName: "Neo Coins", tokenSymbol: "NC" });
    const { getBranding } = await freshBranding();
    const b = await getBranding();
    assert.deepEqual(b, { tokenName: "Neo Coins", tokenSymbol: "NC" });
  });

  test("reads the portal's public branding endpoint on its own host", async () => {
    const fetchMock = stubFetch({ tokenName: "Neo Coins", tokenSymbol: "NC" });
    const { getBranding } = await freshBranding();
    await getBranding();
    const url = String(fetchMock.mock.calls[0].arguments[0]);
    assert.equal(url, "https://neo-zone.example.test/api/companion/branding");
  });

  test("caches within the TTL — a chat burst costs one round-trip", async () => {
    const fetchMock = stubFetch({ tokenName: "Neo Coins", tokenSymbol: "NC" });
    const { getBranding } = await freshBranding();
    await getBranding();
    await getBranding();
    await getBranding();
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  test("concurrent callers share ONE in-flight request", async () => {
    const fetchMock = stubFetch({ tokenName: "Neo Coins", tokenSymbol: "NC" });
    const { getBranding } = await freshBranding();
    const all = await Promise.all([getBranding(), getBranding(), getBranding(), getBranding()]);
    assert.equal(fetchMock.mock.callCount(), 1);
    for (const b of all) assert.equal(b.tokenName, "Neo Coins");
  });

  test("re-reads after the TTL expires, so a rename lands without a restart", async () => {
    mock.timers.enable({ apis: ["Date"] });
    const fetchMock = stubFetch({ tokenName: "Neo Coins", tokenSymbol: "NC" });
    const { getBranding } = await freshBranding();
    assert.equal((await getBranding()).tokenName, "Neo Coins");

    // The streamer renames the currency in /admin…
    stubFetch({ tokenName: "Zone Bucks", tokenSymbol: "ZB" });
    mock.timers.tick(4 * 60_000); // …still inside the 5 min TTL → old name, no request
    assert.equal((await getBranding()).tokenName, "Neo Coins");

    mock.timers.tick(61_000); // …past the TTL → picked up without restarting the bot
    assert.equal((await getBranding()).tokenName, "Zone Bucks");
    assert.equal(fetchMock.mock.callCount(), 1); // the first stub was only ever called once
  });
});

describe("degradation — a broken portal must go generic, never founder-branded", () => {
  test("network failure keeps the neutral wording and does not throw", async () => {
    stubFetchFailure();
    const { getBranding } = await freshBranding();
    const b = await getBranding(); // must resolve, not reject — chat path must survive
    assert.equal(b.tokenName, "tokeny");
    assertNoFounderCurrency(b.tokenName);
  });

  test("non-OK status keeps the neutral wording", async () => {
    stubFetch({ error: "rate-limited" }, 429);
    const { getBranding } = await freshBranding();
    assert.equal((await getBranding()).tokenName, "tokeny");
  });

  test("invalid JSON body keeps the neutral wording", async () => {
    globalThis.fetch = (async () => new Response("<html>502</html>", { status: 200 })) as unknown as typeof fetch;
    const { getBranding } = await freshBranding();
    assert.equal((await getBranding()).tokenName, "tokeny");
  });

  test("half-filled payload is REFUSED — never 'obstawiaj undefined' in chat", async () => {
    stubFetch({ tokenName: "Neo Coins" }); // tokenSymbol missing
    const { getBranding } = await freshBranding();
    const b = await getBranding();
    assert.equal(b.tokenName, "tokeny");
    assert.equal(b.tokenSymbol, "tokenów");
  });

  test("blank / non-string values are refused", async () => {
    stubFetch({ tokenName: "   ", tokenSymbol: 42 });
    const { getBranding } = await freshBranding();
    assert.equal((await getBranding()).tokenName, "tokeny");
  });

  test("a good value SURVIVES a later outage (last-known beats neutral)", async () => {
    mock.timers.enable({ apis: ["Date"] });
    stubFetch({ tokenName: "Neo Coins", tokenSymbol: "NC" });
    const { getBranding } = await freshBranding();
    assert.equal((await getBranding()).tokenName, "Neo Coins");

    stubFetchFailure();
    mock.timers.tick(5 * 60_000 + 1); // TTL expired → refresh attempt fails
    assert.equal((await getBranding()).tokenName, "Neo Coins");
  });

  test("failures back off — a down portal costs ONE request, not one per message", async () => {
    const fetchMock = stubFetchFailure();
    const { getBranding } = await freshBranding();
    await getBranding();
    await getBranding();
    await getBranding();
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  test("retries once the back-off window has passed", async () => {
    mock.timers.enable({ apis: ["Date"] });
    const failing = stubFetchFailure();
    const { getBranding } = await freshBranding();
    await getBranding();
    assert.equal(failing.mock.callCount(), 1);

    mock.timers.tick(60_001); // past the 60 s back-off → portal is back
    stubFetch({ tokenName: "Neo Coins", tokenSymbol: "NC" });
    assert.equal((await getBranding()).tokenName, "Neo Coins");
  });

  test("an absurdly long name is bounded (chat platforms cap message length)", async () => {
    stubFetch({ tokenName: "N".repeat(500), tokenSymbol: "S".repeat(500) });
    const { getBranding } = await freshBranding();
    const b = await getBranding();
    assert.equal(b.tokenName.length, 32);
    assert.equal(b.tokenSymbol.length, 32);
  });
});

describe("applyBranding (placeholder substitution for sync copy)", () => {
  let mod: BrandingModule;
  beforeEach(async () => {
    mod = await freshBranding();
  });

  test("neutral cache substitutes generic wording, never 'GT'", () => {
    const out = mod.applyBranding("Zgarniaj %tokenName%: https://portal.test");
    assert.equal(out, "Zgarniaj tokeny: https://portal.test");
    assertNoFounderCurrency(out);
  });

  test("substitutes the portal's names once branding is known", async () => {
    stubFetch({ tokenName: "Neo Coins", tokenSymbol: "NC" });
    await mod.getBranding();
    assert.equal(mod.applyBranding("Wydaj %tokenName% w sklepie"), "Wydaj Neo Coins w sklepie");
    assert.equal(mod.applyBranding("Pula: 500 %gt%."), "Pula: 500 NC.");
  });

  test("replaces EVERY occurrence of both placeholders", async () => {
    stubFetch({ tokenName: "Neo Coins", tokenSymbol: "NC" });
    await mod.getBranding();
    assert.equal(mod.applyBranding("%tokenName% i %tokenName% za %gt% i %gt%"), "Neo Coins i Neo Coins za NC i NC");
  });

  test("leaves text without placeholders untouched", () => {
    const text = "Ranking widzów: https://portal.test/ranking";
    assert.equal(mod.applyBranding(text), text);
  });
});
