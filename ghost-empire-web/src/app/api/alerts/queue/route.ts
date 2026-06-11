// src/app/api/alerts/queue/route.ts
// Polled by the OBS overlay (~1.2s) as the FALLBACK transport — the realtime
// path is /api/alerts/stream (SSE). Both share lib/alert-feed so the payload is
// identical regardless of transport. Returns alerts newer than `since`.
// Token-gated (constant-time compare against the DB/env overlay token).
import { NextResponse } from "next/server";
import { isValidOverlayToken } from "@/lib/alerts";
import { fetchAlertFeed } from "@/lib/alert-feed";
import { currentTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const tenantId = await currentTenantId();
  if (!(await isValidOverlayToken(token, tenantId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sinceParam = url.searchParams.get("since");
  let since: Date;
  if (sinceParam) {
    const parsed = new Date(sinceParam);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid since" }, { status: 400 });
    }
    since = parsed;
  } else {
    // First connect — only show alerts from the last 10 seconds, not all history.
    since = new Date(Date.now() - 10_000);
  }

  return NextResponse.json(await fetchAlertFeed(since, tenantId));
}
