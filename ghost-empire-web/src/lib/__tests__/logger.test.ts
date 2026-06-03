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
  });
});
