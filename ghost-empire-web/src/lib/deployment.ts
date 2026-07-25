// src/lib/deployment.ts
// "Is this the real deployment, or a throwaway preview?" — one answer, one place.
//
// Why it exists: the money-critical crons (donation polling) PAGE A HUMAN when they fail
// (`Sentry.captureMessage` + HTTP 500 — see api/cron/streamlabs-poll). A preview/dev build runs
// the exact same handler against the same DB, so any failure there produces an alert that looks
// identical to "real income has stalled". Recurring false alarms on a money-in rail are worse than
// no alarm: they train the operator to ignore the one that matters.
//
// INVARIANT — fail OPEN. Only a POSITIVE non-production signal from the platform (`VERCEL_ENV` =
// `preview` / `development`) counts as non-production. Anything else — the var unset (self-hosted
// portal, Docker, another host), or a value we don't recognise — is treated as production, so a
// tenant running E-Forge outside Vercel keeps polling and keeps alerting exactly as before. A
// gate on a money-in rail must never silence a real outage just because it can't identify the host.

/** Deployment classes we distinguish. Mirrors Vercel's `VERCEL_ENV` vocabulary. */
export type DeploymentEnv = "production" | "preview" | "development";

/** The environment shape this module reads — injectable so it can be unit-tested. Modelled as an
 *  index signature (not `{ VERCEL_ENV?: string }`) because an all-optional "weak type" refuses
 *  `process.env`: TS's weak-type check requires overlapping properties, and `ProcessEnv` declares
 *  its keys through an index signature. */
type EnvLike = { readonly [key: string]: string | undefined };

/**
 * Classify the current deployment.
 *
 * @param env - Environment to read (defaults to `process.env`); pass a literal in tests.
 * @returns `"preview"` / `"development"` only on an explicit Vercel signal, `"production"` otherwise.
 *
 * @remarks
 * Deliberately biased toward `"production"`: an unset or unknown `VERCEL_ENV` means "we don't know",
 * and on a money-in rail "we don't know" must behave like production (keep polling, keep alerting).
 */
export function deploymentEnv(env: EnvLike = process.env): DeploymentEnv {
  const value = env.VERCEL_ENV?.trim().toLowerCase();
  if (value === "preview") return "preview";
  if (value === "development") return "development";
  return "production";
}

/**
 * Whether side effects that only make sense for real traffic (money-in polling, paging alerts)
 * should run.
 *
 * @param env - Environment to read (defaults to `process.env`).
 * @returns `false` only on a Vercel preview/development deployment.
 *
 * @example
 * ```ts
 * if (!isProductionDeployment()) return NextResponse.json({ ok: true, skipped: "non-production" });
 * ```
 */
export function isProductionDeployment(env: EnvLike = process.env): boolean {
  return deploymentEnv(env) === "production";
}
