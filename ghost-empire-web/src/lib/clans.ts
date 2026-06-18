// src/lib/clans.ts
// Pure logic + constants for clans/teams. Creating a clan and contributing to it
// SPEND GT into a shared treasury — a real economy sink. One clan per user
// (User.clanId); the treasury drives the clan leaderboard.

export const CLAN_CREATE_COST = 5000;
export const CONTRIBUTE_MIN = 10;
export const CONTRIBUTE_MAX = 1_000_000;
export const TAG_MIN = 2;
export const TAG_MAX = 5;
export const NAME_MIN = 3;
export const NAME_MAX = 30;

/** Normalize a tag to uppercase A–Z/0–9 only, capped at TAG_MAX. */
export function normalizeClanTag(raw: string): string {
  return (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, TAG_MAX);
}

export function isValidClanTag(tag: string): boolean {
  return new RegExp(`^[A-Z0-9]{${TAG_MIN},${TAG_MAX}}$`).test(tag);
}

export function isValidClanName(name: string): boolean {
  const n = name.trim();
  return n.length >= NAME_MIN && n.length <= NAME_MAX;
}

export function isValidContribution(amount: number): boolean {
  return Number.isInteger(amount) && amount >= CONTRIBUTE_MIN && amount <= CONTRIBUTE_MAX;
}
