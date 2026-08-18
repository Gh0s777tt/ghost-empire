import { describe, it, expect, vi, afterEach } from "vitest";
import { createLogger, errContext } from "@/lib/logger";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("logger", () => {
  it("suppresses levels below the LOG_LEVEL threshold", () => {
    vi.stubEnv("LOG_LEVEL", "warn");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = createLogger("test");
    log.info("suppressed");
    log.warn("shown");
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("emits single-line JSON with level/scope/msg/context in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOG_LEVEL", "info");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    createLogger("webhook").info("got event", { type: "sub", n: 3 });
    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed).toMatchObject({ level: "info", scope: "webhook", msg: "got event", type: "sub", n: 3 });
    expect(typeof parsed.time).toBe("string");
  });

  it("renders a readable line in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    createLogger("svc").info("hello", { a: 1 });
    expect(spy.mock.calls[0][0]).toBe('[INFO] svc: hello {"a":1}');
  });

  it("error() folds a thrown Error into context (message, no stack in prod)", () => {
    vi.stubEnv("NODE_ENV", "production");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    createLogger("svc").error("failed", new Error("boom"));
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed).toMatchObject({ level: "error", scope: "svc", msg: "failed", err: "boom" });
    expect(parsed.stack).toBeUndefined();
  });

  it("errContext stringifies non-Error throwables", () => {
    expect(errContext("nope")).toEqual({ err: "nope" });
    expect(errContext(404)).toEqual({ err: "404" });
    expect(errContext(null)).toEqual({ err: "null" });
    expect(errContext(undefined)).toEqual({ err: "undefined" });
  });

  // Regresja z produkcji: `cron.streamlabs-poll` padał 672 razy przez trzy tygodnie,
  // a log mówił wyłącznie `err: "[object Object]"` — bo kontekst trafił na pozycję błędu,
  // a stary `String(e)` zjadał wszystkie pola. Diagnostyka ma przetrwać tę pomyłkę.
  it("errContext ROZKŁADA zwykły obiekt zamiast robić z niego [object Object]", () => {
    expect(errContext({ tenantId: "t1", error: "not_connected" })).toEqual({
      tenantId: "t1",
      error: "not_connected",
    });
    // wartość rzucona, która nie jest Errorem, też staje się czytelna
    expect(errContext({ code: "P2010" })).toEqual({ code: "P2010" });
    // tablica nie jest kontekstem — zostaje przy starym zachowaniu
    expect(errContext([1, 2])).toEqual({ err: "1,2" });
  });

  it("error() z kontekstem na złej pozycji nadal dowozi pola do logu", () => {
    vi.stubEnv("NODE_ENV", "production");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    createLogger("cron.streamlabs-poll").error("portal poll failed (fetch)", {
      tenantId: "t1",
      error: "token_decrypt_failed",
    });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed).toMatchObject({ tenantId: "t1", error: "token_decrypt_failed" });
    expect(parsed.err).toBeUndefined();
  });

  it("error() z poprawną kolejnością łączy błąd i kontekst", () => {
    vi.stubEnv("NODE_ENV", "production");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    createLogger("cron.backup").error("backup upload failed", new Error("503"), { status: 503 });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed).toMatchObject({ err: "503", status: 503 });
  });
});
