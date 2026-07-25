// src/lib/after-safe.ts
// `after()` that can never fail its caller — the guard every POST-COMMIT side effect in the
// casino money paths runs behind. next/server's `after()` throws synchronously when there is no
// request scope (a script, a cron tick, a test), and every casino path schedules its achievement
// grant AFTER the payout transaction has already committed. Unguarded that turned a fully paid
// play into a 500 — and in `playGtGame`, where the call sat inside the money try/catch, the catch
// then also refunded a jackpot surplus the player had already been paid, minting chips out of
// nothing. Post-commit work is best-effort by definition: it must never rewrite a money result
// that is already durable.
import { after } from "next/server";

/**
 * Schedule `work` to run after the response, swallowing every failure.
 *
 * @param work - A best-effort post-response side effect (achievement grants, cache warms, …).
 *
 * @remarks
 * Two distinct failures are absorbed:
 * - **`after()` itself throwing** — there is no request scope. The work is *skipped*, not run
 *   inline: a caller outside a request scope has no response to defer past, and running a
 *   multi-query grant inline would put the very latency back on the money path that `after()`
 *   was introduced to remove.
 * - **`work` rejecting** — the deferred job failed. Left unhandled that surfaces as an unhandled
 *   rejection in the runtime, so it is caught here too.
 *
 * The invariant this exists to protect: **once the money transaction commits, nothing may change
 * the caller's result.** Never use it for work the caller's correctness depends on — by design
 * there is no signal back about whether the work ran.
 *
 * @example
 * ```ts
 * const newBalance = await prisma.$transaction(...); // money is now durable
 * safeAfter(() => grantCasino(userId));              // best-effort, cannot fail the payout
 * return { ok: true, newBalance };
 * ```
 */
export function safeAfter(work: () => void | Promise<void>): void {
  try {
    after(async () => {
      try {
        await work();
      } catch {
        /* deferred work is best-effort — never surface it as an unhandled rejection */
      }
    });
  } catch {
    /* no request scope (script/cron/test) — skip the work, never fail an already-paid caller */
  }
}
