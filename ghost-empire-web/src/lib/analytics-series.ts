// src/lib/analytics-series.ts
// Pure series/cohort builders for the admin growth charts (#769). SQL returns sparse
// day/week buckets; these helpers fill the gaps, order the axes and generate SVG paths —
// all pure and unit-tested. DB queries live in /api/admin/analytics-charts.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** UTC "YYYY-MM-DD" for a timestamp. */
export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The last `days` UTC day-keys, oldest → newest, ending today. */
export function dayKeys(days: number, now: number): string[] {
  const today = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate(),
  );
  return Array.from({ length: days }, (_, i) => dayKey(today - (days - 1 - i) * DAY_MS));
}

/** Monday-anchored UTC week start for a timestamp (matches Postgres date_trunc('week')). */
export function weekStart(ms: number): number {
  const d = new Date(ms);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(midnight).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return midnight - dow * DAY_MS;
}

/** The last `weeks` week-start keys ("YYYY-MM-DD"), oldest → newest, ending this week. */
export function weekKeys(weeks: number, now: number): string[] {
  const thisWeek = weekStart(now);
  return Array.from({ length: weeks }, (_, i) => dayKey(thisWeek - (weeks - 1 - i) * WEEK_MS));
}

/** Fill a sparse {key → value} map onto an ordered axis (missing = 0, negatives clamped). */
export function fillSeries(axis: string[], sparse: Record<string, number>): number[] {
  return axis.map((k) => Math.max(0, Math.round(sparse[k] ?? 0)));
}

/**
 * SVG polyline path ("M x y L x y …") for a series scaled into a w×h box (y grows down,
 * so the max value sits at the top). A flat all-zero series draws along the bottom edge.
 */
export function linePath(values: number[], w: number, h: number): string {
  if (values.length === 0) return "";
  const max = Math.max(1, ...values);
  const stepX = values.length > 1 ? w / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = +(i * stepX).toFixed(2);
      const y = +(h - (v / max) * h).toFixed(2);
      return `${i === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
}

/** Closed area path under linePath (for a soft fill below the line). */
export function areaPath(values: number[], w: number, h: number): string {
  const line = linePath(values, w, h);
  if (!line) return "";
  return `${line} L${w} ${h} L0 ${h} Z`;
}

export type CohortCell = { pct: number; users: number };
export type CohortRow = { cohort: string; size: number; cells: (CohortCell | null)[] };

/**
 * Build a signup-week × weeks-since-signup retention grid. `sizes` = users per cohort
 * week; `activity` = distinct active users per (cohort week, activity week). Cells in
 * the future (activity week before signup or after `now`'s week) are null. Week 0 (the
 * signup week itself) is included — it is ~100% by construction and anchors the row.
 */
export function buildCohortGrid(
  sizes: { cohort: string; size: number }[],
  activity: { cohort: string; week: string; users: number }[],
  weeks: number,
  now: number,
): CohortRow[] {
  const axis = weekKeys(weeks, now);
  const idx = new Map(axis.map((k, i) => [k, i]));
  const act = new Map<string, number>();
  for (const a of activity) act.set(`${a.cohort}|${a.week}`, a.users);

  return axis
    .map((cohort) => {
      const size = sizes.find((s) => s.cohort === cohort)?.size ?? 0;
      const cohortIdx = idx.get(cohort) ?? 0;
      const cells: (CohortCell | null)[] = axis.map((week, wIdx) => {
        const offset = wIdx - cohortIdx;
        if (offset < 0 || offset >= weeks - cohortIdx + 1) return null; // before signup
        if (wIdx >= axis.length) return null;
        if (size === 0) return null;
        const users = act.get(`${cohort}|${week}`) ?? 0;
        return { users, pct: Math.min(100, Math.round((users / size) * 100)) };
      });
      // Re-shape to "weeks since signup": drop leading nulls so column 0 = signup week.
      const sinceSignup = cells.slice(cohortIdx);
      while (sinceSignup.length < weeks) sinceSignup.push(null);
      return { cohort, size, cells: sinceSignup.slice(0, weeks) };
    })
    .filter((r) => r.size > 0);
}
