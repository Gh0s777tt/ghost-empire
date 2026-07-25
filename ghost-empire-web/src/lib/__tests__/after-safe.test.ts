import { describe, it, expect, vi, beforeEach } from "vitest";
import { safeAfter } from "@/lib/after-safe";

// next/server's `after()` is exactly what safeAfter guards, and it has two failure modes: it
// throws synchronously when there is no request scope, and the task it defers can reject later.
// Both are simulated here. The contract under test is that NEITHER reaches the caller — by the
// time a casino path calls safeAfter its payout is already committed, so a throw here would
// hand the player an error for money they have already been paid.
const hook = vi.hoisted(() => ({
  impl: (_task: () => unknown): void => {},
  deferred: [] as Array<() => unknown>,
}));
vi.mock("next/server", () => ({ after: (task: () => unknown) => hook.impl(task) }));

describe("safeAfter", () => {
  beforeEach(() => {
    hook.deferred = [];
    hook.impl = (task) => { hook.deferred.push(task); };
  });

  it("schedules the work through after() when a request scope exists", async () => {
    const work = vi.fn();
    safeAfter(work);

    expect(hook.deferred).toHaveLength(1);
    expect(work).not.toHaveBeenCalled(); // deferred, not run inline — that's the whole point
    await hook.deferred[0]();
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("swallows an after() that throws — no request scope must never fail the caller", () => {
    hook.impl = () => { throw new Error("after() outside a request scope"); };
    const work = vi.fn();

    expect(() => safeAfter(work)).not.toThrow();
    // Skipped, not run inline: the caller has no response to defer past, and running a
    // multi-query grant here would put its latency back on the money path.
    expect(work).not.toHaveBeenCalled();
  });

  it("swallows a rejecting task so it can't surface as an unhandled rejection", async () => {
    safeAfter(() => Promise.reject(new Error("achievement grant blew up")));

    await expect(hook.deferred[0]()).resolves.toBeUndefined();
  });

  it("swallows a task that throws synchronously too", async () => {
    safeAfter(() => { throw new Error("import failed"); });

    await expect(hook.deferred[0]()).resolves.toBeUndefined();
  });
});
