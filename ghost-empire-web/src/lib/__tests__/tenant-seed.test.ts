import { describe, it, expect } from "vitest";
import { cloneCatalogRows } from "../tenant-seed";

describe("cloneCatalogRows", () => {
  const src = [
    { id: "1", tenantId: "founder", createdAt: "x", code: "daily_messages", target: 10, reward: 250, active: true },
    { id: "2", tenantId: "founder", createdAt: "y", code: "daily_voice", target: 30, reward: 500, active: false },
  ];

  it("stamps the target tenantId and keeps only the requested fields", () => {
    const out = cloneCatalogRows(src, "new", ["code", "target", "reward", "active"]);
    expect(out).toEqual([
      { tenantId: "new", code: "daily_messages", target: 10, reward: 250, active: true },
      { tenantId: "new", code: "daily_voice", target: 30, reward: 500, active: false },
    ]);
    // id / source tenantId / createdAt are dropped
    expect(out[0]).not.toHaveProperty("id");
    expect(out[0]).not.toHaveProperty("createdAt");
    expect(out[0].tenantId).toBe("new");
  });

  it("preserves nullable/falsy field values (null soundUrl, minAmount, 0)", () => {
    const alerts = [{ id: "a", tenantId: "f", type: "donation", soundUrl: null, minAmount: 0, position: "top-left" }];
    const out = cloneCatalogRows(alerts, "t", ["type", "soundUrl", "minAmount", "position"]);
    expect(out[0]).toEqual({ tenantId: "t", type: "donation", soundUrl: null, minAmount: 0, position: "top-left" });
  });

  it("returns an empty array for an empty source", () => {
    expect(cloneCatalogRows([], "t", ["code"])).toEqual([]);
  });
});
