// src/shutdown.ts
// Graceful shutdown for a process that is supposed to run 24/7.
//
// WHY THIS EXISTS: the documented deployment is `docker run --restart unless-stopped`
// (README → "Hosting (24/7)"), so every redeploy or config change is a `docker stop`:
// SIGTERM, then SIGKILL ~10 s later. Until this module there was no `process.on` anywhere
// in src/, so the bot simply died mid-flight and whatever it was doing was lost. The
// expensive case is heist.ts: the crew's chips are ALREADY escrowed server-side while the
// resolution is a plain in-memory setTimeout up to ~90 s out — a restart inside that window
// means the `action: "resolve"` call is never made, the stake is stranded and no result is
// ever posted to chat. Money-shaped POSTs (chat-award, raffle entries) have the same shape:
// killed halfway, nobody retries them.
//
// CONTRACT — deliberately tiny, a drain is a LAST CHANCE, not a queue:
//  • features register a callback with onShutdown(); all callbacks run in parallel,
//  • already-started portal calls are registered with trackInFlight() and awaited too,
//  • the whole drain is bounded by DRAIN_DEADLINE_MS, which sits BELOW docker's 10 s
//    grace — a hung portal must never be the reason a stop escalates to SIGKILL,
//  • nothing here retries and nothing is persisted: state that must survive a restart
//    belongs in the portal's DB, not in this process,
//  • the handler is idempotent — a second Ctrl-C during the drain is ignored, never a
//    second racing drain.

/** A feature's drain callback. Must be best-effort: it runs while the process is dying. */
type DrainFn = () => void | Promise<void>;

// 8 s < docker stop's default 10 s grace, leaving room for the exit itself.
const DRAIN_DEADLINE_MS = 8_000;

const drains: { name: string; fn: DrainFn }[] = [];
const inFlight = new Set<Promise<unknown>>();
let draining = false;

/**
 * Register work to flush when the process is asked to stop.
 *
 * @param name short module tag, only used in the shutdown log line.
 * @param fn best-effort drain; it may reject, the drain logs and keeps going.
 */
export function onShutdown(name: string, fn: DrainFn): void {
  drains.push({ name, fn });
}

/** True once a SIGTERM/SIGINT drain has started — call sites can stop taking new work. */
export function isShuttingDown(): boolean {
  return draining;
}

/**
 * Mark a promise as in-flight work the drain should wait for, and return it unchanged.
 *
 * @remarks Only for calls whose loss actually costs something (chips, GT, raffle tickets).
 * Cosmetic fire-and-forget traffic (overlay chat feed, moderation stats) is deliberately
 * NOT tracked — waiting on it would spend the deadline on things nobody misses.
 */
export function trackInFlight<T>(p: Promise<T>): Promise<T> {
  inFlight.add(p);
  // Settled is settled: a rejection here is the caller's business, we only stop waiting.
  void p.then(
    () => inFlight.delete(p),
    () => inFlight.delete(p),
  );
  return p;
}

async function drain(signal: NodeJS.Signals): Promise<void> {
  if (draining) return; // second signal while draining — ignore, don't race the first
  draining = true;
  const startedAt = Date.now();
  console.log(`[shutdown] ${signal} — draining ${drains.length} handler(s) + ${inFlight.size} in-flight call(s)`);

  const work = Promise.allSettled([
    ...drains.map(async (d) => {
      try {
        await d.fn();
      } catch (e) {
        console.warn(`[shutdown] "${d.name}" drain failed:`, (e as Error).message);
      }
    }),
    ...inFlight,
  ]);
  // unref() so the deadline timer itself can never keep the process alive.
  const deadline = new Promise<void>((resolve) => {
    setTimeout(resolve, DRAIN_DEADLINE_MS).unref();
  });
  await Promise.race([work, deadline]);

  console.log(`[shutdown] drained in ${Date.now() - startedAt}ms — exiting`);
  // Explicit exit: the platform connectors hold live sockets and refreshing intervals, so
  // the event loop would never empty on its own and the stop would still end in a SIGKILL.
  process.exit(0);
}

/**
 * Arm the SIGTERM/SIGINT handlers. Call once, from index.ts, AFTER the feature modules
 * have registered their drains (registration happens at import time).
 */
export function installShutdownHandlers(): void {
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => void drain(signal));
  }
  console.log(`[shutdown] SIGTERM/SIGINT drain armed (max ${DRAIN_DEADLINE_MS}ms)`);
}
