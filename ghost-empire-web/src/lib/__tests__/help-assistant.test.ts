import { describe, it, expect } from "vitest";
import { buildHelpAssistantPrompt, HELP_PAGES } from "@/lib/help-assistant";

describe("buildHelpAssistantPrompt", () => {
  it("pins replies to the requested locale", () => {
    expect(buildHelpAssistantPrompt("pl")).toContain('locale "pl"');
    expect(buildHelpAssistantPrompt("en")).toContain('locale "en"');
  });

  it("grounds the assistant in the real viewer pages", () => {
    const prompt = buildHelpAssistantPrompt("pl");
    for (const p of HELP_PAGES) {
      expect(prompt).toContain(p.path);
    }
  });

  it("mentions Ghost Tokens so the model knows the core economy", () => {
    expect(buildHelpAssistantPrompt("en")).toMatch(/Ghost Tokens|GT/);
  });

  it("tells the model to stay brief and not invent features", () => {
    const prompt = buildHelpAssistantPrompt("en");
    expect(prompt).toMatch(/brief/i);
    expect(prompt).toMatch(/[Nn]ever invent|Only describe features that exist/);
  });
});
