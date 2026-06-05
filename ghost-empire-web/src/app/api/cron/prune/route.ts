// src/app/api/cron/prune/route.ts
// Vercel Cron handler — deletes old transient rows (chat feed, alerts, event logs,
// read notifications, old wheel spins) so the free-tier DB stays small.
// Vercel auto-sets Authorization: Bearer ${CRON_SECRET} on cron-triggered requests.
import { NextResponse } from "next/server";
import { pruneOldRecords } from "@/lib/pruning";
import { createLogger } from "@/lib/logger";

const log = createLogger("cron.prune");

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await pruneOldRecords();
    log.info("pruned old records", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    log.error("prune failed", e);
    return NextResponse.json({ error: "prune_failed" }, { status: 500 });
  }
}
