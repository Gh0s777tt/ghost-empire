// src/lib/__tests__/compliance.test.ts
//
// Pins a LEGAL prohibition, not a feature flag. If this fails, the change re-opens surfaces that
// REGULAMIN_GHOST_TOKENS.md §7 ust. 12 forbids and §28 ust. 2 makes non-derogable. Fix the change.
import { describe, it, expect } from "vitest";
import { CASINO_SURFACES_ENABLED, CASINO_DISABLED_REASON, casinoGate } from "@/lib/compliance";

describe("§7 ust. 12 — casino surfaces are retired, not renamed", () => {
  it("keeps the switch off", () => {
    // The clause bans the MECHANIC, not just the word, and applies regardless of prize value — so
    // renaming the games or pointing at the free-chips defence does not satisfy it.
    expect(CASINO_SURFACES_ENABLED).toBe(false);
  });

  it("answers 410 Gone, not 404 — the endpoint existed and was intentionally retired", () => {
    const res = casinoGate();
    expect(res).not.toBeNull();
    expect(res!.status).toBe(410);
  });

  it("says WHY in a machine-readable way, so a client stops retrying and a log is diagnosable", async () => {
    const body = await casinoGate()!.json();
    expect(body.reason).toBe(CASINO_DISABLED_REASON);
    expect(String(body.error)).not.toMatch(/kasyn|jackpot|żeton/i); // the refusal itself must stay clean
  });
});
