// src/app/api/cron/streamlabs-poll/route.ts
// Vercel Cron handler — polls Streamlabs for new donations periodically.
// Vercel auto-sets Authorization: Bearer ${CRON_SECRET} on cron-triggered requests.
import { NextResponse } from "next/server";
import { pollAndProcessDonations } from "@/lib/streamlabs";
import { createLogger } from "@/lib/logger";

const log = createLogger("cron.streamlabs-poll");

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await pollAndProcessDonations();
  if (result.ok) {
    log.info("polled donations", { fetched: result.fetched, matched: result.matched, unmatched: result.unmatched });
  } else {
    log.warn("poll skipped/failed", { error: result.error });
  }
  return NextResponse.json(result);
}
