// src/lib/collectibles.ts
// Pure source-of-truth for the collectible-cards system (#551) — rarities, their drop
// weights + colours, the GT pack price, and the weighted rarity roll. Shared by the
// admin editor, the pack-opening route, and the render. No server-only imports.

export const RARITIES = ["common", "rare", "epic", "legendary"] as const;
export type Rarity = (typeof RARITIES)[number];

// Relative drop weights (sum = 100 → readable as percentages).
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, rare: 28, epic: 10, legendary: 2 };
export const RARITY_COLOR: Record<Rarity, string> = { common: "#a1a1aa", rare: "#60a5fa", epic: "#c084fc", legendary: "#fbbf24" };

export const PACK_PRICE = 250; // GT to open one pack

export function isRarity(r: string): r is Rarity {
  return (RARITIES as readonly string[]).includes(r);
}

export function normalizeRarity(r: string | null | undefined): Rarity {
  return r && isRarity(r) ? r : "common";
}

/** Pick a rarity by weight. `rnd` ∈ [0,1). Pure + deterministic for testing. */
export function pickRarity(rnd: number): Rarity {
  const total = RARITIES.reduce((s, r) => s + RARITY_WEIGHT[r], 0);
  const target = Math.max(0, Math.min(0.999999, rnd)) * total;
  let acc = 0;
  for (const r of RARITIES) {
    acc += RARITY_WEIGHT[r];
    if (target < acc) return r;
  }
  return "common";
}
