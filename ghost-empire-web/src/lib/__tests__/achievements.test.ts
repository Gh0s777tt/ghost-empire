import { describe, it, expect } from "vitest";
import { achievementCloneRows } from "../achievements";

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "src-id",
  tenantId: "founder",
  createdAt: new Date("2026-01-01"),
  code: "duel_win_1",
  name: "Pierwsza Krew",
  description: "Wygraj pierwszy pojedynek",
  icon: "⚔️",
  rarity: "common",
  hidden: false,
  triggerType: "duels_won" as string | null,
  triggerValue: 1 as number | null,
  xpReward: 0,
  tokenReward: 500,
  rewardNote: null as string | null,
  ...over,
});

describe("achievementCloneRows", () => {
  it("stamps the target tenantId and drops id/createdAt/source tenantId", () => {
    const [out] = achievementCloneRows([row()], "new-tenant");
    expect(out.tenantId).toBe("new-tenant");
    expect(out).not.toHaveProperty("id");
    expect(out).not.toHaveProperty("createdAt");
    expect(out.code).toBe("duel_win_1");
    expect(out.tokenReward).toBe(500);
  });

  it("preserves every catalog field, including nullable trigger fields and hidden", () => {
    const [out] = achievementCloneRows(
      [row({ code: "secret", hidden: true, triggerType: null, triggerValue: null, xpReward: 50, rewardNote: "Steam key" })],
      "t2",
    );
    expect(out).toEqual({
      tenantId: "t2",
      code: "secret",
      name: "Pierwsza Krew",
      description: "Wygraj pierwszy pojedynek",
      icon: "⚔️",
      rarity: "common",
      hidden: true,
      triggerType: null,
      triggerValue: null,
      xpReward: 50,
      tokenReward: 500,
      rewardNote: "Steam key",
    });
  });

  it("maps every row and is empty for an empty catalog", () => {
    expect(achievementCloneRows([], "t")).toEqual([]);
    expect(achievementCloneRows([row({ code: "a" }), row({ code: "b" })], "t").map((r) => r.code)).toEqual(["a", "b"]);
  });
});
