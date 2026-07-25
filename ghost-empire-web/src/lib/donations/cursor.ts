// src/lib/donations/cursor.ts
// The "do not replay history" rule, shared by every POLLING donation provider (#donation-layer).
//
// WHY THIS IS ITS OWN FILE: every poll-based feed (Tipply's last-tips, DonationAlerts' donations
// page) returns the most recent N donations on EVERY call. A naive first poll therefore ingests a
// full page of HISTORY as if it were live — firing an overlay alert per row and filling the
// streamer's reconciliation queue with donations they settled in the provider's own panel days ago.
// The rule is identical for all of them, so it lives here once rather than being re-derived per
// adapter — the same mistake that let four hand-copied donation pipelines drift apart.
import type { NormalizedDonation } from "./types";

/**
 * Default backstop: how far back a poll may reach when nothing else constrains it.
 *
 * Long enough that a multi-hour cron outage still recovers the donations it missed, short enough
 * that re-enabling a long-idle integration cannot replay a month of history onto the overlay.
 */
export const DEFAULT_MAX_LOOKBACK_MS = 12 * 60 * 60 * 1000;

/**
 * Overlap kept around `lastEventAt` so a donation created mid-poll is not skipped.
 *
 * Duplicates are free — the pipeline dedupes on `Donation.externalId` — but a gap is permanent, so
 * this deliberately errs towards re-reading.
 */
export const CURSOR_GRACE_MS = 30 * 60 * 1000;

/**
 * The oldest donation a poll for this integration may ingest.
 *
 * The cutoff is the LATEST of three floors:
 *  - `createdAt` — when the integration was set up; nothing before it is ours to process;
 *  - `lastEventAt - CURSOR_GRACE_MS` — resume just before the last successful ingest;
 *  - `now - maxLookbackMs` — the hard backstop for a long-idle integration.
 *
 * @param createdAt - When the integration row was created.
 * @param lastEventAt - When this integration last ingested something, or null if never.
 * @param now - The current time (passed in so this stays pure and testable).
 * @param maxLookbackMs - Override the backstop for a provider with a different cadence.
 * @returns The cutoff instant; donations older than it must be ignored.
 *
 * @remarks unit-tested in `__tests__/donations-tipply.test.ts`.
 */
export function pollSince(
  createdAt: Date,
  lastEventAt: Date | null,
  now: Date,
  maxLookbackMs: number = DEFAULT_MAX_LOOKBACK_MS,
): Date {
  const floors = [createdAt.getTime(), now.getTime() - maxLookbackMs];
  if (lastEventAt) floors.push(lastEventAt.getTime() - CURSOR_GRACE_MS);
  return new Date(Math.max(...floors));
}

/** Drop events older than the cutoff — see {@link pollSince}. */
export function selectFresh<T extends { donatedAt: Date }>(events: T[], since: Date): T[] {
  return events.filter((e) => e.donatedAt.getTime() >= since.getTime());
}

/**
 * How far beyond "now" a provider timestamp may sit and still be believed.
 *
 * Generous on purpose: a provider that reports zone-less local time can legitimately look hours
 * ahead of our UTC clock (DonationAlerts documents NO timezone for `created_at`), and that is
 * harmless as long as the cursor stays in the SAME clock — see {@link vendorSince}. What this bound
 * exists to reject is an absurd outlier: one row dated 2126 would otherwise become the cursor and
 * silently wedge the integration forever, because a cursor can only ever move forward.
 */
export const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

/**
 * The newest believable instant among a batch, for storing as the next cursor.
 *
 * @param events - The batch that was just processed.
 * @param now - The current time, passed in so this stays pure.
 * @returns The newest timestamp at most {@link MAX_CLOCK_SKEW_MS} beyond `now`, or null.
 *
 * @remarks
 * Returns null for an empty batch so the caller leaves `lastEventAt` untouched rather than stamping
 * "now" — stamping a poll that processed nothing would walk the cursor forward over donations that
 * had not appeared in the feed yet.
 */
export function newestAt(events: Pick<NormalizedDonation, "donatedAt">[], now: Date): Date | null {
  const ceiling = now.getTime() + MAX_CLOCK_SKEW_MS;
  let max: number | null = null;
  for (const e of events) {
    const t = e.donatedAt.getTime();
    if (Number.isNaN(t) || t > ceiling) continue; // not a real timestamp — never let it become the cursor
    if (max === null || t > max) max = t;
  }
  return max === null ? null : new Date(max);
}

/**
 * The cutoff for a provider whose timestamps are on ITS OWN, unspecified clock.
 *
 * WHY THIS IS SEPARATE FROM {@link pollSince}: `pollSince` maxes the stored cursor against
 * `createdAt` and `now - lookback`, which are on OUR clock. That is correct only when the provider's
 * timestamps are also real UTC (Tipply's are). DonationAlerts documents no timezone at all, so
 * mixing the two clocks breaks in both directions: a provider clock running ahead makes every floor
 * useless and, once stored, a future cursor drops every later donation; a provider clock running
 * behind makes pre-connect donations look fresh and replays history as live, auto-credited income.
 *
 * So for such a provider the comparison NEVER leaves the provider's own frame:
 *  - no cursor yet (`lastEventAt === null`) → return null, meaning "ingest nothing this round, just
 *    prime the cursor from the newest row the provider returned". That is the correct backfill guard
 *    and it needs no clock agreement whatsoever;
 *  - otherwise → the stored cursor minus the overlap window, both of which are provider-clock.
 *
 * @returns The cutoff, or null when the caller must prime instead of ingest.
 */
export function vendorSince(lastEventAt: Date | null): Date | null {
  if (!lastEventAt) return null;
  return new Date(lastEventAt.getTime() - CURSOR_GRACE_MS);
}
