// src/app/api/cron/tipply-poll/route.ts
// Cron: pull recent Tipply tips for every portal that connected one (#donation-layer).
//
// Tipply has no webhook and no official API, so the only self-serve path is polling the public
// last-tips endpoint behind the streamer's own widget UUID (see lib/donations/tipply.ts for why this
// is deliberately `unverified` and therefore lands in the reconciliation queue instead of minting).
//
// Reliability lessons already paid for on the Streamlabs cron are applied here from the start:
//  - EVERY portal is isolated in its own try/catch, so one failing integration cannot starve the
//    portals ordered after it;
//  - a failure is reported to Sentry AND stored on the integration row so the streamer sees it in
//    the admin panel, instead of a silent stall that looks like "no tips today";
//  - the response is non-200 when any portal failed, so a stalled income rail is visible to uptime
//    monitoring rather than indistinguishable from a quiet period;
//  - a non-JSON body is reported as such via the shared `jsonOrThrow()`. Tipply's endpoint is
//    undocumented and unauthenticated, so an HTML interstitial (Cloudflare, maintenance, a moved
//    route) is a LIKELY response — and `res.json()` on HTML throws the useless
//    `Unexpected token '<'`. This is the exact error that showed up in Sentry for the Streamlabs cron;
//  - it does not run outside production, via the shared `isProductionDeployment()`. The handler is
//    reachable on every preview/dev deploy with the same database and the same CRON_SECRET, so it
//    would poll the SAME live integrations and duplicate both queue rows and Sentry noise.
//    Fail-OPEN: only Vercel's explicit signal counts as non-production, so a self-hosted portal
//    without that variable keeps polling.
//
// Both guards deliberately reuse the Streamlabs helpers rather than re-implementing them here —
// two copies of a fail-open environment gate is exactly how the four donation pipelines drifted.
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret } from "@/lib/utils";
import { httpFetch, jsonOrThrow } from "@/lib/http";
import { deploymentEnv, isProductionDeployment } from "@/lib/deployment";
import { ingestDonation } from "@/lib/donations/ingest";
import { parseTipplyFeed, tipplyFeedUrl, tipplySince, selectFreshTips } from "@/lib/donations/tipply";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("cron.tipply-poll");

export async function GET(req: Request) {
  if (!verifyCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fail-open environment gate — see the header. Vercel only SCHEDULES crons on production, but the
  // route itself answers on every preview deploy.
  if (!isProductionDeployment()) {
    const env = deploymentEnv();
    log.info("skipped — non-production deployment", { env });
    return NextResponse.json({ ok: true, skipped: "non-production-deployment", env }, { status: 200 });
  }

  const integrations = await prisma.donationIntegration
    .findMany({
      where: { provider: "tipply", enabled: true },
      select: { id: true, tenantId: true, externalRef: true, createdAt: true, lastEventAt: true },
      orderBy: { createdAt: "asc" }, // deterministic order, so a failure hits the same place twice
    })
    .catch(() => []);

  const results: Array<{ id: string; ok: boolean; ingested: number; error?: string }> = [];

  for (const it of integrations) {
    try {
      if (!it.externalRef) {
        results.push({ id: it.id, ok: false, ingested: 0, error: "no_widget_id" });
        continue;
      }
      const res = await httpFetch(tipplyFeedUrl(it.externalRef), { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`tipply_http_${res.status}`);
      // jsonOrThrow names the upstream and reports what it actually sent, instead of the bare
      // `Unexpected token '<'` an HTML body would produce.
      const payload = await jsonOrThrow<unknown>(res, "tipply last-tips");
      // The endpoint always returns the most recent ~25 tips, so without a cutoff the first poll
      // would replay history as live donations. See tipplySince() for the exact rule.
      const since = tipplySince(it.createdAt, it.lastEventAt, new Date());
      const tips = selectFreshTips(parseTipplyFeed(payload), since);

      let ingested = 0;
      for (const tip of tips) {
        // Idempotent by provider event id — re-polling the same tips is a no-op ("duplicate").
        const r = await ingestDonation(tip, it.tenantId);
        if (r.status === "credited" || r.status === "queued") ingested++;
      }

      await prisma.donationIntegration
        .update({ where: { id: it.id }, data: { lastEventAt: ingested ? new Date() : undefined, lastError: null } })
        .catch(() => {});
      results.push({ id: it.id, ok: true, ingested });
    } catch (e) {
      const error = e instanceof Error ? e.message : "poll_failed";
      log.error("tipply poll failed for portal", { integrationId: it.id, tenantId: it.tenantId, error });
      Sentry.captureException(e, { tags: { cron: "tipply-poll" }, extra: { integrationId: it.id, tenantId: it.tenantId } });
      // Surface it to the streamer in the admin panel rather than failing silently.
      await prisma.donationIntegration.update({ where: { id: it.id }, data: { lastError: error.slice(0, 300) } }).catch(() => {});
      results.push({ id: it.id, ok: false, ingested: 0, error });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  const ingested = results.reduce((s, r) => s + r.ingested, 0);
  log.info("tipply polled", { integrations: results.length, failed, ingested });
  return NextResponse.json(
    { ok: failed === 0, integrations: results.length, failed, ingested, results },
    { status: failed > 0 ? 500 : 200 },
  );
}
