import { describe, it, expect } from "vitest";
import { langName, shouldTranslate, buildTranslatePrompt } from "@/lib/chat-translate";

describe("langName", () => {
  it("maps known codes to English names", () => {
    expect(langName("en")).toBe("English");
    expect(langName("pl")).toBe("Polish");
    expect(langName("JA")).toBe("Japanese");
    expect(langName("pt-BR")).toBe("Portuguese"); // takes first 2 chars
  });
  it("falls back to upper-cased code for unknown", () => {
    expect(langName("xx")).toBe("XX");
    expect(langName("")).toBe("");
  });
});

describe("shouldTranslate", () => {
  it("translates normal messages", () => {
    expect(shouldTranslate("hello there")).toBe(true);
    expect(shouldTranslate("Cześć wszystkim")).toBe(true);
    expect(shouldTranslate("привет стримеру")).toBe(true);
  });
  it("skips empties, too-short, commands, links, letter-less", () => {
    expect(shouldTranslate("")).toBe(false);
    expect(shouldTranslate("  ")).toBe(false);
    expect(shouldTranslate("hi")).toBe(false); // < 3
    expect(shouldTranslate("!drop")).toBe(false); // command
    expect(shouldTranslate("https://twitch.tv/x")).toBe(false); // bare link
    expect(shouldTranslate("😂😂😂")).toBe(false); // emoji only
    expect(shouldTranslate("12345")).toBe(false); // numbers only
    expect(shouldTranslate("!!!")).toBe(false);
  });
});

describe("buildTranslatePrompt", () => {
  it("includes the target language and the message, asks for translation only", () => {
    const p = buildTranslatePrompt("hola", "Polish");
    expect(p).toContain("Polish");
    expect(p).toContain("hola");
    expect(p.toLowerCase()).toContain("only");
  });
});
