// src/lib/achievement-progress.ts
// "How close am I?" progress for LOCKED achievements with a numeric threshold (#audit5 UX).
// Pure — the /achievements page already loads the viewer's stats, so this just maps a trigger
// to the matching stat and computes a clamped 0–100% bar. Only the threshold triggers backed by
// those stats get a bar; manual + dynamic (donations/subs/etc.) triggers return null (no bar).

export type AchProgressStats = { level: number; totalEarned: number; streak: number; messageCount: number };

// Which viewer stat a threshold trigger measures against (mirrors lib/achievements computeCurrentValue).
const STAT_FOR_TRIGGER: Record<string, keyof AchProgressStats> = {
  level: "level",
  tokens_earned: "totalEarned",
  streak: "streak",
  messages: "messageCount",
};

export type AchProgress = { current: number; target: number; pct: number };

/** Progress toward a locked achievement, or null when it can't be shown inline
 *  (no numeric trigger, manual/dynamic trigger, or no viewer stats). */
export function achievementProgress(
  triggerType: string | null | undefined,
  triggerValue: number | null | undefined,
  stats: AchProgressStats | null | undefined,
): AchProgress | null {
  if (!triggerType || !triggerValue || triggerValue <= 0 || !stats) return null;
  const key = STAT_FOR_TRIGGER[triggerType];
  if (!key) return null;
  const current = Math.max(0, stats[key] ?? 0);
  const pct = Math.max(0, Math.min(100, Math.round((Math.min(current, triggerValue) / triggerValue) * 100)));
  return { current, target: triggerValue, pct };
}
