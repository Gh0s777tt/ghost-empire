// src/app/api/cron/donationalerts-poll/route.ts
// Cron: pull recent DonationAlerts donations for every portal that connected one (#donation-layer).
//
// This is the ONLY poll that may mint: the donations are read by us, over TLS, with a credential the
// streamer granted us, from the vendor's own API — so the events are stamped `verified` here and the
// pipeline's trust gate lets them credit a viewer whose GE-code is in the message. Everything else
// still applies: an unmatched donation lands in the reconciliation queue, and an unknown currency
// cannot mint at all (see `fx.ts`).
//
// THREE RULES THIS PAID FOR IN REVIEW, each guarding real money:
//
//  1. THE FIRST POLL INGESTS NOTHING. It only primes the cursor from the newest row the vendor
//     returns. The feed always contains the most recent page, so ingesting it on first connect would
//     replay history as live, AUTO-CREDITED income — the worst version of the backfill bug, because
//     here there is no human in the loop. Priming is also the only backfill guard that needs no
//     agreement between our clock and the vendor's.
//
//  2. THE CURSOR NEVER LEAVES THE VENDOR'S CLOCK. `created_at` carries no timezone (the vendor
//     documents none), so comparing it against our `now` breaks in both directions: a vendor clock
//     running ahead stores a future cursor that then drops every later donation, and one running
//     behind makes pre-connect donations look fresh. `vendorSince()` compares vendor-time to
//     vendor-time only.
//
//  3. IT PAGINATES, AND SAYS SO WHEN IT CANNOT. One page is ~30 rows; a raid or a cron outage
//     overflows it. Reading only page 1 lost those donations permanently AND silently — the poll
//     still reported ok. It now walks pages until one is older than the cursor, and if the cap is hit
//     it fails LOUDLY (lastError + Sentry + non-200) rather than reporting success over a gap.
//
// Plus the shared cron rules: per-portal try/catch, failures on the row and in Sentry, non-200 when
// any portal failed, no runs outside production, and a readable error for a non-JSON body.
//
// Token renewal: rather than track an expiry column, a 401 triggers exactly ONE refresh + retry.
// That needs no schema change and self-heals whatever the vendor's real lifetime turns out to be.
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret } from "@/lib/utils";
import { deploymentEnv, isProductionDeployment } from "@/lib/deployment";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { ingestDonation } from "@/lib/donations/ingest";
import { daFetchDonations, daExchangeToken, parseDaFeed } from "@/lib/donations/donationalerts";
import { vendorSince, selectFresh, newestAt } from "@/lib/donations/cursor";
import type { NormalizedDonation } from "@/lib/donations/types";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("cron.donationalerts-poll");

/** Hard bound on pages per portal per tick — a backlog bigger than this is reported, not swallowed. */
const MAX_PAGES = 8;

type PortalResult = {
  id: string;
  ok: boolean;
  ingested: number;
  credited: number;
  primed?: boolean;
  truncated?: boolean;
  error?: string;
};

export async function GET(req: Request) {
  if (!verifyCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isProductionDeployment()) {
    const env = deploymentEnv();
    log.info("skipped — non-production deployment", { env });
    return NextResponse.json({ ok: true, skipped: "non-production-deployment", env }, { status: 200 });
  }

  const integrations = await prisma.donationIntegration
    .findMany({
      where: { provider: "donationalerts", enabled: true },
      select: { id: true, tenantId: true, tokenEnc: true, secretEnc: true, lastEventAt: true, trust: true },
      orderBy: { createdAt: "asc" }, // deterministic order — a failure lands in the same place twice
    })
    .catch(() => []);

  const results: PortalResult[] = [];

  for (const it of integrations) {
    try {
      let accessToken = decryptSecret(it.tokenEnc);
      if (!accessToken) throw new Error("no_access_token");

      /** One page, renewing the token at most once for the whole portal. */
      let renewed = false;
      const fetchPage = async (page: number): Promise<unknown> => {
        try {
          return await daFetchDonations(accessToken!, page);
        } catch (e) {
          if (renewed || !(e instanceof Error) || e.message !== "donationalerts_unauthorized") throw e;
          renewed = true;
          // Expired access token — renew once, persist, retry. Terminal for this portal if we have no
          // refresh token: the streamer must reconnect, and lastError says exactly that.
          const refreshToken = decryptSecret(it.secretEnc);
          if (!refreshToken) throw new Error("expired_and_no_refresh_token — reconnect required");
          const grant = await daExchangeToken({ refreshToken });
          accessToken = grant.access_token;
          await prisma.donationIntegration.update({
            where: { id: it.id },
            data: {
              tokenEnc: encryptSecret(grant.access_token),
              // The vendor MAY rotate the refresh token; keeping the old one after a rotation would
              // brick the next renewal, so store it whenever one comes back.
              ...(grant.refresh_token ? { secretEnc: encryptSecret(grant.refresh_token) } : {}),
            },
          });
          return await daFetchDonations(accessToken, page);
        }
      };

      const since = vendorSince(it.lastEventAt);

      // ── First poll for this grant: prime only. See rule 1 in the header.
      if (since === null) {
        const firstPage = parseDaFeed(await fetchPage(1));
        const cursor = newestAt(firstPage, new Date());
        await prisma.donationIntegration.update({
          where: { id: it.id },
          // No donations in the feed yet? Stamp the wall clock so the next tick has a cursor and does
          // not prime forever — with an empty feed there is no history to replay, so this is safe.
          data: { lastEventAt: cursor ?? new Date(), lastError: null },
        });
        log.info("primed cursor, ingested nothing", { integrationId: it.id, seen: firstPage.length });
        results.push({ id: it.id, ok: true, ingested: 0, credited: 0, primed: true });
        continue;
      }

      // ── Walk pages until one is entirely older than the cursor (rule 3).
      const fresh: NormalizedDonation[] = [];
      let truncated = false;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const parsed = parseDaFeed(await fetchPage(page));
        if (parsed.length === 0) break;
        fresh.push(...selectFresh(parsed, since));
        const oldestOnPage = Math.min(...parsed.map((d) => d.donatedAt.getTime()));
        if (oldestOnPage < since.getTime()) break; // this page already reaches past the cursor
        if (page === MAX_PAGES) truncated = true; // still not there — the backlog is bigger than we read
      }

      // Oldest first, so a mid-loop failure leaves the cursor behind the gap rather than past it.
      fresh.sort((a, b) => a.donatedAt.getTime() - b.donatedAt.getTime());

      let ingested = 0;
      let credited = 0;
      for (const donation of fresh) {
        // Read from the row rather than hardcoding "verified", so a future manual downgrade path can
        // only ever LOWER it. Today no code writes "unverified" here, so the kill switch is the
        // Enabled toggle in the panel — do not document a control that does not exist.
        const trust = it.trust === "verified" ? ("verified" as const) : ("unverified" as const);
        const r = await ingestDonation({ ...donation, trust }, it.tenantId);
        if (r.status === "credited") { ingested++; credited++; }
        else if (r.status === "queued") ingested++;
      }

      const cursor = newestAt(fresh, new Date());
      if (truncated) {
        // Do NOT report success over a gap: the streamer must be able to tell "nothing came in" from
        // "more came in than I read".
        throw new Error(`truncated_backlog: more than ${MAX_PAGES} pages pending — some donations may be unread`);
      }
      await prisma.donationIntegration
        .update({ where: { id: it.id }, data: { ...(cursor ? { lastEventAt: cursor } : {}), lastError: null } })
        .catch(() => {});
      results.push({ id: it.id, ok: true, ingested, credited });
    } catch (e) {
      const error = e instanceof Error ? e.message : "poll_failed";
      log.error("donationalerts poll failed for portal", e, { integrationId: it.id, tenantId: it.tenantId });
      Sentry.captureException(e, { tags: { cron: "donationalerts-poll" }, extra: { integrationId: it.id, tenantId: it.tenantId } });
      await prisma.donationIntegration.update({ where: { id: it.id }, data: { lastError: error.slice(0, 300) } }).catch(() => {});
      results.push({ id: it.id, ok: false, ingested: 0, credited: 0, error });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  const ingested = results.reduce((s, r) => s + r.ingested, 0);
  const credited = results.reduce((s, r) => s + r.credited, 0);
  log.info("donationalerts polled", { integrations: results.length, failed, ingested, credited });
  return NextResponse.json(
    { ok: failed === 0, integrations: results.length, failed, ingested, credited, results },
    { status: failed > 0 ? 500 : 200 },
  );
}
