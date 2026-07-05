// QA: brzegi tokena companiona nieobjęte przez companion-token.test.ts —
// skew zegara w przód, dokładna granica 7 dni, podmiana podpisu między
// ważnymi tokenami (cross-token), bearerFromRequest.
import { describe, it, expect } from "vitest";
import { signCompanionToken, verifyCompanionToken, bearerFromRequest } from "@/lib/companion-token";

const DAY = 24 * 60 * 60 * 1000;

describe("verifyCompanionToken — granice czasu", () => {
  it("accepts a token exactly at the 7-day boundary (now - issuedAt == MAX_AGE)", () => {
    const now = Date.now();
    const tok = signCompanionToken("u", "t");
    // issuedAt = ~now; sprawdzamy dokładnie now + 7 dni → `>` nie odrzuca równości
    expect(verifyCompanionToken(tok, now + 7 * DAY)).not.toBeNull();
    expect(verifyCompanionToken(tok, now + 7 * DAY + 61_000)).toBeNull();
  });

  it("accepts small forward clock skew (<60 s) but rejects a token from the future", () => {
    const now = Date.now();
    const tok = signCompanionToken("u", "t"); // issuedAt ≈ now
    // weryfikator cofnięty o 30 s względem wystawcy → w oknie skew
    expect(verifyCompanionToken(tok, now - 30_000)).not.toBeNull();
    // weryfikator cofnięty o >60 s → token "z przyszłości", odrzucony
    expect(verifyCompanionToken(tok, now - 61_000)).toBeNull();
  });
});

describe("verifyCompanionToken — podmiany między ważnymi tokenami", () => {
  it("rejects a payload from token A glued to the signature of token B", () => {
    const a = signCompanionToken("alice", "tenant-1");
    const b = signCompanionToken("bob", "tenant-2");
    const [av, abody] = a.split(".");
    const bsig = b.split(".")[2];
    expect(verifyCompanionToken(`${av}.${abody}.${bsig}`)).toBeNull();
  });

  it("rejects a truncated and an extended token", () => {
    const tok = signCompanionToken("u", "t");
    expect(verifyCompanionToken(tok.slice(0, -2))).toBeNull();
    expect(verifyCompanionToken(`${tok}.extra`)).toBeNull(); // 4 części
  });
});

describe("bearerFromRequest", () => {
  const req = (auth?: string) =>
    new Request("https://x.test/api", { headers: auth === undefined ? {} : { authorization: auth } });

  it("extracts the token from a Bearer header (case-insensitive, trims)", () => {
    expect(bearerFromRequest(req("Bearer abc.def.ghi"))).toBe("abc.def.ghi");
    expect(bearerFromRequest(req("bearer abc"))).toBe("abc");
    expect(bearerFromRequest(req("  Bearer   spaced-token  "))).toBe("spaced-token");
  });

  it("returns null for missing/non-bearer/empty auth headers", () => {
    expect(bearerFromRequest(req())).toBeNull();
    expect(bearerFromRequest(req("Basic dXNlcjpwYXNz"))).toBeNull();
    expect(bearerFromRequest(req("Bearer"))).toBeNull();
    expect(bearerFromRequest(req(""))).toBeNull();
  });
});
