// src/lib/sse.ts
// Tiny pure helpers for building Server-Sent Events wire frames.
// Kept framework-free so they're trivially unit-testable; the actual streaming
// (ReadableStream + headers) lives in the route handler.

/** A named SSE event carrying a JSON payload: `event: <name>\ndata: <json>\n\n`. */
export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** An SSE comment line (ignored by EventSource) — used as a keep-alive heartbeat. */
export function sseComment(text: string): string {
  return `: ${text}\n\n`;
}

/** Sets the client's auto-reconnect backoff (ms) before it retries a dropped stream. */
export function sseRetry(ms: number): string {
  return `retry: ${ms}\n\n`;
}

/** Standard SSE response headers — disables caching and proxy buffering so frames flush immediately. */
export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no", // nginx/Vercel: don't buffer the stream
};

/**
 * Build a long-lived SSE `Response` that calls `onTick(send, tick)` every
 * `tickMs`, emits a heartbeat comment periodically, and **self-closes** after
 * `maxLifetimeMs` — staying under the platform's function-duration cap so the
 * browser's EventSource transparently reconnects. Cleans up on client
 * disconnect via `signal` (and on stream cancel).
 *
 * `onTick` does the per-tick work: call `send(sseFrame(...))` with whatever
 * frames this stream emits. Throwing inside `onTick` is swallowed so a transient
 * backend blip doesn't kill the connection — it just retries next tick.
 *
 * Shared by the bespoke alert stream (/api/alerts/stream) and the generic
 * overlay streamer (/api/overlay/stream/[feed]).
 */
export function sseStreamResponse(opts: {
  signal: AbortSignal;
  onTick: (send: (chunk: string) => void, tick: number) => void | Promise<void>;
  tickMs?: number;
  maxLifetimeMs?: number;
  heartbeatTicks?: number;
  reconnectBackoffMs?: number;
}): Response {
  const {
    signal,
    onTick,
    tickMs = 1000,
    maxLifetimeMs = 50_000,
    heartbeatTicks = 15,
    reconnectBackoffMs = 3000,
  } = opts;

  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true; // controller closed (client gone mid-write) — stop looping
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
      signal.addEventListener("abort", close);
      send(sseRetry(reconnectBackoffMs));

      const startedAt = Date.now();
      let tick = 0;
      const loop = async () => {
        if (closed) return;
        tick += 1;
        try {
          await onTick(send, tick);
        } catch {
          /* transient backend error — keep the stream, retry next tick */
        }
        if (tick % heartbeatTicks === 0) send(sseComment("ping"));
        if (closed) return;
        if (Date.now() - startedAt >= maxLifetimeMs) {
          close();
          return;
        }
        timer = setTimeout(loop, tickMs);
      };
      // Run the first tick immediately so the client authenticates + paints fast.
      await loop();
    },
    cancel() {
      closed = true;
      if (timer) clearTimeout(timer);
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
