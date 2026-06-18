// src/lib/clan-wars.ts
// Pure logic for clan wars. A war is a time-boxed competition; clans accumulate
// `warPoints` (= GT members contribute during the window). The admin starts/ends
// it; the top clan wins the prize pool into its treasury. One active war per tenant.

export const WAR_MIN_DAYS = 1;
export const WAR_MAX_DAYS = 30;
export const WAR_MAX_PRIZE = 10_000_000;

/** A war counts as live while its status is "active" AND `now` is before `endsAt`. */
export function isWarLive(war: { status: string; endsAt: string | Date }, now: number): boolean {
  return war.status === "active" && new Date(war.endsAt).getTime() > now;
}

/** Milliseconds remaining until `endsAt`, floored at 0. */
export function warTimeRemaining(endsAt: string | Date, now: number): number {
  return Math.max(0, new Date(endsAt).getTime() - now);
}

/** Clamp a requested war length to [WAR_MIN_DAYS, WAR_MAX_DAYS] whole days. */
export function clampWarDays(days: number): number {
  if (!Number.isFinite(days)) return WAR_MIN_DAYS;
  return Math.min(WAR_MAX_DAYS, Math.max(WAR_MIN_DAYS, Math.floor(days)));
}

/** Clamp a prize pool to [0, WAR_MAX_PRIZE] whole GT. */
export function clampPrize(prize: number): number {
  if (!Number.isFinite(prize)) return 0;
  return Math.min(WAR_MAX_PRIZE, Math.max(0, Math.floor(prize)));
}
