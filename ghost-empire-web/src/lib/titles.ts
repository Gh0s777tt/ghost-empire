// src/lib/titles.ts
// Profile Titles (#761) — a cosmetic GT SINK: viewers buy prestige titles with GT (curated
// catalog, no user-generated text → no moderation) and equip one, shown as flair next to their
// name. Pure catalog + helpers here (no DB/network) so it's unit-tested and importable anywhere.
// Labels are i18n keys (`titles.title_<id>`) so they localize. Owned titles live on
// User.ownedTitles (JSON id array); the equipped one on User.equippedTitleId.
export type TitleRarity = "common" | "rare" | "epic" | "legendary";
export type TitleDef = { id: string; cost: number; rarity: TitleRarity };

// Ordered cheapest → priciest. Ids are stable (stored on the user) — never reuse/rename an id.
export const PROFILE_TITLES: readonly TitleDef[] = [
  { id: "rookie", cost: 500, rarity: "common" },
  { id: "regular", cost: 1500, rarity: "common" },
  { id: "insider", cost: 3000, rarity: "common" },
  { id: "supporter", cost: 6000, rarity: "rare" },
  { id: "veteran", cost: 12000, rarity: "rare" },
  { id: "highroller", cost: 20000, rarity: "rare" },
  { id: "elite", cost: 35000, rarity: "epic" },
  { id: "legend", cost: 60000, rarity: "epic" },
  { id: "phantom", cost: 100000, rarity: "legendary" },
  { id: "eternal", cost: 200000, rarity: "legendary" },
] as const;

const BY_ID = new Map(PROFILE_TITLES.map((t) => [t.id, t]));

/** A title definition by id, or null for an unknown/empty id. */
export function titleById(id: string | null | undefined): TitleDef | null {
  return id ? BY_ID.get(id) ?? null : null;
}

/** Is this a real catalog title id? */
export function isValidTitleId(id: unknown): id is string {
  return typeof id === "string" && BY_ID.has(id);
}

/** Defensive parse of the stored User.ownedTitles JSON into a clean id list (only real ids, deduped). */
export function parseOwnedTitles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) if (isValidTitleId(x) && !out.includes(x)) out.push(x);
  return out;
}

export const TITLE_RARITY_COLOR: Record<TitleRarity, string> = {
  common: "#a1a1aa",
  rare: "#3b82f6",
  epic: "#a855f7",
  legendary: "#f59e0b",
};
