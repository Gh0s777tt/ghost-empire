import { describe, it, expect } from "vitest";
import { buildRecapPrompt, type RecapData } from "@/lib/stream-recap";

const data: RecapData = {
  startedAt: "2026-06-19T18:00:00.000Z",
  endedAt: "2026-06-19T21:00:00.000Z",
  durationMin: 180,
  subs: 12,
  donations: 3,
  follows: 40,
  gtEarned: 25000,
  messages: 1840,
  topChatters: [{ name: "viewerA", count: 120 }, { name: "viewerB", count: 90 }],
  topSupporters: [{ name: "Kuba", amount: 50 }],
};

describe("buildRecapPrompt", () => {
  it("pins output to the requested locale", () => {
    expect(buildRecapPrompt(data, "pl").system).toContain('locale "pl"');
    expect(buildRecapPrompt(data, "en").system).toContain('locale "en"');
  });

  it("includes the real numbers in the user prompt", () => {
    const { user } = buildRecapPrompt(data, "pl");
    expect(user).toContain("180 min");
    expect(user).toContain("New subs: 12");
    expect(user).toContain("25000");
    expect(user).toContain("viewerA (120)");
    expect(user).toContain("Kuba (50)");
  });

  it("instructs the model not to invent data", () => {
    expect(buildRecapPrompt(data, "en").system).toMatch(/never invent/i);
  });

  it("shows an em-dash placeholder when a list is empty", () => {
    const empty = { ...data, topChatters: [], topSupporters: [] };
    const { user } = buildRecapPrompt(empty, "en");
    expect(user).toContain("Top chatters: —");
    expect(user).toContain("Top supporters: —");
  });
});
