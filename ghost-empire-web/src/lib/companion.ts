// src/lib/companion.ts
// Pure logic for the Ghost Companion idle pet. xp = lifetime GT fed; the stage
// (and the progress toward the next) is derived here so the API and the UI agree.
// Feeding is the economy SINK (burns GT) — see /api/companion/feed.

export type CompanionStage = { index: number; key: string; minXp: number; emoji: string };

// Six evolution stages. Each `key` maps to an i18n label `companion.stage_<key>`.
export const COMPANION_STAGES: CompanionStage[] = [
  { index: 0, key: "spark", minXp: 0, emoji: "✨" },
  { index: 1, key: "wisp", minXp: 500, emoji: "🌫️" },
  { index: 2, key: "ghost", minXp: 2000, emoji: "👻" },
  { index: 3, key: "specter", minXp: 6000, emoji: "💀" },
  { index: 4, key: "wraith", minXp: 15000, emoji: "🎭" },
  { index: 5, key: "phantom", minXp: 40000, emoji: "👑" },
];

export const FEED_MIN = 10;
export const FEED_MAX = 100_000;

/** The highest stage whose xp threshold has been reached. */
export function companionStage(xp: number): CompanionStage {
  let stage = COMPANION_STAGES[0];
  for (const s of COMPANION_STAGES) {
    if (xp >= s.minXp) stage = s;
    else break;
  }
  return stage;
}

export type CompanionProgress = {
  stage: CompanionStage;
  next: CompanionStage | null;
  /** 0–100 toward the next stage; 100 at max stage. */
  pct: number;
  /** GT (xp) still needed to evolve; 0 at max stage. */
  toNext: number;
};

export function companionProgress(xp: number): CompanionProgress {
  const stage = companionStage(xp);
  const next = COMPANION_STAGES[stage.index + 1] ?? null;
  if (!next) return { stage, next: null, pct: 100, toNext: 0 };
  const span = next.minXp - stage.minXp;
  const into = xp - stage.minXp;
  const pct = span > 0 ? Math.min(100, Math.max(0, Math.round((into / span) * 100))) : 0;
  return { stage, next, pct, toNext: Math.max(0, next.minXp - xp) };
}

/** A feed amount is valid when it's a whole number within [FEED_MIN, FEED_MAX]. */
export function isValidFeed(amount: number): boolean {
  return Number.isInteger(amount) && amount >= FEED_MIN && amount <= FEED_MAX;
}
