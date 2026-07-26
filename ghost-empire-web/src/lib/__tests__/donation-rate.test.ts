// src/lib/__tests__/donation-rate.test.ts
//
// This file pins a LEGAL prohibition, not an arithmetic behaviour. If a change makes it fail, that
// change reinstates crediting GT for money — which REGULAMIN_GHOST_TOKENS.md forbids in §7 ust. 3 and
// makes non-derogable in §28 ust. 2. Fix the change, not the test.
import { describe, it, expect } from "vitest";
import { gtFromPln } from "@/lib/donation-rate";
import { SEASON_XP } from "@/lib/seasons";

describe("gtFromPln — §7 ust. 3: GT is never credited for a payment", () => {
  it("returns 0 for every realistic donation amount", () => {
    for (const pln of [0.01, 1, 4.99, 10, 25.5, 100, 1_000, 100_000, 1_000_000]) {
      expect(gtFromPln(pln)).toBe(0);
    }
  });

  it("returns the same for any two amounts — the clause bans amount-dependence explicitly", () => {
    // "Liczba GT […] nie zależy od kwoty jakiejkolwiek wpłaty ani od faktu jej dokonania."
    // A flat non-zero rate would still breach the first half of that sentence, so the only compliant
    // implementation is a constant zero.
    expect(gtFromPln(1)).toBe(gtFromPln(1_000_000));
  });

  it("stays 0 on garbage input rather than throwing inside a money path", () => {
    for (const bad of [0, -50, NaN, Infinity, -Infinity]) {
      expect(gtFromPln(bad)).toBe(0);
    }
  });

  it("cannot be switched back on by configuration", () => {
    // The old implementation read GT_PER_PLN / DONATION_GT_PER_PLN / PAYMEDIA_GT_PER_PLN. They are
    // gone on purpose: a deployment must not be able to reinstate a prohibited behaviour by env.
    process.env.GT_PER_PLN = "500";
    process.env.DONATION_GT_PER_PLN = "500";
    process.env.PAYMEDIA_GT_PER_PLN = "500";
    try {
      expect(gtFromPln(10)).toBe(0);
    } finally {
      delete process.env.GT_PER_PLN;
      delete process.env.DONATION_GT_PER_PLN;
      delete process.env.PAYMEDIA_GT_PER_PLN;
    }
  });
});

// ── The indirect forms §8 ust. 4 bans by name. They live in other modules, but they are the same
//    prohibition, so they are pinned next to it rather than scattered.

describe("§8 ust. 4 — a payment may not accelerate GT indirectly either", () => {
  it("grants no season XP for anything bought", () => {
    // Season progress unlocks the pass, and the pass grants GT (§8 ust. 1 g), so paid season XP is
    // the "skrócony czas odblokowania" the clause forbids by name.
    for (const src of ["twitch_sub", "kick_sub", "gift_sub_each", "bit_each", "donation_per_pln"] as const) {
      expect(SEASON_XP[src]).toBe(0);
    }
  });

  it("still rewards the free activities §8 ust. 1 lists as the closed catalogue of GT sources", () => {
    // The prohibition must not quietly kill the legitimate economy — that would be a different bug.
    expect(SEASON_XP.chat_message).toBeGreaterThan(0);
    expect(SEASON_XP.drop_claim).toBeGreaterThan(0);
    expect(SEASON_XP.welcome).toBeGreaterThan(0);
  });
});
