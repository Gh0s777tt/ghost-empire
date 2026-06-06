// src/app/api/alerts/stream/route.ts
// Realtime (SSE) transport for the OBS alert overlay — replaces ~1.2s polling
// with a single long-lived connection that pushes alerts as they land.
//
// Why a server-side read loop (and not Redis pub/sub): Upstash REST has no
// persistent SUBSCRIBE, so the streamer-facing pattern is a thin loop that reads
// the feed every ~1s and writes SSE frames. DB load is comparable to the old
// polling (one streamer = ~one connection) but with far fewer HTTP invocations
// and lower alert latency. The overlay falls back to /api/alerts/queue polling
// if this endpoint is unreachable, so it's zero-risk on stream.
//
// Vercel note: serverless functions have a max duration, so the loop self-closes
// well before it (MAX_LIFETIME_MS) and the browser's EventSource transparently
// reconnects — keeping the stream alive indefinitely across short reconnects.
import { isValidOverlayToken } from "@/lib/alerts";
import { fetchAlertFeed } from "@/lib/alert-feed";
import { sseComment, sseFrame, sseRetry } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Prisma (pg driver adapter) needs Node, not Edge.
export const maxDuration = 60; // Vercel Pro ceiling for this fn; we self-close at 50s.

const TICK_MS = 1000; // how often we read the feed and flush new alerts
const MAX_LIFETIME_MS = 50_000; // close before the platform does; client reconnects
const HEARTBEAT_TICKS = 15; // send a keep-alive comment every N ticks (~15s)
const RECONNECT_BACKOFF_MS = 3000; // client retry delay after a dropped stream

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!(await isValidOverlayToken(token))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  // First batch mirrors the polled queue's first-connect behaviour: only alerts
  // from the last 10s, so a freshly-opened overlay doesn't replay old history.
  let cursor = new Date(Date.now() - 10_000);
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already closed (client gone mid-write) — stop the loop.
          closed = true;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Stop cleanly when the client disconnects (OBS source removed / tab closed).
      req.signal.addEventListener("abort", close);

      // Tell the client how fast to reconnect after we self-close.
      send(sseRetry(RECONNECT_BACKOFF_MS));

      const startedAt = Date.now();
      let tick = 0;

      const loop = async () => {
        if (closed) return;
        tick += 1;
        try {
          const feed = await fetchAlertFeed(cursor);
          cursor = new Date(feed.now);
          // Settings every tick is cheap JSON; the client setState no-ops when
          // values are unchanged, so this keeps look-config live without churn.
          send(sseFrame("settings", feed.settings));
          if (feed.alerts.length > 0) send(sseFrame("alerts", feed.alerts));
        } catch {
          // Transient DB blip — keep the connection and retry next tick.
        }

        if (tick % HEARTBEAT_TICKS === 0) send(sseComment("ping"));

        if (closed) return;
        if (Date.now() - startedAt >= MAX_LIFETIME_MS) {
          close();
          return;
        }
        timer = setTimeout(loop, TICK_MS);
      };

      // Kick off the first read immediately so the overlay authenticates and
      // gets its settings without waiting a full tick.
      await loop();
    },
    cancel() {
      closed = true;
      if (timer) clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (nginx/Vercel) so frames flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
