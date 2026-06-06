// src/app/api/alerts/stream/route.ts
// Realtime (SSE) transport for the OBS alert overlay — pushes alerts as they land
// instead of the overlay polling /api/alerts/queue. Shares the SSE stream helper
// (lib/sse) with the generic overlay streamer (/api/overlay/stream/[feed]); the
// overlay falls back to polling /api/alerts/queue if this is unreachable, so it's
// zero-risk on stream. Self-closes before Vercel's function cap; EventSource
// transparently reconnects.
import { isValidOverlayToken } from "@/lib/alerts";
import { fetchAlertFeed } from "@/lib/alert-feed";
import { sseFrame, sseStreamResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Prisma (pg driver adapter) needs Node, not Edge.
export const maxDuration = 60; // Vercel Pro ceiling; the stream self-closes at 50s.

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!(await isValidOverlayToken(token))) {
    return new Response("Unauthorized", { status: 401 });
  }

  // First batch mirrors the polled queue's first-connect behaviour: only alerts
  // from the last 10s, so a freshly-opened overlay doesn't replay old history.
  // Advances to the server clock each tick.
  let cursor = new Date(Date.now() - 10_000);

  return sseStreamResponse({
    signal: req.signal,
    onTick: async (send) => {
      const feed = await fetchAlertFeed(cursor);
      cursor = new Date(feed.now);
      // Settings every tick is cheap JSON; the client setState no-ops when values
      // are unchanged, so this keeps look-config live without churn.
      send(sseFrame("settings", feed.settings));
      if (feed.alerts.length > 0) send(sseFrame("alerts", feed.alerts));
    },
  });
}
