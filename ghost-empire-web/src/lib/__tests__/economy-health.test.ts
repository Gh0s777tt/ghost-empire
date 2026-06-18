import { describe, it, expect } from "vitest";
import { flowKind, economyHealth } from "@/lib/economy-health";

describe("flowKind", () => {
  it("treats positive (and zero) amounts as faucets, negative as sinks", () => {
    expect(flowKind(5000)).toBe("faucet");
    expect(flowKind(0)).toBe("faucet");
    expect(flowKind(-250)).toBe("sink");
  });
});

describe("economyHealth", () => {
  it("flags a faucet-dominated window as inflating", () => {
    const h = economyHealth(1000, 100);
    expect(h.burnRatio).toBeCloseTo(0.1);
    expect(h.status).toBe("inflating");
  });

  it("calls a balanced window healthy", () => {
    expect(economyHealth(1000, 700).status).toBe("healthy");
  });

  it("calls a sink-heavy window contracting", () => {
    expect(economyHealth(1000, 950).status).toBe("contracting");
    expect(economyHealth(500, 1000).status).toBe("contracting");
    expect(economyHealth(500, 1000).burnRatio).toBe(2);
  });

  it("reports an empty window as healthy (nothing to inflate)", () => {
    const h = economyHealth(0, 0);
    expect(h.burnRatio).toBe(0);
    expect(h.status).toBe("healthy");
  });

  it("treats burn with zero mint as infinite ratio (contracting)", () => {
    const h = economyHealth(0, 300);
    expect(h.burnRatio).toBe(Infinity);
    expect(h.status).toBe("contracting");
  });
});
