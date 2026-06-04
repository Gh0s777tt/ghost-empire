import { describe, it, expect } from "vitest";
import {
  capsRatio, isExcessiveCaps,
  isTooLong,
  maxCharRun, maxWordRun, isRepeatSpam,
  combiningRatio, maxCombiningRun, isZalgo,
  normalizeForProfanity, containsProfanity,
  evaluateMessage,
} from "@/lib/moderation";

describe("caps", () => {
  it("capsRatio = uppercase letters / all letters (ignores non-letters)", () => {
    expect(capsRatio("HELLO")).toBe(1);
    expect(capsRatio("hello")).toBe(0);
    expect(capsRatio("Hello")).toBeCloseTo(0.2, 5);
    expect(capsRatio("123 !!! 😀")).toBe(0); // no letters
  });

  it("isExcessiveCaps ignores short messages, flags sustained shouting", () => {
    expect(isExcessiveCaps("OK")).toBe(false);            // too short
    expect(isExcessiveCaps("HELLO WORLD")).toBe(true);    // 10 letters, all caps
    expect(isExcessiveCaps("Hello world this is fine")).toBe(false);
    expect(isExcessiveCaps("łódź")).toBe(false);          // Polish lowercase
  });
});

describe("length", () => {
  it("isTooLong counts code points", () => {
    expect(isTooLong("abc", 3)).toBe(false);
    expect(isTooLong("abcd", 3)).toBe(true);
    expect(isTooLong("😀😀", 3)).toBe(false);
  });
});

describe("repeat / flood", () => {
  it("maxCharRun finds the longest identical-char run", () => {
    expect(maxCharRun("aaaa")).toBe(4);
    expect(maxCharRun("abc")).toBe(1);
    expect(maxCharRun("aabbbbc")).toBe(4);
    expect(maxCharRun("")).toBe(0);
  });

  it("maxWordRun is case-insensitive", () => {
    expect(maxWordRun("lol lol lol")).toBe(3);
    expect(maxWordRun("Hi hi HI there")).toBe(3);
    expect(maxWordRun("a b c")).toBe(1);
  });

  it("isRepeatSpam flags long char runs OR repeated words", () => {
    expect(isRepeatSpam("aaaaaaaa")).toBe(true);          // 8 identical chars
    expect(isRepeatSpam("spam spam spam spam")).toBe(true); // 4 identical words
    expect(isRepeatSpam("hello world")).toBe(false);
  });
});

describe("zalgo", () => {
  // "a" stacked with four combining marks.
  const zalgo = "à́̂̃lgo";
  it("combiningRatio / maxCombiningRun measure stacked marks", () => {
    expect(combiningRatio("hello")).toBe(0);
    expect(maxCombiningRun(zalgo)).toBe(4);
    expect(combiningRatio(zalgo)).toBeGreaterThan(0.2);
  });

  it("isZalgo flags glitch text but not normal / Polish text", () => {
    expect(isZalgo(zalgo)).toBe(true);
    expect(isZalgo("normalny tekst")).toBe(false);
    expect(isZalgo("zażółć gęślą jaźń")).toBe(false); // precomposed Polish, no marks
  });
});

describe("profanity", () => {
  it("normalizeForProfanity folds leetspeak and strips separators", () => {
    expect(normalizeForProfanity("B.A.D")).toBe("bad");
    expect(normalizeForProfanity("b a d")).toBe("bad");
    expect(normalizeForProfanity("b4d")).toBe("bad");
    expect(normalizeForProfanity("$h1t")).toBe("shit");
  });

  it("containsProfanity matches through evasion, empty list never matches", () => {
    const words = ["badword"];
    expect(containsProfanity("this is a badword", words)).toBe(true);
    expect(containsProfanity("b a d w o r d", words)).toBe(true);   // spacing evasion
    expect(containsProfanity("b4dw0rd!!!", words)).toBe(true);      // leetspeak
    expect(containsProfanity("totally clean", words)).toBe(false);
    expect(containsProfanity("badword", [])).toBe(false);          // no wordlist
  });
});

describe("evaluateMessage", () => {
  const cfg = {
    profanity: { enabled: true, words: ["badword"] },
    caps: { enabled: true, minLetters: 8, maxRatio: 0.7 },
    length: { enabled: true, maxChars: 50 },
    repeat: { enabled: true, charRun: 8, wordRun: 4 },
    zalgo: { enabled: true, maxRatio: 0.2, maxRun: 3 },
  };

  it("returns null for a clean message", () => {
    expect(evaluateMessage("hej, fajny stream!", cfg)).toBeNull();
  });

  it("detects each violation type", () => {
    expect(evaluateMessage("you are a b4dword", cfg)).toBe("profanity");
    expect(evaluateMessage("à́̂̃̄", cfg)).toBe("zalgo");
    expect(evaluateMessage("x".repeat(60), cfg)).toBe("length");
    expect(evaluateMessage("THIS IS WAY TOO LOUD", cfg)).toBe("caps");
    expect(evaluateMessage("spam spam spam spam spam", cfg)).toBe("repeat");
  });

  it("respects enabled flags (disabled rule is skipped)", () => {
    expect(evaluateMessage("THIS IS WAY TOO LOUD", { caps: { enabled: false } })).toBeNull();
  });
});
