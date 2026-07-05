// QA: zachowanie limitera (okna czasowe, semantyka limitu, degradacja).
// Mockowane: @/lib/redis i @/lib/prisma (testy nie wychodzą do sieci/DB),
// czas przez vi.useFakeTimers — deterministyczne okna.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mutowalny stan mocków (hoisted, bo vi.mock jest hoistowany nad importy).
const state = vi.hoisted(() => {
  const bucket = {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  return {
    redis: null as null | { eval: (script: string, keys: string[], args: unknown[]) => Promise<unknown> },
    bucket,
  };
});

vi.mock("@/lib/redis", () => ({
  get redis() {
    return state.redis;
  },
  hasRedis: false,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { rateLimitBucket: state.bucket },
}));

import { rateLimit } from "@/lib/rate-limit";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-05T12:00:00Z"));
  state.redis = null;
  state.bucket.findUnique.mockReset();
  state.bucket.create.mockReset();
  state.bucket.update.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

// ---------- ścieżka Redis ----------
describe("rateLimit — Redis path", () => {
  it("allows exactly maxHits and blocks the (maxHits+1)-th request", async () => {
    let count = 0;
    state.redis = { eval: async () => [++count, 60_000] };
    const r1 = await rateLimit("k", 2, 60_000);
    const r2 = await rateLimit("k", 2, 60_000);
    const r3 = await rateLimit("k", 2, 60_000);
    expect(r1).toMatchObject({ allowed: true, remaining: 1 });
    expect(r2).toMatchObject({ allowed: true, remaining: 0 });
    expect(r3.allowed).toBe(false);
    if (!r3.allowed) expect(r3.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("uses windowMs for resetAt when PTTL is negative (missing TTL edge)", async () => {
    state.redis = { eval: async () => [1, -1] };
    const r = await rateLimit("k", 5, 30_000);
    expect(r.allowed).toBe(true);
    expect(r.resetAt.getTime()).toBe(Date.now() + 30_000);
  });

  it("degrades to the DB limiter when eval returns a malformed shape", async () => {
    state.redis = { eval: async () => "GARBAGE" };
    state.bucket.findUnique.mockResolvedValue(null);
    state.bucket.create.mockResolvedValue({
      key: "k", count: 1, windowStart: new Date(), expiresAt: new Date(Date.now() + 60_000),
    });
    const r = await rateLimit("k", 3, 60_000);
    expect(r).toMatchObject({ allowed: true, remaining: 2 });
    expect(state.bucket.create).toHaveBeenCalledOnce(); // realnie spadło na DB
  });

  it("degrades to the DB limiter when Redis throws", async () => {
    state.redis = { eval: async () => { throw new Error("upstash down"); } };
    state.bucket.findUnique.mockResolvedValue(null);
    state.bucket.create.mockResolvedValue({
      key: "k", count: 1, windowStart: new Date(), expiresAt: new Date(Date.now() + 60_000),
    });
    const r = await rateLimit("k", 3, 60_000);
    expect(r.allowed).toBe(true);
    expect(state.bucket.create).toHaveBeenCalledOnce();
  });
});

// ---------- ścieżka DB ----------
describe("rateLimit — DB path (redis = null)", () => {
  it("first hit creates the bucket with count 1", async () => {
    state.bucket.findUnique.mockResolvedValue(null);
    state.bucket.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data);
    const r = await rateLimit("db:first", 5, 60_000);
    expect(r).toMatchObject({ allowed: true, remaining: 4 });
    expect(state.bucket.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ key: "db:first", count: 1 }) }),
    );
  });

  it("blocks at maxHits with Retry-After derived from expiresAt", async () => {
    const expiresAt = new Date(Date.now() + 45_000);
    state.bucket.findUnique.mockResolvedValue({
      key: "k", count: 3, windowStart: new Date(Date.now() - 15_000), expiresAt,
    });
    const r = await rateLimit("k", 3, 60_000);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.retryAfterSeconds).toBe(45);
      expect(r.resetAt).toEqual(expiresAt);
    }
    expect(state.bucket.update).not.toHaveBeenCalled(); // zablokowany hit nie inkrementuje
  });

  it("resets the window when the bucket expired (fixed window rollover)", async () => {
    // bucket sprzed 2 minut przy oknie 60 s → reset na count 1
    state.bucket.findUnique.mockResolvedValue({
      key: "k", count: 99, windowStart: new Date(Date.now() - 120_000), expiresAt: new Date(Date.now() - 60_000),
    });
    state.bucket.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      key: "k", ...data,
    }));
    const r = await rateLimit("k", 3, 60_000);
    expect(r).toMatchObject({ allowed: true, remaining: 2 });
    expect(state.bucket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ count: 1 }) }),
    );
  });

  it("increments an active bucket and reports remaining from the updated count", async () => {
    state.bucket.findUnique.mockResolvedValue({
      key: "k", count: 1, windowStart: new Date(), expiresAt: new Date(Date.now() + 60_000),
    });
    state.bucket.update.mockResolvedValue({ key: "k", count: 2 });
    const r = await rateLimit("k", 3, 60_000);
    expect(r).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("fails OPEN on DB outage by default", async () => {
    state.bucket.findUnique.mockRejectedValue(new Error("db down"));
    const r = await rateLimit("k", 3, 60_000);
    expect(r.allowed).toBe(true);
  });

  it("fails CLOSED on DB outage when failClosed is set", async () => {
    state.bucket.findUnique.mockRejectedValue(new Error("db down"));
    const r = await rateLimit("k", 3, 60_000, { failClosed: true });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.retryAfterSeconds).toBe(60);
  });

  // D-1 (naprawione): wyścig dwóch PIERWSZYCH żądań — drugi create pada na P2002,
  // ale to nie awaria DB, tylko "bucket właśnie powstał": ponawiamy jako inkrement,
  // więc hit jest POLICZONY (nie fail-open z zawyżonym remaining).
  it("retries the increment when the racy first create hits a unique violation (#qa D-1)", async () => {
    state.bucket.findUnique
      .mockResolvedValueOnce(null) // pierwszy odczyt: brak bucketa
      .mockResolvedValueOnce({    // po P2002: bucket już istnieje (wyścig przegrany)
        key: "race", count: 1, windowStart: new Date(), expiresAt: new Date(Date.now() + 60_000),
      });
    const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    state.bucket.create.mockRejectedValue(p2002);
    state.bucket.update.mockResolvedValue({ key: "race", count: 2 });
    const r = await rateLimit("race", 3, 60_000);
    expect(r).toMatchObject({ allowed: true, remaining: 1 }); // hit POLICZONY, nie zgubiony
    expect(state.bucket.update).toHaveBeenCalledOnce();
  });

  it("still fails OPEN when the retry also fails (genuine outage, not a race)", async () => {
    // create → P2002 (wyścig), ale drugi odczyt też pada → prawdziwa awaria DB → fail-open.
    state.bucket.findUnique
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("db down"));
    const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    state.bucket.create.mockRejectedValue(p2002);
    const r = await rateLimit("race", 3, 60_000);
    expect(r).toMatchObject({ allowed: true, remaining: 3 });
  });

  it("a non-P2002 create error is treated as an outage (no retry, fail-open)", async () => {
    state.bucket.findUnique.mockResolvedValue(null);
    state.bucket.create.mockRejectedValue(new Error("connection reset"));
    const r = await rateLimit("k", 3, 60_000);
    expect(r).toMatchObject({ allowed: true, remaining: 3 });
    expect(state.bucket.findUnique).toHaveBeenCalledOnce(); // brak ponowienia
  });
});
