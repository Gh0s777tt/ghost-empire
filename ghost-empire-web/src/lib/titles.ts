// src/lib/titles.ts
// Profile Titles (#761) — a cosmetic GT SINK: viewers buy prestige titles with GT (curated
// catalog, no user-generated text → no moderation) and equip one, shown as flair next to their
// name. Pure catalog + helpers here (no DB/network) so it's unit-tested and importable anywhere.
// Labels are i18n keys (`titles.title_<id>`) so they localize. Owned titles live on
// User.ownedTitles (JSON id array); the equipped one on User.equippedTitleId.
export type TitleRarity = "common" | "rare" | "epic" | "legendary";
// `requiresLevel` (#788/B5) gates the pricier titles behind a RANK, not just GT — so a top title
// is a prestige/progression symbol you earn by playing, not just a wallet check. Optional; a title
// with no level req is purchasable at any level (the cheap common ones).
export type TitleDef = { id: string; cost: number; rarity: TitleRarity; requiresLevel?: number };

// Ordered cheapest → priciest. Ids are stable (stored on the user) — never reuse/rename an id.
// Level gates roughly track the rank tiers (lib/utils.rankForLevel: SHADOW@5, SPECTER@15, HAUNT@30).
export const PROFILE_TITLES: readonly TitleDef[] = [
  { id: "rookie", cost: 500, rarity: "common" },
  { id: "regular", cost: 1500, rarity: "common" },
  { id: "insider", cost: 3000, rarity: "common" },
  { id: "supporter", cost: 6000, rarity: "rare", requiresLevel: 5 },
  { id: "veteran", cost: 12000, rarity: "rare", requiresLevel: 5 },
  { id: "highroller", cost: 20000, rarity: "rare", requiresLevel: 10 },
  { id: "elite", cost: 35000, rarity: "epic", requiresLevel: 15 },
  { id: "legend", cost: 60000, rarity: "epic", requiresLevel: 25 },
  { id: "phantom", cost: 100000, rarity: "legendary", requiresLevel: 40 },
  { id: "eternal", cost: 200000, rarity: "legendary", requiresLevel: 60 },
] as const;

const BY_ID = new Map(PROFILE_TITLES.map((t) => [t.id, t]));

/** Whether a viewer at `level` meets a title's rank gate (#788/B5). Pure → unit-tested. */
export function titleUnlocked(title: TitleDef, level: number): boolean {
  return level >= (title.requiresLevel ?? 0);
}

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
