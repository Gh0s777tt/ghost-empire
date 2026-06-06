import { describe, it, expect } from "vitest";
import { sseFrame, sseComment, sseRetry } from "@/lib/sse";

describe("sseFrame", () => {
  it("formats a named event with a JSON data line and a blank-line terminator", () => {
    expect(sseFrame("alerts", [{ id: "x" }])).toBe('event: alerts\ndata: [{"id":"x"}]\n\n');
  });

  it("serializes object payloads", () => {
    expect(sseFrame("settings", { durationMs: 6000 })).toBe(
      'event: settings\ndata: {"durationMs":6000}\n\n',
    );
  });
});

describe("sseComment", () => {
  it("emits a comment line (ignored by EventSource) used as heartbeat", () => {
    expect(sseComment("ping")).toBe(": ping\n\n");
  });
});

describe("sseRetry", () => {
  it("emits the reconnect-backoff directive in ms", () => {
    expect(sseRetry(3000)).toBe("retry: 3000\n\n");
  });
});
