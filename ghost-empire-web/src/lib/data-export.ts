// src/lib/data-export.ts
// Pure shaper for the GDPR "download my data" export (#audit3 — Art. 15 access + Art. 20
// portability). The API route fetches the rows and decrypts the shipping PII; this module
// assembles the final, JSON-serializable object and — critically — REDACTS all secret
// material. Secret values (TOTP secret, passkey keys, OAuth tokens) are NEVER exported;
// only their *presence* (e.g. `totpEnabled: true`, `passkeys: 2`) is. Kept pure so the
// redaction guarantees are unit-tested without a DB.

export type ExportUser = {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  country: string | null;
  profileAccent: string | null;
  image: string | null;
  discordUsername: string | null;
  tokens: number;
  totalEarned: number;
  totalSpent: number;
  level: number;
  xp: number;
  prestige: number;
  streak: number;
  isDonator: boolean;
  totalDonated: number;
  referralCode: string | null;
  donationCode: string | null;
  isBanned: boolean;
  banReason: string | null;
  createdAt: Date | string;
  totpEnabledAt: Date | string | null;
  // Present on the DB row but MUST NOT be exported — buildUserExport never reads it.
  totpSecret?: string | null;
};

export type ExportShipping = {
  fullName: string | null;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  parcelLocker: string | null;
  consentAt: string | null;
} | null;

export type ExportInput = {
  user: ExportUser;
  shipping: ExportShipping;
  socialLinks: { platform: string; handle: string; url: string; clicks: number }[];
  transactions: { type: string; amount: number; reason: string; status: string; createdAt: Date | string }[];
  transactionsTruncated: boolean;
  achievements: { code: string; name: string; rarity: string; earnedAt: Date | string }[];
  collectibles: { name: string; rarity: string; qty: number; acquiredAt: Date | string }[];
  follows: { tenant: string; since: Date | string }[];
  companion: { name: string; xp: number } | null;
  passkeyCount: number;
  pushSubscriptionCount: number;
  generatedAt: string; // ISO timestamp (passed in — keeps this module pure/deterministic)
};

const iso = (d: Date | string | null | undefined): string | null =>
  d == null ? null : typeof d === "string" ? d : d.toISOString();

/** Assemble the full, redacted personal-data export for one user. */
export function buildUserExport(input: ExportInput) {
  const u = input.user;
  return {
    meta: {
      kind: "ghost-empire-user-data-export",
      spec: "GDPR Art. 15 (access) + Art. 20 (portability)",
      generatedAt: input.generatedAt,
      note: "All personal data we hold that is associated with your account. Secret material (2FA secret, passkey keys, OAuth tokens) and other people's data are excluded.",
    },
    account: {
      id: u.id,
      name: u.name,
      email: u.email,
      username: u.username,
      displayName: u.displayName,
      bio: u.bio,
      country: u.country,
      profileAccent: u.profileAccent,
      avatar: u.image,
      discordUsername: u.discordUsername,
      referralCode: u.referralCode,
      donationCode: u.donationCode,
      isDonator: u.isDonator,
      totalDonated: u.totalDonated,
      banned: u.isBanned,
      banReason: u.isBanned ? u.banReason : null,
      createdAt: iso(u.createdAt),
    },
    economy: {
      tokens: u.tokens,
      totalEarned: u.totalEarned,
      totalSpent: u.totalSpent,
    },
    progression: {
      level: u.level,
      xp: u.xp,
      prestige: u.prestige,
      streak: u.streak,
    },
    security: {
      // Presence only — the secret itself is never included.
      totpEnabled: !!u.totpEnabledAt,
      totpEnabledAt: iso(u.totpEnabledAt),
      passkeys: input.passkeyCount,
      pushSubscriptions: input.pushSubscriptionCount,
    },
    shipping: input.shipping
      ? {
          fullName: input.shipping.fullName,
          phone: input.shipping.phone,
          email: input.shipping.email,
          addressLine: input.shipping.addressLine,
          city: input.shipping.city,
          postalCode: input.shipping.postalCode,
          country: input.shipping.country,
          parcelLocker: input.shipping.parcelLocker,
          consentAt: input.shipping.consentAt,
        }
      : null,
    socialLinks: input.socialLinks.map((s) => ({ platform: s.platform, handle: s.handle, url: s.url, clicks: s.clicks })),
    achievements: input.achievements.map((a) => ({ code: a.code, name: a.name, rarity: a.rarity, earnedAt: iso(a.earnedAt) })),
    collectibles: input.collectibles.map((c) => ({ name: c.name, rarity: c.rarity, quantity: c.qty, acquiredAt: iso(c.acquiredAt) })),
    followedPortals: input.follows.map((f) => ({ portal: f.tenant, since: iso(f.since) })),
    companion: input.companion ? { name: input.companion.name, xp: input.companion.xp } : null,
    ledger: {
      truncated: input.transactionsTruncated,
      count: input.transactions.length,
      entries: input.transactions.map((t) => ({ type: t.type, amount: t.amount, reason: t.reason, status: t.status, at: iso(t.createdAt) })),
    },
  };
}

/** Safe download filename, e.g. `ghost-empire-data-gh0s77tt-2026-06-21.json`. */
export function exportFilename(username: string | null, generatedAt: string): string {
  const day = generatedAt.slice(0, 10); // YYYY-MM-DD from the ISO timestamp
  const who =
    (username || "me")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "me";
  return `ghost-empire-data-${who}-${day}.json`;
}
