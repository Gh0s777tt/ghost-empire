// src/lib/hype-detector.ts
// Chat hype detection for the AI Clip Director (#517). A "hype spike" = at least
// `threshold` chat messages within a rolling `windowMs`. State is in-memory per
// serverless instance (cheap, no Redis on the hot path) — good enough to catch the
// big bursts that land on one instance; the cooldown stops repeat-triggering.
// The pure detector is unit-tested; the stateful recorder wraps it.

/** Pure: does the window [now-windowMs, now] contain >= threshold timestamps? */
export function detectHypeSpike(timestamps: number[], now: number, windowMs: number, threshold: number): boolean {
  const cutoff = now - windowMs;
  let count = 0;
  for (const t of timestamps) if (t >= cutoff) count++;
  return count >= threshold;
}

const buffers = new Map<string, number[]>();
const lastTrigger = new Map<string, number>();
const MAX_BUFFER = 500;

/**
 * Record a chat message for `tenantKey` and return true IFF it just crossed the hype
 * threshold AND the per-tenant cooldown has elapsed (so one burst makes one clip).
 */
export function recordAndCheckHype(
  tenantKey: string,
  now: number,
  opts: { windowMs: number; threshold: number; cooldownMs: number },
): boolean {
  const cutoff = now - opts.windowMs;
  const buf = (buffers.get(tenantKey) ?? []).filter((t) => t >= cutoff);
  buf.push(now);
  if (buf.length > MAX_BUFFER) buf.splice(0, buf.length - MAX_BUFFER);
  buffers.set(tenantKey, buf);

  if (!detectHypeSpike(buf, now, opts.windowMs, opts.threshold)) return false;
  const last = lastTrigger.get(tenantKey);
  if (last !== undefined && now - last < opts.cooldownMs) return false; // still cooling down
  lastTrigger.set(tenantKey, now);
  return true;
}

/** Test helper — reset the in-memory state. */
export function _resetHypeState(): void {
  buffers.clear();
  lastTrigger.clear();
}
