// QA: postęp questów dziennych — skoping per-tenant zapytania o katalog,
// short-circuit bez aktywnych questów, batch upsertów w JEDNEJ transakcji,
// cache katalogu (TTL 5 min) na gorącej ścieżce chat-award.
// Mock prisma; czas przez fake timers; resetModules per test (cache modułowy).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  taskFindMany: vi.fn(),
  upsert: vi.fn((args: unknown) => ({ __upsert: args })),
  transaction: vi.fn(async (ops: unknown[]) => ops),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: state.userFindUnique },
    dailyTask: { findMany: state.taskFindMany },
    userTask: { upsert: state.upsert },
    $transaction: state.transaction,
  },
}));

async function loadModule() {
  vi.resetModules(); // świeży taskCache w każdym teście
  return import("@/lib/daily-tasks");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-05T10:00:00Z"));
  state.userFindUnique.mockReset();
  state.taskFindMany.mockReset();
  state.upsert.mockClear();
  state.transaction.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("updateDailyTaskProgress", () => {
  it("scopes the task-catalog query to the user's tenant", async () => {
    state.userFindUnique.mockResolvedValue({ tenantId: "tenant-A" });
    state.taskFindMany.mockResolvedValue([{ id: "task-1" }]);
    const { updateDailyTaskProgress } = await loadModule();
    await updateDailyTaskProgress("user-1", "messages");
    expect(state.taskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ triggerType: "messages", active: true, tenantId: "tenant-A" }),
      }),
    );
  });

  it("UWAGA U-2: a user with no tenant queries the catalog UNSCOPED (all portals)", async () => {
    // Dokumentuje bieżące zachowanie legacy-fallback: tenantId null → zapytanie
    // bez filtra tenanta, więc user bez tenanta bije postęp w questach KAŻDEGO
    // portalu tego samego triggera. Patrz TEST_REPORT.md U-2.
    state.userFindUnique.mockResolvedValue({ tenantId: null });
    state.taskFindMany.mockResolvedValue([{ id: "foreign-task" }]);
    const { updateDailyTaskProgress } = await loadModule();
    await updateDailyTaskProgress("user-legacy", "messages");
    const where = (state.taskFindMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect("tenantId" in where).toBe(false); // brak filtra — celowo/legacy, ale ryzykowne
  });

  it("skips the transaction entirely when there are no active quests", async () => {
    state.userFindUnique.mockResolvedValue({ tenantId: "t" });
    state.taskFindMany.mockResolvedValue([]);
    const { updateDailyTaskProgress } = await loadModule();
    await updateDailyTaskProgress("u", "wheel_spin");
    expect(state.transaction).not.toHaveBeenCalled();
    expect(state.upsert).not.toHaveBeenCalled();
  });

  it("batches one upsert per active quest into a single transaction, keyed by today()", async () => {
    state.userFindUnique.mockResolvedValue({ tenantId: "t" });
    state.taskFindMany.mockResolvedValue([{ id: "q1" }, { id: "q2" }, { id: "q3" }]);
    const { updateDailyTaskProgress } = await loadModule();
    await updateDailyTaskProgress("u", "messages");
    expect(state.transaction).toHaveBeenCalledOnce();
    expect(state.upsert).toHaveBeenCalledTimes(3);
    const call = state.upsert.mock.calls[0]![0] as {
      where: { userId_taskId_date: { date: string } };
      create: { progress: number };
      update: unknown;
    };
    expect(call.where.userId_taskId_date.date).toBe("2026-07-05"); // dzisiejsza data (fake time)
    expect(call.create.progress).toBe(1);
    expect(call.update).toEqual({ progress: { increment: 1 } });
  });

  it("caches the catalog per (tenant, trigger) for 5 min and re-queries after TTL", async () => {
    state.userFindUnique.mockResolvedValue({ tenantId: "t" });
    state.taskFindMany.mockResolvedValue([{ id: "q1" }]);
    const { updateDailyTaskProgress } = await loadModule();

    await updateDailyTaskProgress("u", "messages");
    await updateDailyTaskProgress("u", "messages"); // ciepły cache
    expect(state.taskFindMany).toHaveBeenCalledTimes(1);

    await updateDailyTaskProgress("u", "poll_vote"); // inny trigger → osobny wpis
    expect(state.taskFindMany).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(5 * 60_000 + 1); // po TTL
    await updateDailyTaskProgress("u", "messages");
    expect(state.taskFindMany).toHaveBeenCalledTimes(3);
  });

  it("caches per tenant — tenant B does not reuse tenant A's catalog", async () => {
    state.userFindUnique
      .mockResolvedValueOnce({ tenantId: "tenant-A" })
      .mockResolvedValueOnce({ tenantId: "tenant-B" });
    state.taskFindMany.mockResolvedValue([{ id: "q" }]);
    const { updateDailyTaskProgress } = await loadModule();
    await updateDailyTaskProgress("uA", "messages");
    await updateDailyTaskProgress("uB", "messages");
    expect(state.taskFindMany).toHaveBeenCalledTimes(2);
    const tenants = state.taskFindMany.mock.calls.map(
      (c) => (c[0] as { where: { tenantId?: string } }).where.tenantId,
    );
    expect(tenants).toEqual(["tenant-A", "tenant-B"]);
  });
});
