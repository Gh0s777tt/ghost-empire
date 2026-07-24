// src/app/api/cron/streamlabs-poll/route.ts
// Vercel Cron handler — polls Streamlabs for new donations periodically.
// Vercel auto-sets Authorization: Bearer ${CRON_SECRET} on cron-triggered requests.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pollAndProcessDonations } from "@/lib/streamlabs";
import { createLogger } from "@/lib/logger";
import { verifyCronSecret } from "@/lib/utils";
import * as Sentry from "@sentry/nextjs";

const log = createLogger("cron.streamlabs-poll");

export async function GET(req: Request) {
  if (!verifyCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Poll EVERY portal's Streamlabs connection, not just the founder's. Each connection
  // row carries its tenantId (the legacy founder row is tenantId null); processing scopes
  // donations to that portal. Previously this polled getStreamlabsConnection() (no arg) →
  // the default row only, so sub-tenant donations were never ingested. #owner-batch
  const conns = await prisma.streamlabsConnection.findMany({ select: { tenantId: true } });
  // Sequential (like cron/weekly-rewards) — don't fan out concurrent external-API + DB-tx
  // work across every portal at once.
  const results: Array<{ tenantId: string | null; ok: boolean; fetched: number; matched: number; unmatched: number; error?: string }> = [];
  for (const c of conns) {
    try {
      results.push({ tenantId: c.tenantId, ...(await pollAndProcessDonations(c.tenantId)) });
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
