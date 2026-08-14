// src/app/api/cron/streamlabs-poll/route.ts
// Vercel Cron handler — polls Streamlabs for new donations periodically.
// Vercel auto-sets Authorization: Bearer ${CRON_SECRET} on cron-triggered requests.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pollAndProcessDonations } from "@/lib/streamlabs";
import { createLogger } from "@/lib/logger";
import { verifyCronSecret } from "@/lib/utils";
import { deploymentEnv, isProductionDeployment } from "@/lib/deployment";
import * as Sentry from "@sentry/nextjs";

const log = createLogger("cron.streamlabs-poll");

export async function GET(req: Request) {
  if (!verifyCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Production-only. Vercel schedules crons on the production deployment, but the handler is
  // reachable on every preview/dev build too (same code, same DB, same CRON_SECRET) — and there it
  // would poll the SAME live Streamlabs connections and, on any hiccup, fire the money-in alert
  // below. A false "donation income stalled" page teaches the operator to ignore the real one, so
  // a non-production run stops here: no poll, no Sentry, HTTP 200 (a 500 would just move the noise
  // to uptime monitoring). `isProductionDeployment()` is fail-open — a self-hosted portal with no
  // VERCEL_ENV still polls and still alerts exactly as before.
  if (!isProductionDeployment()) {
    const env = deploymentEnv();
    log.info("skipped — non-production deployment", { env });
    return NextResponse.json({ ok: true, skipped: "non-production-deployment", env }, { status: 200 });
  }

  // Poll EVERY portal's Streamlabs connection, not just the founder's. Each connection
  // row carries its tenantId (the legacy founder row is tenantId null); processing scopes
  // donations to that portal. Previously this polled getStreamlabsConnection() (no arg) →
  // the default row only, so sub-tenant donations were never ingested. #owner-batch
  const conns = await prisma.streamlabsConnection.findMany({ select: { tenantId: true } });
  // Sequential (like cron/weekly-rewards) — don't fan out concurrent external-API + DB-tx
  // work across every portal at once.
  const results: Array<{ tenantId: string | null; ok: boolean; fetched: number; matched: number; unmatched: number; error?: string; errorCode?: string }> = [];
  for (const c of conns) {
    try {
      const r = await pollAndProcessDonations(c.tenantId);
      results.push({ tenantId: c.tenantId, ...r });
      // A RETURNED ok:false is a fetch failure (pollAndProcessDonations swallows its own fetch
      // errors and returns instead of throwing), so it never hits the catch below. Surface it to
      // Sentry too — otherwise a sustained Streamlabs outage stalls income while only nudging the
      // failed-count, invisible to alerting.
      if (!r.ok) {
        log.error("portal poll failed (fetch)", { tenantId: c.tenantId, error: r.error, errorCode: r.errorCode });
        Sentry.captureMessage("streamlabs-poll: portal fetch failed", {
          level: "error",
          // `streamlabsError` is a TAG, not just extra: `reauth_required` means this portal's
          // donations are dead until an admin re-runs the OAuth connect, while `refresh_failed`
          // clears itself on the next tick. Alert rules need to tell those apart. #801
          tags: { cron: "streamlabs-poll", streamlabsError: r.errorCode ?? "fetch_failed" },
          extra: { tenantId: c.tenantId, error: r.error },
        });
      }
    } catch (e) {
      // Isolate portals: pollAndProcessDonations only try/catches its fetch — a throw in the
      // mint transaction / achievements / goals would otherwise abort the loop and starve every
      // portal ordered AFTER this one (their real-money donations never ingested this cycle).
      const error = e instanceof Error ? e.message : "poll_failed";
      log.error("portal poll threw", { tenantId: c.tenantId, error });
      Sentry.captureException(e, { tags: { cron: "streamlabs-poll" }, extra: { tenantId: c.tenantId } });
      results.push({ tenantId: c.tenantId, ok: false, fetched: 0, matched: 0, unmatched: 0, error });
    }
  }

  const totals = results.reduce(
    (a, r) => ({ fetched: a.fetched + r.fetched, matched: a.matched + r.matched, unmatched: a.unmatched + r.unmatched }),
    { fetched: 0, matched: 0, unmatched: 0 },
  );
  const failed = results.filter((r) => !r.ok).length;
  log.info("polled donations", { portals: results.length, failed, ...totals });
  // Always-200 makes a stalled income rail look identical to a quiet period. Return non-200 when
  // any portal failed so the Vercel cron run is flagged and uptime/Sentry can alert; the other
  // portals were still polled above.
  return NextResponse.json(
    { ok: failed === 0, portals: results.length, failed, totals, results },
    { status: failed > 0 ? 500 : 200 },
  );
}
