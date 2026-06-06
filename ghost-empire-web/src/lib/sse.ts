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
