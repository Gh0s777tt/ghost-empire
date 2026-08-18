// Covers the DB money path of the THREE stateful GT casino games — mines, hi-lo, blackjack —
// which casino-games.integration deliberately leaves out: they keep their session state
// (bet + bomb layout / deck / current card) in Redis and bail with a 503 (`if (!redis) …`)
// BEFORE touching money, so against a no-Redis harness they can't reach their money path at all.
//
// The fix is the one the casino-games note pointed at: give them a working session store WITHOUT
// standing up a real Redis service. We double ONLY `@/lib/redis` with an in-memory Map; every
// game's real charge/settle transaction still runs against the real test Postgres. What's asserted
// is the money — like wheel / duels / heist / playGtGame since the "Kasyno na Żetonach" migration:
//   • the bet is really charged on START (chips decrement + one CHIPS ledger row),
//   • a win credits exactly the payout (chips increment + one CHIPS ledger row),
//   • a loss keeps the stake and refunds NOTHING (no winnings row invented, session unwinnable),
//   • blackjack's double charges a SECOND bet and settles on the doubled stake,
//   • a broke / out-of-range bet is rejected with no partial charge and no session,
// — and that ALL of it moves `chips` and leaves the real GT economy (tokens + totalEarned/
//   totalSpent) untouched, with every ledger row stamped CHIPS. A mislabelled row would drag
//   casino volume back into weekly-ranking / wrapped / economy-health (which count only GT).
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { minesStart, minesReveal, minesCashout, minesMultiplier, MINES_TILES } from "@/lib/gt-mines";
import { hiloStart, hiloGuess, hiloCashout, hiloStepMultiplier } from "@/lib/gt-hilo";
import { blackjackStart, blackjackHit, blackjackStand, blackjackDouble } from "@/lib/gt-blackjack";
import { MIN_BET, MAX_BET } from "@/lib/gt-games";
import { resetDb, createUserWithChips, chipsOf, gtLedgerOf, GT_SEED } from "./helpers";

// ── The session-store double ───────────────────────────────────────────────────────────────
// An in-memory stand-in for the Upstash REST client. Values are JSON round-tripped on the way in
// and out exactly like the real client, so a `get` never aliases the stored object — a game that
// mutates a session in place and then re-`set`s it can't accidentally observe the mutation early
// (the property the #audit-v2 locks exist to protect). `sessions` lives via vi.hoisted so both the
// mock factory and the test body can reach the same Map.
const sessions = vi.hoisted(() => new Map<string, string>());

vi.mock("@/lib/redis", () => {
  const put = (k: string, v: unknown) => sessions.set(k, JSON.stringify(v));
  const read = <T>(k: string): T | null => {
    const v = sessions.get(k);
    return v === undefined ? null : (JSON.parse(v) as T);
  };
  const redis = {
    async set(key: string, value: unknown) { put(key, value); return "OK"; },
    async get<T>(key: string) { return read<T>(key); },
    async del(key: string) { return sessions.delete(key) ? 1 : 0; },
    async getdel<T>(key: string) { const v = read<T>(key); sessions.delete(key); return v; },
    async incrby(key: string, by: number) { const next = Number(read<number>(key) ?? 0) + by; put(key, next); return next; },
  };
  return {
    redis,
    hasRedis: true,
    // The per-session lock only serializes the intermediate read-modify-write against concurrent
    // moves; this suite is single-threaded, so run the critical section straight through — exactly
    // what the real withLock does when Redis is unavailable (fail-open).
    withLock: async <T>(_key: string, _ttlMs: number, fn: () => Promise<T>) => ({ ok: true as const, value: await fn() }),
    cacheJson: async <T>(_k: string, _ttl: number, producer: () => Promise<T>) => producer(),
    cacheDelete: async () => {},
  };
});

// ── The RNG double ─────────────────────────────────────────────────────────────────────────
// Only cryptoRng is replaced (the rest of secure-rng stays real). `queue` feeds exact draws where
// a scenario needs them (hi-lo cards); `fallback` covers the rest. Blackjack shuffles 51 cards
// from cryptoRng at deal time — a fallback of 0.7 makes that a non-blackjack (ACTIVE) start so a
// session is stored to drive; each hand's actual cards are then set on the session directly (below).
const rng = vi.hoisted(() => ({ queue: [] as number[], fallback: 0.5 }));
vi.mock("@/lib/secure-rng", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/secure-rng")>()),
  cryptoRng: () => (rng.queue.length ? (rng.queue.shift() as number) : rng.fallback),
}));

// Session shapes (internal to the game libs; mirrored here to peek/steer the store).
type MinesSession = { bet: number; bombs: number; bombSet: number[]; revealed: number[] };
type HiloSession = { bet: number; mult: number; card: { rank: number; suit: number }; steps: number };
type BjSession = { bet: number; deck: number[]; player: number[]; dealer: number[]; doubled: boolean };

// The single live session for a game prefix, and helpers to read / overwrite it.
const sessionKey = (prefix: string): string => {
  const keys = [...sessions.keys()].filter((k) => k.startsWith(prefix));
  expect(keys).toHaveLength(1);
  return keys[0];
};
const peekSession = <T>(prefix: string): T => JSON.parse(sessions.get(sessionKey(prefix)) as string) as T;
const setSession = (key: string, value: unknown): void => { sessions.set(key, JSON.stringify(value)); };
const noSession = (prefix: string): void => {
  expect([...sessions.keys()].filter((k) => k.startsWith(prefix))).toHaveLength(0);
};

const bet = 1000; // > MIN_BET, and large enough that fractional multipliers floor to a clean win
const start = bet * 10;

// A cryptoRng value that makes drawCard() (rank = 1 + floor(rng*13)) return exactly `r` (1..13).
const rankRng = (r: number) => (r - 1 + 0.5) / 13;

beforeEach(async () => {
  rng.queue = [];
  rng.fallback = 0.5;
  sessions.clear();
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

// One CHIPS spend row of −bet is the only thing START may write. Reused across all three games.
async function expectChargedOnce(userId: string, reason: string): Promise<void> {
  const rows = await prisma.transaction.findMany({ where: { userId } });
  expect(rows).toHaveLength(1);
  expect(rows[0].type).toBe("spend");
  expect(rows[0].amount).toBe(-bet);
  expect(rows[0].currency).toBe("CHIPS");
  expect(rows[0].reason).toBe(reason);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("mines — money path (integration, real DB)", () => {
  it("charges the bet and opens a session on start — chips only", async () => {
    const u = await createUserWithChips(start);

    const r = await minesStart(u.id, bet, 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(await chipsOf(u.id)).toBe(start - bet);
    await expectChargedOnce(u.id, "gtgame:mines");
    // No play row until the game ends (reveal/cashout), and the real economy is untouched.
    expect(await prisma.gtGamePlay.count({ where: { userId: u.id } })).toBe(0);
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
    // The session really landed in the store.
    expect(peekSession<MinesSession>("mines:").bet).toBe(bet);
  });

  it("a safe reveal + cash-out credits bet × multiplier — chips only", async () => {
    const u = await createUserWithChips(start);
    const s = await minesStart(u.id, bet, 3);
    expect(s.ok).toBe(true);
    if (!s.ok) return;

    // Pick a provably-safe tile from the real bomb layout (peeked, not guessed).
    const layout = peekSession<MinesSession>("mines:");
    const safe = [...Array(MINES_TILES).keys()].find((t) => !layout.bombSet.includes(t)) as number;

    const rev = await minesReveal(u.id, s.sessionId, safe);
    expect(rev.ok && rev.bomb === false).toBe(true);

    const cash = await minesCashout(u.id, s.sessionId);
    expect(cash.ok).toBe(true);
    if (!cash.ok) return;

    const payout = Math.floor(bet * minesMultiplier(1, 3)); // one safe reveal, three bombs
    expect(payout).toBeGreaterThan(bet); // a real win, not a break-even
    expect(cash.payout).toBe(payout);
    expect(cash.net).toBe(payout - bet);
    expect(cash.newBalance).toBe(start - bet + payout);
    expect(await chipsOf(u.id)).toBe(start - bet + payout);

    // One spend + one earn, both CHIPS; the earn credits exactly the payout.
    const rows = await prisma.transaction.findMany({ where: { userId: u.id }, orderBy: { amount: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows.every((t) => t.currency === "CHIPS")).toBe(true);
    expect(rows[0].amount).toBe(-bet);
    expect(rows[1].amount).toBe(payout);
    expect(rows[1].reason).toBe("gtgame:mines:win");
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
  });

  it("hitting a bomb keeps the bet, refunds nothing, and the session can't be cashed out", async () => {
    const u = await createUserWithChips(start);
    const s = await minesStart(u.id, bet, 3);
    expect(s.ok).toBe(true);
    if (!s.ok) return;

    const bomb = peekSession<MinesSession>("mines:").bombSet[0];
    const rev = await minesReveal(u.id, s.sessionId, bomb);
    expect(rev.ok && rev.bomb === true).toBe(true);

    // The already-charged bet is simply lost — no winnings row, no refund.
    expect(await chipsOf(u.id)).toBe(start - bet);
    const rows = await prisma.transaction.findMany({ where: { userId: u.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(-bet);
    expect(rows[0].currency).toBe("CHIPS");

    // The bomb ended the session, so a cash-out can't resurrect a payout from a lost hand.
    const cash = await minesCashout(u.id, s.sessionId);
    expect(cash.ok).toBe(false);
    if (cash.ok) return;
    expect(cash.status).toBe(404);
    expect(await chipsOf(u.id)).toBe(start - bet);
    expect(await prisma.transaction.count({ where: { userId: u.id } })).toBe(1);
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
  });

  it("rejects a start the player can't afford — no charge, no session, no rows", async () => {
    const poor = await createUserWithChips(bet - 1);

    const r = await minesStart(poor.id, bet, 3);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(402);

    expect(await chipsOf(poor.id)).toBe(bet - 1);
    expect(await prisma.transaction.count({ where: { userId: poor.id } })).toBe(0);
    expect(await prisma.gtGamePlay.count({ where: { userId: poor.id } })).toBe(0);
    noSession("mines:");
    expect(await gtLedgerOf(poor.id)).toEqual(GT_SEED);
  });

  it("rejects an out-of-range bet or bomb count before touching the database", async () => {
    const u = await createUserWithChips(start);

    for (const badBet of [MIN_BET - 1, MAX_BET + 1, 0, -100, 1.5]) {
      const r = await minesStart(u.id, badBet, 3);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(400);
    }
    for (const badBombs of [0, 11, 1.5]) {
      const r = await minesStart(u.id, bet, badBombs);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(400);
    }

    // A negative bet is the dangerous one: `chips: { decrement: -100 }` would CREDIT the player,
    // so the range guard has to reject before the transaction, not inside it.
    expect(await chipsOf(u.id)).toBe(start);
    expect(await prisma.transaction.count({ where: { userId: u.id } })).toBe(0);
    noSession("mines:");
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("hi-lo — money path (integration, real DB)", () => {
  it("charges the bet and deals the first card on start — chips only", async () => {
    rng.queue = [rankRng(7), 0]; // first card: rank 7
    const u = await createUserWithChips(start);

    const r = await hiloStart(u.id, bet);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(await chipsOf(u.id)).toBe(start - bet);
    await expectChargedOnce(u.id, "gtgame:hilo");
    expect(await prisma.gtGamePlay.count({ where: { userId: u.id } })).toBe(0);
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
    expect(peekSession<HiloSession>("hilo:").card.rank).toBe(7);
  });

  it("a correct guess + cash-out credits bet × multiplier — chips only", async () => {
    // Start on rank 7, guess HIGHER, next card rank 13 (a win). The bet only moves on cash-out.
    rng.queue = [rankRng(7), 0, rankRng(13), 0];
    const u = await createUserWithChips(start);
    const s = await hiloStart(u.id, bet);
    expect(s.ok).toBe(true);
    if (!s.ok) return;

    const guess = await hiloGuess(u.id, s.state.sessionId, "hi");
    expect(guess.ok && guess.state.status === "active").toBe(true);
    // A correct guess raises the multiplier but writes NO ledger row yet.
    expect(await prisma.transaction.count({ where: { userId: u.id } })).toBe(1);

    const cash = await hiloCashout(u.id, s.state.sessionId);
    expect(cash.ok).toBe(true);
    if (!cash.ok) return;

    const payout = Math.floor(bet * hiloStepMultiplier(7, "hi"));
    expect(payout).toBeGreaterThan(bet);
    expect(cash.state.payout).toBe(payout);
    expect(cash.state.newBalance).toBe(start - bet + payout);
    expect(await chipsOf(u.id)).toBe(start - bet + payout);

    const rows = await prisma.transaction.findMany({ where: { userId: u.id }, orderBy: { amount: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows.every((t) => t.currency === "CHIPS")).toBe(true);
    expect(rows[0].amount).toBe(-bet);
    expect(rows[1].amount).toBe(payout);
    expect(rows[1].reason).toBe("gtgame:hilo:win");
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
  });

  it("a wrong guess busts, keeps the bet, refunds nothing, and can't be cashed out", async () => {
    // Start on rank 7, guess HIGHER, next card rank 1 (lower → bust).
    rng.queue = [rankRng(7), 0, rankRng(1), 0];
    const u = await createUserWithChips(start);
    const s = await hiloStart(u.id, bet);
    expect(s.ok).toBe(true);
    if (!s.ok) return;

    const guess = await hiloGuess(u.id, s.state.sessionId, "hi");
    expect(guess.ok && guess.state.status === "busted").toBe(true);

    expect(await chipsOf(u.id)).toBe(start - bet);
    const rows = await prisma.transaction.findMany({ where: { userId: u.id } });
    expect(rows).toHaveLength(1); // spend only — no winnings row invented
    expect(rows[0].amount).toBe(-bet);
    expect(rows[0].currency).toBe("CHIPS");

    const cash = await hiloCashout(u.id, s.state.sessionId);
    expect(cash.ok).toBe(false);
    if (cash.ok) return;
    expect(cash.status).toBe(404);
    expect(await chipsOf(u.id)).toBe(start - bet);
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
  });

  it("cashing out before any correct guess pays nothing and keeps the session", async () => {
    rng.queue = [rankRng(7), 0];
    const u = await createUserWithChips(start);
    const s = await hiloStart(u.id, bet);
    expect(s.ok).toBe(true);
    if (!s.ok) return;

    // Nothing has been won yet, so there is nothing to pay — and the stake isn't silently refunded.
    const cash = await hiloCashout(u.id, s.state.sessionId);
    expect(cash.ok).toBe(false);
    if (cash.ok) return;
    expect(cash.status).toBe(400);

    expect(await chipsOf(u.id)).toBe(start - bet);
    expect(await prisma.transaction.count({ where: { userId: u.id } })).toBe(1); // just the start charge
    expect(peekSession<HiloSession>("hilo:").steps).toBe(0); // session was put back, not consumed
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
  });

  it("rejects a start the player can't afford — no charge, no session", async () => {
    const poor = await createUserWithChips(bet - 1);

    const r = await hiloStart(poor.id, bet);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(402);

    expect(await chipsOf(poor.id)).toBe(bet - 1);
    expect(await prisma.transaction.count({ where: { userId: poor.id } })).toBe(0);
    noSession("hilo:");
    expect(await gtLedgerOf(poor.id)).toEqual(GT_SEED);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("blackjack — money path (integration, real DB)", () => {
  // Cards are 0-51: rank = c % 13 (0=A … 9="10", 10=J, 11=Q, 12=K), value = min(rank+1,10), A=11.
  const T = [9, 22, 35, 48]; // the four "10"s (value 10)
  const NINE = [8, 21]; //      two 9s (value 9)
  const FIVE = 4, SIX = 5, SEVEN = 6; // ♠5 / ♠6 / ♠7

  // The deal is random; force a known hand by overwriting the stored session (keeping the SAME
  // `bet` the charge used). settle()/dealerPlay() then run for real against Postgres. Blackjack
  // is the only game whose card math changes the payout multiplier, so each outcome (2× win, 1×
  // push, 0× loss, doubled win) is pinned to a concrete hand rather than left to the shuffle.
  const steerSession = (patch: Partial<BjSession>): void => {
    const key = sessionKey("bj:");
    const s = JSON.parse(sessions.get(key) as string) as BjSession;
    setSession(key, { ...s, doubled: false, ...patch });
  };

  beforeEach(() => { rng.fallback = 0.7; }); // 0.7 ⇒ a non-blackjack (ACTIVE) start

  async function activeStart(userId: string): Promise<string> {
    const r = await blackjackStart(userId, bet);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("start failed");
    // If the shuffle ever starts dealing a natural blackjack under fallback 0.7 this fires —
    // pick a new fallback (see the RNG-double note). Instant settles store no session to steer.
    expect(r.state.status).toBe("active");
    return r.state.sessionId;
  }

  it("charges the bet and opens a hand on start — chips only", async () => {
    const u = await createUserWithChips(start);
    await activeStart(u.id);

    expect(await chipsOf(u.id)).toBe(start - bet);
    await expectChargedOnce(u.id, "gtgame:blackjack");
    expect(await prisma.gtGamePlay.count({ where: { userId: u.id } })).toBe(0);
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
  });

  it("a winning hand pays 2× on stand — chips only", async () => {
    const u = await createUserWithChips(start);
    const id = await activeStart(u.id);
    steerSession({ player: [T[0], T[1]], dealer: [NINE[0], NINE[1]], deck: [] }); // 20 vs 18

    const r = await blackjackStand(u.id, id);
    expect(r.ok && r.state.status === "done").toBe(true);
    if (!r.ok) return;
    expect(r.state.result?.multiplier).toBe(2);
    expect(r.state.result?.payout).toBe(bet * 2);
    expect(await chipsOf(u.id)).toBe(start - bet + bet * 2);

    const rows = await prisma.transaction.findMany({ where: { userId: u.id }, orderBy: { amount: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows.every((t) => t.currency === "CHIPS")).toBe(true);
    expect(rows[0].amount).toBe(-bet);
    expect(rows[1].amount).toBe(bet * 2);
    expect(rows[1].reason).toBe("gtgame:blackjack:win");
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
  });

  it("a push returns exactly the stake (1×) — chips back to start", async () => {
    const u = await createUserWithChips(start);
    const id = await activeStart(u.id);
    steerSession({ player: [T[0], T[1]], dealer: [T[2], T[3]], deck: [] }); // 20 vs 20

    const r = await blackjackStand(u.id, id);
    expect(r.ok && r.state.status === "done").toBe(true);
    if (!r.ok) return;
    expect(r.state.result?.multiplier).toBe(1);
    expect(r.state.result?.payout).toBe(bet);
    expect(await chipsOf(u.id)).toBe(start); // charged bet, returned bet — net zero

    const rows = await prisma.transaction.findMany({ where: { userId: u.id }, orderBy: { amount: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows.every((t) => t.currency === "CHIPS")).toBe(true);
    expect(rows[0].amount).toBe(-bet);
    expect(rows[1].amount).toBe(bet);
    expect(rows[1].reason).toBe("gtgame:blackjack:win");
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
  });

  it("a losing hand keeps the bet and pays nothing — still chips only", async () => {
    const u = await createUserWithChips(start);
    const id = await activeStart(u.id);
    steerSession({ player: [NINE[0], NINE[1]], dealer: [T[0], T[1]], deck: [] }); // 18 vs 20

    const r = await blackjackStand(u.id, id);
    expect(r.ok && r.state.status === "done").toBe(true);
    if (!r.ok) return;
    expect(r.state.result?.multiplier).toBe(0);
    expect(r.state.result?.payout).toBe(0);
    expect(await chipsOf(u.id)).toBe(start - bet);

    const rows = await prisma.transaction.findMany({ where: { userId: u.id } });
    expect(rows).toHaveLength(1); // spend only — no winnings row on a loss
    expect(rows[0].amount).toBe(-bet);
    expect(rows[0].currency).toBe("CHIPS");
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
  });

  it("busting on a hit keeps the bet and pays nothing", async () => {
    const u = await createUserWithChips(start);
    const id = await activeStart(u.id);
    steerSession({ player: [T[0], T[1]], dealer: [NINE[0], NINE[1]], deck: [FIVE] }); // 20, draw a 5 → 25 bust

    const r = await blackjackHit(u.id, id);
    expect(r.ok && r.state.status === "done").toBe(true);
    if (!r.ok) return;
    expect(r.state.result?.payout).toBe(0);
    expect(await chipsOf(u.id)).toBe(start - bet);

    const rows = await prisma.transaction.findMany({ where: { userId: u.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(-bet);
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
  });

  it("double charges a SECOND bet and settles on the doubled stake", async () => {
    const u = await createUserWithChips(start);
    const id = await activeStart(u.id);
    // 11, dealer stands on 17, one more card is a "10" → 21 auto-stand → win at 2× the doubled bet.
    steerSession({ player: [FIVE, SIX], dealer: [SEVEN, T[1]], deck: [T[2]] });

    const r = await blackjackDouble(u.id, id);
    expect(r.ok && r.state.status === "done").toBe(true);
    if (!r.ok) return;
    expect(r.state.doubled).toBe(true);
    expect(r.state.result?.payout).toBe(bet * 4); // floor(2·bet × 2)
    // Charged twice (bet + bet), paid 4× → net +2·bet.
    expect(await chipsOf(u.id)).toBe(start - bet - bet + bet * 4);

    const rows = await prisma.transaction.findMany({ where: { userId: u.id }, orderBy: [{ amount: "asc" }] });
    expect(rows).toHaveLength(3);
    expect(rows.every((t) => t.currency === "CHIPS")).toBe(true);
    const spends = rows.filter((t) => t.type === "spend");
    expect(spends).toHaveLength(2);
    expect(spends.every((t) => t.amount === -bet && t.reason === "gtgame:blackjack")).toBe(true);
    const earns = rows.filter((t) => t.type === "earn");
    expect(earns).toHaveLength(1);
    expect(earns[0].amount).toBe(bet * 4);
    expect(earns[0].reason).toBe("gtgame:blackjack:win");
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
  });

  it("rejects a start the player can't afford — no charge, no hand", async () => {
    const poor = await createUserWithChips(bet - 1);

    const r = await blackjackStart(poor.id, bet);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(402);

    expect(await chipsOf(poor.id)).toBe(bet - 1);
    expect(await prisma.transaction.count({ where: { userId: poor.id } })).toBe(0);
    noSession("bj:");
    expect(await gtLedgerOf(poor.id)).toEqual(GT_SEED);
  });

  it("rejects an out-of-range bet before touching the database", async () => {
    const u = await createUserWithChips(start);

    for (const badBet of [MIN_BET - 1, MAX_BET + 1, 0, -100, 1.5]) {
      const r = await blackjackStart(u.id, badBet);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(400);
    }

    expect(await chipsOf(u.id)).toBe(start);
    expect(await prisma.transaction.count({ where: { userId: u.id } })).toBe(0);
    noSession("bj:");
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
  });
});
