// src/__tests__/moderation.test.ts
// Guards the pure detectors of src/moderation.ts — the bot-side automod that decides
// delete/timeout/warn for every chat message on every portal (audyt 2026-08, finding medium/1:
// 13 pure, dependency-free functions with zero tests).
//
// Why this file matters MORE than usual coverage: moderation.ts is a hand-maintained MIRROR
// of the web app's src/lib/moderation.ts ("kept in sync", per its header) with NO shared code
// and NO gate catching divergence — these tests pin the contract so a silent drift on either
// side fails loudly here. They also add the missing regression guard for the already-fixed
// `youtube.com.evil.com` whitelist-prefix bypass (moderation.ts hasDisallowedLink).
//
// Runner: Node's built-in test runner via tsx (`npm test`) — same deliberate no-new-dependency
// choice as branding.test.ts.
import { test, describe, mock, afterEach } from "node:test";
import assert from "node:assert/strict";

// env.ts's req() throws on missing vars at import time, so these must exist before the
// first dynamic import of moderation.ts (dotenv does not override already-set values).
process.env.PORTAL_URL = "https://neo-zone.example.test";
process.env.BOT_SECRET = "test-secret";
process.env.TWITCH_BOT_USERNAME = "TestBot";
process.env.TWITCH_CHANNEL = "test_channel";

type ModerationModule = typeof import("../moderation");

/**
 * A moderation.ts with FRESH module state (config disabled, empty offender map). The module
 * keeps its synced config and escalation strikes in module scope, so config/escalation tests
 * would otherwise leak into each other; a distinct import query gives each case its own
 * instance (same pattern as branding.test.ts freshBranding()).
 */
let instances = 0;
async function freshModeration(): Promise<ModerationModule> {
  return (await import(`../moderation.ts?case=${++instances}`)) as ModerationModule;
}

// One shared instance for the STATELESS detectors — they read no module state.
const M = await freshModeration();

type FetchArgs = [input?: unknown, init?: unknown];

/** Stub global fetch with a JSON body + status (for refreshModeration config tests). */
function stubFetch(body: unknown, status = 200) {
  const fn = mock.fn(async (..._args: FetchArgs) => new Response(JSON.stringify(body), { status }));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("capsRatio / isExcessiveCaps", () => {
  test("no letters → ratio 0 (numbers/emotes can't be 'caps spam')", () => {
    assert.equal(M.capsRatio(""), 0);
    assert.equal(M.capsRatio("1234 !!! 🎉🎉"), 0);
  });

  test("counts only letters, mixed case is proportional", () => {
    assert.equal(M.capsRatio("ABCD"), 1);
    assert.equal(M.capsRatio("AbCd"), 0.5);
    assert.equal(M.capsRatio("A1b2C3d4"), 0.5); // digits are not letters
  });

  test("short messages are never 'excessive caps' (minLetters floor)", () => {
    assert.equal(M.isExcessiveCaps("OK!!"), false);
    assert.equal(M.isExcessiveCaps("LOL"), false);
  });

  test("a full-caps rant is flagged, incl. Polish diacritics", () => {
    assert.equal(M.isExcessiveCaps("TO JEST SKANDAL"), true);
    assert.equal(M.isExcessiveCaps("ZAŻÓŁĆ GĘŚLĄ JAŹŃ"), true); // \p{L} + toLowerCase are Unicode-aware
  });

  test("ratio exactly AT the threshold passes (strict >)", () => {
    // 10 letters, 7 upper → ratio 0.7, default maxRatio 0.7 → not excessive.
    assert.equal(M.capsRatio("ABCDEFGhij"), 0.7);
    assert.equal(M.isExcessiveCaps("ABCDEFGhij"), false);
    assert.equal(M.isExcessiveCaps("ABCDEFGHij"), true); // 0.8 > 0.7
  });
});

describe("isTooLong", () => {
  test("counts CODE POINTS, not UTF-16 units — emoji don't double-count", () => {
    const skulls = "💀".repeat(10); // .length is 20, but 10 visible characters
    assert.equal(M.isTooLong(skulls, 10), false);
    assert.equal(M.isTooLong(skulls, 9), true);
  });

  test("boundary: exactly maxChars is allowed", () => {
    assert.equal(M.isTooLong("abcde", 5), false);
    assert.equal(M.isTooLong("abcdef", 5), true);
  });
});

describe("maxCharRun / maxWordRun / isRepeatSpam", () => {
  test("char runs", () => {
    assert.equal(M.maxCharRun(""), 0);
    assert.equal(M.maxCharRun("abc"), 1);
    assert.equal(M.maxCharRun("aaab"), 3);
    assert.equal(M.maxCharRun("abbbbba"), 5);
  });

  test("word runs are case-insensitive and whitespace-tolerant", () => {
    assert.equal(M.maxWordRun("gg gg gg"), 3);
    assert.equal(M.maxWordRun("GG   gg\tGg"), 3);
    assert.equal(M.maxWordRun("hype omg hype"), 1); // non-consecutive repeats don't count
  });

  test("isRepeatSpam thresholds (defaults: 8 chars, 4 words) are inclusive", () => {
    assert.equal(M.isRepeatSpam("a".repeat(8)), true);
    assert.equal(M.isRepeatSpam("a".repeat(7)), false);
    assert.equal(M.isRepeatSpam("hype hype hype hype"), true);
    assert.equal(M.isRepeatSpam("hype hype hype"), false);
  });
});

describe("zalgo (combining-mark abuse)", () => {
  test("empty text is not zalgo", () => {
    assert.equal(M.combiningRatio(""), 0);
    assert.equal(M.isZalgo(""), false);
  });

  // \u-escapes, not literal zalgo text: an editor/normalization pass could silently
  // precompose or reorder literal combining marks and hollow these tests out.
  test("a run of stacked combining marks is flagged", () => {
    const zalgo = "z\u0300\u0301\u0302\u0303algo"; // 4 consecutive marks > maxRun 3
    assert.equal(M.maxCombiningRun(zalgo), 4);
    assert.equal(M.isZalgo(zalgo), true);
  });

  test("high overall ratio is flagged even without a long run", () => {
    // 3 marks in 9 chars → ratio ≈ 0.33 > 0.2, but runs of 1 only.
    const t = "a\u0300b\u0301c\u0302def";
    assert.equal(M.maxCombiningRun(t), 1);
    assert.equal(M.isZalgo(t), true);
  });

  test("normal text with a light accent is NOT zalgo (boundaries: ratio ≤ 0.2, run ≤ 3)", () => {
    // 3-mark run (not > 3) and ratio 3/19 ≈ 0.16 (not > 0.2) → clean.
    const t = "a\u0300\u0301\u0302bcdefghijklmnop";
    assert.equal(M.isZalgo(t), false);
    assert.equal(M.isZalgo("zażółć gęślą jaźń"), false); // precomposed Polish, zero combining marks
  });
});

describe("normalizeForProfanity / containsProfanity", () => {
  test("folds leetspeak and strips separators", () => {
    assert.equal(M.normalizeForProfanity("n00b"), "noob");
    assert.equal(M.normalizeForProfanity("w-u l.g_4 r"), "wulgar");
  });

  test("keeps Polish diacritics (a Polish word list must keep matching)", () => {
    // "?" and not "!": the leet map folds "!" to "i" BEFORE stripping, by design —
    // "w!dz" must normalize to "widz", so punctuation-as-letter wins over punctuation.
    assert.equal(M.normalizeForProfanity("Żółć?"), "żółć");
  });

  test("catches spaced-out + leet evasion of a listed word", () => {
    assert.equal(M.containsProfanity("w u l g 4 r", ["wulgar"]), true);
    assert.equal(M.containsProfanity("totally fine message", ["wulgar"]), false);
  });

  test("empty/absent word list never matches", () => {
    assert.equal(M.containsProfanity("anything", []), false);
    assert.equal(M.containsProfanity("anything", undefined as unknown as string[]), false);
  });

  test("a word that normalizes to nothing cannot match everything", () => {
    // "!!!" normalizes to "" — an includes("") would flag EVERY message.
    assert.equal(M.containsProfanity("hello chat", ["!!!"]), false);
  });
});

describe("hasDisallowedLink — whitelist is exact host or dot-suffix", () => {
  const WL = ["youtube.com", "twitch.tv"];

  test("no link → clean", () => {
    assert.equal(M.hasDisallowedLink("no links here, just words", WL), false);
  });

  test("REGRESSION (fixed bypass): whitelisted domain as a PREFIX of a foreign host", () => {
    // includes() used to allow 'youtube.com.evil.com' because it contains 'youtube.com'.
    assert.equal(M.hasDisallowedLink("https://youtube.com.evil.com/watch", WL), true);
    assert.equal(M.hasDisallowedLink("youtube.com.evil.com", WL), true);
  });

  test("suffix trick without a dot is also disallowed (notyoutube.com)", () => {
    assert.equal(M.hasDisallowedLink("https://notyoutube.com/x", WL), true);
  });

  test("exact host and real subdomains are allowed", () => {
    assert.equal(M.hasDisallowedLink("https://youtube.com/watch?v=x", WL), false);
    assert.equal(M.hasDisallowedLink("www.youtube.com/watch", WL), false);
    assert.equal(M.hasDisallowedLink("https://clips.twitch.tv/SomeClip", WL), false);
  });

  test("host comparison is case-insensitive", () => {
    assert.equal(M.hasDisallowedLink("https://YouTube.COM/abc", WL), false);
  });

  test("empty whitelist blocks every link", () => {
    assert.equal(M.hasDisallowedLink("check https://example.com", []), true);
  });

  test("one disallowed link among allowed ones still flags", () => {
    assert.equal(M.hasDisallowedLink("youtube.com/a and evil.example/b", WL), true);
  });
});

describe("matchesAnyRegex — portal-supplied patterns on every message", () => {
  test("matches case-insensitively", () => {
    assert.equal(M.matchesAnyRegex("BUY CHEAP FOLLOWERS", ["cheap\\s+followers"]), true);
    assert.equal(M.matchesAnyRegex("regular message", ["cheap\\s+followers"]), false);
  });

  test("an invalid pattern is skipped, never thrown (portal config must not crash the bot)", () => {
    assert.equal(M.matchesAnyRegex("spam here", ["(unclosed", "spam"]), true);
    assert.equal(M.matchesAnyRegex("clean", ["(unclosed"]), false);
  });

  test("ReDoS bound: patterns over 200 chars are ignored", () => {
    const huge = "a".repeat(201);
    assert.equal(M.matchesAnyRegex("a".repeat(300), [huge]), false);
  });

  test("ReDoS bound: text is truncated to 1000 chars before testing", () => {
    const msg = "x".repeat(1500) + "koniec";
    assert.equal(M.matchesAnyRegex(msg, ["koniec$"]), false); // the tail was cut off
    assert.equal(M.matchesAnyRegex("x koniec", ["koniec$"]), true);
  });

  test("empty pattern list never matches", () => {
    assert.equal(M.matchesAnyRegex("anything", []), false);
  });
});

describe("escalateAction / escalateTimeout", () => {
  test("first offense keeps the configured action", () => {
    assert.equal(M.escalateAction("warn", 0), "warn");
    assert.equal(M.escalateAction("delete", 0), "delete");
    assert.equal(M.escalateAction("timeout", 0), "timeout");
  });

  test("second offense hardens a lone warn to delete", () => {
    assert.equal(M.escalateAction("warn", 1), "delete");
    assert.equal(M.escalateAction("delete", 1), "delete");
  });

  test("third offense: anything softer than a timeout becomes a timeout", () => {
    assert.equal(M.escalateAction("warn", 2), "timeout");
    assert.equal(M.escalateAction("delete", 2), "timeout");
    assert.equal(M.escalateAction("timeout", 5), "timeout");
  });

  test("timeout doubles per prior offense and caps at 24h", () => {
    assert.equal(M.escalateTimeout(600, 0), 600);
    assert.equal(M.escalateTimeout(600, 1), 1200);
    assert.equal(M.escalateTimeout(600, 3), 4800);
    assert.equal(M.escalateTimeout(600, 20), 86_400); // cap — never a multi-day ban from doubling
  });

  test("a negative prior count is clamped (never SHORTENS the base timeout)", () => {
    assert.equal(M.escalateTimeout(600, -5), 600);
  });
});

describe("escalate() — per-user strike window", () => {
  test("repeat offender escalates: warn → delete → timeout with doubled secs", async () => {
    const mod = await freshModeration();
    const verdict = { action: "warn" as const, timeoutSecs: 60, violation: "caps" as const };
    const first = mod.escalate("twitch", "Spammer", verdict);
    assert.equal(first.priorCount, 0);
    assert.equal(first.action, "warn");
    const second = mod.escalate("twitch", "spammer", verdict); // username casing must not reset strikes
    assert.equal(second.priorCount, 1);
    assert.equal(second.action, "delete");
    const third = mod.escalate("twitch", "SPAMMER", verdict);
    assert.equal(third.priorCount, 2);
    assert.equal(third.action, "timeout");
    assert.equal(third.timeoutSecs, 240); // 60 * 2^2
  });

  test("strikes are keyed per platform — same nick on Kick starts clean", async () => {
    const mod = await freshModeration();
    const verdict = { action: "warn" as const, timeoutSecs: 60, violation: "repeat" as const };
    mod.escalate("twitch", "dualuser", verdict);
    const onKick = mod.escalate("kick", "dualuser", verdict);
    assert.equal(onKick.priorCount, 0);
  });
});

describe("checkMessage — config sync + exemption matrix", () => {
  const NOBODY = { isSub: false, isVip: false, isMod: false };

  test("moderation is OFF until the portal enables it (default config)", async () => {
    const mod = await freshModeration();
    assert.equal(mod.checkMessage("ANY MESSAGE AT ALL !!!!", NOBODY), null);
  });

  test("a synced profanity rule flags a plain viewer with the configured verdict", async () => {
    const mod = await freshModeration();
    stubFetch({
      enabled: true,
      exempt: { subs: true, vips: true, mods: true },
      rules: { profanity: { words: ["wulgar"], action: "timeout", timeoutSecs: 300 } },
    });
    await mod.refreshModeration();
    const v = mod.checkMessage("ale w u l g 4 r", NOBODY);
    assert.deepEqual(v, { action: "timeout", timeoutSecs: 300, violation: "profanity" });
    assert.equal(mod.checkMessage("czysta wiadomość", NOBODY), null);
  });

  test("exempt roles are never checked (mods can post anything)", async () => {
    const mod = await freshModeration();
    stubFetch({
      enabled: true,
      exempt: { subs: false, vips: false, mods: true },
      rules: { length: { maxChars: 5, action: "delete", timeoutSecs: 0 } },
    });
    await mod.refreshModeration();
    assert.equal(mod.checkMessage("way too long", { ...NOBODY, isMod: true }), null);
    assert.notEqual(mod.checkMessage("way too long", NOBODY), null);
  });

  test("link rule: allowSubs lets subs post links, plain viewers are flagged", async () => {
    const mod = await freshModeration();
    stubFetch({
      enabled: true,
      exempt: { subs: false, vips: false, mods: false },
      rules: { link: { whitelist: ["youtube.com"], allowSubs: true, action: "delete", timeoutSecs: 0 } },
    });
    await mod.refreshModeration();
    assert.equal(mod.checkMessage("check https://evil.example", { ...NOBODY, isSub: true }), null);
    const v = mod.checkMessage("check https://evil.example", NOBODY);
    assert.deepEqual(v, { action: "delete", timeoutSecs: 0, violation: "link" });
    assert.equal(mod.checkMessage("check https://youtube.com/w", NOBODY), null);
  });

  test("portal turning moderation off clears the synced rules", async () => {
    const mod = await freshModeration();
    stubFetch({
      enabled: true,
      exempt: { subs: false, vips: false, mods: false },
      rules: { length: { maxChars: 5, action: "delete", timeoutSecs: 0 } },
    });
    await mod.refreshModeration();
    assert.notEqual(mod.checkMessage("way too long", NOBODY), null);
    stubFetch({ enabled: false });
    await mod.refreshModeration();
    assert.equal(mod.checkMessage("way too long", NOBODY), null);
  });

  test("a failed refresh keeps the current config (portal outage ≠ automod off)", async () => {
    const mod = await freshModeration();
    stubFetch({
      enabled: true,
      exempt: { subs: false, vips: false, mods: false },
      rules: { caps: { minLetters: 8, maxRatio: 0.7, action: "warn", timeoutSecs: 0 } },
    });
    await mod.refreshModeration();
    stubFetch({ error: "boom" }, 500);
    await mod.refreshModeration();
    assert.notEqual(mod.checkMessage("TO JEST SKANDAL", NOBODY), null);
  });

  test("profanity wins over link when a message violates both (fixed rule order)", async () => {
    const mod = await freshModeration();
    stubFetch({
      enabled: true,
      exempt: { subs: false, vips: false, mods: false },
      rules: {
        profanity: { words: ["wulgar"], action: "timeout", timeoutSecs: 600 },
        link: { whitelist: [], allowSubs: false, action: "delete", timeoutSecs: 0 },
      },
    });
    await mod.refreshModeration();
    const v = mod.checkMessage("wulgar https://evil.example", NOBODY);
    assert.equal(v?.violation, "profanity");
  });
});
