// src/app/api/cron/streamlabs-poll/route.ts
// Vercel Cron handler — polls Streamlabs for new donations periodically.
// Vercel auto-sets Authorization: Bearer ${CRON_SECRET} on cron-triggered requests.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pollAndProcessDonations } from "@/lib/streamlabs";
import { createLogger } from "@/lib/logger";
import { verifyCronSecret } from "@/lib/utils";

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
    results.push({ tenantId: c.tenantId, ...(await pollAndProcessDonations(c.tenantId)) });
  }

  const totals = results.reduce(
    (a, r) => ({ fetched: a.fetched + r.fetched, matched: a.matched + r.matched, unmatched: a.unmatched + r.unmatched }),
    { fetched: 0, matched: 0, unmatched: 0 },
  );
  log.info("polled donations", { portals: results.length, ...totals });
  return NextResponse.json({ ok: true, portals: results.length, totals, results });
}
