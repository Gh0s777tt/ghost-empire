import { describe, it, expect } from "vitest";
import { buildUserExport, exportFilename, type ExportInput } from "@/lib/data-export";

function baseInput(over: Partial<ExportInput> = {}): ExportInput {
  return {
    user: {
      id: "u1",
      name: "Test",
      email: "t@example.com",
      username: "tester",
      displayName: "Tester",
      bio: null,
      country: "PL",
      profileAccent: "violet",
      image: null,
      discordUsername: null,
      tokens: 100,
      totalEarned: 500,
      totalSpent: 400,
      level: 5,
      xp: 1234,
      prestige: 0,
      streak: 3,
      isDonator: true,
      totalDonated: 4200,
      referralCode: "REF123",
      donationCode: "GE-ABC123",
      isBanned: false,
      banReason: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      totpEnabledAt: null,
      ...over.user,
    },
    shipping: null,
    socialLinks: [],
    transactions: [],
    transactionsTruncated: false,
    achievements: [],
    collectibles: [],
    follows: [],
    companion: null,
    passkeyCount: 0,
    pushSubscriptionCount: 0,
    generatedAt: "2026-06-21T12:00:00.000Z",
    ...over,
  };
}

describe("buildUserExport", () => {
  it("NEVER includes secret material (totpSecret) anywhere in the output", () => {
    const out = buildUserExport(
      baseInput({ user: { ...baseInput().user, totpSecret: "enc:v1:SUPER_SECRET_TOTP", totpEnabledAt: new Date("2026-02-02T00:00:00.000Z") } }),
    );
    const json = JSON.stringify(out);
    expect(json).not.toContain("SUPER_SECRET_TOTP");
    expect(json).not.toContain("totpSecret");
    // …but presence is reported.
    expect(out.security.totpEnabled).toBe(true);
    expect(out.security.totpEnabledAt).toBe("2026-02-02T00:00:00.000Z");
  });

  it("reports 2FA disabled when totpEnabledAt is null", () => {
    const out = buildUserExport(baseInput());
    expect(out.security.totpEnabled).toBe(false);
    expect(out.security.totpEnabledAt).toBeNull();
  });

  it("maps core account + economy + progression fields", () => {
    const out = buildUserExport(baseInput());
    expect(out.account.username).toBe("tester");
    expect(out.account.donationCode).toBe("GE-ABC123");
    expect(out.account.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(out.economy).toEqual({ tokens: 100, totalEarned: 500, totalSpent: 400 });
    expect(out.progression).toEqual({ level: 5, xp: 1234, prestige: 0, streak: 3 });
  });

  it("only reveals banReason when actually banned", () => {
    const notBanned = buildUserExport(baseInput({ user: { ...baseInput().user, isBanned: false, banReason: "leftover note" } }));
    expect(notBanned.account.banReason).toBeNull();
    const banned = buildUserExport(baseInput({ user: { ...baseInput().user, isBanned: true, banReason: "spam" } }));
    expect(banned.account.banReason).toBe("spam");
  });

  it("includes decrypted shipping when present, null otherwise", () => {
    expect(buildUserExport(baseInput()).shipping).toBeNull();
    const withShip = buildUserExport(
      baseInput({
        shipping: {
          fullName: "Jan Kowalski",
          phone: "+48 600 100 200",
          email: "jan@example.com",
          addressLine: "ul. Testowa 1",
          city: "Warszawa",
          postalCode: "00-001",
          country: "PL",
          parcelLocker: "WAW01M",
          consentAt: "2026-03-03T00:00:00.000Z",
        },
      }),
    );
    expect(withShip.shipping?.fullName).toBe("Jan Kowalski");
    expect(withShip.shipping?.parcelLocker).toBe("WAW01M");
  });

  it("shapes collections + ledger and flags truncation", () => {
    const out = buildUserExport(
      baseInput({
        socialLinks: [{ platform: "twitch", handle: "t", url: "https://twitch.tv/t", clicks: 9 }],
        achievements: [{ code: "first_blood", name: "First Blood", rarity: "rare", earnedAt: new Date("2026-04-04T00:00:00.000Z") }],
        collectibles: [{ name: "Skull Card", rarity: "legendary", qty: 2, acquiredAt: new Date("2026-05-05T00:00:00.000Z") }],
        follows: [{ tenant: "Ghost Empire", since: new Date("2026-01-15T00:00:00.000Z") }],
        companion: { name: "Widmo", xp: 42 },
        transactions: [{ type: "earn", amount: 10, reason: "daily", status: "completed", createdAt: new Date("2026-06-01T00:00:00.000Z") }],
        transactionsTruncated: true,
      }),
    );
    expect(out.socialLinks[0]).toEqual({ platform: "twitch", handle: "t", url: "https://twitch.tv/t", clicks: 9 });
    expect(out.achievements[0]).toMatchObject({ code: "first_blood", rarity: "rare" });
    expect(out.collectibles[0]).toMatchObject({ name: "Skull Card", quantity: 2 });
    expect(out.followedPortals[0].portal).toBe("Ghost Empire");
    expect(out.companion).toEqual({ name: "Widmo", xp: 42 });
    expect(out.ledger.count).toBe(1);
    expect(out.ledger.truncated).toBe(true);
    expect(out.ledger.entries[0]).toEqual({ type: "earn", amount: 10, reason: "daily", status: "completed", at: "2026-06-01T00:00:00.000Z" });
  });
});

describe("exportFilename", () => {
  it("builds a safe slugged filename with the date", () => {
    expect(exportFilename("Gh0s77tt", "2026-06-21T12:00:00.000Z")).toBe("ghost-empire-data-gh0s77tt-2026-06-21.json");
  });
  it("sanitizes weird usernames and falls back to 'me'", () => {
    expect(exportFilename("a b/c..d", "2026-06-21T00:00:00.000Z")).toBe("ghost-empire-data-a-b-c-d-2026-06-21.json");
    expect(exportFilename(null, "2026-06-21T00:00:00.000Z")).toBe("ghost-empire-data-me-2026-06-21.json");
    expect(exportFilename("@@@", "2026-06-21T00:00:00.000Z")).toBe("ghost-empire-data-me-2026-06-21.json");
  });
});
